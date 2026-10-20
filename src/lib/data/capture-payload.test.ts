import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeCaptureEmail,
  normalizeCapturePhone,
  parseCapturePayload,
} from "./capture-payload.ts";

test("aceita os apelidos de campo mais comuns de formulário", () => {
  const r = parseCapturePayload({
    Nome: "Ana Souza",
    WhatsApp: "(11) 98888-7777",
    "E-mail": "ANA@EXEMPLO.COM",
    Empresa: "Clínica Sorriso",
    Cidade: "São Paulo",
    Mensagem: "Quero um orçamento",
  });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.fields.name, "Ana Souza");
  assert.equal(r.fields.phone, "5511988887777");
  assert.equal(r.fields.email, "ana@exemplo.com");
  assert.equal(r.fields.company, "Clínica Sorriso");
  assert.equal(r.fields.city, "São Paulo");
  assert.equal(r.fields.message, "Quero um orçamento");
});

test("telefone com DDI não ganha 55 de novo", () => {
  assert.equal(normalizeCapturePhone("+55 11 98888-7777"), "5511988887777");
  assert.equal(normalizeCapturePhone("11 98888-7777"), "5511988887777");
  assert.equal(normalizeCapturePhone("11988887777"), "5511988887777");
});

test("só as chaves de rastreamento conhecidas atravessam", () => {
  const r = parseCapturePayload({
    telefone: "11988887777",
    utm_source: "google",
    utm_campaign: "black-friday",
    gclid: "abc123",
    senha: "nao-pode-passar",
    cpf: "12345678900",
  });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual(r.fields.tracking, {
    utm_source: "google",
    utm_campaign: "black-friday",
    gclid: "abc123",
  });
});

test("sem telefone e sem e-mail, recusa", () => {
  const r = parseCapturePayload({ nome: "Ana", mensagem: "oi" });
  assert.equal(r.ok, false);
});

test("nome é opcional: usa empresa ou telefone", () => {
  const r = parseCapturePayload({ empresa: "Odonto X", email: "contato@odontox.com" });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.fields.name, "Odonto X");
});

test("e-mail inválido não conta como contato", () => {
  const r = parseCapturePayload({ nome: "Ana", email: "ana@" });
  assert.equal(r.ok, false);
  assert.equal(normalizeCaptureEmail("ana@exemplo.com"), "ana@exemplo.com");
});

test("valor gigante é cortado no teto", () => {
  const r = parseCapturePayload({ telefone: "11988887777", mensagem: "x".repeat(5000) });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.fields.message?.length, 2000);
});
