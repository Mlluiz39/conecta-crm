import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseCapturePayload } from "@/lib/data/capture-payload";
import { ensureOpenOpportunity } from "@/lib/data/opportunity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/captacao/<token> — porta pública de captação de lead.
 *
 * Para quem está do outro lado (landing page, formulário próprio, Zapier, n8n,
 * TypeScript de anúncio) isto é só um endereço que aceita JSON ou
 * form-urlencoded e devolve 200. Não exige login; a credencial é o token da
 * fonte, que aponta para UMA organização.
 *
 * O que acontece depois:
 * 1. valida e normaliza o payload (telefone/e-mail obrigatório);
 * 2. reusa contato existente por telefone ou e-mail (sem duplicar);
 * 3. grava origem/UTM no contato;
 * 4. cria o card no funil (ou devolve o card aberto que já existe).
 *
 * A rota nunca devolve erro de negócio com stack: erro de formulário é 422 com
 * uma mensagem que o dono da página consegue corrigir.
 */

const MAX_BODY_BYTES = 64 * 1024;
const RATE_LIMIT_PER_MINUTE = 30;
const TOKEN_RE = /^[A-Za-z0-9_-]{16,128}$/;

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type",
  "cache-control": "no-store",
};

/**
 * Limite em memória: best-effort por instância. Não substitui um WAF, mas
 * impede que um formulário em loop crie centenas de leads em um minuto.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

function rateLimited(key: string): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    if (buckets.size > 5000) {
      for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
    }
    buckets.set(key, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  bucket.count += 1;
  return bucket.count > RATE_LIMIT_PER_MINUTE;
}

function clientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;
  return request.headers.get("x-real-ip")?.trim() || null;
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: CORS_HEADERS });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET() {
  return json({ ok: false, error: "Use POST para enviar um lead." }, 405);
}

export async function POST(
  request: NextRequest,
  { params }: { params: { token: string } },
) {
  const token = String(params.token ?? "");
  if (!TOKEN_RE.test(token)) return json({ ok: false, error: "Fonte inválida." }, 404);

  const ip = clientIp(request);
  if (rateLimited(`${token}:${ip ?? "sem-ip"}`)) {
    return json({ ok: false, error: "Muitas tentativas. Tente de novo em um minuto." }, 429);
  }

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return json({ ok: false, error: "Payload grande demais." }, 413);
  }

  const admin = createAdminClient();
  const { data: source, error: sourceError } = await admin
    .from("lead_capture_sources")
    .select("id, organization_id, name, stage_id, is_active")
    .eq("token", token)
    .maybeSingle();

  if (sourceError) {
    console.error("[captacao] leitura da fonte falhou:", sourceError.message);
    return json({ ok: false, error: "Não foi possível ler a fonte." }, 500);
  }
  if (!source || !source.is_active) {
    return json({ ok: false, error: "Fonte inválida ou desativada." }, 404);
  }

  const contentType = (request.headers.get("content-type") ?? "").toLowerCase();
  let payload: unknown;
  try {
    if (contentType.includes("application/json")) {
      const raw = await request.text();
      if (raw.length > MAX_BODY_BYTES) {
        return json({ ok: false, error: "Payload grande demais." }, 413);
      }
      payload = JSON.parse(raw);
    } else if (contentType.includes("form")) {
      const form = await request.formData();
      const fields: Record<string, string> = {};
      form.forEach((value, key) => {
        // Campo repetido: o primeiro vence (mesma regra do parser).
        if (typeof value === "string" && !(key in fields)) fields[key] = value;
      });
      payload = fields;
    } else {
      // Cliente que não manda content-type: tenta JSON e, se não for, form.
      const raw = await request.text();
      if (raw.length > MAX_BODY_BYTES) {
        return json({ ok: false, error: "Payload grande demais." }, 413);
      }
      try {
        payload = JSON.parse(raw);
      } catch {
        payload = Object.fromEntries(new URLSearchParams(raw).entries());
      }
    }
  } catch {
    return json({ ok: false, error: "Corpo inválido: envie JSON ou form-urlencoded." }, 400);
  }

  const parsed = parseCapturePayload(payload);
  if (!parsed.ok) return json({ ok: false, error: parsed.error }, 422);

  const { fields } = parsed;
  const organizationId = String(source.organization_id);

  // ── Contato: reusa por telefone ou e-mail; nunca duplica ──────────────
  type Contato = {
    id: string;
    name: string | null;
    phone: string | null;
    email: string | null;
    custom_fields: Record<string, unknown> | null;
  };
  let contact: Contato | null = null;

  if (fields.phone) {
    const { data } = await admin
      .from("contacts")
      .select("id, name, phone, email, custom_fields")
      .eq("organization_id", organizationId)
      .eq("phone", fields.phone)
      .limit(1)
      .maybeSingle();
    contact = (data as Contato | null) ?? null;
  }
  if (!contact && fields.email) {
    const { data } = await admin
      .from("contacts")
      .select("id, name, phone, email, custom_fields")
      .eq("organization_id", organizationId)
      .eq("email", fields.email)
      .limit(1)
      .maybeSingle();
    contact = (data as Contato | null) ?? null;
  }
  if (!contact && fields.phone) {
    // Contatos antigos podem ter o telefone sem DDI; o sufixo de 9 dígitos
    // evita duplicar o mesmo lead em formatos diferentes.
    const { data } = await admin
      .from("contacts")
      .select("id, name, phone, email, custom_fields")
      .eq("organization_id", organizationId)
      .like("phone", `%${fields.phone.slice(-9)}`)
      .limit(1)
      .maybeSingle();
    contact = (data as Contato | null) ?? null;
  }

  const currentCustom =
    contact?.custom_fields && typeof contact.custom_fields === "object"
      ? (contact.custom_fields as Record<string, unknown>)
      : {};

  // Primeiro toque vence: origem e formulário não são sobrescritos por uma
  // segunda captura da mesma pessoa.
  const mergedCustom: Record<string, unknown> = { ...currentCustom };
  if (!mergedCustom.origem) mergedCustom.origem = "captacao";
  if (!mergedCustom.formulario) mergedCustom.formulario = source.name;
  if (fields.company && !mergedCustom.empresa) mergedCustom.empresa = fields.company;
  if (fields.city && !mergedCustom.cidade) mergedCustom.cidade = fields.city;
  if (fields.message) mergedCustom.mensagem = fields.message;
  if (Object.keys(fields.tracking).length > 0 && !mergedCustom.utm) {
    mergedCustom.utm = fields.tracking;
  }
  if (fields.externalId && !mergedCustom.captura_external_id) {
    mergedCustom.captura_external_id = fields.externalId;
  }
  mergedCustom.captura_em = new Date().toISOString();

  let contactId: string;
  if (contact) {
    contactId = String(contact.id);
    const patch: Record<string, unknown> = { custom_fields: mergedCustom };
    if (!contact.name && fields.name) patch.name = fields.name;
    if (!contact.email && fields.email) patch.email = fields.email;
    const { error } = await admin
      .from("contacts")
      .update(patch)
      .eq("organization_id", organizationId)
      .eq("id", contactId);
    if (error) console.error("[captacao] atualização do contato falhou:", error.message);
  } else {
    const { data, error } = await admin
      .from("contacts")
      .insert({
        organization_id: organizationId,
        name: fields.name,
        phone: fields.phone,
        email: fields.email,
        custom_fields: mergedCustom,
      })
      .select("id")
      .single();

    if (error || !data) {
      // Corrida com outro envio do mesmo formulário: re-seleciona.
      let againId: string | null = null;
      if (fields.phone) {
        const { data: again } = await admin
          .from("contacts")
          .select("id")
          .eq("organization_id", organizationId)
          .eq("phone", fields.phone)
          .maybeSingle();
        againId = again?.id ? String(again.id) : null;
      }
      if (!againId && fields.email) {
        const { data: again } = await admin
          .from("contacts")
          .select("id")
          .eq("organization_id", organizationId)
          .eq("email", fields.email)
          .maybeSingle();
        againId = again?.id ? String(again.id) : null;
      }
      if (!againId) {
        console.error("[captacao] insert do contato falhou:", error?.message);
        return json({ ok: false, error: "Não foi possível salvar o lead." }, 500);
      }
      contactId = againId;
    } else {
      contactId = String(data.id);
    }
  }

  // ── Card no funil: conversa/captação vira oportunidade ────────────────
  const opportunity = await ensureOpenOpportunity(admin, {
    organizationId,
    contactId,
    contactName: fields.name,
    stageId: source.stage_id ? String(source.stage_id) : null,
    title: `Lead — ${fields.name}`,
  });

  return json(
    {
      ok: true,
      contact_id: contactId,
      lead_id: opportunity?.id ?? null,
      card_created: opportunity?.created ?? false,
    },
    200,
  );
}
