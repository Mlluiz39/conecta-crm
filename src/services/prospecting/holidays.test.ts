import { test } from "node:test";
import assert from "node:assert/strict";
import { feriados, holidayName, isHoliday, pascoa } from "./holidays.ts";

/**
 * Feriados e janela de disparo: prospecção não sai em domingo nem em feriado.
 * Aqui os módulos são IMPORTADOS de verdade (não replicados), então o teste
 * quebra se a regra do CRM mudar.
 */

const START = 9;
const END = 18;

/** Mesma regra de `insideWindow` em outreach-queue.ts (seg–sáb, 9–18, sem feriado). */
function dentroDaJanela(date: Date): boolean {
  if (date.getDay() === 0) return false;
  if (holidayName(date)) return false;
  const hora = date.getHours() + date.getMinutes() / 60;
  return hora >= START && hora < END;
}

test("Páscoa 2026 é 05/04 e 2027 é 28/03", () => {
  assert.equal(pascoa(2026).toISOString().slice(0, 10), "2026-04-05");
  assert.equal(pascoa(2027).toISOString().slice(0, 10), "2027-03-28");
});

test("feriados móveis de 2026 caem nas datas certas", () => {
  const mapa = feriados(2026);
  assert.equal(mapa["2026-02-16"], "Carnaval (segunda)");
  assert.equal(mapa["2026-02-17"], "Carnaval (terça)");
  assert.equal(mapa["2026-04-03"], "Sexta-feira Santa");
  assert.equal(mapa["2026-06-04"], "Corpus Christi");
});

test("feriados nacionais fixos estão no mapa", () => {
  const mapa = feriados(2026);
  for (const dia of ["2026-01-01", "2026-04-21", "2026-05-01", "2026-09-07", "2026-10-12", "2026-11-02", "2026-11-15", "2026-11-20", "2026-12-25"]) {
    assert.ok(mapa[dia], `faltou ${dia}`);
  }
});

test("holidayName reconhece feriado e ignora dia comum", () => {
  assert.equal(holidayName(new Date(2026, 8, 7, 10, 0)), "Independência do Brasil");
  assert.equal(holidayName(new Date(2026, 9, 6, 10, 0)), null); // terça comum
});

test("isHoliday e HOLIDAYS_EXTRA", () => {
  assert.equal(isHoliday(new Date(2026, 11, 25, 9, 0)), true);
  assert.equal(isHoliday(new Date(2026, 6, 9, 9, 0)), false); // 09/07 (SP) não é nacional
  process.env.HOLIDAYS_EXTRA = "2026-07-09";
  try {
    assert.equal(isHoliday(new Date(2026, 6, 9, 9, 0)), true);
    assert.equal(holidayName(new Date(2026, 6, 9, 9, 0)), "feriado local");
    // extras com formato inválido são ignorados
    process.env.HOLIDAYS_EXTRA = "09/07/2026, lixo";
    assert.equal(isHoliday(new Date(2026, 6, 9, 9, 0)), false);
  } finally {
    delete process.env.HOLIDAYS_EXTRA;
  }
});

test("janela de disparo: terça 10h sim, domingo não, feriado não", () => {
  assert.equal(dentroDaJanela(new Date(2026, 9, 6, 10, 0)), true); // terça 06/10
  assert.equal(dentroDaJanela(new Date(2026, 9, 11, 10, 0)), false); // domingo
  assert.equal(dentroDaJanela(new Date(2026, 8, 7, 10, 0)), false); // feriado (07/09)
  assert.equal(dentroDaJanela(new Date(2026, 9, 10, 10, 0)), true); // sábado 10/10
  assert.equal(dentroDaJanela(new Date(2026, 9, 6, 8, 30)), false); // antes da janela
  assert.equal(dentroDaJanela(new Date(2026, 9, 6, 18, 0)), false); // fim da janela
});
