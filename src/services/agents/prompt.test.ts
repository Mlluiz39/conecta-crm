import { test } from "node:test";
import assert from "node:assert/strict";
import { renderPrompt, extractVariables } from "./prompt.ts";

test("substitui variáveis conhecidas", () => {
  const out = renderPrompt(
    "Olá {{nome_contato}}, aqui é {{nome_agente}} da {{nome_empresa}}.",
    { nome_contato: "Ana", nome_agente: "Sofia", nome_empresa: "Matriz" },
  );
  assert.equal(out, "Olá Ana, aqui é Sofia da Matriz.");
});

test("variável ausente vira string vazia (sem vazar chaves)", () => {
  const out = renderPrompt("Canal: {{canal}}.", {});
  assert.equal(out, "Canal: .");
  assert.ok(!out.includes("{{"));
});

test("tolera espaços dentro das chaves", () => {
  assert.equal(renderPrompt("Oi {{ nome_contato }}", { nome_contato: "Bia" }), "Oi Bia");
});

test("extractVariables lista chaves únicas", () => {
  const vars = extractVariables("{{a}} {{b}} {{a}}");
  assert.deepEqual(vars.sort(), ["a", "b"]);
});

test("chave desconhecida permanece intacta (exemplos do prompt sobrevivem)", () => {
  const out = renderPrompt("Sobre {{necessidade}}, indico {{solucao}}. Canal: {{canal}}.", {
    canal: "WhatsApp",
  });
  assert.equal(out, "Sobre {{necessidade}}, indico {{solucao}}. Canal: WhatsApp.");
});
