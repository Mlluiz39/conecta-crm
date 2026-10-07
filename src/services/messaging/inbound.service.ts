import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { runAgentForConversation } from "@/services/agents/engine";
import { transcribeAudio, synthesizeSpeech } from "@/services/audio/voice";
import { getMessageProvider, providerFromConfig } from "./index";
import type { MessageProvider } from "./types";

/**
 * "digitando…" enquanto o modelo pensa. O indicador do WhatsApp expira sozinho, então
 * renovamos a cada ~7s. Quem fecha é o chamador: se já existe resposta na fila, o
 * `flushOutbox` continua digitando e fecha no envio (evita o indicador piscar).
 */
function comDigitando(
  provider: MessageProvider,
  accountId: string,
  to: string,
  presence: "composing" | "recording" = "composing",
) {
  const marcar = async (p: "composing" | "recording" | "paused", delayMs?: number) => {
    try {
      await provider.sendPresence?.(accountId, to, p, delayMs);
    } catch {
      // indicador é cosmético
    }
  };
  void marcar(presence, 8000);
  const timer = setInterval(() => void marcar(presence, 8000), 7000);
  let parado = false;
  return async function pararDigitando(manterAtivo: boolean) {
    if (parado) return;
    parado = true;
    clearInterval(timer);
    if (!manterAtivo) await marcar("paused");
  };
}

export type InboundOutcome = {
  status: "processed" | "duplicate" | "ignored" | "invalid_signature";
  messages: number;
};

function normalizeHandle(from: string): string {
  const v = String(from ?? "");
  // LID (identidade vinculada): preserva o sufixo p/ roundtrip de envio
  if (v.endsWith("@lid")) return `${v.replace(/[^\d]/g, "")}@lid`;
  return v.replace(/[^\d+]/g, "");
}

/**
 * Processa webhook da Zernio (ou Cernio):
 * Valida assinatura, salva webhook_events (idempotência), garante canal/contato/conversa e aciona IA.
 */
export async function handleInboundWebhook(params: {
  providerName: string;
  rawBody: string;
  headers: Headers;
}): Promise<InboundOutcome> {
  const provider = getMessageProvider(params.providerName);
  const supabase = createAdminClient();

  if (!provider.verifySignature(params.rawBody, params.headers)) {
    return { status: "invalid_signature", messages: 0 };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(params.rawBody);
  } catch {
    return { status: "ignored", messages: 0 };
  }

  const inbound = provider.parseInbound(payload);
  let processed = 0;

  for (const msg of inbound) {
    // 1. Idempotência em webhook_events: unique(provider, event_id)
    const { error: dupError } = await supabase.from("webhook_events").insert({
      provider: provider.name,
      event_id: msg.externalEventId,
      payload: msg.raw as any,
    });

    if (dupError) {
      if (dupError.code === "23505") continue; // Já processado
      throw new Error(dupError.message);
    }

    // 2. Resolve canal e organização
    let { data: channelRow } = await supabase
      .from("channels")
      .select("id, organization_id")
      .eq("cernio_channel_id", msg.externalAccountId)
      .maybeSingle();

    if (!channelRow) {
      // Se não achar por cernio_channel_id, busca a primeira organização
      const { data: fallbackOrg } = await supabase.from("organizations").select("id").limit(1).single();
      if (!fallbackOrg) continue;

      const { data: newChan } = await supabase
        .from("channels")
        .upsert(
          {
            organization_id: fallbackOrg.id,
            type: msg.channel,
            name: `Canal ${msg.channel.toUpperCase()}`,
            cernio_channel_id: msg.externalAccountId || "default",
            status: "conectado",
          },
          { onConflict: "organization_id,type,cernio_channel_id" },
        )
        .select("id, organization_id")
        .single();
      channelRow = newChan;
    }

    if (!channelRow) continue;
    const organizationId = channelRow.organization_id;
    const handle = normalizeHandle(msg.from);

    // 3. Localiza/cria contato — matching hierárquico (índice org+phone é PARCIAL,
    //    não dá upsert onConflict): 1) phone exato 2) sufixo 9 dígitos (DDI varia:
    //    "5511977869073" vs "11977869073") 3) nome/pushName (caso @lid)
    let { data: contact } = await supabase
      .from("contacts")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("phone", handle)
      .limit(1)
      .maybeSingle();

    const digits = handle.replace(/\D/g, "");
    if (!contact && digits.length >= 9 && !handle.endsWith("@lid")) {
      const { data: bySuffix } = await supabase
        .from("contacts")
        .select("id")
        .eq("organization_id", organizationId)
        .like("phone", `%${digits.slice(-9)}`)
        .limit(1)
        .maybeSingle();
      contact = bySuffix;
    }

    if (!contact && msg.fromName) {
      const { data: byName } = await supabase
        .from("contacts")
        .select("id")
        .eq("organization_id", organizationId)
        .ilike("name", `%${msg.fromName}%`)
        .limit(1)
        .maybeSingle();
      contact = byName;
    }

    if (!contact) {
      const inserted = await supabase
        .from("contacts")
        .insert({
          organization_id: organizationId,
          name: msg.fromName || handle || "Lead Inbound",
          phone: handle || null,
        })
        .select("id")
        .single();
      if (inserted.error && inserted.error.code !== "23505") {
        console.error("[webhook] erro ao criar contato:", inserted.error.message);
      }
      contact = inserted.data;
      if (!contact) {
        // corrida: outro evento criou o mesmo telefone agora
        const again = await supabase
          .from("contacts")
          .select("id")
          .eq("organization_id", organizationId)
          .eq("phone", handle)
          .maybeSingle();
        contact = again.data;
      }
    }

    if (!contact) continue;

    // 4. Upsert conversa (unique channel_id, external_id) — chave estável = thread do provider
    const externalConvId = msg.externalConversationId || msg.externalMessageId || `conv_${handle}`;
    const { data: conv } = await supabase
      .from("conversations")
      .upsert(
        {
          organization_id: organizationId,
          contact_id: contact.id,
          channel_id: channelRow.id,
          channel_type: msg.channel,
          external_id: externalConvId,
          status: "aberta",
        },
        { onConflict: "channel_id,external_id" },
      )
      .select("id")
      .single();

    if (!conv) continue;

    // 4b. Áudio do lead: transcreve para o agente poder responder o que ele falou.
    //     (Nota de voz não tem texto; sem isso o agente ficava em silêncio.)
    const inboundWasAudio = msg.kind === "audio";
    if (!msg.text && inboundWasAudio && msg.externalMessageId) {
      const midia = await provider.fetchMediaBase64?.(msg.externalAccountId, {
        id: msg.externalMessageId,
        raw: msg.raw,
      });
      const texto = midia ? await transcribeAudio(midia) : "";
      if (texto) {
        msg.text = texto;
        console.log(`[audio] ${msg.externalMessageId} transcrito (${texto.length} chars)`);
      } else {
        console.warn(`[audio] não consegui transcrever ${msg.externalMessageId}`);
      }
    }

    // 5. Insere mensagem recebida (trigger on_message_insert atualiza last_message_at e unread_count automaticamente)
    const { error: msgErr } = await supabase.from("messages").insert({
      organization_id: organizationId,
      conversation_id: conv.id,
      direction: "in",
      sender_type: "contact",
      content: msg.text || "",
      external_id: msg.externalMessageId,
      status: "entregue",
      created_at: msg.timestamp,
      ...(inboundWasAudio ? { media: { audio: true, transcribed: Boolean(msg.text) } } : {}),
    });

    if (msgErr && msgErr.code !== "23505") {
      console.error("Erro ao salvar mensagem:", msgErr);
    }

    await supabase
      .from("webhook_events")
      .update({ processed_at: new Date().toISOString() })
      .eq("provider", provider.name)
      .eq("event_id", msg.externalEventId);

    // 5b. Tick azul: o lead vê que a mensagem dele foi lida (best-effort, não bloqueia)
    if (msg.externalMessageId) {
      void provider
        .markRead?.(msg.externalAccountId, { id: msg.externalMessageId, from: msg.from })
        .catch(() => {});
    }

    // 6. Aciona o agente de IA para responder à conversa
    if (msg.text) {
      // "digitando…" desde já: o modelo leva alguns segundos e o lead precisa ver atividade.
      // Lead que mandou voz vê "gravando áudio…", coerente com a resposta em voz.
      const pararDigitando = comDigitando(
        provider,
        msg.externalAccountId,
        msg.from,
        inboundWasAudio ? "recording" : "composing",
      );
      let res: Awaited<ReturnType<typeof runAgentForConversation>> | null = null;
      try {
        res = await runAgentForConversation({
          supabase,
          organizationId,
          conversationId: conv.id,
          inboundText: msg.text,
          inboundWasAudio,
        });
      } finally {
        // Se já existe resposta na fila, quem fecha o indicador é o flushOutbox
        // (evita o "digitando" piscar entre o fim do modelo e o envio).
        await pararDigitando(Boolean(res?.handled && res?.reply));
      }

      // Resposta já foi gravada pelo engine como 'pendente' (fila de saída).
      // Fire-and-forget: webhook responde rápido (Evolution redeliveria em 30s);
      // envio acontece em paralelo e o cron /api/cron/outbox cobre falhas.
      if (res?.handled && res?.reply) {
        void flushOutbox(10).catch((e) => console.error("[outbox flush]", e));
      }
    }

    processed++;
  }

  return { status: processed > 0 ? "processed" : "duplicate", messages: processed };
}

const MAX_ATTEMPTS = 3;

type OutboxMeta = { attempts?: number; lastError?: string; lastAttemptAt?: string };

/**
 * Envia mensagens de saída pendentes (fila em messages.status='pendente').
 * Sucesso → 'enviada' + external_id. Falha → retenta até MAX_ATTEMPTS → 'falhou'.
 * Tentativas ficam em messages.media.outbox (jsonb, sem DDL).
 */
export async function flushOutbox(limit = 50): Promise<number> {
  const supabase = createAdminClient();

  const { data: rows, error } = await supabase
    .from("messages")
    .select(
      `id, organization_id, content, media, agent_id,
       conversation:conversations!inner(
         id, channel_id,
         channel:channels!inner(id, cernio_channel_id, config),
         contact:contacts(id, phone)
       )`,
    )
    .eq("direction", "out")
    .eq("status", "pendente")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("[outbox] erro ao ler fila:", error.message);
    return 0;
  }

  // Provider por organização: config do canal (tela Conexões) > env
  const providers = new Map<string, ReturnType<typeof getMessageProvider>>();
  function providerFor(orgId: string, channelCfg: any) {
    const cached = providers.get(orgId);
    if (cached) return cached;
    const p = providerFromConfig(channelCfg);
    providers.set(orgId, p);
    return p;
  }

  let sent = 0;
  console.log(`[outbox] fila: ${rows?.length ?? 0} pendente(s)`);
  for (const [i, row] of (rows ?? []).entries()) {
    // Delay anti-flood: rajada derruba a conexão Baileys
    if (i > 0) await new Promise((r) => setTimeout(r, 1500));
    const conv: any = row.conversation;
    const phone: string | undefined = conv?.contact?.phone;
    const meta: OutboxMeta = (row.media as any)?.outbox ?? {};
    const attempts = (meta.attempts ?? 0) + 1;
    const base: OutboxMeta = { attempts, lastAttemptAt: new Date().toISOString() };

    if (!row.content || !phone) {
      await supabase
        .from("messages")
        .update({
          status: "falhou",
          media: {
            ...((row.media as any) ?? {}),
            outbox: { ...base, lastError: !phone ? "contato sem telefone" : "mensagem sem conteúdo" },
          },
        })
        .eq("id", row.id);
      continue;
    }

    const provider = providerFor(row.organization_id, (conv?.channel as any)?.config);
    const accountId = (conv?.channel as any)?.cernio_channel_id || "default";
    // Resposta ao lead simula digitação (flag `typing` da fila). Disparo de campanha não:
    // segurar o lote travaria o cron.
    const typing = Boolean((row.media as any)?.typing);
    const digitandoMs = Math.min(Math.max(String(row.content).length * 45, 1200), 4500);
    const keepMedia = (extra: OutboxMeta) => ({ ...((row.media as any) ?? {}), outbox: extra });

    console.log(`[outbox] send via provider=${provider.name} to=${phone}${typing ? ` (digitando ${digitandoMs}ms)` : ""}`);
    if (typing) {
      await provider.sendPresence?.(accountId, phone, "composing", digitandoMs).catch(() => {});
      await new Promise((r) => setTimeout(r, digitandoMs));
    }
    const result = await provider.sendText(accountId, phone, row.content);
    if (typing) {
      // Sempre limpa o indicador: se o envio falhar, o lead não fica com "digitando…" preso.
      await provider.sendPresence?.(accountId, phone, "paused").catch(() => {});
    }

    if (result.ok) {
      await supabase
        .from("messages")
        .update({ status: "enviada", external_id: result.externalMessageId ?? null, media: keepMedia(base) })
        .eq("id", row.id);
      sent++;
    } else if (attempts >= MAX_ATTEMPTS) {
      await supabase
        .from("messages")
        .update({ status: "falhou", media: keepMedia({ ...base, lastError: result.error }) })
        .eq("id", row.id);
      console.error(`[outbox] mensagem ${row.id} falhou após ${attempts} tentativas:`, result.error);
    } else {
      await supabase
        .from("messages")
        .update({ media: keepMedia({ ...base, lastError: result.error }) })
        .eq("id", row.id);
      console.warn(`[outbox] tentativa ${attempts}/${MAX_ATTEMPTS} falhou:`, result.error);
    }
  }

  return sent;
}
