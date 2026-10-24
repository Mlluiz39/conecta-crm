import "server-only";
import { serverEnv } from "@/lib/env";
import { buildLead, type CompanyLead, type CompanySearchResult } from "@/services/prospecting/company-search";
import { filterStrongProspects } from "@/services/prospecting/presence";
import { buildApifyInput } from "@/services/prospecting/apify-input";

/**
 * Busca de empresas no Google Maps via Apify (actor configurável em
 * APIFY_GOOGLE_MAPS_ACTOR, padrão compass/crawler-google-places).
 *
 * Devolve nome, telefone, site, endereço, categoria e nota — o telefone é o que
 * permite a abordagem por WhatsApp depois.
 *
 * `apenasSemSite` (padrão ligado) mantém só empresas sem site próprio e sem
 * sistema: rede social e link solto continuam valendo (ver presence.ts). Como
 * uma boa parte do que o Maps devolve é descartada, a varredura pede 3x o
 * número desejado (máx. 100) e depois corta no limite pedido.
 */
export async function searchCompaniesApify(params: {
  nicho: string;
  local: string;
  max?: number;
  apenasSemSite?: boolean;
  /**
   * Busca por raio a partir de um ponto (prospecção "perto de mim").
   * O ator espera GeoJSON com a ordem [longitude, latitude] e `radiusKm`.
   */
  geo?: { lat: number; lng: number; raioKm: number };
}): Promise<CompanySearchResult> {
  const { apify } = serverEnv();
  if (!apify.apiKey) {
    return { provider: "apify", found: 0, leads: [], error: "APIFY_API_KEY não configurada" };
  }

  const nicho = params.nicho.trim();
  const local = params.local.trim();
  const max = Math.min(100, Math.max(1, params.max ?? 20));
  const apenasSemSite = params.apenasSemSite !== false;
  // Sem o filtro, pede exatamente o que o usuário quer; com o filtro, sobra margem.
  const varredura = apenasSemSite ? Math.min(100, Math.max(max, max * 3)) : max;
  // Com coordenada, a área é o raio: mandar cidade junto brigaria com ela.
  const geo = params.geo && Number.isFinite(params.geo.lat) && Number.isFinite(params.geo.lng)
    ? {
        lat: params.geo.lat,
        lng: params.geo.lng,
        raioKm: Math.min(50, Math.max(0.5, Number(params.geo.raioKm) || 5)),
      }
    : null;
  const query = geo ? nicho : [nicho, local].filter(Boolean).join(" ");

  const url = `https://api.apify.com/v2/acts/${apify.actor}/run-sync-get-dataset-items`;

  try {
    const res = await fetch(`${url}?token=${encodeURIComponent(apify.apiKey)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildApifyInput({ query, varredura, geo })),
      // Google Maps com poucos itens leva ~40s; damos folga para lotes maiores.
      signal: AbortSignal.timeout(280_000),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return {
        provider: "apify",
        found: 0,
        leads: [],
        error: `Apify HTTP ${res.status}: ${detail.slice(0, 200)}`,
      };
    }

    const items = (await res.json()) as Record<string, unknown>[];
    const leads: CompanyLead[] = [];
    for (const item of Array.isArray(items) ? items : []) {
      const lead = buildLead("apify", {
        name: item.title,
        phone: item.phone,
        website: item.website,
        mapsUrl: item.url,
        neighborhood: item.neighborhood,
        street: item.street,
        postalCode: item.postalCode,
        reviewsCount: item.reviewsCount,
        price: item.price,
        // o Google diz se o dono reclamou o perfil; não reclamado = descuido com presença digital
        unclaimed: item.claimThisBusiness === false,
        permanentlyClosed: item.permanentlyClosed,
        temporarilyClosed: item.temporarilyClosed,
        openingHours: item.openingHours,
        description: item.description,
        ownerDescription: item.ownerDescription,
        categories: item.categories,
        reviewTags: item.reviewsTags,
        imageUrl: item.imageUrl,
        placeId: item.placeId,
        lat: (item.location as { lat?: number } | undefined)?.lat,
        lng: (item.location as { lng?: number } | undefined)?.lng,
        // guarda o item inteiro: 3 KB por empresa, não vale a pena perder nada
        raw: item,
        address: item.address,
        city: item.city,
        state: item.state,
        category: item.categoryName,
        rating: item.totalScore,
      });
      if (lead) leads.push(lead);
    }

    // Filtro estrito: só fica quem não tem site próprio nem sistema.
    if (apenasSemSite) {
      const filtrado = filterStrongProspects(leads, max);
      return {
        provider: "apify",
        found: filtrado.kept.length,
        leads: filtrado.kept,
        scanned: leads.length,
        discarded: filtrado.counts,
      };
    }

    return { provider: "apify", found: leads.length, leads: leads.slice(0, max), scanned: leads.length };
  } catch (error) {
    const message = (error as Error).name === "TimeoutError"
      ? "Apify demorou demais (limite ~4min) — tente menos resultados"
      : (error as Error).message;
    return { provider: "apify", found: 0, leads: [], error: message };
  }
}
