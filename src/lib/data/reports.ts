import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/session";

export type MonthPoint = { mes: string; receita: number; leads: number; ganhos: number };
export type ChannelPoint = { canal: string; leads: number };
export type AgentPoint = {
  nome: string;
  tipo: "Humano" | "IA";
  conversas: number;
  convertidos: number;
  receita: number;
};
export type ReportData = {
  kpis: {
    receita: number;
    leadsNovos: number;
    taxaConversao: number;
    tmrMinutos: number | null;
    ticketMedio: number;
  };
  monthly: MonthPoint[];
  byChannel: ChannelPoint[];
  byAgent: AgentPoint[];
};

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export async function getReportData(monthsBack = 6): Promise<ReportData> {
  const { organizationId } = await requireProfile();
  const supabase = createClient();
  const since = new Date();
  since.setMonth(since.getMonth() - (monthsBack - 1));
  since.setDate(1);
  since.setHours(0, 0, 0, 0);

  const [contactsRes, oppsRes, convsRes, msgsRes, agentsRes, profilesRes] = await Promise.all([
    supabase.from("contacts").select("id, origin_channel, created_at").eq("organization_id", organizationId).is("deleted_at", null).gte("created_at", since.toISOString()),
    supabase.from("opportunities").select("id, value, status, origin_channel, owner_id, created_at, won_at").eq("organization_id", organizationId).is("deleted_at", null),
    supabase.from("conversations").select("id, agent_id, assigned_to, channel").eq("organization_id", organizationId),
    supabase.from("messages").select("id, conversation_id, direction, created_at").eq("organization_id", organizationId).gte("created_at", since.toISOString()),
    supabase.from("agents").select("id, name").eq("organization_id", organizationId),
    supabase.from("profiles").select("id, full_name").eq("organization_id", organizationId),
  ]);

  const contacts = contactsRes.data ?? [];
  const opps = oppsRes.data ?? [];
  const convs = convsRes.data ?? [];
  const msgs = msgsRes.data ?? [];
  const agents = agentsRes.data ?? [];
  const profiles = profilesRes.data ?? [];

  const won = opps.filter((o: any) => o.status === "won");
  const receita = won.reduce((s: number, o: any) => s + Number(o.value), 0);
  const leadsNovos = contacts.length;
  const taxaConversao = opps.length ? (won.length / opps.length) * 100 : 0;
  const ticketMedio = won.length ? receita / won.length : 0;

  // TMR: primeira resposta outbound após cada inbound, por conversa.
  const tmrMinutos = computeTMR(msgs as any[]);

  // Série mensal.
  const monthly: MonthPoint[] = [];
  for (let i = 0; i < monthsBack; i++) {
    const d = new Date(since);
    d.setMonth(since.getMonth() + i);
    const y = d.getFullYear();
    const m = d.getMonth();
    const inMonth = (iso: string | null) => {
      if (!iso) return false;
      const x = new Date(iso);
      return x.getFullYear() === y && x.getMonth() === m;
    };
    monthly.push({
      mes: `${MONTHS[m]}/${String(y).slice(2)}`,
      receita: won.filter((o: any) => inMonth(o.won_at ?? o.created_at)).reduce((s: number, o: any) => s + Number(o.value), 0),
      leads: contacts.filter((c: any) => inMonth(c.created_at)).length,
      ganhos: won.filter((o: any) => inMonth(o.won_at ?? o.created_at)).length,
    });
  }

  // Leads por canal.
  const channelMap = new Map<string, number>();
  for (const c of contacts as any[]) {
    const ch = c.origin_channel ?? "manual";
    channelMap.set(ch, (channelMap.get(ch) ?? 0) + 1);
  }
  const byChannel = [...channelMap.entries()].map(([canal, leads]) => ({ canal, leads }));

  // Performance por atendente (humanos e IA).
  const agentNameById = new Map(agents.map((a: any) => [a.id, a.name]));
  const profileNameById = new Map(profiles.map((p: any) => [p.id, p.full_name]));
  const byAgent: AgentPoint[] = [];

  for (const [agentId, name] of agentNameById) {
    const convIds = convs.filter((c: any) => c.agent_id === agentId).map((c: any) => c.id);
    byAgent.push({
      nome: name as string,
      tipo: "IA",
      conversas: convIds.length,
      convertidos: won.filter((o: any) => convIds.includes(o.id)).length,
      receita: won.filter((o: any) => convIds.includes(o.id)).reduce((s: number, o: any) => s + Number(o.value), 0),
    });
  }
  for (const [profileId, name] of profileNameById) {
    const convIds = convs.filter((c: any) => c.assigned_to === profileId).map((c: any) => c.id);
    const myOpps = won.filter((o: any) => o.owner_id === profileId);
    byAgent.push({
      nome: (name as string) || "Atendente",
      tipo: "Humano",
      conversas: convIds.length,
      convertidos: myOpps.length,
      receita: myOpps.reduce((s: number, o: any) => s + Number(o.value), 0),
    });
  }

  return {
    kpis: { receita, leadsNovos, taxaConversao, tmrMinutos, ticketMedio },
    monthly,
    byChannel,
    byAgent: byAgent.filter((a) => a.conversas > 0 || a.receita > 0),
  };
}

/** Tempo médio de primeira resposta (min), pareado por conversa. */
function computeTMR(msgs: { conversation_id: string; direction: string; created_at: string }[]): number | null {
  const byConv = new Map<string, { direction: string; created_at: string }[]>();
  for (const m of msgs) {
    byConv.set(m.conversation_id, [...(byConv.get(m.conversation_id) ?? []), m]);
  }
  const deltas: number[] = [];
  for (const list of byConv.values()) {
    list.sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
    for (let i = 0; i < list.length; i++) {
      if (list[i].direction !== "inbound") continue;
      const reply = list.slice(i + 1).find((m) => m.direction === "outbound");
      if (reply) {
        deltas.push((+new Date(reply.created_at) - +new Date(list[i].created_at)) / 60000);
        break;
      }
    }
  }
  if (deltas.length === 0) return null;
  return deltas.reduce((s, d) => s + d, 0) / deltas.length;
}

/**
 * Gera o CSV (ou "XLSX" no formato CSV) dos dados de relatório.
 * ponytail: XLSX real (planilha binária) exigiria lib; CSV abre no Excel.
 * Upgrade = trocar por `xlsx`/exceljs quando o cliente pedir .xlsx nativo.
 */
export async function exportReportCsv(): Promise<string> {
  const data = await getReportData();
  const lines: string[] = [];

  lines.push("Métrica,Valor");
  lines.push(`Receita,${data.kpis.receita.toFixed(2)}`);
  lines.push(`Leads Novos,${data.kpis.leadsNovos}`);
  lines.push(`Taxa de Conversão (%),${data.kpis.taxaConversao.toFixed(2)}`);
  lines.push(`TMR (min),${data.kpis.tmrMinutos?.toFixed(1) ?? ""}`);
  lines.push(`Ticket Médio,${data.kpis.ticketMedio.toFixed(2)}`);
  lines.push("");

  lines.push("Mês,Receita,Leads,Ganhos");
  for (const m of data.monthly) lines.push(`${m.mes},${m.receita.toFixed(2)},${m.leads},${m.ganhos}`);
  lines.push("");

  lines.push("Canal,Leads");
  for (const c of data.byChannel) lines.push(`${c.canal},${c.leads}`);
  lines.push("");

  lines.push("Atendente,Tipo,Conversas,Convertidos,Receita");
  for (const a of data.byAgent) lines.push(`${a.nome},${a.tipo},${a.conversas},${a.convertidos},${a.receita.toFixed(2)}`);

  return lines.join("\n");
}
