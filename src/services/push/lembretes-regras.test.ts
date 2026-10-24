import { test } from "node:test";
import assert from "node:assert/strict";
import { avaliarLembrete, textoDoLembrete } from "./lembretes-regras.ts";

const AGORA = new Date("2026-10-24T12:00:00Z").getTime();
const horasAtras = (h: number) => new Date(AGORA - h * 3_600_000).toISOString();

const base = {
  conversationId: "c1",
  contactName: "Pizzaria do Zé",
  ultimaDirecao: "out" as const,
};

test("nossa última mensagem há mais de 24h entra no lembrete", () => {
  const r = avaliarLembrete(
    { ...base, ultimaMensagemEm: horasAtras(26) },
    AGORA,
    24,
    12,
  );
  assert.equal(r.incluir, true);
  assert.equal(r.incluir && r.horasSemResposta, 26);
});

test("lead respondeu: não lembra", () => {
  const r = avaliarLembrete(
    { ...base, ultimaMensagemEm: horasAtras(30), ultimaDirecao: "in" },
    AGORA,
    24,
    12,
  );
  assert.deepEqual(r, { incluir: false, motivo: "lead_respondeu" });
});

test("respondeu há pouco: não lembra", () => {
  const r = avaliarLembrete({ ...base, ultimaMensagemEm: horasAtras(3) }, AGORA, 24, 12);
  assert.deepEqual(r, { incluir: false, motivo: "sem_mensagem" });
});

test("já lembrado há menos de 12h não repete", () => {
  const r = avaliarLembrete(
    { ...base, ultimaMensagemEm: horasAtras(30), lembradoEm: horasAtras(4) },
    AGORA,
    24,
    12,
  );
  assert.deepEqual(r, { incluir: false, motivo: "lembrado_ha_pouco" });
});

test("lembrado há mais de 12h volta a lembrar", () => {
  const r = avaliarLembrete(
    { ...base, ultimaMensagemEm: horasAtras(30), lembradoEm: horasAtras(13) },
    AGORA,
    24,
    12,
  );
  assert.equal(r.incluir, true);
});

test("conversa sem mensagem não entra", () => {
  const r = avaliarLembrete({ ...base, ultimaMensagemEm: "", ultimaDirecao: null }, AGORA, 24, 12);
  assert.deepEqual(r, { incluir: false, motivo: "sem_mensagem" });
});

test("um lead vira aviso com nome e horas", () => {
  const t = textoDoLembrete([{ contactName: "Pizzaria do Zé", horasSemResposta: 25 }]);
  assert.match(t!.titulo, /Pizzaria do Zé/);
  assert.match(t!.corpo, /25h/);
  assert.equal(t!.url, "/conversas");
});

test("vários leads viram UM aviso, com limite de nomes", () => {
  const t = textoDoLembrete([
    { contactName: "A", horasSemResposta: 25 },
    { contactName: "B", horasSemResposta: 26 },
    { contactName: "C", horasSemResposta: 27 },
    { contactName: "D", horasSemResposta: 28 },
  ]);
  assert.match(t!.titulo, /4 leads/);
  assert.match(t!.corpo, /A, B, C e mais 1/);
});

test("sem pendências não gera aviso", () => {
  assert.equal(textoDoLembrete([]), null);
});

test("conversa antiga demais não vira lembrete", () => {
  const r = avaliarLembrete(
    { ...base, ultimaMensagemEm: horasAtras(24 * 10) },
    AGORA,
    24,
    12,
    24 * 7,
  );
  assert.deepEqual(r, { incluir: false, motivo: "antiga_demais" });
});

test("conversa de ontem ainda lembra", () => {
  const r = avaliarLembrete({ ...base, ultimaMensagemEm: horasAtras(48) }, AGORA, 24, 12, 24 * 7);
  assert.equal(r.incluir, true);
});
