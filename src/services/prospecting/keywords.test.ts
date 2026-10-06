import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyTemperature, firstMatch, matchGroups } from "./keywords.ts";

test("pedido de call esquenta o lead", () => {
  const r = classifyTemperature(["Podemos marcar uma call amanhã?"]);
  assert.equal(r.temperature, "quente");
  assert.ok(r.reasons.some((x) => x.includes("call")));
});

test("sinal de fechamento esquenta o lead", () => {
  for (const text of [
    "Quero fechar!",
    "Pode me mandar o contrato?",
    "Aprovei a proposta",
    "Qual o pix para pagamento?",
    "Quando começamos?",
  ]) {
    assert.equal(classifyTemperature([text]).temperature, "quente", text);
  }
});

test("pedido de orçamento deixa o lead morno", () => {
  for (const text of [
    "Quanto custa?",
    "Me manda o orçamento",
    "Qual o valor do site?",
    "Quanto vocês cobram?",
    "Qual o investimento?",
  ]) {
    assert.equal(classifyTemperature([text]).temperature, "morno", text);
    assert.ok(matchGroups(text).includes("orcamento"), text);
  }
});

test("interesse sem valor (prazo/como funciona) também é morno", () => {
  for (const text of ["Qual o prazo?", "Como funciona?", "Me explica melhor"]) {
    assert.equal(classifyTemperature([text]).temperature, "morno", text);
  }
});

test("desinteresse explícito deixa o lead frio", () => {
  for (const text of ["Não tenho interesse", "Está muito caro", "Depois eu vejo", "Não quero"]) {
    assert.equal(classifyTemperature([text]).temperature, "frio", text);
  }
});

test("fechamento vence desinteresse anterior", () => {
  const r = classifyTemperature(["Depois eu vejo", "Pensei melhor, quero fechar"]);
  assert.equal(r.temperature, "quente");
});

test("sem sinal nenhum → frio", () => {
  assert.equal(classifyTemperature(["Oi"]).temperature, "frio");
});

test("matchGroups identifica os grupos certos", () => {
  assert.deepEqual(matchGroups("posso agendar uma reunião?").sort(), ["call"]);
  assert.deepEqual(matchGroups("quanto custa o site?").sort(), ["orcamento"]);
  assert.deepEqual(matchGroups("qual o prazo de entrega?").sort(), ["interesse"]);
  assert.ok(matchGroups("não tenho interesse, obrigado").includes("desinteresse"));
});

test("firstMatch devolve a palavra que casou", () => {
  assert.equal(firstMatch("Quero fechar hoje", "fechamento"), "fechar");
  assert.equal(firstMatch("bom dia", "fechamento"), null);
});

test("ignora acento e maiúsculas", () => {
  assert.ok(matchGroups("QUAL O PREÇO?").includes("orcamento"));
  assert.ok(matchGroups("podemos marcar uma REUNIÃO").includes("call"));
  assert.ok(matchGroups("ME MANDA O ORÇAMENTO").includes("orcamento"));
});
