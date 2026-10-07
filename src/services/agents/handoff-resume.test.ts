import { test } from "node:test";
import assert from "node:assert/strict";
import { avaliarRetomadaAutomatica, avisoRetomada } from "./handoff.ts";

/**
 * Caso real (07/10/2026): a regra `cliente_pede_humano` desligou a IA na conversa do lead às
 * 03:59 e nada devolveu o atendimento. Quando ele escreveu "Ola" e "Oi" horas depois, o motor
 * parou no `bot_active = false` e ninguém respondeu. A retomada automática existe para isso.
 */
const AGORA = new Date("2026-10-07T12:00:00.000Z");
const minutosAtras = (min: number) => new Date(AGORA.getTime() - min * 60_000).toISOString();

const base = {
  assumidaPorHumano: false,
  agora: AGORA,
  minutos: 30,
};

test("retoma quando o transbordo passou do tempo sem ninguém assumir", () => {
  const r = avaliarRetomadaAutomatica({ ...base, botDisabledAt: minutosAtras(480) });
  assert.equal(r.retomar, true);
  assert.equal(r.minutosParados, 480);
});

test("não retoma no meio do silêncio mínimo", () => {
  const r = avaliarRetomadaAutomatica({ ...base, botDisabledAt: minutosAtras(5) });
  assert.equal(r.retomar, false);
  assert.equal(r.motivo, "silencio_curto");
  assert.equal(r.minutosParados, 5);
});

test("retoma exatamente no limite", () => {
  const r = avaliarRetomadaAutomatica({ ...base, botDisabledAt: minutosAtras(30) });
  assert.equal(r.retomar, true);
});

test("humano que assumiu no CRM manda: nunca retoma por cima", () => {
  const r = avaliarRetomadaAutomatica({
    ...base,
    botDisabledAt: minutosAtras(60 * 24),
    assumidaPorHumano: true,
  });
  assert.equal(r.retomar, false);
  assert.equal(r.motivo, "humano_assumiu");
});

test("resposta humana recente reinicia o relógio do silêncio", () => {
  const r = avaliarRetomadaAutomatica({
    ...base,
    botDisabledAt: minutosAtras(600),
    ultimaHumanaEm: minutosAtras(4),
  });
  assert.equal(r.retomar, false, "humano falou há 4 min — a IA não entra no meio");
  assert.equal(r.minutosParados, 4);
});

test("resposta humana antiga não segura a retomada para sempre", () => {
  const r = avaliarRetomadaAutomatica({
    ...base,
    botDisabledAt: minutosAtras(600),
    ultimaHumanaEm: minutosAtras(120),
  });
  assert.equal(r.retomar, true);
  assert.equal(r.minutosParados, 120);
});

test("minutos = 0 desliga a retomada automática", () => {
  const r = avaliarRetomadaAutomatica({ ...base, minutos: 0, botDisabledAt: minutosAtras(9999) });
  assert.equal(r.retomar, false);
  assert.equal(r.motivo, "retomada_automatica_desligada");
});

test("sem data de transbordo não retoma (não dá para medir o silêncio)", () => {
  const r = avaliarRetomadaAutomatica({ ...base, botDisabledAt: null });
  assert.equal(r.retomar, false);
  assert.equal(r.motivo, "sem_data_de_transbordo");
});

test("o aviso da retomada diz os minutos e proíbe prometer humano de novo", () => {
  const texto = avisoRetomada(45);
  assert.match(texto, /45 min/);
  assert.match(texto, /sem prometer de novo/i);
});
