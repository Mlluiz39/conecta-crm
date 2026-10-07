import "server-only";
import type { AgentToolContext } from "./tools";
import type { ToolSchema } from "./claude";

/**
 * Ferramentas do **modo dono**: o CEO pergunta ao Gerente pelo Telegram e ele responde com
 * dados reais do CRM. Todas são **somente leitura** — nenhuma escreve, agenda ou mexe em lead.
 *
 * A busca na base de conhecimento (`buscar_informacoes`) continua vindo do registry normal,
 * porque já é read-only e é o que responde "o que a gente vende / quanto custa / qual o prazo".
 */

export const INTERNAL_TOOL_KEYS = ["buscar_informacoes", "panorama_crm", "situacao_lead", "agenda"] as const;
export type InternalToolKey = (typeof INTERNAL_TOOL_KEYS)[number];

const DIA = 86_400_000;

/**
 * Meia-noite de hoje no horário de São Paulo (o container roda em UTC — "hoje" em UTC
 * começaria às 21h do dia anterior para o dono). O Brasil não tem mais horário de verão,
 * então o offset fixo -03:00 é o correto.
 */
function inicioDoDiaSP(agora = new Date()): Date {
  const [ano, mes, dia] = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(agora)
    .split("-");
  return new Date(`${ano}-${mes}-${dia}T00:00:00-03:00`);
}

function encurtar(texto: unknown, limite = 160): string {
  const t = String(texto ?? "").replace(/\s+/g, " ").trim();
  return t.length > limite ? `${t.slice(0, limite)}…` : t;
}

/** Números do dia: o que o dono pergunta primeiro ("como está hoje?"). */
async function panoramaCrm(ctx: AgentToolContext): Promise<unknown> {
  const { supabase, organizationId } = ctx;
  const desde = inicioDoDiaSP().toISOString();
  const ontem = new Date(Date.now() - DIA).toISOString();

  const [convs, msgsDia, alertas, calls, novos] = await Promise.all([
    supabase
      .from("conversations")
      .select("id, channel_type, status, bot_active, last_message_at, contact:contacts(name, phone)")
      .eq("organization_id", organizationId)
      .eq("is_internal", false)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(200),
    supabase
      .from("messages")
      .select("id, direction, created_at")
      .eq("organization_id", organizationId)
      .gte("created_at", desde)
      .limit(1000),
    supabase
      .from("alerts")
      .select("type, title, created_at, notified_at")
      .eq("organization_id", organizationId)
      .gte("created_at", ontem)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("appointments")
      .select("title, starts_at, status, contact:contacts(name)")
      .eq("organization_id", organizationId)
      .gte("starts_at", new Date(Date.now() - DIA).toISOString())
      .order("starts_at", { ascending: true })
      .limit(20),
    supabase
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .gte("created_at", desde),
  ]);

  const conversas = (convs.data ?? []) as any[];
  const comBot = conversas.filter((c) => c.bot_active).length;
  const entradas = (msgsDia.data ?? []).filter((m: any) => m.direction === "in").length;
  const saidas = (msgsDia.data ?? []).filter((m: any) => m.direction === "out").length;
  const aguardando = conversas.filter((c) => {
    if (!c.last_message_at) return false;
    return new Date(c.last_message_at).getTime() > Date.now() - 3 * DIA;
  });

  return {
    hoje: {
      mensagens_recebidas: entradas,
      mensagens_enviadas: saidas,
      contatos_novos: novos.count ?? 0,
    },
    conversas: {
      total: conversas.length,
      com_ia_ativa: comBot,
      em_atendimento_humano: conversas.length - comBot,
    },
    ultimas_conversas: conversas.slice(0, 8).map((c) => ({
      contato: c.contact?.name ?? c.contact?.phone ?? "sem nome",
      canal: c.channel_type,
      ia_ativa: c.bot_active,
      ultima_mensagem: c.last_message_at,
    })),
    alertas_ultimas_24h: (alertas.data ?? []).map((a: any) => ({
      tipo: a.type,
      titulo: a.title,
      quando: a.created_at,
    })),
    agenda: (calls.data ?? []).map((a: any) => ({
      titulo: a.title,
      quando: a.starts_at,
      status: a.status,
      contato: a.contact?.name ?? null,
    })),
    observacao: "Números calculados agora, direto do CRM.",
  };
}

/** Andamento de um lead específico: é o "o lead X teve alguma alteração?". */
async function situacaoLead(ctx: AgentToolContext, input: any): Promise<unknown> {
  const { supabase, organizationId } = ctx;
  const busca = String(input?.contato ?? input?.nome ?? "").trim();
  if (!busca) return { erro: "Informe o nome, telefone ou empresa do lead." };
  const digitos = busca.replace(/\D/g, "");
  // Vírgula e parêntese quebram a sintaxe do `or` do PostgREST.
  const termo = busca.replace(/[,()]/g, " ").trim();

  let query = supabase
    .from("contacts")
    .select("id, name, phone, email, telegram_chat_id, created_at")
    .eq("organization_id", organizationId)
    .limit(5);
  query =
    digitos.length >= 8
      ? query.or(`name.ilike.%${termo}%,phone.ilike.%${digitos}%`)
      : query.ilike("name", `%${termo}%`);

  const { data: contatos } = await query;
  if (!contatos?.length) return { encontrados: 0, busca, dica: "Nenhum contato com esse termo." };

  const detalhes = [];
  for (const contato of contatos as any[]) {
    const [{ data: convs }, { data: calls }, { data: opps }] = await Promise.all([
      supabase
        .from("conversations")
        .select("id, channel_type, status, bot_active, agent_id, last_message_at, unread_count")
        .eq("organization_id", organizationId)
        .eq("contact_id", contato.id)
        .eq("is_internal", false)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(3),
      supabase
        .from("appointments")
        .select("title, starts_at, status")
        .eq("organization_id", organizationId)
        .eq("contact_id", contato.id)
        .gte("starts_at", new Date(Date.now() - DIA).toISOString())
        .order("starts_at", { ascending: true })
        .limit(5),
      supabase
        .from("opportunities")
        .select("id, title, value, stage:pipeline_stages(name, is_won, is_lost)")
        .eq("organization_id", organizationId)
        .eq("contact_id", contato.id)
        .limit(3),
    ]);

    const conversas = (convs ?? []) as any[];
    const ultimas = [];
    for (const c of conversas.slice(0, 2)) {
      const { data: msgs } = await supabase
        .from("messages")
        .select("direction, sender_type, content, created_at")
        .eq("conversation_id", c.id)
        .order("created_at", { ascending: false })
        .limit(4);
      ultimas.push({
        conversa: c.id,
        canal: c.channel_type,
        ia_ativa: c.bot_active,
        ultima_atividade: c.last_message_at,
        ultimas_mensagens: (msgs ?? []).reverse().map((m: any) => ({
          de: m.direction === "in" ? "lead" : m.sender_type === "agent_ai" ? "IA" : "humano",
          texto: encurtar(m.content),
          quando: m.created_at,
        })),
      });
    }

    detalhes.push({
      contato: contato.name,
      telefone: contato.phone,
      criado_em: contato.created_at,
      funil: (opps ?? []).map((o: any) => ({
        titulo: o.title,
        valor: o.value,
        etapa: o.stage?.name ?? null,
        ganho: o.stage?.is_won ?? false,
        perdido: o.stage?.is_lost ?? false,
      })),
      agendamentos: calls ?? [],
      conversas: ultimas,
    });
  }

  return { encontrados: detalhes.length, busca, detalhes };
}

/** Próximos compromissos da agenda. */
async function agenda(ctx: AgentToolContext, input: any): Promise<unknown> {
  const dias = Math.min(Math.max(Number(input?.dias ?? 7), 1), 60);
  const { data } = await ctx.supabase
    .from("appointments")
    .select("title, starts_at, status, notes, contact:contacts(name, phone)")
    .eq("organization_id", ctx.organizationId)
    .gte("starts_at", new Date(Date.now() - DIA).toISOString())
    .lte("starts_at", new Date(Date.now() + dias * DIA).toISOString())
    .order("starts_at", { ascending: true })
    .limit(30);

  return {
    janela_dias: dias,
    compromissos: (data ?? []).map((a: any) => ({
      titulo: a.title,
      quando: a.starts_at,
      status: a.status,
      contato: a.contact?.name ?? null,
      telefone: a.contact?.phone ?? null,
      observacao: encurtar(a.notes, 120),
    })),
  };
}

const schemas: Record<Exclude<InternalToolKey, "buscar_informacoes">, ToolSchema> = {
  panorama_crm: {
    name: "panorama_crm",
    description:
      "Visão geral do CRM agora: mensagens recebidas/enviadas hoje, contatos novos, quantas conversas estão com a IA ativa e quantas em atendimento humano, últimas conversas, alertas das últimas 24h e a agenda. Use quando o dono perguntar 'como estão as coisas', 'como foi o dia' ou pedir um resumo.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  situacao_lead: {
    name: "situacao_lead",
    description:
      "Andamento de um lead/contato específico: etapa no funil, agendamentos, canal, se a IA está respondendo e as últimas mensagens trocadas. Use quando o dono citar um lead, empresa ou telefone ('o lead da Odonto X', 'aquele do 11 9...').",
    input_schema: {
      type: "object",
      properties: {
        contato: { type: "string", description: "Nome, empresa ou telefone do lead." },
      },
      required: ["contato"],
    },
  },
  agenda: {
    name: "agenda",
    description:
      "Próximos compromissos agendados (reuniões, visitas, demos) com contato e horário. Use quando o dono perguntar o que tem marcado.",
    input_schema: {
      type: "object",
      properties: {
        dias: { type: "number", description: "Quantos dias à frente olhar (1 a 60). Padrão 7." },
      },
      required: [],
    },
  },
};

/** Schemas das ferramentas internas (já inclui a busca na base de conhecimento). */
export function internalToolsForClaude(buscarInformacoes: ToolSchema[]): ToolSchema[] {
  return [...buscarInformacoes, schemas.panorama_crm, schemas.situacao_lead, schemas.agenda];
}

/** Executa uma ferramenta interna. Só leitura — nada aqui escreve no banco. */
export async function executeInternalTool(
  ctx: AgentToolContext,
  key: string,
  input: unknown,
): Promise<unknown> {
  switch (key) {
    case "panorama_crm":
      return panoramaCrm(ctx);
    case "situacao_lead":
      return situacaoLead(ctx, input);
    case "agenda":
      return agenda(ctx, input);
    default:
      throw new Error(`Ferramenta interna desconhecida: ${key}`);
  }
}
