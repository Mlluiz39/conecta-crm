import "server-only";
import { serverEnv } from "@/lib/env";
import { buildLead, type CompanyLead, type CompanySearchResult } from "@/services/prospecting/company-search";

type ApolloOrganization = {
  name?: string;
  website_url?: string;
  primary_phone?: { number?: string; sanitized_number?: string } | string | null;
  phone?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  industry?: string | null;
  linkedin_url?: string | null;
};

/**
 * Busca de empresas no Apollo via gateway da AISA
 * (POST /apis/v1/apollo/mixed_companies/search).
 *
 * Traz nome, site, telefone e localização. Onde não há telefone, o lead entra
 * só com site/e-mail (útil para a prospecção por e-mail).
 */
export async function searchCompaniesAisa(params: {
  nicho: string;
  local: string;
  max?: number;
}): Promise<CompanySearchResult> {
  const { aisa } = serverEnv();
  if (!aisa.apiKey) {
    return { provider: "aisa", found: 0, leads: [], error: "AISA_API_KEY não configurada" };
  }

  const nicho = params.nicho.trim();
  const local = params.local.trim();
  const perPage = Math.min(100, Math.max(1, params.max ?? 20));

  const body: Record<string, unknown> = {
    page: 1,
    per_page: perPage,
  };
  if (nicho) body.q_organization_keyword_tags = [nicho];
  // AISA/Apollo espera localização no formato "Cidade, Estado, País" ou país.
  if (local) body.organization_locations = [local];

  try {
    const res = await fetch(`${aisa.baseUrl}/apollo/mixed_companies/search`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${aisa.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return {
        provider: "aisa",
        found: 0,
        leads: [],
        error: `AISA HTTP ${res.status}: ${detail.slice(0, 200)}`,
      };
    }

    const json = (await res.json()) as {
      organizations?: ApolloOrganization[];
      accounts?: ApolloOrganization[];
      pagination?: { total_entries?: number };
      error?: string;
    };

    const source = json.organizations?.length ? json.organizations : (json.accounts ?? []);
    const leads: CompanyLead[] = [];
    for (const org of source) {
      const phoneRaw =
        typeof org.primary_phone === "string"
          ? org.primary_phone
          : (org.primary_phone?.number ?? org.primary_phone?.sanitized_number ?? org.phone ?? null);

      const lead = buildLead("aisa", {
        name: org.name,
        phone: phoneRaw,
        website: org.website_url,
        mapsUrl: null,
        raw: org as unknown as Record<string, unknown>,
        city: org.city,
        state: org.state,
        category: org.industry,
      });
      if (lead) leads.push(lead);
    }

    if (leads.length === 0 && json.error) {
      return { provider: "aisa", found: 0, leads: [], error: json.error };
    }
    return { provider: "aisa", found: leads.length, leads };
  } catch (error) {
    return { provider: "aisa", found: 0, leads: [], error: (error as Error).message };
  }
}
