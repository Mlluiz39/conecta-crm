import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildSuppressionIndex,
  isSuppressed,
  normalizeSuppressionPhone,
} from "./suppression-index.ts";

test("casa por contato, telefone ou e-mail", () => {
  const index = buildSuppressionIndex([
    { contact_id: "c1", phone: "5511988887777", email: "ana@exemplo.com" },
    { contact_id: null, phone: "5521977776666", email: null },
    { contact_id: null, phone: null, email: "bia@exemplo.com" },
  ]);

  assert.equal(isSuppressed(index, { contactId: "c1" }), true);
  assert.equal(isSuppressed(index, { phone: "(21) 97777-6666" }), true);
  assert.equal(isSuppressed(index, { email: "BIA@EXEMPLO.COM" }), true);
  assert.equal(isSuppressed(index, { phone: "5511977776666", email: "outra@exemplo.com" }), false);
});

test("índice vazio não bloqueia ninguém", () => {
  const index = buildSuppressionIndex([]);
  assert.equal(isSuppressed(index, { contactId: "c1", phone: "5511988887777" }), false);
});

test("LID do WhatsApp não vira telefone", () => {
  assert.equal(normalizeSuppressionPhone("123456789012345@lid"), null);
  assert.equal(normalizeSuppressionPhone("11988887777"), "5511988887777");
});
