import { test } from "node:test";
import assert from "node:assert/strict";
import { isOptOutMessage } from "./opt-out.ts";

test("detecta pedidos explícitos de parar", () => {
  for (const text of [
    "Por favor, pare de me mandar mensagens",
    "Para de enviar mensagem pra mim",
    "Não me mande mais nada",
    "Não quero mais receber",
    "Quero me descadastrar",
    "Pode me remover da lista",
    "Sair da lista",
    "Cancelar o envio, por favor",
  ]) {
    assert.equal(isOptOutMessage(text), true, text);
  }
});

test("não confunde transbordo com opt-out", () => {
  for (const text of [
    "Não quero falar com robô",
    "Quero falar com uma pessoa",
    "Não tenho interesse no momento",
    "Achei caro, mas me manda outra opção",
    "Quanto custa?",
    "Parece bom, podemos marcar uma call?",
  ]) {
    assert.equal(isOptOutMessage(text), false, text);
  }
});

test("ignora acento, maiúscula e espaço extra", () => {
  assert.equal(isOptOutMessage("  NAO   QUERO  MAIS  RECEBER  "), true);
  assert.equal(isOptOutMessage("descadastre-me"), true);
});
