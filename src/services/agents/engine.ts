import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AgentToolKey,
  ChannelType,
  HandoffRuleKey,
  PromptVariables,
  AgentRole,
} from "@/types/domain";
import { AGENT_ROLE_LABEL, CHANNEL_LABEL } from "@/types/domain";
import { serverEnv } from "@/lib/env";
import { runAgentLoop } from "./claude";
import {
  avaliarRetomadaAutomatica,
  avisoRetomada,
  evaluateHandoff,
  mensagemDeTransbordo,
} from "./handoff";
import { buildInternalSystemInstruction } from "./internal";
import { executeInternalTool, internalToolsForClaude } from "./internal-tools";
import { contextoAtual, formatBusinessHours, isWithinBusinessHours } from "./business-hours";
import { renderPrompt } from "./prompt";
import { executeTool, toolsForClaude } from "./tools";
import { buildAgentSystemInstruction, sanitizeAiReply } from "./sanitizer";

const HISTORY_LIMIT = 20;

export type EngineResult = {
  handled: boolean;
  reply?: string;
  reason?: string;
  handoffRule?: HandoffRuleKey;
};

/** Resolve o agente que atende um canal, pela regra de 1 ativo por canal. */
export async function resolveChannelAgent(
  supabase: SupabaseClient,
  organizationId: string,
  channel: ChannelType,
): Promise<{ agentId: string } | null> {
  const { data } = await supabase
    .from("agent_channels")
    .select("agent_id, agents!inner(is_active)")
    .eq("organization_id", organizationId)
    .eq("channel", channel)
    .eq("is_active", true)
    .maybeSingle();
  if (!data) return null;
  const agent = (data as any).agents;
  if (!agent?.is_active) return null;
  return { agentId: data.agent_id };
}


/**
 * Rede de segurança do roteamento: se o gerente não chamar `delegar_para`, classificamos a
 * intenção por palavras-chave para a conversa não ficar sem especialista.
 * (Modelos pequenos às vezes ignoram ferramentas; isto garante a hierarquia de qualquer forma.)
 */
const REGRAS_ROTA: { role: AgentRole; termos: RegExp }[] = [
  { role: "suporte", termos: /\b(erro|problema|parou|n[ãa]o funciona|n[ãa]o est[áa] funcionando|bug|quebrou|fora do ar|caiu|inst[áa]vel)\b/i },
  { role: "agendador", termos: /\b(agendar|agenda|remarcar|desmarcar|cancelar|marcar|reuni[ãa]o|visita|hor[áa]rio dispon[íi]vel)\b/i },
  { role: "vendedor", termos: /\b(or[çc]amento|pre[çc]o|valor|quanto custa|proposta|contratar|site|sistema|aplicativo|app|automa[çc][ãa]o|integra[çc][ãa]o|agente de ia|chatbot|landing)\b/i },
  { role: "atendente", termos: /\b(d[úu]vida|informa[çc][ãa]o|como funciona|endere[çc]o|contato|pagamento|suporte)\b/i },
];

function classificarIntencao(texto: string): AgentRole | null {
  const alvo = String(texto ?? "");
  for (const regra of REGRAS_ROTA) {
    if (regra.termos.test(alvo)) return regra.role;
  }
  return null;
}

/** Campos da conversa que a retomada automática precisa ler. */
type ConversaParaRetomada = {
  id: string;
  assigned_to: string | null;
  bot_disabled_at: string | null;
  handoff_reason: string | null;
};

/**
 * Retoma uma conversa que ficou em transbordo sem ninguém atender.
 *
 * Só age quando **ninguém assumiu** a conversa (`assigned_to` nulo): se um humano clicou
 * "Assumir conversa", quem manda é ele. O silêncio é medido do transbordo
 * (`bot_disabled_at`) ou da última mensagem escrita por um humano no CRM — o que for mais
 * recente — e precisa passar de `HANDOFF_AUTO_RESUME_MINUTES` (padrão 30; 0 desliga).
 *
 * Quando retoma, deixa uma nota na conversa: sem isso a IA "voltaria do nada" no histórico.
 */
async function retomarConversaAbandonada(params: {
  supabase: SupabaseClient;
  organizationId: string;
  conversationId: string;
  conversation: ConversaParaRetomada;
}): Promise<{ retomou: boolean; minutosParados: number | null }> {
  const { supabase, organizationId, conversationId, conversation } = params;
  const minutos = serverEnv().handoff.autoResumeMinutes;

  let ultimaHumanaEm: string | null = null;
  if (!conversation.assigned_to && conversation.bot_disabled_at) {
    const { data } = await supabase
      .from("messages")
      .select("created_at")
      .eq("conversation_id", conversationId)
      .eq("direction", "out")
      .eq("sender_type", "user")
      .gte("created_at", conversation.bot_disabled_at)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    ultimaHumanaEm = (data as { created_at?: string } | null)?.created_at ?? null;
  }

  const decisao = avaliarRetomadaAutomatica({
    botDisabledAt: conversation.bot_disabled_at,
    ultimaHumanaEm,
    assumidaPorHumano: Boolean(conversation.assigned_to),
    minutos,
  });
  if (!decisao.retomar) return { retomou: false, minutosParados: decisao.minutosParados };

  const { error } = await supabase
    .from("conversations")
    .update({ bot_active: true, handoff_reason: null, bot_disabled_at: null })
    .eq("id", conversationId)
    .eq("organization_id", organizationId);
  if (error) {
    console.error("[handoff] não deu para retomar a conversa:", error.message);
    return { retomou: false, minutosParados: decisao.minutosParados };
  }

  await supabase.from("conversation_notes").insert({
    organization_id: organizationId,
    conversation_id: conversationId,
    content:
      `IA retomou o atendimento automaticamente: ${decisao.minutosParados} min sem resposta ` +
      `humana (transbordo: ${conversation.handoff_reason ?? "assumido no CRM"}).`,
  });
  console.log(
    `[handoff] conversa ${conversationId} retomada pela IA depois de ${decisao.minutosParados} min`,
  );
  return { retomou: true, minutosParados: decisao.minutosParados };
}

export async function runAgentForConversation(params: {
  supabase: SupabaseClient;
  organizationId: string;
  conversationId: string;
  inboundText: string;
  /** Lead mandou áudio: a resposta sai como nota de voz, na voz do agente que atendeu. */
  inboundWasAudio?: boolean;
  /**
   * Id da mensagem que acabou de entrar (já gravada em `messages`). Serve para o histórico
   * não contar a mensagem atual duas vezes — sem isso um único pedido de humano virava dois
   * e a IA saía da conversa na primeira menção.
   */
  inboundMessageId?: string | null;
}): Promise<EngineResult> {
  const { supabase, organizationId, conversationId, inboundText, inboundWasAudio, inboundMessageId } = params;

  const { data: conv } = await supabase
    .from("conversations")
    .select(
      "id, contact_id, channel_type, agent_id, bot_active, assigned_to, bot_disabled_at, handoff_reason, is_internal, contact:contacts(id, name)",
    )
    .eq("id", conversationId)
    .eq("organization_id", organizationId)
    .single();
  if (!conv) return { handled: false, reason: "conversa_nao_encontrada" };

  /**
   * Transbordo não é definitivo: se ninguém assumiu a conversa e já passou o tempo de
   * silêncio, a IA retoma aqui mesmo (ver `avaliarRetomadaAutomatica`). Sem isso, o lead que
   * volta a escrever depois de um handoff automático ficava sem resposta para sempre.
   */
  let minutosDeRetomada: number | null = null;
  if (!conv.bot_active) {
    const retomada = await retomarConversaAbandonada({
      supabase,
      organizationId,
      conversationId,
      conversation: conv as ConversaParaRetomada,
    });
    if (!retomada.retomou) return { handled: false, reason: "bot_desativado" };
    minutosDeRetomada = retomada.minutosParados;
  }

  /**
   * Conversa interna = o dono falando com o agente (ex.: Telegram do CEO). Não é lead:
   * outro prompt, outras ferramentas (só leitura) e nenhuma regra comercial.
   */
  const interno = Boolean((conv as any).is_internal);

  let agentId = conv.agent_id as string | null;
  if (interno) {
    // Modo dono é sempre com o gerente: nada de cair em vendedor/agendador por delegação.
    const { data: gerente } = await supabase
      .from("agents")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("role", "gerente")
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    agentId = gerente?.id ?? null;
    if (!agentId) return { handled: false, reason: "sem_agente_gerente" };
  } else if (!agentId) {
    const resolved = await resolveChannelAgent(supabase, organizationId, conv.channel_type);
    agentId = resolved?.agentId ?? null;
  }
  if (!agentId) return { handled: false, reason: "sem_agente_no_canal" };

  const { data: agent } = await supabase
    .from("agents")
    .select("id, name, role, tone, is_active")
    .eq("id", agentId)
    .eq("organization_id", organizationId)
    .single();
  if (!agent || !agent.is_active) return { handled: false, reason: "agente_inativo" };

  // O modo interno monta a instrução em código; não depende de prompt publicado.
  const { data: promptVersion } = interno
    ? { data: null }
    : await supabase
        .from("agent_prompt_versions")
        .select("id, prompt")
        .eq("agent_id", agentId)
        .eq("status", "published")
        .maybeSingle();
  if (!interno && !promptVersion) return { handled: false, reason: "sem_prompt_publicado" };

  const [{ data: toolRows }, { data: ruleRows }, { data: org }] = await Promise.all([
    supabase.from("agent_tools").select("tool_key, enabled").eq("agent_id", agentId).eq("enabled", true),
    supabase.from("agent_handoff_rules").select("rule_key, enabled, config").eq("agent_id", agentId).eq("enabled", true),
    supabase.from("organizations").select("name, business_hours, timezone, out_of_hours_message").eq("id", organizationId).single(),
  ]);

  const enabledTools = (toolRows ?? []).map((r: any) => r.tool_key as AgentToolKey);
  const enabledRules = (ruleRows ?? []).map((r: any) => r.rule_key as HandoffRuleKey);

  // Regra de handoff antes de chamar a IA — nunca numa conversa interna: "transbordar para
  // humano" não faz sentido quando quem escreve É o dono.
  let rule: HandoffRuleKey | null = null;
  if (!interno) {
    // O pedido de humano é contado junto com o histórico: uma menção isolada ("vocês têm
    // atendente?") não desliga mais o atendimento — a IA responde e tenta resolver.
    // A mensagem atual é excluída da consulta (`neq id`): ela entra na conta como `message`.
    let consultaHistorico = supabase
      .from("messages")
      .select("content")
      .eq("conversation_id", conversationId)
      .eq("direction", "in")
      .order("created_at", { ascending: false })
      .limit(5);
    if (inboundMessageId) consultaHistorico = consultaHistorico.neq("id", inboundMessageId);
    const { data: anteriores } = await consultaHistorico;

    rule = evaluateHandoff({
      enabledRules,
      message: inboundText,
      consecutiveFailures: 0,
      withinBusinessHours: isWithinBusinessHours(org?.business_hours, org?.timezone || "America/Sao_Paulo"),
      historicoInbound: (anteriores ?? [])
        .reverse()
        .map((m: any) => String(m.content ?? ""))
        .filter(Boolean),
      pedidosNecessarios: serverEnv().handoff.pedidosAteTransbordar,
    });
  }

  if (rule) {
    await supabase
      .from("conversations")
      .update({
        bot_active: false,
        handoff_reason: rule,
        bot_disabled_at: new Date().toISOString(),
      })
      .eq("id", conversationId);

    // Desligar em silêncio era o pior pedaço: o lead pedia uma pessoa e não recebia nada.
    // Esta mensagem fixa vai na fila da outbox (o inbound service dispara o flush) e o dono
    // recebe o alerta de "pediu humano" pelo detector.
    const espera = mensagemDeTransbordo();
    await supabase.from("messages").insert({
      organization_id: organizationId,
      conversation_id: conversationId,
      direction: "out",
      sender_type: "system",
      content: espera,
      status: "pendente",
      media: { typing: true },
    });
    return { handled: true, reply: espera, reason: "handoff", handoffRule: rule };
  }

  // Horário real de atendimento (organizations.business_hours)
  const horario = formatBusinessHours(org?.business_hours);

  // Variáveis do prompt (só o atendimento a lead usa o prompt publicado)
  const variables: PromptVariables = {
    nome_empresa: org?.name ?? "",
    nome_contato: (conv as any).contact?.name ?? "",
    horario_atendimento: horario,
    canal: CHANNEL_LABEL[conv.channel_type as ChannelType] ?? conv.channel_type,
    nome_agente: agent.name,
    funcao_agente: AGENT_ROLE_LABEL[agent.role as AgentRole] ?? agent.role,
  };
  const renderedBase = promptVersion ? renderPrompt(promptVersion.prompt, variables) : "";

  // ── Fase 2: memória própria + subagentes (hierarquia gerente → especialistas) ──
  // No modo interno não há subagentes: quem responde ao dono é sempre o gerente.
  const [{ data: memoriaRows }, { data: subRows }, { data: kbRows }] = await Promise.all([
    supabase.from("agent_memories").select("key, content").eq("agent_id", agentId),
    interno
      ? Promise.resolve({ data: [] as any[] })
      : supabase
          .from("agents")
          .select("id, name, role, tone")
          .eq("organization_id", organizationId)
          .eq("manager_agent_id", agentId)
          .eq("is_active", true),
    interno
      ? supabase.from("knowledge_base_items").select("title").eq("organization_id", organizationId).limit(30)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const memoria = (memoriaRows ?? [])
    .filter((m: any) => String(m.content ?? "").trim())
    .map((m: any) => `- ${m.key}: ${String(m.content).trim()}`)
    .join("\n");

  const subagentes = (subRows ?? [])
    .map((a: any) => `- ${a.role} → ${a.name}${a.tone ? ` (tom ${a.tone})` : ""}`)
    .join("\n");

  const system = interno
    ? buildInternalSystemInstruction({
        empresa: org?.name ?? "a empresa",
        dono: (conv as any).contact?.name ?? "o dono",
        agente: agent.name,
        topicos: (kbRows ?? []).map((k: any) => String(k.title ?? "")).filter(Boolean),
        contexto: contextoAtual(org),
        memoria,
        aviso: minutosDeRetomada !== null ? avisoRetomada(minutosDeRetomada) : undefined,
      })
    : buildAgentSystemInstruction({
        basePrompt: renderedBase,
        role: agent.role,
        agentName: agent.name,
        tone: agent.tone,
        context: [
          contextoAtual(org),
          minutosDeRetomada !== null ? avisoRetomada(minutosDeRetomada) : "",
        ]
          .filter(Boolean)
          .join("\n"),
        memory: memoria,
        subagents: subagentes,
      });

  // Histórico recente em ordem cronológica
  const { data: historyRows } = await supabase
    .from("messages")
    .select("sender_type, content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);

  const history = (historyRows ?? [])
    .reverse()
    .filter((m: any) => m.content)
    .map((m: any): Anthropic.MessageParam => ({
      role: m.sender_type === "contact" ? "user" : "assistant",
      content: String(m.content),
    }));

  const { data: opp } = await supabase
    .from("opportunities")
    .select("id")
    .eq("contact_id", conv.contact_id)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .maybeSingle();

  const toolCtx = {
    supabase,
    organizationId,
    conversationId,
    contactId: conv.contact_id,
    opportunityId: opp?.id ?? null,
    agentId,
  };

  const result = await runAgentLoop({
    model: serverEnv().defaultModel,
    system,
    messages: [...history, { role: "user", content: inboundText }],
    // Modo dono: base de conhecimento + ferramentas de leitura do CRM (nada de
    // agendar/mover funil/transbordar — o dono não é lead e o agente não age sozinho).
    tools: interno
      ? internalToolsForClaude(toolsForClaude(["buscar_informacoes"]))
      : toolsForClaude(enabledTools),
    executeTool: (key, input) =>
      interno && key !== "buscar_informacoes"
        ? executeInternalTool(toolCtx, key, input)
        : executeTool(toolCtx, interno ? ["buscar_informacoes"] : enabledTools, key, input),
  });

  // Registra as chamadas de ferramentas no agent_tool_calls do schema
  for (const tc of result.toolCalls) {
    await supabase.from("agent_tool_calls").insert({
      organization_id: organizationId,
      agent_id: agentId,
      conversation_id: conversationId,
      tool_key: tc.tool_key,
      input: tc.input,
      output: tc.output,
    });
  }

  // Verifica se o bot permaneceu ativo (a tool derivar_para_atendente pode ter desativado)
  const { data: after } = await supabase
    .from("conversations")
    .select("bot_active")
    .eq("id", conversationId)
    .single();

  // Roteamento de segurança (Fase 2): gerente sem delegação explícita. Não vale no modo dono —
  // a conversa do CEO não pode ser "repassada" para um vendedor.
  if (!interno && String(agent.role) === "gerente") {
    const { data: depois } = await supabase
      .from("conversations")
      .select("agent_id")
      .eq("id", conversationId)
      .single();
    // Sem intenção clara NÃO roteia: o próprio gerente segue atendendo (antes caía sempre no
    // primeiro irmão da lista, o que jogava conversa genérica no agendador).
    const papel = classificarIntencao(inboundText);
    if (!depois?.agent_id && papel) {
      const { data: irmaos } = await supabase
        .from("agents")
        .select("id, name, role")
        .eq("organization_id", organizationId)
        .eq("manager_agent_id", agentId)
        .eq("is_active", true);
      const escolhido = (irmaos ?? []).find((a: any) => String(a.role) === papel) ?? null;
      if (escolhido) {
        await supabase
          .from("conversations")
          .update({ agent_id: escolhido.id })
          .eq("id", conversationId)
          .eq("organization_id", organizationId);
        await supabase.from("conversation_notes").insert({
          organization_id: organizationId,
          conversation_id: conversationId,
          content: `Roteado automaticamente para ${escolhido.name} (${escolhido.role}) — o gerente não delegou explicitamente.`,
        });
        console.log(`[agents] roteamento automático → ${escolhido.role} (${escolhido.name})`);
      }
    }
  }

  // Falha do LLM NUNCA vai para o cliente: registra e deixa o alerta/handoff cuidarem.
  if (result.error) {
    console.error("[agents] turno falhou (nada enviado ao cliente):", result.error);
    return { handled: true, reason: result.error };
  }

  if (after?.bot_active && result.reply) {
    // TRAVA DE SAÍDA: o cliente recebe só a resposta final — corta monólogo interno,
    // sintaxe de ferramenta, assinatura de spam/CTA e vazamento de log antes de gravar.
    const limpo = sanitizeAiReply(result.reply);
    if (limpo.trim() !== result.reply.trim()) {
      console.log(`[agents] trava de saída ajustou a resposta (${result.reply.length} -> ${limpo.length} chars)`);
    }
    await supabase.from("messages").insert({
      organization_id: organizationId,
      conversation_id: conversationId,
      direction: "out",
      sender_type: "agent_ai",
      agent_id: agentId,
      content: limpo,
      // Fila de saída: flushOutbox envia e retenta; 'enviada' só após aceite do provider.
      status: "pendente",
      // Resposta ao lead mostra "digitando…" antes do envio (campanha não usa).
      // `voice`: o lead mandou áudio, então a resposta sai em áudio.
      media: { typing: true, ...(inboundWasAudio ? { voice: true } : {}) },
    });
  }

  return {
    handled: true,
    reply: result.reply,
    reason: result.error,
  };
}
