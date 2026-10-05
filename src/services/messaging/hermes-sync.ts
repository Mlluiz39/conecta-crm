import "server-only";
import { DatabaseSync } from "node:sqlite";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env";

export type HermesSyncResult = {
  sessions: number;
  contacts: number;
  conversations: number;
  messages: number;
};

/**
 * Espelha o state.db do Hermes (fonte da verdade das conversas WhatsApp)
 * para o Supabase: contatos, conversas e mensagens.
 *
 * Idempotente: messages.upsert em (conversation_id, external_id=`hermes_<uid>`).
 * A conversa usa external_id `<fone>@s.whatsapp.net` p/ casar com o histórico
 * salvo pelo provider Evolution (mesmo contato = mesma conversa).
 */
export async function syncHermesState(): Promise<HermesSyncResult> {
  const home = serverEnv().hermes.home;
  if (!home) throw new Error("HERMES_HOME não configurado");

  const db = new DatabaseSync(`${home}/state.db`, { readOnly: true });
  const supabase = createAdminClient();
  const result: HermesSyncResult = { sessions: 0, contacts: 0, conversations: 0, messages: 0 };

  try {
    const { data: org } = await supabase.from("organizations").select("id").limit(1).single();
    if (!org) return result;
    const organizationId = org.id;

    // Canal alvo: primeiro canal whatsapp (ou cria "WhatsApp Hermes")
    let { data: channel } = await supabase
      .from("channels")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("type", "whatsapp")
      .limit(1)
      .maybeSingle();
    if (!channel) {
      const created = await supabase
        .from("channels")
        .upsert(
          {
            organization_id: organizationId,
            type: "whatsapp",
            name: "WhatsApp Hermes",
            cernio_channel_id: "hermes",
            status: "conectado",
            config: { provider: "hermes" },
          },
          { onConflict: "organization_id,type,cernio_channel_id" },
        )
        .select("id")
        .single();
      channel = created.data;
    }
    if (!channel) return result;
    const channelId = channel.id;

    const sessions = db
      .prepare(
        "SELECT id, session_key, display_name FROM sessions WHERE source = 'whatsapp'",
      )
      .all() as { id: string; session_key: string | null; display_name: string | null }[];
    result.sessions = sessions.length;

    for (const sess of sessions) {
      const phone = sess.session_key?.match(/whatsapp:dm:(\d+)/)?.[1];
      if (!phone) continue; // sessão sem DM identificável (grupo etc.)
      const handle = `${phone}@s.whatsapp.net`;

      // Match 3-tier (índice org+phone é PARCIAL — sem upsert onConflict):
      // 1) phone exato 2) sufixo 9 dígitos 3) nome. Mesma ordem do inbound.service.
      let { data: contact } = await supabase
        .from("contacts")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("phone", handle)
        .limit(1)
        .maybeSingle();
      if (!contact && phone.length >= 9) {
        const bySuffix = await supabase
          .from("contacts")
          .select("id")
          .eq("organization_id", organizationId)
          .like("phone", `%${phone.slice(-9)}`)
          .limit(1)
          .maybeSingle();
        contact = bySuffix.data;
      }
      if (!contact && sess.display_name) {
        const byName = await supabase
          .from("contacts")
          .select("id")
          .eq("organization_id", organizationId)
          .ilike("name", `%${sess.display_name}%`)
          .limit(1)
          .maybeSingle();
        contact = byName.data;
      }
      if (!contact) {
        const inserted = await supabase
          .from("contacts")
          .insert({
            organization_id: organizationId,
            name: sess.display_name || handle,
            phone: handle,
          })
          .select("id")
          .single();
        if (inserted.error && inserted.error.code !== "23505") {
          console.error("[hermes-sync] erro ao criar contato:", inserted.error.message);
        }
        contact = inserted.data;
        result.contacts++;
      }
      if (!contact) continue;

      const { data: conv, error: convErr } = await supabase
        .from("conversations")
        .upsert(
          {
            organization_id: organizationId,
            contact_id: contact.id,
            channel_id: channelId,
            channel_type: "whatsapp",
            external_id: handle,
            status: "aberta",
          },
          { onConflict: "channel_id,external_id" },
        )
        .select("id")
        .single();
      if (convErr || !conv) {
        if (convErr && convErr.code !== "23505") {
          console.error("[hermes-sync] erro na conversa:", convErr.message);
        }
        if (!conv) continue;
      }
      result.conversations++;

      const rows = db
        .prepare(
          `SELECT id, role, content, timestamp, message_uid
             FROM messages
            WHERE session_id = ? AND role IN ('user', 'assistant') AND content IS NOT NULL
              AND content NOT LIKE 'Your request was not processed%'
              AND content NOT LIKE 'This turn did not complete%'
            ORDER BY timestamp`,
        )
        .all(sess.id) as {
        id: number;
        role: string;
        content: string;
        timestamp: number;
        message_uid: string | null;
      }[];

      for (const m of rows) {
        const isIn = m.role === "user";
        const { error } = await supabase.from("messages").upsert(
          {
            organization_id: organizationId,
            conversation_id: conv.id,
            direction: isIn ? "in" : "out",
            sender_type: isIn ? "contact" : "agent_ai",
            content: m.content,
            external_id: `hermes_${m.message_uid ?? m.id}`,
            status: isIn ? "entregue" : "enviada",
            created_at: new Date(m.timestamp * 1000).toISOString(),
          },
          { onConflict: "conversation_id,external_id", ignoreDuplicates: true },
        );
        if (error && error.code !== "23505") {
          console.error("[hermes-sync] erro ao salvar mensagem:", error.message);
        } else if (!error) {
          result.messages++;
        }
      }
    }
  } finally {
    db.close();
  }

  return result;
}
