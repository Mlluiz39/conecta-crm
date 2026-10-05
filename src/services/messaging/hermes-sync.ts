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

const MESSAGE_CHUNK = 200;

/**
 * Espelha o state.db do Hermes (fonte da verdade das conversas WhatsApp)
 * para o Supabase: contatos, conversas e mensagens.
 *
 * Idempotente: messages.upsert em (conversation_id, external_id=`hermes_<uid>`).
 * A conversa usa external_id `<fone>@s.whatsapp.net` p/ casar com o histórico
 * salvo pelo provider Evolution (mesmo contato = mesma conversa).
 *
 * Desempenho: tudo é resolvido em memória com poucas consultas em lote
 * (~6 queries por rodada) em vez de uma query por mensagem — cada ida ao
 * Supabase custa ~220ms.
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
      .prepare("SELECT id, session_key, display_name FROM sessions WHERE source = 'whatsapp'")
      .all() as { id: string; session_key: string | null; display_name: string | null }[];
    result.sessions = sessions.length;

    // Corte opcional (HERMES_SYNC_SINCE em ISO): só espelha mensagens a partir dali.
    // Sem isso o sync reimporta todo o histórico do state.db sempre que o CRM é limpo.
    const sinceRaw = process.env.HERMES_SYNC_SINCE ?? "";
    const sinceTs = sinceRaw ? Math.floor(new Date(sinceRaw).getTime() / 1000) : null;
    const validSince = sinceTs !== null && Number.isFinite(sinceTs) ? sinceTs : null;

    type HermesMessageRow = {
      id: number;
      role: string;
      content: string;
      timestamp: number;
      message_uid: string | null;
    };

    const selectMessages = db.prepare(
      `SELECT id, role, content, timestamp, message_uid
         FROM messages
        WHERE session_id = ? AND role IN ('user', 'assistant') AND content IS NOT NULL
          AND content NOT LIKE 'Your request was not processed%'
          AND content NOT LIKE 'This turn did not complete%'
          ${validSince !== null ? "AND timestamp >= ?" : ""}
        ORDER BY timestamp`,
    );

    // Sessões com mensagem nova são as únicas que precisam de contato/conversa.
    const rowsBySession = new Map<string, HermesMessageRow[]>();
    for (const sess of sessions) {
      const rows = (
        validSince !== null ? selectMessages.all(sess.id, validSince) : selectMessages.all(sess.id)
      ) as HermesMessageRow[];
      if (rows.length > 0) rowsBySession.set(sess.id, rows);
    }

    // ── Contatos da org (1 query) para casar em memória ──────────────────
    const { data: contactRows } = await supabase
      .from("contacts")
      .select("id, phone, name")
      .eq("organization_id", organizationId)
      .limit(5000);
    const byPhone = new Map<string, string>();
    const bySuffix = new Map<string, string>();
    const byName = new Map<string, string>();
    for (const c of contactRows ?? []) {
      if (c.phone) {
        byPhone.set(c.phone, c.id);
        const digits = String(c.phone).replace(/\D/g, "");
        if (digits.length >= 9) bySuffix.set(digits.slice(-9), c.id);
      }
      if (c.name) byName.set(String(c.name).toLowerCase(), c.id);
    }

    // ── Conversas existentes do canal (1 query) ──────────────────────────
    const { data: convRows } = await supabase
      .from("conversations")
      .select("id, external_id")
      .eq("organization_id", organizationId)
      .eq("channel_id", channelId);
    const convByExternal = new Map<string, string>();
    for (const c of convRows ?? []) {
      if (c.external_id) convByExternal.set(String(c.external_id), c.id);
    }

    // ── external_ids já espelhados (1 query) ─────────────────────────────
    const { data: knownRows } = await supabase
      .from("messages")
      .select("conversation_id, external_id")
      .eq("organization_id", organizationId)
      .like("external_id", "hermes_%");
    const knownByConversation = new Map<string, Set<string>>();
    for (const row of knownRows ?? []) {
      const key = String(row.conversation_id);
      const set = knownByConversation.get(key) ?? new Set<string>();
      set.add(String(row.external_id));
      knownByConversation.set(key, set);
    }

    type PendingMessage = Record<string, unknown>;
    const messagesByConversation = new Map<string, PendingMessage[]>();
    const queuedByConversation = new Map<string, Set<string>>();
    const missingContacts: Record<string, unknown>[] = [];

    for (const sess of sessions) {
      const rows = rowsBySession.get(sess.id);
      if (!rows) continue; // nada novo nesta sessão: não mexe em contato/conversa
      const phone = sess.session_key?.match(/whatsapp:dm:(\d+)/)?.[1];
      if (!phone) continue; // sessão sem DM identificável (grupo etc.)
      const handle = `${phone}@s.whatsapp.net`;
      const suffix = phone.length >= 9 ? phone.slice(-9) : null;
      const nameKey = sess.display_name ? sess.display_name.toLowerCase() : null;

      // Match 3-tier em memória: phone exato → sufixo (9) → nome
      let contactId =
        byPhone.get(handle) ??
        (suffix ? bySuffix.get(suffix) : undefined) ??
        (nameKey ? byName.get(nameKey) : undefined) ??
        null;

      if (!contactId) {
        const exists = missingContacts.some((c) => c.phone === handle);
        if (!exists) {
          missingContacts.push({
            organization_id: organizationId,
            name: sess.display_name || handle,
            phone: handle,
          });
        }
      }

      // Resolve/registra a conversa em memória
      const existingConv = convByExternal.get(handle) ?? null;
      let convId: string;
      if (existingConv) {
        convId = existingConv;
      } else {
        if (!contactId) {
          // O contato será criado no lote abaixo; a conversa desta sessão fica
          // para a próxima rodada (evita dependência de ordem).
          continue;
        }
        const { data: createdConv, error: convErr } = await supabase
          .from("conversations")
          .upsert(
            {
              organization_id: organizationId,
              contact_id: contactId,
              channel_id: channelId,
              channel_type: "whatsapp",
              external_id: handle,
              status: "aberta",
            },
            { onConflict: "channel_id,external_id" },
          )
          .select("id")
          .single();
        if (convErr || !createdConv) {
          if (convErr && convErr.code !== "23505") {
            console.error("[hermes-sync] erro na conversa:", convErr.message);
          }
          continue;
        }
        convId = createdConv.id;
        convByExternal.set(handle, convId);
      }
      result.conversations++;

      const bucket = messagesByConversation.get(convId) ?? [];
      const queued = queuedByConversation.get(convId) ?? new Set<string>();
      const known = knownByConversation.get(convId) ?? new Set<string>();

      for (const m of rows) {
        const externalId = `hermes_${m.message_uid ?? m.id}`;
        if (known.has(externalId) || queued.has(externalId)) continue;
        queued.add(externalId);
        const isIn = m.role === "user";
        bucket.push({
          organization_id: organizationId,
          conversation_id: convId,
          direction: isIn ? "in" : "out",
          sender_type: isIn ? "contact" : "agent_ai",
          content: m.content,
          external_id: externalId,
          status: isIn ? "entregue" : "enviada",
          created_at: new Date(m.timestamp * 1000).toISOString(),
        });
      }
      queuedByConversation.set(convId, queued);
      if (bucket.length > 0) messagesByConversation.set(convId, bucket);
    }

    // ── Cria contatos faltantes em lote ──────────────────────────────────
    if (missingContacts.length > 0) {
      const { data: created } = await supabase
        .from("contacts")
        .insert(missingContacts)
        .select("id, phone");
      result.contacts += created?.length ?? 0;
    }

    // ── Grava mensagens em lote ──────────────────────────────────────────
    for (const [, messages] of messagesByConversation) {
      for (let i = 0; i < messages.length; i += MESSAGE_CHUNK) {
        const chunk = messages.slice(i, i + MESSAGE_CHUNK);
        const { data: inserted, error } = await supabase
          .from("messages")
          .upsert(chunk, { onConflict: "conversation_id,external_id", ignoreDuplicates: true })
          .select("id");
        if (error && error.code !== "23505") {
          console.error("[hermes-sync] erro ao salvar mensagens:", error.message);
        } else if (!error) {
          result.messages += inserted?.length ?? 0;
        }
      }
    }
  } finally {
    db.close();
  }

  return result;
}
