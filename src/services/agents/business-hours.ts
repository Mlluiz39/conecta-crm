/**
 * Relógio e expediente do atendimento.
 *
 * Módulo puro (sem `server-only`/banco) para poder ser testado: é o que decide se existe
 * pessoa da equipe agora — informação que o agente usa para não inventar horário nem
 * prometer retorno. Antes o cálculo era fixo (seg–sex 9–18), ignorando o que a organização
 * configura em `organizations.business_hours`.
 */

const DIAS_SEMANA: Record<string, number> = { dom: 0, seg: 1, ter: 2, qua: 3, qui: 4, sex: 5, sab: 6, sáb: 6 };

export type Faixa = { dias: number[]; inicio: number; fim: number };

/** "seg-sex" / "sab" / "seg,qua" → dias da semana (0 = domingo). */
export function diasDaChave(chave: string): number[] {
  const out = new Set<number>();
  for (const parte of chave.toLowerCase().split(/[,;]/).map((s) => s.trim()).filter(Boolean)) {
    const [a, b] = parte.split("-").map((s) => s.trim());
    const ia = DIAS_SEMANA[a?.slice(0, 3)];
    const ib = DIAS_SEMANA[(b ?? a)?.slice(0, 3)];
    if (ia === undefined) continue;
    if (ib === undefined) { out.add(ia); continue; }
    for (let d = Math.min(ia, ib); d <= Math.max(ia, ib); d++) out.add(d);
  }
  return [...out];
}

/** organizations.business_hours → faixas em minutos. Fallback: seg-sex 9h–18h. */
export function expediente(businessHours: any): Faixa[] {
  const faixas: Faixa[] = [];
  if (businessHours && typeof businessHours === "object") {
    for (const [chave, valor] of Object.entries(businessHours)) {
      const r = valor as { inicio?: string; fim?: string };
      if (!r?.inicio || !r?.fim) continue;
      const [hi, mi] = r.inicio.split(":").map(Number);
      const [hf, mf] = r.fim.split(":").map(Number);
      const dias = diasDaChave(chave);
      if (dias.length === 0) continue;
      faixas.push({ dias, inicio: hi * 60 + (mi || 0), fim: hf * 60 + (mf || 0) });
    }
  }
  return faixas.length ? faixas : [{ dias: [1, 2, 3, 4, 5], inicio: 9 * 60, fim: 18 * 60 }];
}

/** Dia da semana e minutos do dia no fuso da organização (o container pode estar em outro). */
export function partesNoFuso(tz: string, agora = new Date()): { dia: number; minutos: number } {
  try {
    const f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz || "America/Sao_Paulo",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const p = Object.fromEntries(f.formatToParts(agora).map((x) => [x.type, x.value]));
    const mapa: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const dia = mapa[String(p.weekday)] ?? agora.getDay();
    const minutos = Number(p.hour) * 60 + Number(p.minute);
    return { dia, minutos: Number.isFinite(minutos) ? minutos : agora.getHours() * 60 + agora.getMinutes() };
  } catch {
    return { dia: agora.getDay(), minutos: agora.getHours() * 60 + agora.getMinutes() };
  }
}

export function isWithinBusinessHours(businessHours: any, tz = "America/Sao_Paulo", agora = new Date()): boolean {
  const { dia, minutos } = partesNoFuso(tz, agora);
  return expediente(businessHours).some((f) => f.dias.includes(dia) && minutos >= f.inicio && minutos < f.fim);
}

/**
 * Bloco de contexto do turno: data/hora atual, expediente e situação.
 *
 * Sem isto o agente não sabe que horas são nem se existe pessoa da equipe — foi a causa de
 * respostas inventando horário ("estamos fechados", "retorno amanhã") no atendimento antigo.
 */
export function contextoAtual(org: { timezone?: string | null; business_hours?: any; out_of_hours_message?: string | null } | null): string {
  const tz = org?.timezone || "America/Sao_Paulo";
  const agora = new Date();
  let legivel = agora.toLocaleString("pt-BR", { timeZone: tz });
  try {
    legivel = new Intl.DateTimeFormat("pt-BR", {
      timeZone: tz,
      weekday: "long",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(agora);
  } catch {
    /* fuso inválido: usa o do servidor */
  }
  const dentro = isWithinBusinessHours(org?.business_hours, tz, agora);
  const faixas = expediente(org?.business_hours)
    .map((f) => `${f.dias.map((d) => ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"][d]).join("/")} ${String(Math.floor(f.inicio / 60)).padStart(2, "0")}h–${String(Math.floor(f.fim / 60)).padStart(2, "0")}h`)
    .join(" · ");
  const foraMsg = org?.out_of_hours_message?.trim()
    ? `
Mensagem padrão fora do horário: "${org.out_of_hours_message.trim()}"`
    : "";

  return `[CONTEXTO ATUAL — relógio e expediente da equipe]
Agora: ${legivel} (${tz})
Atendimento humano: ${faixas}
Situação: ${dentro ? "DENTRO do expediente (existe pessoa da equipe agora)" : "FORA do expediente (sem pessoa da equipe agora)"}${foraMsg}
Use isto só para saber se há pessoa da equipe disponível. Nunca diga que o sistema está fechado, nunca chute horário, nunca prometa prazo ou valor. Você atende em qualquer horário; o expediente só importa quando o assunto exigir uma pessoa (valor, prazo, fechamento, reunião).`;
}

/** business_hours ({"seg-sex":{"inicio":"09:00","fim":"18:00"}}) → texto legível. */
export function formatBusinessHours(businessHours: any): string {
  if (!businessHours || typeof businessHours !== "object") {
    return "Seg a Sex, 09h às 18h";
  }
  const parts = Object.entries(businessHours)
    .map(([days, range]) => {
      const r = range as { inicio?: string; fim?: string };
      if (!r?.inicio || !r?.fim) return null;
      return `${days}, ${r.inicio.replace(":00", "h")} às ${r.fim.replace(":00", "h")}`;
    })
    .filter(Boolean);
  return parts.length ? parts.join(" · ") : "Seg a Sex, 09h às 18h";
}
