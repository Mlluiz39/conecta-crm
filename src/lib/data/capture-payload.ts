/**
 * Normaliza o que chega de um formulário/landing/anúncio para o formato que o
 * CRM grava em `contacts` e `opportunities`.
 *
 * Este arquivo é puro de propósito: a rota pública e os testes usam a mesma
 * função, e nenhum dos dois precisa de Supabase para saber se o payload presta.
 *
 * Regras:
 * - nome é opcional (cai para empresa/telefone), mas telefone OU e-mail é obrigatório;
 * - telefone brasileiro vira E.164 sem "+" (o mesmo formato de `lead-parser.ts`);
 * - só chaves de rastreamento conhecidas atravessam (UTM, gclid, ctwa_clid…),
 *   com teto de tamanho — o resto do formulário não é guardado por padrão.
 */

/** Lista fechada: chave desconhecida não vira dado no CRM. */
export const TRACKING_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "utm_id",
  "utm_adset",
  "utm_ad",
  "utm_placement",
  "utm_matchtype",
  "utm_network",
  "utm_device",
  "utm_creative",
  "gclid",
  "gbraid",
  "wbraid",
  "fbclid",
  "ctwa_clid",
  "ttclid",
  "msclkid",
] as const;

export type TrackingKey = (typeof TRACKING_KEYS)[number];

export type CaptureFields = {
  name: string;
  phone: string | null;
  email: string | null;
  company: string | null;
  city: string | null;
  message: string | null;
  externalId: string | null;
  /** Origem de campanha; vazio quando o formulário não mandou nada. */
  tracking: Partial<Record<TrackingKey, string>>;
};

export type CaptureParseResult =
  | { ok: true; fields: CaptureFields }
  | { ok: false; error: string };

const MAX_NAME = 160;
const MAX_COMPANY = 160;
const MAX_CITY = 120;
const MAX_EMAIL = 254;
const MAX_MESSAGE = 2000;
const MAX_TRACKING = 300;
const MAX_EXTERNAL_ID = 200;

/** "Nome completo" → "nomecompleto"; serve para comparar cabeçalhos. */
export function normalizeFieldKey(key: string): string {
  return String(key ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function clean(value: unknown, max: number): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") return null; // File/Blob/array: não é campo de texto
  const text = String(value)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .trim();
  if (!text) return null;
  return text.slice(0, max);
}

/** Telefone brasileiro no mesmo formato do restante do CRM (55 + DDD + número). */
export function normalizeCapturePhone(raw: unknown): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  // 8–11 dígitos = número nacional sem DDI; 12+ já veio com DDI (ou é internacional).
  return digits.length <= 11 ? `55${digits}` : digits;
}

export function normalizeCaptureEmail(raw: unknown): string | null {
  const email = clean(raw, MAX_EMAIL)?.toLowerCase() ?? null;
  if (!email) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

const NAME_KEYS = ["nome", "name", "nomecompleto", "fullname", "contato", "lead"];
const PHONE_KEYS = [
  "telefone",
  "phone",
  "whatsapp",
  "celular",
  "fone",
  "telefonecelular",
  "telefonewhatsapp",
  "numerodetelefone",
];
const EMAIL_KEYS = ["email", "e-mail", "mail", "correioeletronico"];
const COMPANY_KEYS = ["empresa", "company", "organizacao", "negocio", "razaosocial"];
const CITY_KEYS = ["cidade", "city", "municipio"];
const MESSAGE_KEYS = ["mensagem", "message", "observacao", "observacoes", "comentario", "duvida"];
const EXTERNAL_KEYS = ["externalid", "external_id", "idexterno", "eventid", "event_id"];

function pick(values: Record<string, string>, keys: string[]): string | null {
  for (const key of keys) {
    const value = values[key];
    if (value) return value;
  }
  return null;
}

/**
 * Aceita JSON (`{ nome, telefone, utm_source }`) e form-urlencoded convertido
 * em objeto (`Object.fromEntries(await request.formData())`).
 */
export function parseCapturePayload(input: unknown): CaptureParseResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "Envie um objeto JSON ou um formulário." };
  }

  const values: Record<string, string> = {};
  const tracking: Partial<Record<TrackingKey, string>> = {};
  const trackingSet = new Set<string>(TRACKING_KEYS);

  for (const [rawKey, rawValue] of Object.entries(input as Record<string, unknown>)) {
    const raw = String(rawKey ?? "").trim().toLowerCase();
    const value = clean(rawValue, raw.startsWith("utm_") || trackingSet.has(raw) ? MAX_TRACKING : MAX_MESSAGE);
    if (!value) continue;

    if (trackingSet.has(raw)) {
      tracking[raw as TrackingKey] = value;
      continue;
    }
    const key = normalizeFieldKey(raw);
    if (!key) continue;
    // Primeiro valor vence: campo repetido no form não vira lista.
    if (!(key in values)) values[key] = value;
  }

  const phone = normalizeCapturePhone(pick(values, PHONE_KEYS));
  const email = normalizeCaptureEmail(pick(values, EMAIL_KEYS));

  if (!phone && !email) {
    return { ok: false, error: "Informe telefone ou e-mail para o lead entrar no CRM." };
  }

  const company = clean(pick(values, COMPANY_KEYS), MAX_COMPANY);
  const rawName = clean(pick(values, NAME_KEYS), MAX_NAME);
  // O nome nunca é obrigatório: formulário de anúncio costuma mandar só o telefone.
  const name = rawName || company || phone || email || "Lead do site";

  return {
    ok: true,
    fields: {
      name,
      phone,
      email,
      company,
      city: clean(pick(values, CITY_KEYS), MAX_CITY),
      message: clean(pick(values, MESSAGE_KEYS), MAX_MESSAGE),
      externalId: clean(pick(values, EXTERNAL_KEYS), MAX_EXTERNAL_ID),
      tracking,
    },
  };
}
