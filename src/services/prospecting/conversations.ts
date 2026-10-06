import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { normalizePhone } from "@/lib/data/lead-parser";

type SupabaseLike = ReturnType<typeof createClient>;

/**
 * Resolve a conversa de WhatsApp do lead usando o MESMO external_id que o sync
 * do Hermes (`<fone>@s.whatsapp.net`). Sem isso a prospecção abriria uma thread
 * separada (`manual_<id>`) e a resposta do lead cairia em outra conversa.
 */
export async function ensureProspectConversation(
  supabase: SupabaseLike,
  params: { organizationId: string; contactId: string; channelId: string; phone: string | null },
): Promise<{ id: string; externalId: string; created: boolean } | null> {
  const digits = normalizePhone(params.phone ?? "");
  const canonical = digits ? `${digits}@s.whatsapp.net` : null;

  // 1) conversa canônica (a que o Hermes alimenta)
  if (canonical) {
    const { data: existing } = await supabase
      .from("conversations")
      .select("id")
      .eq("organization_id", params.organizationId)
      .eq("channel_id", params.channelId)
      .eq("external_id", canonical)
      .maybeSingle();
    if (existing) return { id: existing.id, externalId: canonical, created: false };
  }

  // 2) qualquer conversa já existente desse contato nesse canal (evita duplicar)
  const { data: byContact } = await supabase
    .from("conversations")
    .select("id, external_id")
    .eq("organization_id", params.organizationId)
    .eq("channel_id", params.channelId)
    .eq("contact_id", params.contactId)
    .limit(1)
    .maybeSingle();
  if (byContact) {
    return { id: byContact.id, externalId: byContact.external_id ?? "", created: false };
  }

  // 3) cria com o external_id canônico
  const externalId = canonical ?? `manual_${params.contactId}`;
  const { data: created, error } = await supabase
    .from("conversations")
    .insert({
      organization_id: params.organizationId,
      contact_id: params.contactId,
      channel_id: params.channelId,
      channel_type: "whatsapp",
      external_id: externalId,
      status: "aberta",
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") {
      const { data: again } = await supabase
        .from("conversations")
        .select("id")
        .eq("organization_id", params.organizationId)
        .eq("channel_id", params.channelId)
        .eq("external_id", externalId)
        .maybeSingle();
      if (again) return { id: again.id, externalId, created: false };
    }
    console.error("[prospect] conversa:", error.message);
    return null;
  }
  return { id: created.id, externalId, created: true };
}

/**
 * Resolve a conversa de E-MAIL do lead: mesmo `external_id` que o sync do Hermes
 * usa (`<email>`), então a resposta do cliente cai na mesma thread.
 */
export async function ensureEmailConversation(
  supabase: SupabaseLike,
  params: { organizationId: string; contactId: string; email: string },
): Promise<{ id: string; externalId: string } | null> {
  const externalId = params.email.trim().toLowerCase();
  if (!externalId) return null;

  let { data: channel } = await supabase
    .from("channels")
    .select("id")
    .eq("organization_id", params.organizationId)
    .eq("type", "email")
    .limit(1)
    .maybeSingle();

  if (!channel) {
    const { data: created } = await supabase
      .from("channels")
      .insert({
        organization_id: params.organizationId,
        type: "email",
        name: "E-mail (Hermes)",
        status: "conectado",
        config: { provider: "hermes" },
      })
      .select("id")
      .single();
    channel = created ?? null;
  }
  if (!channel) return null;

  const { data: existing } = await supabase
    .from("conversations")
    .select("id")
    .eq("organization_id", params.organizationId)
    .eq("channel_id", channel.id)
    .eq("external_id", externalId)
    .maybeSingle();
  if (existing) return { id: existing.id, externalId };

  const { data: byContact } = await supabase
    .from("conversations")
    .select("id, external_id")
    .eq("organization_id", params.organizationId)
    .eq("channel_id", channel.id)
    .eq("contact_id", params.contactId)
    .limit(1)
    .maybeSingle();
  if (byContact) return { id: byContact.id, externalId: byContact.external_id ?? externalId };

  const { data: createdConv, error } = await supabase
    .from("conversations")
    .insert({
      organization_id: params.organizationId,
      contact_id: params.contactId,
      channel_id: channel.id,
      channel_type: "email",
      external_id: externalId,
      status: "aberta",
    })
    .select("id")
    .single();
  if (error || !createdConv) {
    console.error("[prospect] conversa de e-mail:", error?.message);
    return null;
  }
  return { id: createdConv.id, externalId };
}
