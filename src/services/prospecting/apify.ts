import "server-only";
import { serverEnv } from "@/lib/env";
import { buildLead, type CompanyLead, type CompanySearchResult } from "@/services/prospecting/company-search";

/**
 * Busca de empresas no Google Maps via Apify (actor configurável em
 * APIFY_GOOGLE_MAPS_ACTOR, padrão compass/crawler-google-places).
 *
 * Devolve nome, telefone, site, endereço, categoria e nota — o telefone é o que
 * permite a abordagem por WhatsApp depois.
 */
export async function searchCompaniesApify(params: {
  nicho: string;
  local: string;
  max?: number;
}): Promise<CompanySearchResult> {
  const { apify } = serverEnv();
  if (!apify.apiKey) {
    return { provider: "apify", found: 0, leads: [], error: "APIFY_API_KEY não configurada" };
  }

  const nicho = params.nicho.trim();
  const local = params.local.trim();
  const max = Math.min(100, Math.max(1, params.max ?? 20));
  const query = [nicho, local].filter(Boolean).join(" ");

  const url = `https://api.apify.com/v2/acts/${apify.actor}/run-sync-get-dataset-items`;

  try {
    const res = await fetch(`${url}?token=${encodeURIComponent(apify.apiKey)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        searchStringsArray: [query],
        maxCrawledPlacesPerSearch: max,
        language: "pt-BR",
        skipClosedPlaces: true,
        // 0 = não traz textos de avaliação (mais barato/rápido).
        // APIFY_MAX_REVIEWS=5 traz os comentários, ótimos para personalizar a abordagem.
        maxReviews: Number(process.env.APIFY_MAX_REVIEWS ?? 0) || 0,
        maxImages: 0,
      }),
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
    return { provider: "apify", found: leads.length, leads };
  } catch (error) {
    const message = (error as Error).name === "TimeoutError"
      ? "Apify demorou demais (limite ~4min) — tente menos resultados"
      : (error as Error).message;
    return { provider: "apify", found: 0, leads: [], error: message };
  }
}
