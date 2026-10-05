import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizePhone, parseLeadLine, stripHeader } from "./lead-parser.ts";

test("normalizePhone adiciona o DDI 55 em números locais", () => {
  assert.equal(normalizePhone("(11) 97786-9073"), "5511977869073");
});

test("normalizePhone mantém número que já tem DDI", () => {
  assert.equal(normalizePhone("5511977869073"), "5511977869073");
});

test("normalizePhone recusa números fora do tamanho esperado", () => {
  assert.equal(normalizePhone("123"), null);
  assert.equal(normalizePhone("12345678901234567"), null);
});

test("lê o formato nome; telefone; email; empresa; cidade", () => {
  assert.deepEqual(
    parseLeadLine("Carlos Lima; (11) 98888-7777; carlos@clinica.com; Clínica Sorriso; São Paulo"),
    {
      name: "Carlos Lima",
      phone: "5511988887777",
      email: "carlos@clinica.com",
      company: "Clínica Sorriso",
      city: "São Paulo",
    },
  );
});

test("aceita CSV com vírgulas", () => {
  const lead = parseLeadLine("Ana Souza, 11955554444, ana@empresa.com.br, Empresa X");
  assert.equal(lead?.name, "Ana Souza");
  assert.equal(lead?.phone, "5511955554444");
  assert.equal(lead?.email, "ana@empresa.com.br");
  assert.equal(lead?.company, "Empresa X");
});

test("aceita tabulação (colado do Excel)", () => {
  const lead = parseLeadLine("João Pedro\t11944443333\tjoao@loja.com\tLoja do João\tCampinas");
  assert.equal(lead?.name, "João Pedro");
  assert.equal(lead?.phone, "5511944443333");
  assert.equal(lead?.city, "Campinas");
});

test("aceita lead só com e-mail", () => {
  assert.deepEqual(parseLeadLine("Maria Silva; maria@agencia.com"), {
    name: "Maria Silva",
    phone: null,
    email: "maria@agencia.com",
    company: null,
    city: null,
  });
});

test("reconhece telefone e e-mail em qualquer ordem", () => {
  const lead = parseLeadLine("contato@site.com; 11 91234-5678; Roberto Dias");
  assert.equal(lead?.name, "Roberto Dias");
  assert.equal(lead?.phone, "5511912345678");
  assert.equal(lead?.email, "contato@site.com");
});

test("ignora linha sem nome ou sem contato", () => {
  assert.equal(parseLeadLine("11999998888"), null);
  assert.equal(parseLeadLine("Empresa Fantasma"), null);
  assert.equal(parseLeadLine(""), null);
});

test("stripHeader remove cabeçalho de planilha", () => {
  assert.deepEqual(stripHeader(["Nome;Telefone;Email", "Ana;11999998888;a@b.com"]), [
    "Ana;11999998888;a@b.com",
  ]);
});

test("stripHeader mantém a primeira linha quando é um lead", () => {
  const lines = ["Ana Souza; 11999998888", "Bruno; 11888887777"];
  assert.deepEqual(stripHeader(lines), lines);
});
