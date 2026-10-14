/**
 * Parser universal de leads para prospecção no Conecta-CRM.
 *
 * Suporta:
 * 1. Planilha de Prospecção & Auditoria B2B (29 colunas):
 *    Empresa | Nicho | Bairro | Cidade | Website | Telefone (Google Maps) |
 *    WhatsApp (site) | Instagram | Perfil Google Maps | Nota Google | Avaliações |
 *    Anúncios ativos | Meta Ads | Evidência Meta | Google Ads | Evidência Google |
 *    Performance mobile | Problemas identificados | Serviço recomendado |
 *    Pts anúncios | Pts site | Pts SEO | Pts conversão | Pts contato | Pts fit |
 *    Pontuação | Prioridade | Fontes | Data da verificação
 * 2. Apify (JSON / CSV do Google Maps Scraper)
 * 3. AISA (JSON / CSV do Apollo / Mixed Companies Search)
 * 4. CSV / Linhas simples (nome; telefone; email; empresa; cidade)
 *
 * Formatos de arquivo: CSV, TSV, TXT, Excel (.xlsx, .xls) e JSON.
 */

import * as XLSX from "xlsx";

export function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

/** Normaliza telefone brasileiro para o formato E.164 sem "+" (ex.: 5511999998888). */
export function normalizePhone(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const digits = onlyDigits(String(raw));
  if (digits.length < 8 || digits.length > 13) return null;
  if (digits.length <= 11) return `55${digits}`;
  return digits;
}

export function cleanInstagram(raw: unknown): string | null {
  if (!raw) return null;
  let str = String(raw).trim();
  if (!str) return null;
  const urlMatch = str.match(/(?:instagram\.com\/)([a-zA-Z0-9._]+)/i);
  if (urlMatch) return urlMatch[1];
  str = str.replace(/^[@/]+/, "").replace(/\/+$/, "").trim();
  return str || null;
}

export function extractEmail(obj: Record<string, unknown>): string | null {
  for (const v of Object.values(obj)) {
    if (typeof v === "string") {
      const match = v.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
      if (match) return match[0].toLowerCase();
    }
  }
  return null;
}

/** Chave normalizada para comparação de cabeçalhos sem acentos, maiúsculas ou símbolos */
export function normalizeKey(key: string): string {
  return key
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export type LeadSourceKind = "prospect_sheet" | "apify" | "aisa" | "simple_csv";

export const LEAD_SOURCE_LABELS: Record<LeadSourceKind, string> = {
  prospect_sheet: "Planilha de Prospecção (29 colunas)",
  apify: "Apify (Google Maps Scraper)",
  aisa: "AISA (Apollo B2B Search)",
  simple_csv: "CSV / Linhas simples",
};

export type UniversalLead = {
  name: string;
  phone: string | null;
  email: string | null;
  instagram_handle?: string | null;
  custom_fields: Record<string, unknown>;
  sourceKind: LeadSourceKind;
};

export type ParsedLead = {
  name: string;
  phone: string | null;
  email: string | null;
  company: string | null;
  city: string | null;
};

/** Parser legado para compatibilidade com linhas isoladas no formato texto. */
export function parseLeadLine(line: string): ParsedLead | null {
  const raw = (line ?? "").trim();
  if (!raw) return null;

  const cells = raw
    .split(/\s*[;\t|]\s*/)
    .flatMap((part) => part.split(/\s*,\s*/))
    .map((p) => p.trim())
    .filter(Boolean);
  const list = cells.length > 0 ? cells : [raw];

  let name = "";
  let phone: string | null = null;
  let email: string | null = null;
  const rest: string[] = [];

  for (const cell of list) {
    const emailMatch = cell.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
    if (!email && emailMatch) {
      email = emailMatch[0].toLowerCase();
      continue;
    }
    if (!phone && !/[a-zA-Z]/.test(cell)) {
      const normalized = normalizePhone(cell);
      if (normalized) {
        phone = normalized;
        continue;
      }
    }
    if (!name && /[a-zA-ZÀ-ÿ]/.test(cell)) {
      name = cell.replace(/\s+/g, " ");
      continue;
    }
    rest.push(cell);
  }

  if (!name || (!phone && !email)) return null;

  return {
    name,
    phone,
    email,
    company: rest[0] ?? null,
    city: rest[1] ?? null,
  };
}

/** Remove cabeçalho de planilha, se presente. */
export function stripHeader(lines: string[]): string[] {
  if (lines.length === 0) return lines;
  const first = lines[0].toLowerCase();
  const isHeader =
    (first.includes("nome") || first.includes("name") || first.includes("empresa") || first.includes("contato")) &&
    (first.includes("telefone") ||
      first.includes("phone") ||
      first.includes("celular") ||
      first.includes("email") ||
      first.includes("e-mail") ||
      first.includes("whatsapp"));
  return isHeader ? lines.slice(1) : lines;
}

function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const clean = String(value).trim().replace(",", ".");
  const num = parseFloat(clean);
  return Number.isFinite(num) ? num : null;
}

/**
 * Detecta se a lista de registros corresponde à Planilha de Prospecção (29 colunas),
 * Apify, AISA ou formato genérico.
 */
export function detectLeadSource(items: Record<string, unknown>[]): LeadSourceKind {
  if (!items.length) return "simple_csv";

  // Amostra até as 5 primeiras linhas
  const sample = items.slice(0, 5);
  const sampleKeys = new Set<string>();
  for (const row of sample) {
    for (const k of Object.keys(row)) {
      sampleKeys.add(normalizeKey(k));
    }
  }

  // 1. Checa Planilha de Prospecção (29 colunas)
  const hasEmpresa = sampleKeys.has("empresa");
  const hasProspectMarkers =
    sampleKeys.has("telefonegooglemaps") ||
    sampleKeys.has("whatsappsite") ||
    sampleKeys.has("metaads") ||
    sampleKeys.has("googleads") ||
    sampleKeys.has("performancemobile") ||
    sampleKeys.has("problemasidentificados") ||
    sampleKeys.has("servicorecomendado") ||
    sampleKeys.has("ptsanuncios") ||
    sampleKeys.has("pontuacao") ||
    sampleKeys.has("prioridade") ||
    sampleKeys.has("notagoogle");

  if (hasEmpresa && hasProspectMarkers) {
    return "prospect_sheet";
  }

  // 2. Checa Apify (Google Places Crawler)
  const isApify =
    sampleKeys.has("totalscore") ||
    sampleKeys.has("reviewscount") ||
    sampleKeys.has("claimthisbusiness") ||
    sampleKeys.has("crawlergoogleplaces") ||
    sampleKeys.has("placeid") ||
    sampleKeys.has("categoryname") ||
    sampleKeys.has("reviewstags") ||
    sampleKeys.has("searchstring");

  if (isApify) {
    return "apify";
  }

  // 3. Checa AISA (Apollo)
  const isAisa =
    sampleKeys.has("websiteurl") ||
    sampleKeys.has("primaryphone") ||
    sampleKeys.has("organizationkeywordtags") ||
    sampleKeys.has("organizationlocations") ||
    (sampleKeys.has("industry") && (sampleKeys.has("linkedinurl") || sampleKeys.has("primaryphone")));

  if (isAisa) {
    return "aisa";
  }

  return "simple_csv";
}

/**
 * Normaliza um objeto com chaves normalizadas (sem símbolos e minúsculas).
 */
function createNormalizedRowMap(row: Record<string, unknown>): Record<string, unknown> {
  const map: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    map[normalizeKey(k)] = v;
  }
  return map;
}

/** Mapeador para a Planilha de Prospecção (29 colunas) */
function mapProspectSheetRow(row: Record<string, unknown>): UniversalLead | null {
  const n = createNormalizedRowMap(row);

  const empresa = String(n.empresa || n.name || "").trim();
  if (!empresa) return null;

  const phoneRaw = n.whatsappsite || n.telefonegooglemaps || n.whatsapp || n.telefone || n.phone;
  const phone = normalizePhone(phoneRaw);
  const email = extractEmail(row);
  const instagram = cleanInstagram(n.instagram);

  const customFields: Record<string, unknown> = {
    empresa,
    nicho: n.nicho ? String(n.nicho).trim() : null,
    bairro: n.bairro ? String(n.bairro).trim() : null,
    cidade: n.cidade ? String(n.cidade).trim() : null,
    site: n.website || n.site ? String(n.website || n.site).trim() : null,
    telefone_maps: n.telefonegooglemaps ? String(n.telefonegooglemaps).trim() : null,
    whatsapp: n.whatsappsite ? String(n.whatsappsite).trim() : null,
    instagram: n.instagram ? String(n.instagram).trim() : null,
    maps: n.perfilgooglemaps || n.maps ? String(n.perfilgooglemaps || n.maps).trim() : null,
    nota: parseNumber(n.notagoogle || n.nota),
    avaliacoes: parseNumber(n.avaliacoes),
    anuncios_ativos: n.anunciosativos !== undefined ? n.anunciosativos : null,
    meta_ads: n.metaads !== undefined ? n.metaads : null,
    evidencia_meta: n.evidenciameta ? String(n.evidenciameta).trim() : null,
    google_ads: n.googleads !== undefined ? n.googleads : null,
    evidencia_google: n.evidenciagoogle ? String(n.evidenciagoogle).trim() : null,
    performance_mobile: n.performancemobile ? String(n.performancemobile).trim() : null,
    problemas_identificados: n.problemasidentificados ? String(n.problemasidentificados).trim() : null,
    servico_recomendado: n.servicorecomendado ? String(n.servicorecomendado).trim() : null,
    pts_anuncios: parseNumber(n.ptsanuncios),
    pts_site: parseNumber(n.ptssite),
    pts_seo: parseNumber(n.ptsseo),
    pts_conversao: parseNumber(n.ptsconversao),
    pts_contato: parseNumber(n.ptscontato),
    pts_fit: parseNumber(n.ptsfit),
    pontuacao: parseNumber(n.pontuacao),
    prioridade: n.prioridade ? String(n.prioridade).trim() : null,
    fontes: n.fontes ? String(n.fontes).trim() : null,
    data_verificacao: n.datadaverificacao ? String(n.datadaverificacao).trim() : null,
    origem: "planilha_prospeccao",
    bruto: row,
  };

  return {
    name: empresa,
    phone,
    email,
    instagram_handle: instagram,
    custom_fields: customFields,
    sourceKind: "prospect_sheet",
  };
}

/** Mapeador para Apify (Google Places Scraper) */
function mapApifyRow(row: Record<string, unknown>): UniversalLead | null {
  const n = createNormalizedRowMap(row);
  const name = String(n.title || n.name || "").trim();
  if (!name) return null;

  const phoneRaw = n.phone || n.phoneunformatted;
  const phone = normalizePhone(phoneRaw);
  const email = n.email ? String(n.email).toLowerCase() : extractEmail(row);
  const instagram = cleanInstagram(n.instagram || (row.socials as any)?.instagram);

  const customFields: Record<string, unknown> = {
    empresa: name,
    nicho: n.categoryname || (Array.isArray(row.categories) ? row.categories[0] : null),
    bairro: n.neighborhood ? String(n.neighborhood).trim() : null,
    cidade: n.city ? String(n.city).trim() : null,
    site: n.website ? String(n.website).trim() : null,
    maps: n.url ? String(n.url).trim() : null,
    nota: parseNumber(n.totalscore || n.rating),
    avaliacoes: parseNumber(n.reviewscount),
    origem: "apify",
    bruto: row,
  };

  return {
    name,
    phone,
    email,
    instagram_handle: instagram,
    custom_fields: customFields,
    sourceKind: "apify",
  };
}

/** Mapeador para AISA (Apollo B2B) */
function mapAisaRow(row: Record<string, unknown>): UniversalLead | null {
  const n = createNormalizedRowMap(row);
  const name = String(n.name || "").trim();
  if (!name) return null;

  let phoneRaw = n.primaryphone || n.phone;
  if (typeof phoneRaw === "object" && phoneRaw !== null) {
    const pObj = phoneRaw as Record<string, unknown>;
    phoneRaw = pObj.sanitized_number || pObj.number || pObj.phone;
  }
  const phone = normalizePhone(phoneRaw);
  const email = n.email ? String(n.email).toLowerCase() : extractEmail(row);

  const customFields: Record<string, unknown> = {
    empresa: name,
    nicho: n.industry ? String(n.industry).trim() : null,
    cidade: n.city ? String(n.city).trim() : null,
    estado: n.state ? String(n.state).trim() : null,
    site: n.websiteurl || n.website ? String(n.websiteurl || n.website).trim() : null,
    linkedin: n.linkedinurl ? String(n.linkedinurl).trim() : null,
    origem: "aisa",
    bruto: row,
  };

  return {
    name,
    phone,
    email,
    instagram_handle: null,
    custom_fields: customFields,
    sourceKind: "aisa",
  };
}

/**
 * Parser Universal de Leads.
 * Recebe texto (CSV/TSV/JSON) ou Buffer (Excel/JSON/CSV) e extrai os leads
 * mapeando automaticamente a origem (Planilha 29 colunas, Apify, AISA ou CSV simples).
 */
export function parseUniversalLeads(input: {
  text?: string;
  buffer?: Buffer | ArrayBuffer | Uint8Array;
  fileName?: string;
}): {
  detectedSource: LeadSourceKind;
  leads: UniversalLead[];
  invalidCount: number;
  errors: string[];
} {
  const errors: string[] = [];
  let rows: Record<string, unknown>[] = [];
  const textRaw = (input.text || "").trim();

  // 1. Tenta carregar JSON se o texto começar com { ou [ ou se o arquivo for .json
  const isJsonFile = input.fileName?.toLowerCase().endsWith(".json");
  if (isJsonFile || textRaw.startsWith("{") || textRaw.startsWith("[")) {
    try {
      const jsonStr = textRaw || (input.buffer ? Buffer.from(input.buffer).toString("utf-8") : "");
      if (jsonStr) {
        const parsed = JSON.parse(jsonStr);
        if (Array.isArray(parsed)) {
          rows = parsed.filter((r) => r && typeof r === "object");
        } else if (parsed && typeof parsed === "object") {
          if (Array.isArray(parsed.organizations)) {
            rows = parsed.organizations;
          } else if (Array.isArray(parsed.accounts)) {
            rows = parsed.accounts;
          } else if (Array.isArray(parsed.items)) {
            rows = parsed.items;
          } else if (Array.isArray(parsed.results)) {
            rows = parsed.results;
          } else {
            rows = [parsed];
          }
        }
      }
    } catch (e) {
      // Se falhar o parse JSON e não for arquivo forçado, tenta XLSX
      if (isJsonFile) {
        errors.push("Arquivo JSON inválido: " + (e as Error).message);
      }
    }
  }

  // 2. Se não foi carregado como JSON, tenta ler via XLSX (Excel .xlsx, .xls ou CSV/TSV)
  if (rows.length === 0) {
    try {
      let wb: XLSX.WorkBook | null = null;
      if (input.buffer) {
        wb = XLSX.read(input.buffer, { type: "buffer" });
      } else if (textRaw) {
        wb = XLSX.read(textRaw, { type: "string" });
      }

      if (wb && wb.SheetNames.length > 0) {
        const firstSheet = wb.Sheets[wb.SheetNames[0]];
        const sheetRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: "" });
        if (sheetRows.length > 0) {
          rows = sheetRows;
        }
      }
    } catch {
      // continua para fallback de linhas simples
    }
  }

  // 3. Fallback: Parse de linhas simples de texto se XLSX não gerou objetos com colunas
  if (rows.length === 0 && textRaw) {
    const lines = textRaw
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const dataLines = stripHeader(lines);
    const leads: UniversalLead[] = [];
    let invalidCount = 0;

    for (const line of dataLines) {
      const parsed = parseLeadLine(line);
      if (parsed) {
        leads.push({
          name: parsed.name,
          phone: parsed.phone,
          email: parsed.email,
          instagram_handle: null,
          custom_fields: {
            empresa: parsed.company,
            cidade: parsed.city,
            origem: "csv_simples",
          },
          sourceKind: "simple_csv",
        });
      } else {
        invalidCount++;
      }
    }

    return {
      detectedSource: "simple_csv",
      leads,
      invalidCount,
      errors,
    };
  }

  // 4. Identifica a origem das colunas encontradas
  const detectedSource = detectLeadSource(rows);
  const leads: UniversalLead[] = [];
  let invalidCount = 0;

  for (const row of rows) {
    let lead: UniversalLead | null = null;
    if (detectedSource === "prospect_sheet") {
      lead = mapProspectSheetRow(row);
    } else if (detectedSource === "apify") {
      lead = mapApifyRow(row);
    } else if (detectedSource === "aisa") {
      lead = mapAisaRow(row);
    } else {
      // Fallback genérico para CSV estruturado
      const n = createNormalizedRowMap(row);
      const name = String(n.nome || n.name || n.empresa || n.title || "").trim();
      const phoneRaw = n.telefone || n.phone || n.celular || n.whatsapp;
      const phone = normalizePhone(phoneRaw);
      const email = n.email ? String(n.email).toLowerCase() : extractEmail(row);

      if (name && (phone || email)) {
        lead = {
          name,
          phone,
          email,
          instagram_handle: cleanInstagram(n.instagram),
          custom_fields: {
            empresa: n.empresa ? String(n.empresa).trim() : null,
            cidade: n.cidade ? String(n.cidade).trim() : null,
            origem: "csv_generico",
            bruto: row,
          },
          sourceKind: "simple_csv",
        };
      }
    }

    if (lead) {
      leads.push(lead);
    } else {
      invalidCount++;
    }
  }

  return {
    detectedSource,
    leads,
    invalidCount,
    errors,
  };
}
