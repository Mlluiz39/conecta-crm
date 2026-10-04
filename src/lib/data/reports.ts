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

export async function getReportData(): Promise<ReportData> {
  const { organizationId } = await requireProfile();
  const supabase = createClient();

  const [metricsRes, perfRes, contactsRes, convsRes, msgsRes, agentsRes] = await Promise.all([
    supabase.from("v_monthly_metrics").select("*").eq("organization_id", organizationId).order("mes", { ascending: true }),
    supabase.from("v_agent_performance").select("*").eq("organization_id", organizationId),
    supabase.from("contacts").select("id, created_at").eq("organization_id", organizationId),
    supabase.from("conversations").select("id, channel_type, agent_id").eq("organization_id", organizationId),
    supabase.from("messages").select("id, conversation_id, direction, created_at").eq("organization_id", organizationId).limit(500),
    supabase.from("agents").select("id, name").eq("organization_id", organizationId),
  ]);

  const monthlyRows = metricsRes.data ?? [];
  const monthly: MonthPoint[] = monthlyRows.map((r: any) => {
    const d = new Date(r.mes);
    return {
      mes: `${MONTHS[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`,
      receita: Number(r.receita ?? 0),
      leads: Number(r.leads_novos ?? 0),
      ganhos: Number(r.ganhos ?? 0),
    };
  });

  const totalReceita = monthly.reduce((s, m) => s + m.receita, 0);
  const totalLeads = (contactsRes.data ?? []).length;
  const totalGanhos = monthly.reduce((s, m) => s + m.ganhos, 0);
  const taxaConversao = totalLeads > 0 ? (totalGanhos / totalLeads) * 100 : 0;
  const ticketMedio = totalGanhos > 0 ? totalReceita / totalGanhos : 0;

  // Leads por canal
  const channelMap = new Map<string, number>();
  for (const c of convsRes.data ?? []) {
    const ch = (c as any).channel_type ?? "whatsapp";
    channelMap.set(ch, (channelMap.get(ch) ?? 0) + 1);
  }
  const byChannel: ChannelPoint[] = [...channelMap.entries()].map(([canal, leads]) => ({ canal, leads }));
  if (byChannel.length === 0) {
    byChannel.push({ canal: "whatsapp", leads: totalLeads });
  }

  // Desempenho por atendente (humanos da view + robôs de IA)
  const byAgent: AgentPoint[] = (perfRes.data ?? []).map((m: any) => ({
    nome: m.full_name || "Atendente",
    tipo: "Humano",
    conversas: Number(m.conversas_atendidas ?? 0),
    convertidos: Number(m.leads_convertidos ?? 0),
    receita: Number(m.receita_gerada ?? 0),
  }));

  // Adiciona robôs de IA
  for (const ag of agentsRes.data ?? []) {
    const convCount = (convsRes.data ?? []).filter((c: any) => c.agent_id === ag.id).length;
    byAgent.push({
      nome: ag.name,
      tipo: "IA",
      conversas: convCount,
      convertidos: 0,
      receita: 0,
    });
  }

  // TMR
  const tmrMinutos = computeTMR((msgsRes.data ?? []) as any[]);

  return {
    kpis: {
      receita: totalReceita,
      leadsNovos: totalLeads,
      taxaConversao,
      tmrMinutos,
      ticketMedio,
    },
    monthly,
    byChannel,
    byAgent: byAgent.filter((a) => a.conversas > 0 || a.receita > 0),
  };
}

function computeTMR(msgs: { conversation_id: string; direction: string; created_at: string }[]): number | null {
  const byConv = new Map<string, { direction: string; created_at: string }[]>();
  for (const m of msgs) {
    byConv.set(m.conversation_id, [...(byConv.get(m.conversation_id) ?? []), m]);
  }
  const deltas: number[] = [];
  for (const list of byConv.values()) {
    list.sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
    for (let i = 0; i < list.length; i++) {
      if (list[i].direction !== "in") continue;
      const reply = list.slice(i + 1).find((m) => m.direction === "out");
      if (reply) {
        deltas.push((+new Date(reply.created_at) - +new Date(list[i].created_at)) / 60000);
        break;
      }
    }
  }
  if (deltas.length === 0) return null;
  return deltas.reduce((s, d) => s + d, 0) / deltas.length;
}

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
