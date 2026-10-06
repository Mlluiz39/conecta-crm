/**
 * Feriados brasileiros para a janela de prospecção.
 *
 * A janela anti-ban do CRM já evitava domingo e madrugada; feriado é o caso que
 * faltava: disparar abertura de prospecção em feriado é desperdício e queima o
 * número. Feriados nacionais fixos + móveis (Carnaval, Sexta-feira Santa,
 * Corpus Christi, derivados da Páscoa). Extras (estaduais/municipais/da empresa)
 * entram por `HOLIDAYS_EXTRA` — lista separada por vírgula em `YYYY-MM-DD`.
 */

const FIXOS: Record<string, string> = {
  "01-01": "Confraternização Universal",
  "04-21": "Tiradentes",
  "05-01": "Dia do Trabalho",
  "09-07": "Independência do Brasil",
  "10-12": "Nossa Senhora Aparecida",
  "11-02": "Finados",
  "11-15": "Proclamação da República",
  "11-20": "Consciência Negra",
  "12-25": "Natal",
};

/** Domingo de Páscoa (Meeus/Jones/Butcher, gregoriano). */
export function pascoa(ano: number): Date {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(ano, mes - 1, dia);
}

function chave(date: Date): string {
  const mes = String(date.getMonth() + 1).padStart(2, "0");
  const dia = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${mes}-${dia}`;
}

function deslocar(base: Date, dias: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + dias);
  return d;
}

/** Mapa `YYYY-MM-DD` → nome do feriado, para o ano pedido (+ extras do ambiente). */
export function feriados(ano: number): Record<string, string> {
  const mapa: Record<string, string> = {};
  for (const [mmdd, nome] of Object.entries(FIXOS)) {
    mapa[`${ano}-${mmdd}`] = nome;
  }
  const p = pascoa(ano);
  mapa[chave(deslocar(p, -48))] = "Carnaval (segunda)";
  mapa[chave(deslocar(p, -47))] = "Carnaval (terça)";
  mapa[chave(deslocar(p, -2))] = "Sexta-feira Santa";
  mapa[chave(deslocar(p, 60))] = "Corpus Christi";

  const extras = (process.env.HOLIDAYS_EXTRA ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x));
  for (const iso of extras) {
    mapa[iso] = "feriado local";
  }
  return mapa;
}

/** Nome do feriado naquele dia, ou null. */
export function holidayName(date: Date): string | null {
  return feriados(date.getFullYear())[chave(date)] ?? null;
}

export function isHoliday(date: Date): boolean {
  return holidayName(date) !== null;
}
