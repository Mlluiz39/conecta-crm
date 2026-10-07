import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateHandoff, mensagemDeTransbordo, pedeHumano } from "./handoff.ts";

/**
 * Caso real (07/10/2026): o lead escrevia "quero falar com um atendente" e a IA era desligada
 * na hora — sem responder nada. Pior: palavras do dia a dia ("gerente", "pessoa") também
 * desligavam o atendimento, e o lead ficava esperando alguém que nunca era avisado.
 */
const base = {
  enabledRules: ["cliente_pede_humano"] as const,
  consecutiveFailures: 0,
  withinBusinessHours: true,
};

test("uma menção NÃO desliga mais o atendimento", () => {
  const r = evaluateHandoff({
    ...base,
    enabledRules: [...base.enabledRules],
    message: "vocês têm atendente disponível?",
  });
  assert.equal(r, null, "a IA deve responder essa mensagem normalmente");
});

test("o pedido repetido desliga (conta o histórico)", () => {
  const r = evaluateHandoff({
    ...base,
    enabledRules: [...base.enabledRules],
    message: "quero falar com um humano agora",
    historicoInbound: ["oi", "preciso falar com um atendente"],
  });
  assert.equal(r, "cliente_pede_humano");
});

test("duas palavras-gatilho na MESMA mensagem contam como um pedido só", () => {
  // "atendente" + "humano" na mesma frase é uma pessoa pedindo uma vez, não duas.
  const r = evaluateHandoff({
    ...base,
    enabledRules: [...base.enabledRules],
    message: "quero falar com um atendente humano",
  });
  assert.equal(r, null);
});

test("HANDOFF_HUMANO_PEDIDOS=1 restaura o comportamento antigo", () => {
  const r = evaluateHandoff({
    ...base,
    enabledRules: [...base.enabledRules],
    message: "tem atendente?",
    pedidosNecessarios: 1,
  });
  assert.equal(r, "cliente_pede_humano");
});

test("'gerente' e 'pessoa' não são mais gatilho", () => {
  assert.equal(pedeHumano("o gerente da minha empresa pediu um orçamento"), false);
  assert.equal(pedeHumano("uma pessoa me indicou vocês"), false);
  assert.equal(pedeHumano("quero falar com uma pessoa do time"), false);
  assert.equal(pedeHumano("me passa para um atendente"), true);
});

test("outras regras seguem valendo (fora do horário)", () => {
  const r = evaluateHandoff({
    enabledRules: ["fora_do_horario"],
    message: "bom dia",
    consecutiveFailures: 0,
    withinBusinessHours: false,
  });
  assert.equal(r, "fora_do_horario");
});

test("falhas seguidas continuam transbordando no limite", () => {
  const r = evaluateHandoff({
    enabledRules: ["falhas_seguidas"],
    message: "oi",
    consecutiveFailures: 3,
    withinBusinessHours: true,
  });
  assert.equal(r, "falhas_seguidas");
});

test("mensagem de espera existe e não fala de sistema interno", () => {
  const texto = mensagemDeTransbordo();
  assert.ok(texto.length > 20);
  assert.doesNotMatch(texto, /sistema|rob[oô]|IA|bot/i);
});
