/**
 * Tipos e normalização comuns às buscas de empresas (Apify / AISA).
 */

import { normalizePhone } from "@/lib/data/lead-parser";

export type CompanyProvider = "apify" | "aisa";

export type CompanyLead = {
  name: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  /** Link do Google Maps da empresa (o actor devolve em `url`). */
  mapsUrl: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  category: string | null;
  rating: number | null;
  source: CompanyProvider;
  /** Chave estável para dedupe na tela (telefone, e-mail, domínio ou nome). */
  key: string;

  // ── enriquecimento (tudo o que o provedor devolve, sem perder nada) ──
  /** Bairro (Google Maps). */
  neighborhood: string | null;
  /** Rua com número. */
  street: string | null;
  /** CEP. */
  postalCode: string | null;
  /** Quantidade de avaliações — prova social para a abordagem. */
  reviewsCount: number | null;
  /** Faixa de preço quando o Google informa (ex.: "$$"). */
  price: string | null;
  /** true = o dono NÃO reclamou o perfil no Google (sinal de descuido com presença digital). */
  unclaimed: boolean;
  permanentlyClosed: boolean;
  temporarilyClosed: boolean;
  /** Horários de funcionamento: [{ dia, horas }]. */
  openingHours: { day: string; hours: string }[];
  /** Descrição que o próprio negócio escreveu (ótimo para personalizar a abordagem). */
  description: string | null;
  /** Todas as categorias do Google. */
  categories: string[];
  /** O que os clientes mais citam nas avaliações. */
  reviewTags: string[];
  imageUrl: string | null;
  /** Identificadores estáveis do Google (úteis para dedupe/enriquecer depois). */
  placeId: string | null;
  /** Coordenadas. */
  lat: number | null;
  lng: number | null;
  /** Item cru completo do provedor (guardado no CRM para não perder nada). */
  raw: Record<string, unknown>;
};

export type CompanySearchResult = {
  provider: CompanyProvider;
  found: number;
  leads: CompanyLead[];
  error?: string;
};

function num(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function clean(value: unknown): string | null {
  const s = String(value ?? "").trim();
  return s === "" ? null : s;
}

export function domainOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

export function leadKey(input: {
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  name?: string | null;
}): string {
  const digits = input.phone ? normalizePhone(input.phone) : null;
  if (digits) return `tel:${digits}`;
  if (input.email) return `mail:${input.email.toLowerCase()}`;
  const domain = domainOf(input.website ?? null);
  if (domain) return `site:${domain}`;
  return `name:${(input.name ?? "").toLowerCase()}`;
}

/** Monta o lead normalizado a partir de campos crus de qualquer provedor. */
export function buildLead(
  source: CompanyProvider,
  raw: {
    name?: unknown;
    phone?: unknown;
    email?: unknown;
    website?: unknown;
    mapsUrl?: unknown;
    neighborhood?: unknown;
    street?: unknown;
    postalCode?: unknown;
    reviewsCount?: unknown;
    price?: unknown;
    unclaimed?: unknown;
    permanentlyClosed?: unknown;
    temporarilyClosed?: unknown;
    openingHours?: unknown;
    description?: unknown;
    ownerDescription?: unknown;
    categories?: unknown;
    reviewTags?: unknown;
    imageUrl?: unknown;
    placeId?: unknown;
    lat?: unknown;
    lng?: unknown;
    raw?: unknown;
    address?: unknown;
    city?: unknown;
    state?: unknown;
    category?: unknown;
    rating?: unknown;
  },
): CompanyLead | null {
  const name = clean(raw.name);
  if (!name) return null;

  const phone = raw.phone ? normalizePhone(String(raw.phone)) : null;
  const email = clean(raw.email)?.toLowerCase() ?? null;
  const website = clean(raw.website);
  const ratingNum = Number(raw.rating);

  const lead: CompanyLead = {
    name,
    phone,
    email,
    website,
    mapsUrl: clean(raw.mapsUrl),
    address: clean(raw.address),
    city: clean(raw.city),
    state: clean(raw.state),
    category: clean(raw.category),
    rating: Number.isFinite(ratingNum) && ratingNum > 0 ? ratingNum : null,
    source,
    key: "",
    neighborhood: clean(raw.neighborhood),
    street: clean(raw.street),
    postalCode: clean(raw.postalCode),
    reviewsCount: num(raw.reviewsCount),
    price: clean(raw.price),
    unclaimed: raw.unclaimed === true,
    permanentlyClosed: raw.permanentlyClosed === true,
    temporarilyClosed: raw.temporarilyClosed === true,
    openingHours: Array.isArray(raw.openingHours)
      ? (raw.openingHours as { day?: unknown; hours?: unknown }[])
          .map((h) => ({ day: String(h?.day ?? ""), hours: String(h?.hours ?? "") }))
          .filter((h) => h.day && h.hours)
      : [],
    description: clean(raw.description) ?? clean(raw.ownerDescription),
    categories: Array.isArray(raw.categories) ? raw.categories.map((c) => String(c)) : [],
    reviewTags: Array.isArray(raw.reviewTags) ? raw.reviewTags.map((t) => String(t)) : [],
    imageUrl: clean(raw.imageUrl),
    placeId: clean(raw.placeId),
    lat: num(raw.lat),
    lng: num(raw.lng),
    raw: (raw.raw && typeof raw.raw === "object" ? (raw.raw as Record<string, unknown>) : {}),
  };
  lead.key = leadKey(lead);
  return lead;
}
