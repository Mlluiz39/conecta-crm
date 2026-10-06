import { test } from "node:test";
import assert from "node:assert/strict";

/**
 * Testes das regras do ciclo de disparo (anti-ban).
 * As funções puras são replicadas aqui para validação das regras de negócio:
 * janela 9–18h, teto diário 15–20, intervalos variados e próximo slot.
 */

const START = 9;
const END = 18;
const MIN_GAP = 5;

function dailyTarget(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((date.getTime() - start.getTime()) / 86_400_000);
  return 15 + (dayOfYear % 6);
}

function insideWindow(date: Date): boolean {
  if (date.getDay() === 0) return false;
  const hour = date.getHours() + date.getMinutes() / 60;
  return hour >= START && hour < END;
}

function nextWindowStart(date: Date): Date {
  const candidate = new Date(date);
  candidate.setMinutes(0, 0, 0);
  candidate.setHours(START);
  if (candidate <= date) candidate.setDate(candidate.getDate() + 1);
  while (candidate.getDay() === 0) candidate.setDate(candidate.getDate() + 1);
  return candidate;
}

function nextSlot(now: Date, remainingToday: number, random = () => 0.5): Date {
  const end = new Date(now);
  end.setHours(END, 0, 0, 0);
  if (end <= now || !insideWindow(now)) return nextWindowStart(now);

  const minutesLeft = Math.max(1, Math.floor((end.getTime() - now.getTime()) / 60_000));
  const slots = Math.max(1, remainingToday);
  const base = minutesLeft / slots;
  const jitter = 0.6 + random() * 0.8;
  const gap = Math.max(MIN_GAP, Math.round(base * jitter));
  const when = new Date(now.getTime() + gap * 60_000);
  return when > end ? end : when;
}

// segunda 05/10/2026 10:00 (horário local)
const monday10h = new Date(2026, 9, 5, 10, 0, 0);
const monday8h = new Date(2026, 9, 5, 8, 0, 0);
const monday20h = new Date(2026, 9, 5, 20, 0, 0);
const sunday = new Date(2026, 9, 4, 10, 0, 0);

test("teto diário fica entre 15 e 20", () => {
  for (let d = 0; d < 40; d++) {
    const day = new Date(2026, 0, 1 + d);
    const target = dailyTarget(day);
    assert.ok(target >= 15 && target <= 20, `teto ${target} fora de 15..20`);
  }
});

test("teto é estável dentro do mesmo dia", () => {
  assert.equal(dailyTarget(new Date(2026, 9, 5, 9, 0)), dailyTarget(new Date(2026, 9, 5, 17, 30)));
});

test("dentro da janela: 10h em dia de semana", () => {
  assert.equal(insideWindow(monday10h), true);
});

test("fora da janela: antes das 9h e depois das 18h", () => {
  assert.equal(insideWindow(monday8h), false);
  assert.equal(insideWindow(monday20h), false);
});

test("domingo não dispara", () => {
  assert.equal(insideWindow(sunday), false);
});

test("fora do horário, o próximo slot é no início da janela do próximo dia útil", () => {
  const slot = nextSlot(monday20h, 10);
  assert.equal(slot.getDate(), 6); // terça
  assert.equal(slot.getHours(), 9);
  assert.equal(slot.getMinutes(), 0);
});

test("domingo cai para segunda-feira às 9h", () => {
  const slot = nextSlot(sunday, 10);
  assert.equal(slot.getDay(), 1);
  assert.equal(slot.getHours(), 9);
});

test("dentro da janela, o intervalo respeita o mínimo de 5 min", () => {
  const slot = nextSlot(monday10h, 60); // muitas vagas → base pequena
  const diffMin = Math.round((slot.getTime() - monday10h.getTime()) / 60_000);
  assert.ok(diffMin >= MIN_GAP, `intervalo ${diffMin} min abaixo do mínimo`);
});

test("o intervalo distribui o restante do dia (não envia tudo de uma vez)", () => {
  const slot = nextSlot(monday10h, 8); // 8 envios até as 18h
  const diffMin = Math.round((slot.getTime() - monday10h.getTime()) / 60_000);
  assert.ok(diffMin > MIN_GAP, "deveria espaçar mais que o mínimo com 8 vagas");
  assert.ok(slot.getTime() <= new Date(2026, 9, 5, 18, 0).getTime(), "não deve passar do fim da janela");
});

test("o intervalo varia com o jitter (não é sempre o mesmo)", () => {
  const a = nextSlot(monday10h, 8, () => 0);
  const b = nextSlot(monday10h, 8, () => 1);
  assert.notEqual(a.getTime(), b.getTime());
});
