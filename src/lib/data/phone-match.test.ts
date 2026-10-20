import { test } from "node:test";
import assert from "node:assert/strict";
import { phoneSuffixForLookup } from "./phone-match.ts";

test("celular com DDI vira DDD + 9 dígitos", () => {
  assert.equal(phoneSuffixForLookup("5511988887777"), "11988887777");
});

test("celular sem DDI é mantido inteiro", () => {
  assert.equal(phoneSuffixForLookup("11988887777"), "11988887777");
});

test("fixo com DDI vira DDD + 8 dígitos", () => {
  assert.equal(phoneSuffixForLookup("551133334444"), "1133334444");
});

test("DDD diferente não colide no mesmo final", () => {
  assert.notEqual(phoneSuffixForLookup("5511988887777"), phoneSuffixForLookup("5521988887777"));
});

test("aceita máscara e descarta o que é curto demais", () => {
  assert.equal(phoneSuffixForLookup("(11) 98888-7777"), "11988887777");
  assert.equal(phoneSuffixForLookup("1234-5678"), null);
});
