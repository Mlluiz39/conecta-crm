import { test } from "node:test";
import assert from "node:assert/strict";
import { resumirMensagem } from "./mensagem.ts";

test("colapsa quebras de linha e espaços", () => {
  assert.equal(resumirMensagem("Oi!\n\n  Queria   saber  o preço"), "Oi! Queria saber o preço");
});

test("mensagem vazia vira texto padrão", () => {
  assert.equal(resumirMensagem(""), "Mensagem recebida");
  assert.equal(resumirMensagem("   \n "), "Mensagem recebida");
});

test("corta no limite com reticências", () => {
  const longa = "a".repeat(300);
  const saida = resumirMensagem(longa, 20);
  assert.equal(saida.length, 20);
  assert.ok(saida.endsWith("…"));
});

test("respeita o limite padrão de 120", () => {
  const saida = resumirMensagem("b".repeat(500));
  assert.equal(saida.length, 120);
});
