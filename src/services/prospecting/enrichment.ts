/**
 * Transforma o enriquecimento salvo em `contacts.custom_fields` (vindo do Google Maps/Apify)
 * num bloco curto de contexto para a IA de abordagem.
 *
 * A ideia: o vendedor menciona UM detalhe real do negócio (bairro, categoria, avaliação,
 * ausência de site, perfil não reclamado) sem parecer que leu um relatório.
 */

type CustomFields = Record<string, unknown> | null | undefined;

function texto(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null;
  const s = String(valor).trim();
  return s === "" ? null : s;
}

function lista(valor: unknown): string[] {
  return Array.isArray(valor) ? valor.map((v) => String(v)).filter(Boolean) : [];
}

/**
 * Horários legíveis. O Google devolve os dias numa ordem que começa no dia da coleta,
 * então em vez de "terça a segunda" (confuso) resumimos as faixas distintas:
 * "todos os dias 9h–20h" ou "9h–19h (5 dias) e 9h–13h (2 dias)".
 */
function resumoHorarios(horarios: unknown): string | null {
  const itens = Array.isArray(horarios)
    ? (horarios as { day?: unknown; hours?: unknown }[])
        .map((h) => ({ day: String(h?.day ?? ""), hours: String(h?.hours ?? "") }))
        .filter((h) => h.day && h.hours)
    : [];
  if (itens.length === 0) return null;

  const curto = (h: string) =>
    h
      .replace(/\s*to\s*/i, "–")
      .replace(/:00/g, "h")
      .replace(/h–(\d{1,2})h/, "h–$1h");

  // "Fechado"/"Closed" não é faixa de horário: vira a lista de dias fechados
  const abertos = itens.filter((h) => !/fechad|closed/i.test(h.hours));
  const fechados = itens.filter((h) => /fechad|closed/i.test(h.hours)).map((h) => h.day);

  if (abertos.length === 0) return fechados.length ? `fechado (${fechados.slice(0, 3).join(", ")})` : null;

  const porFaixa = new Map<string, number>();
  for (const h of abertos) {
    const faixa = curto(h.hours);
    porFaixa.set(faixa, (porFaixa.get(faixa) ?? 0) + 1);
  }
  const faixas = [...porFaixa.entries()].sort((a, b) => b[1] - a[1]);
  const parte = faixas.length === 1
    ? abertos.length >= 6
      ? `todos os dias, ${faixas[0][0]}`
      : `${faixas[0][0]} (${abertos.length} ${abertos.length === 1 ? "dia" : "dias"}/semana)`
    : faixas.slice(0, 2).map(([faixa, n]) => `${faixa} (${n} ${n === 1 ? "dia" : "dias"})`).join(" e ");

  return fechados.length ? `${parte} — fechado ${fechados.slice(0, 3).join(", ")}` : parte;
}

/**
 * Bloco de contexto do negócio. Retorna `null` quando não há enriquecimento.
 * Não inclui telefone/site (o prompt já recebe esses dados separadamente).
 */
export function enrichmentContext(customFields: CustomFields): string | null {
  if (!customFields || typeof customFields !== "object") return null;

  const partes: string[] = [];
  const categorias = lista(customFields.categorias).length
    ? lista(customFields.categorias)
    : [texto(customFields.categoria)].filter(Boolean) as string[];
  if (categorias.length) partes.push(`ramo: ${categorias.slice(0, 3).join(", ")}`);

  const bairro = texto(customFields.bairro);
  const cidade = texto(customFields.cidade);
  const estado = texto(customFields.estado);
  const local = [bairro, [cidade, estado].filter(Boolean).join("/")].filter(Boolean).join(" — ");
  if (local) partes.push(`onde fica: ${local}`);

  const nota = customFields.nota;
  const avaliacoes = customFields.avaliacoes;
  if (nota !== null && nota !== undefined && String(nota) !== "") {
    partes.push(
      avaliacoes
        ? `avaliação no Google: ${nota} com ${avaliacoes} avaliações`
        : `avaliação no Google: ${nota}`,
    );
  }

  if (customFields.site === null || customFields.site === undefined || customFields.site === "") {
    partes.push("NÃO tem site (só perfil no Google)");
  }
  if (customFields.perfil_nao_reclamado === true) {
    partes.push("o perfil no Google não foi reclamado pelo dono");
  }

  const horarios = resumoHorarios(customFields.horarios);
  if (horarios) partes.push(`funciona ${horarios}`);

  const faixa = texto(customFields.faixa_preco);
  if (faixa) partes.push(`faixa de preço: ${faixa}`);

  const descricao = texto(customFields.descricao);
  if (descricao) partes.push(`o próprio negócio se descreve assim: "${descricao.slice(0, 200)}"`);

  const tags = lista(customFields.tags_avaliacoes);
  if (tags.length) partes.push(`os clientes citam: ${tags.slice(0, 5).join(", ")}`);

  const busca = customFields.busca as { nicho?: string; local?: string } | undefined;
  if (busca?.nicho || busca?.local) {
    partes.push(`encontrado buscando "${[busca?.nicho, busca?.local].filter(Boolean).join(" ")}"`);
  }

  if (partes.length === 0) return null;

  return [
    "Dados públicos do negócio (Google Maps):",
    ...partes.map((p) => `- ${p}`),
    "Use no máximo UM desses detalhes, de forma natural, para mostrar que você olhou o negócio.",
    "Nunca liste tudo, nunca diga que consultou dados ou o Google Maps.",
  ].join("\n");
}

/** Junta o contexto do operador com o enriquecimento (quando existir). */
export function mergeContext(notas: string | null | undefined, customFields: CustomFields): string | null {
  const enriquecido = enrichmentContext(customFields);
  const operador = texto(notas);
  if (operador && enriquecido) return `${operador}\n\n${enriquecido}`;
  return operador ?? enriquecido;
}
