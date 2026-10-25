import { test } from "node:test";
import assert from "node:assert/strict";
import { ranquearCandidatos, termosDaConsulta, variantesDeBusca } from "./kb-search.ts";

const PLANOS = {
  title: "Quanto custa um site? Preço, valor e planos",
  content: "BÁSICO — R$ 500 ... PROFISSIONAL — R$ 1.000 ...",
};
const DESENVOLVIMENTO = {
  title: "Desenvolvimento Web",
  content: "desenvolvemos sites e sistemas web ... funcionalidades, prazo e preço podem variar",
};
const MVP = { title: "Desenvolvimento de MVP", content: "o prazo ... 30 dias" };

test("o item com os valores vence o parágrafo genérico sobre preço", () => {
  // Cenário real: "preço de site" voltava Desenvolvimento Web no full-text (arbitrário) e o
  // item dos planos só aparecia no passe por termo, que nunca rodava.
  const r = ranquearCandidatos({
    consulta: "preço de site",
    candidatos: [DESENVOLVIMENTO, PLANOS],
    casaramFullText: [DESENVOLVIMENTO.title],
  });
  assert.equal(r[0].title, PLANOS.title);
});

test("pergunta natural inteira também traz o item certo", () => {
  const r = ranquearCandidatos({
    consulta: "quanto custa um site institucional",
    candidatos: [DESENVOLVIMENTO, PLANOS, MVP],
    casaramFullText: [PLANOS.title],
  });
  assert.equal(r[0].title, PLANOS.title);
});

test("termo no título vence termo só no conteúdo", () => {
  const comPrazoNoTitulo = { title: "Prazo de entrega dos projetos", content: "combinado na análise" };
  const soNoCorpo = { title: "Como funciona o orçamento?", content: "o prazo depende do escopo" };
  const r = ranquearCandidatos({
    consulta: "prazo de entrega",
    candidatos: [soNoCorpo, comPrazoNoTitulo],
  });
  assert.equal(r[0].title, comPrazoNoTitulo.title);
});

test("acento não separa: 'preco' acha 'preço'", () => {
  const r = ranquearCandidatos({ consulta: "preco", candidatos: [PLANOS, MVP] });
  assert.equal(r[0].title, PLANOS.title);
});

test("candidato sem nenhum termo é descartado", () => {
  const r = ranquearCandidatos({ consulta: "integração com banco", candidatos: [MVP] });
  assert.deepEqual(r, []);
});

test("não duplica o mesmo título vindo de buscas diferentes", () => {
  const r = ranquearCandidatos({
    consulta: "preço",
    candidatos: [PLANOS, PLANOS, PLANOS],
    casaramFullText: [PLANOS.title],
  });
  assert.equal(r.length, 1);
});

test("respeita o limite de resultados", () => {
  const r = ranquearCandidatos({
    consulta: "site",
    candidatos: [PLANOS, DESENVOLVIMENTO, MVP, { title: "Outro site", content: "site" }],
    limite: 2,
  });
  assert.equal(r.length, 2);
});

test("termos da consulta: sem acento, sem pontuação, sem palavra de pergunta", () => {
  assert.deepEqual(termosDaConsulta("Qual o preço do site institucional?"), [
    "preco",
    "site",
    "institucional",
  ]);
  assert.deepEqual(termosDaConsulta("  é  "), []);
});

test("material interno do agente não responde pergunta de cliente", () => {
  const livro = { title: "Negocie... Capítulo 1 — As novas regras", content: "preço valor desconto", category: "livro:negocie" };
  const regra = { title: "Regra interna — preços", content: "nunca inventar preço", category: "Regras internas" };
  const r = ranquearCandidatos({
    consulta: "preço",
    candidatos: [livro, regra, PLANOS],
  });
  assert.deepEqual(r.map((x) => x.title), [PLANOS.title]);
});

test("variantes de busca cobrem com e sem acento", () => {
  const [primeiro] = variantesDeBusca("preço");
  assert.deepEqual(primeiro, ["preço", "preco"]);
  const [soAcento] = variantesDeBusca("Preço do site");
  assert.deepEqual(soAcento, ["preço", "preco"]);
});
