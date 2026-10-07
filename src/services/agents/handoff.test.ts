import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateHandoff, mensagemDeTransbordo, pedeHumano } from "./handoff.ts";
import { avaliarSentimento, clienteInsatisfeito } from "./sentiment.ts";

/**
 * Regra do negócio (dita pelo dono em 07/10/2026):
 *  * pedir para falar com outro SETOR é transferência entre agentes — o bot continua;
 *  * desligar a IA só quando o cliente está muito irritado/insatisfeito/frustrado.
 *
 * Antes disso, a lista de palavras ("atendente", "humano", "gerente", "pessoa") desligava o
 * atendimento por qualquer menção e deixava o lead sem resposta.
 */
const base = { consecutiveFailures: 0, withinBusinessHours: true };
const todasRegras = ["cliente_pede_humano", "sentimento_negativo"] as const;

test("pedido de setor NÃO desliga o atendimento", () => {
  const r = evaluateHandoff({
    ...base,
    enabledRules: [...todasRegras],
    message: "quero falar com o time de vendas",
  });
  assert.equal(r, null, "quem atende isso é a transferência para o agente de vendas");
});

test("pedir um atendente uma vez também não desliga", () => {
  const r = evaluateHandoff({
    ...base,
    enabledRules: [...todasRegras],
    message: "vocês têm atendente disponível agora?",
  });
  assert.equal(r, null);
});

test("cliente irritado com o atendimento desliga (sentimento forte)", () => {
  const r = evaluateHandoff({
    ...base,
    enabledRules: [...todasRegras],
    message: "que atendimento péssimo, ninguém me responde há dois dias",
  });
  assert.equal(r, "sentimento_negativo");
});

test("duas reclamações leves na conversa também desligam", () => {
  const r = evaluateHandoff({
    ...base,
    enabledRules: [...todasRegras],
    message: "de novo isso, tá demorando",
    historicoInbound: ["a demora está grande", "oi"],
  });
  assert.equal(r, "sentimento_negativo");
});

test("rejeitar o robô passa para humano mesmo sem xingamento", () => {
  const r = evaluateHandoff({
    ...base,
    enabledRules: [...todasRegras],
    message: "não quero falar com robô, quero uma pessoa",
  });
  assert.equal(r, "cliente_pede_humano");
});

test("sem a regra de sentimento ligada, reclamação não desliga", () => {
  const r = evaluateHandoff({
    ...base,
    enabledRules: ["cliente_pede_humano"],
    message: "que atendimento péssimo",
  });
  assert.equal(r, null, "quem decide é a configuração de regras do agente");
});

test("pedido de humano repetido três vezes desliga (mínimo é 2)", () => {
  const r = evaluateHandoff({
    ...base,
    enabledRules: ["cliente_pede_humano"],
    message: "quero falar com um atendente",
    historicoInbound: ["me passa para um atendente", "falar com um atendente, por favor"],
  });
  assert.equal(r, "cliente_pede_humano");
});

test("HANDOFF_HUMANO_PEDIDOS nunca fica abaixo de 2", () => {
  const r = evaluateHandoff({
    ...base,
    enabledRules: ["cliente_pede_humano"],
    message: "tem atendente?",
    pedidosNecessarios: 1,
  });
  assert.equal(r, null);
});

test("'gerente' e 'pessoa' soltos não pedem humano", () => {
  assert.equal(pedeHumano("o gerente da minha empresa pediu um orçamento"), false);
  assert.equal(pedeHumano("uma pessoa me indicou vocês"), false);
  assert.equal(pedeHumano("me passa para um atendente"), true);
});

test("outras regras seguem valendo (fora do horário / falhas)", () => {
  assert.equal(
    evaluateHandoff({
      enabledRules: ["fora_do_horario"],
      message: "bom dia",
      consecutiveFailures: 0,
      withinBusinessHours: false,
    }),
    "fora_do_horario",
  );
  assert.equal(
    evaluateHandoff({
      enabledRules: ["falhas_seguidas"],
      message: "oi",
      consecutiveFailures: 3,
      withinBusinessHours: true,
    }),
    "falhas_seguidas",
  );
});

test("mensagem de espera reconhece o problema sem falar de sistema", () => {
  const texto = mensagemDeTransbordo();
  assert.ok(texto.length > 20);
  assert.doesNotMatch(texto, /sistema|rob[oô]|IA|bot/i);
});

test("sentimento: leitura das mensagens do lead", () => {
  assert.equal(avaliarSentimento("bom dia, tudo bem?").forte, false);
  assert.equal(avaliarSentimento("quanto custa um site?").forte, false);
  assert.equal(avaliarSentimento("estou muito irritado com essa demora").forte, true);
  assert.equal(avaliarSentimento("NÃO ACREDITO, QUE ABSURDO!!!").forte, true);
  assert.equal(avaliarSentimento("quero falar com uma pessoa de verdade").rejeitaBot, true);
  assert.equal(avaliarSentimento("o prazo está demorando").leve, true);
});

test("sentimento da conversa: um forte basta, dois leves também", () => {
  assert.equal(clienteInsatisfeito(["oi", "quero um orçamento"]).motivador, false);
  assert.equal(clienteInsatisfeito(["oi", "isso é uma vergonha"]).motivador, true);
  assert.equal(clienteInsatisfeito(["tá demorando", "de novo isso"]).motivador, true);
});
