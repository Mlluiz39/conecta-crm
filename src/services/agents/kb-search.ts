/**
 * Recuperação na base de conhecimento — ranqueamento dos candidatos.
 *
 * Problema real (25/10/2026): a ferramenta `buscar_informacoes` fazia full-text e, **só se
 * voltasse vazio**, um passe por termo com `ilike`. Como o full-text raramente volta vazio,
 * a pergunta "preço de site" trazia "Desenvolvimento Web" (que fala de preço num parágrafo
 * genérico) em vez do item com os valores dos planos — e o agente respondia vago para quem
 * perguntou preço. Duas causas: o PostgREST não ordena por `ts_rank`, então a ordem do
 * full-text é arbitrária, e o passe por termo nunca rodava.
 *
 * Aqui o passe por termo roda sempre, as três buscas viram um conjunto único de candidatos e
 * a ordem sai do texto, não da consulta que o trouxe: **termo no título vale mais que termo
 * no corpo**, com bônus pequeno para quem casou a pergunta inteira no full-text.
 *
 * Módulo puro: recebe as listas já buscadas e devolve o ranking. Sem I/O, testável direto.
 */

export type CandidatoKb = { title: string; content: string; category?: string | null };

/**
 * Material de uso INTERNO do agente: capítulos do livro de negociação, regras internas e
 * memórias. Fica na mesma tabela da base factual, mas não responde pergunta de cliente — e,
 * antes deste filtro, disputava as três vagas com "Desenvolvimento Web" e as regras de preço.
 */
export function ehMaterialInterno(category: string | null | undefined): boolean {
  const c = String(category ?? "").toLowerCase();
  return c.startsWith("livro:") || c.startsWith("agent_memory:") || c === "regras internas";
}

/** Palavras de pergunta que não discriminam item nenhum. */
const SEM_VALOR = new Set([
  "qual", "quais", "para", "como", "sobre", "tem", "ter", "voce", "voces",
  "pode", "favor", "quero", "gostaria", "saber", "sao", "uma", "uns", "umas",
]);

const PESO_TITULO = 3;
const PESO_CONTEUDO = 1;
/** Bônus por casar a pergunta inteira no full-text (todos os termos em algum lugar). */
const BONUS_FULL_TEXT = 1;

const semAcento = (texto: string) =>
  String(texto ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

/**
 * Termos úteis da consulta, sem acento, sem pontuação, mínimo de 3 letras.
 * A variante sem acento importa porque o `ilike` do Postgres diferencia "preço" de "preco".
 */
export function termosDaConsulta(consulta: string): string[] {
  const brutos = semAcento(consulta)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .filter((t) => t.length >= 3 && !SEM_VALOR.has(t));
  return [...new Set(brutos)];
}

/**
 * Variantes para o `ilike` (que no Postgres diferencia "Preço" de "preco"): cada termo vai
 * com e sem acento. Sem isso, quem pergunta "preco" não acha o item que escreve "Preço" —
 * foi exatamente o que escondia os planos na pergunta mais comum de todas.
 */
export function variantesDeBusca(consulta: string): string[][] {
  const brutos = String(consulta ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .filter((t) => t.length >= 3 && !SEM_VALOR.has(semAcento(t)));
  return [...new Set(brutos)].map((t) => [...new Set([t, semAcento(t)])]).slice(0, 6);
}

/**
 * Soma os pontos de cada candidato e devolve os melhores.
 *
 * @param candidatos - união de tudo que as buscas devolveram (dedupe por título é feito aqui).
 * @param casaramFullText - títulos que o full-text encontrou (pergunta inteira).
 */
export function ranquearCandidatos(params: {
  consulta: string;
  candidatos: CandidatoKb[];
  casaramFullText?: string[];
  limite?: number;
}): CandidatoKb[] {
  const { consulta, candidatos, casaramFullText = [], limite = 3 } = params;
  const termos = termosDaConsulta(consulta);
  const noFullText = new Set(casaramFullText);

  const vistos = new Map<string, { item: CandidatoKb; score: number; ordem: number }>();
  let ordem = 0;

  for (const item of candidatos) {
    if (!item?.title || vistos.has(item.title)) continue;
    if (ehMaterialInterno(item.category)) continue;
    const titulo = semAcento(item.title);
    const corpo = semAcento(item.content);

    let score = 0;
    for (const termo of termos) {
      if (titulo.includes(termo)) score += PESO_TITULO;
      else if (corpo.includes(termo)) score += PESO_CONTEUDO;
    }
    if (noFullText.has(item.title)) score += BONUS_FULL_TEXT;

    vistos.set(item.title, { item, score, ordem: ordem++ });
  }

  return [...vistos.values()]
    .filter((v) => v.score > 0)
    .sort((a, b) => b.score - a.score || a.ordem - b.ordem)
    .slice(0, limite)
    .map((v) => v.item);
}
