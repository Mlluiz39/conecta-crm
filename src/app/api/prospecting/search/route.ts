import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/session";
import { searchCompaniesApify } from "@/services/prospecting/apify";
import { searchCompaniesAisa } from "@/services/prospecting/aisa";
import { domainOf, type CompanyLead, type CompanyProvider } from "@/services/prospecting/company-search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export const maxDuration = 300;

/**
 * Busca empresas no provedor escolhido (Apify = Google Maps, AISA = Apollo)
 * e salva os leads no CRM, pulando o que já existe (telefone, e-mail, domínio ou nome).
 *
 * Body: { provider: "apify" | "aisa", nicho: string, local: string, max?: number }
 */
export async function POST(request: NextRequest) {
  const { organizationId, id: userId } = await requireProfile();
  const supabase = createClient();

  let payload: { provider?: string; nicho?: string; local?: string; max?: number };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const provider: CompanyProvider = payload.provider === "aisa" ? "aisa" : "apify";
  const nicho = String(payload.nicho ?? "").trim();
  const local = String(payload.local ?? "").trim();
  const max = Number(payload.max ?? 20) || 20;

  if (!nicho && !local) {
    return NextResponse.json({ error: "Informe o nicho e o local" }, { status: 400 });
  }

  const result = provider === "aisa"
    ? await searchCompaniesAisa({ nicho, local, max })
    : await searchCompaniesApify({ nicho, local, max });

  if (result.error) {
    return NextResponse.json(
      { provider, found: 0, saved: 0, duplicates: 0, leads: [], error: result.error },
      { status: 200 },
    );
  }

  // ── Dedupe contra o que já está no CRM ────────────────────────────────
  const { data: existing } = await supabase
    .from("contacts")
    .select("id, name, phone, email")
    .eq("organization_id", organizationId)
    .limit(5000);

  const knownPhones = new Set<string>();
  const knownEmails = new Set<string>();
  const knownNames = new Set<string>();
  for (const c of existing ?? []) {
    if (c.phone) knownPhones.add(String(c.phone).replace(/\D/g, ""));
    if (c.email) knownEmails.add(String(c.email).toLowerCase());
    if (c.name) knownNames.add(String(c.name).toLowerCase());
  }

  const batch = new Date().toISOString();
  const toInsert: Record<string, unknown>[] = [];
  const leads: (CompanyLead & { saved: boolean })[] = [];
  let duplicates = 0;

  for (const lead of result.leads) {
    const phoneDigits = lead.phone ?? null;
    const dup =
      (phoneDigits && knownPhones.has(phoneDigits)) ||
      (lead.email && knownEmails.has(lead.email)) ||
      knownNames.has(lead.name.toLowerCase());

    if (dup) {
      duplicates++;
      leads.push({ ...lead, saved: false });
      continue;
    }
    if (phoneDigits) knownPhones.add(phoneDigits);
    if (lead.email) knownEmails.add(lead.email);
    knownNames.add(lead.name.toLowerCase());

    toInsert.push({
      organization_id: organizationId,
      owner_id: userId,
      name: lead.name,
      phone: lead.phone,
      email: lead.email,
      custom_fields: {
        empresa: lead.name,
        site: lead.website,
        endereco: lead.address,
        cidade: lead.city,
        estado: lead.state,
        categoria: lead.category,
        nota: lead.rating,
        origem: provider,
        busca: { provider, nicho, local, at: batch },
        // ── enriquecimento completo do provedor ──
        bairro: lead.neighborhood,
        rua: lead.street,
        cep: lead.postalCode,
        avaliacoes: lead.reviewsCount,
        faixa_preco: lead.price,
        perfil_nao_reclamado: lead.unclaimed,
        fechado_definitivo: lead.permanentlyClosed,
        fechado_temporario: lead.temporarilyClosed,
        horarios: lead.openingHours,
        descricao: lead.description,
        categorias: lead.categories,
        tags_avaliacoes: lead.reviewTags,
        foto: lead.imageUrl,
        place_id: lead.placeId,
        localizacao: lead.lat !== null && lead.lng !== null ? { lat: lead.lat, lng: lead.lng } : null,
        maps: lead.mapsUrl,
        // item cru do provedor inteiro: 3 KB por empresa, não perdemos nada
        bruto: lead.raw,
      },
    });
    leads.push({ ...lead, saved: true });
  }

  let saved = 0;
  const errors: string[] = [];
  for (let i = 0; i < toInsert.length; i += 100) {
    const chunk = toInsert.slice(i, i + 100);
    const { data, error } = await supabase.from("contacts").insert(chunk).select("id");
    if (error) errors.push(error.message);
    else saved += data?.length ?? 0;
  }

  return NextResponse.json({
    provider,
    found: result.found,
    saved,
    duplicates,
    leads,
    errors,
    domainSample: leads.slice(0, 1).map((l) => domainOf(l.website)),
    query: { nicho, local, max },
  });
}
