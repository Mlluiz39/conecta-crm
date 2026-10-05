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
  address: string | null;
  city: string | null;
  state: string | null;
  category: string | null;
  rating: number | null;
  source: CompanyProvider;
  /** Chave estável para dedupe na tela (telefone, e-mail, domínio ou nome). */
  key: string;
};

export type CompanySearchResult = {
  provider: CompanyProvider;
  found: number;
  leads: CompanyLead[];
  error?: string;
};

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
    address: clean(raw.address),
    city: clean(raw.city),
    state: clean(raw.state),
    category: clean(raw.category),
    rating: Number.isFinite(ratingNum) && ratingNum > 0 ? ratingNum : null,
    source,
    key: "",
  };
  lead.key = leadKey(lead);
  return lead;
}
