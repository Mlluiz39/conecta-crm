import { test } from "node:test";
import assert from "node:assert/strict";
import {
  contextoAtual,
  diasDaChave,
  expediente,
  formatBusinessHours,
  isWithinBusinessHours,
} from "./business-hours.ts";
import { pareceErroInterno } from "./sanitizer.ts";

const SEG_9H = new Date("2026-10-05T09:30:00-03:00"); // segunda 09:30 em São Paulo
const SEG_13H = new Date("2026-10-05T12:30:00-03:00"); // almoço
const SEG_19H = new Date("2026-10-05T19:00:00-03:00"); // depois do expediente
const SAB_10H = new Date("2026-10-10T10:00:00-03:00"); // sábado
const DOM_10H = new Date("2026-10-11T10:00:00-03:00"); // domingo
const ORG = { "seg-sex": { inicio: "09:00", fim: "12:00" }, sab: { inicio: "09:00", fim: "12:00" } };

test("chave de dias: intervalo, dia solto e lista", () => {
  assert.deepEqual(diasDaChave("seg-sex"), [1, 2, 3, 4, 5]);
  assert.deepEqual(diasDaChave("sab"), [6]);
  assert.deepEqual(diasDaChave("sab,dom"), [6, 0]);
});

test("expediente lido da organização, com fallback seg-sex 9-18", () => {
  assert.equal(expediente(ORG).length, 2);
  const fallback = expediente(null);
  assert.equal(fallback.length, 1);
  assert.deepEqual(fallback[0].dias, [1, 2, 3, 4, 5]);
  assert.equal(fallback[0].inicio, 9 * 60);
  assert.equal(fallback[0].fim, 18 * 60);
});

test("dentro e fora do expediente (fuso America/Sao_Paulo)", () => {
  assert.equal(isWithinBusinessHours(ORG, "America/Sao_Paulo", SEG_9H), true);
  assert.equal(isWithinBusinessHours(ORG, "America/Sao_Paulo", SEG_13H), false, "almoço fica fora");
  assert.equal(isWithinBusinessHours(ORG, "America/Sao_Paulo", SEG_19H), false);
  assert.equal(isWithinBusinessHours(ORG, "America/Sao_Paulo", SAB_10H), true);
  assert.equal(isWithinBusinessHours(ORG, "America/Sao_Paulo", DOM_10H), false);
});

test("o fuso da organização é respeitado (não o do servidor)", () => {
  // 09:30 em São Paulo = 12:30 UTC. Avaliando em UTC, o mesmo instante está fora.
  assert.equal(isWithinBusinessHours(ORG, "America/Sao_Paulo", SEG_9H), true);
  assert.equal(isWithinBusinessHours(ORG, "UTC", SEG_9H), false);
});

test("contexto do turno informa hora, expediente e situação", () => {
  const dentro = contextoAtual({ timezone: "America/Sao_Paulo", business_hours: ORG });
  assert.match(dentro, /CONTEXTO ATUAL/);
  assert.match(dentro, /Atendimento humano:/);
  assert.match(dentro, /America\/Sao_Paulo/);

  const fora = contextoAtual({
    timezone: "America/Sao_Paulo",
    business_hours: ORG,
    out_of_hours_message: "Retornamos no próximo horário de atendimento.",
  });
  assert.match(fora, /Mensagem padrão fora do horário/);
  assert.match(fora, /nunca chute horário/i);
});

test("formatBusinessHours mostra a configuração, não texto fixo", () => {
  assert.match(formatBusinessHours(ORG), /seg-sex, 09h às 12h/);
  assert.match(formatBusinessHours({}), /09h às 18h/);
});

test("erro interno nunca é tratado como resposta ao cliente", () => {
  // Caso real de 07/10/2026: o proxy devolveu 502 com HTML e o lead recebeu isso.
  assert.equal(pareceErroInterno('⚠️ Erro do 9router: 9router HTTP 502: <!DOCTYPE html>\n<!--[i'), true);
  assert.equal(pareceErroInterno("<!DOCTYPE html><html><head><title>502 Bad Gateway</title>"), true);
  assert.equal(pareceErroInterno("todos os alvos de LLM falharam — último erro: HTTP 502"), true);
  assert.equal(pareceErroInterno("fetch failed"), true);
  // Resposta legítima passa
  assert.equal(pareceErroInterno("Olá! Tudo bem? Como vocês organizam o agendamento hoje?"), false);
  assert.equal(pareceErroInterno("Perfeito, Marcelo! Vou confirmar com o responsável e já te retorno."), false);
});
