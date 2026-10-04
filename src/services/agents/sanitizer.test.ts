import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeAiReply, buildAgentSystemInstruction } from "./sanitizer.ts";

test("remove blocos de código com json", () => {
  const input = "```json\n{\"action\": \"agendar\"}\n```\nOlá, como posso ajudar?";
  assert.equal(sanitizeAiReply(input), "Olá, como posso ajudar?");
});

test("remove json no início da resposta", () => {
  const input = '{"confirmado": true} Perfeito! Agendei seu horário.';
  assert.equal(sanitizeAiReply(input), "Perfeito! Agendei seu horário.");
});

test("extrai campo mensagem quando resposta inteira for json", () => {
  const input = '{"mensagem": "Olá, sou o consultor!", "status": "ok"}';
  assert.equal(sanitizeAiReply(input), "Olá, sou o consultor!");
});

test("informa postura de vendedor consultivo no prompt", () => {
  const res = buildAgentSystemInstruction({
    basePrompt: "Você é um atendente.",
    role: "vendedor",
    agentName: "Lucas",
  });
  assert.ok(res.includes("VENDEDOR CONSULTIVO"));
  assert.ok(res.includes("REGRA ABSOLUTA DE FORMATO"));
});
