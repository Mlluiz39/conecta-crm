/**
 * Verificação de /contatos (sem as colunas Oportunidade/Responsável e nome comprido
 * cortado com reticências) e de /conversas (botão "Apagar conversa" com confirmação).
 *
 * Uso (com o CRM rodando; em dev `npm run dev`, em produção `npm run build && npm start`):
 *   CRM_TEST_PASSWORD="..." node scripts/probe-contatos-conversas.mjs
 *   CRM_TEST_PASSWORD="..." node scripts/probe-contatos-conversas.mjs --url=http://127.0.0.1:8081 --shots=.probe
 *
 * A senha vem de CRM_TEST_PASSWORD (ou ADMIN_PASSWORD) — nunca fica no arquivo. O padrão é
 * logar como admin@conectacrm.com.br, o mesmo dos outros probes de UI (scripts/ui-probe.mjs).
 *
 * Nada é apagado neste probe: ele só abre o diálogo e cancela.
 */
import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);
const BASE = String(args.url ?? process.env.CRM_BASE_URL ?? "http://127.0.0.1:8081").replace(/\/$/, "");
const SHOTS = String(args.shots ?? ".probe").replace(/\/$/, "");
mkdirSync(SHOTS, { recursive: true });
const EMAIL = process.env.CRM_TEST_EMAIL || "admin@conectacrm.com.br";
const PASSWORD = process.env.CRM_TEST_PASSWORD || process.env.ADMIN_PASSWORD || "";
if (!PASSWORD) {
  console.error("defina CRM_TEST_PASSWORD (ou ADMIN_PASSWORD) para rodar este probe");
  process.exit(2);
}

const browser = await puppeteer.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  defaultViewport: { width: 1600, height: 1000 },
});
const page = await browser.newPage();
const problemas = [];
page.on("pageerror", (e) => problemas.push(`EXCEÇÃO: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error" && !/favicon|404/.test(m.text())) problemas.push(`console.error: ${m.text().slice(0, 200)}`);
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const texto = (sel = "body") => page.$eval(sel, (e) => e.textContent?.trim() ?? "").catch(() => "");
let ok = 0;
const falhas = [];
async function check(nome, cond, detalhe = "") {
  if (cond) {
    ok++;
    console.log(`  ok   ${nome}`);
  } else {
    falhas.push(nome);
    console.log(`  FALHA ${nome} ${detalhe}`);
  }
}

// ── login ──────────────────────────────────────────────────────────────────
await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60_000 });
await page.waitForSelector('input[name="email"]', { timeout: 30_000 });
await sleep(2500);
for (let t = 1; t <= 3; t++) {
  await page.$eval('input[name="email"]', (el) => (el.value = ""));
  await page.$eval('input[name="password"]', (el) => (el.value = ""));
  await page.type('input[name="email"]', EMAIL, { delay: 5 });
  await page.type('input[name="password"]', PASSWORD, { delay: 5 });
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 60_000 }).catch(() => null),
    page.click('button[type="submit"]'),
  ]);
  await sleep(2000);
  if (!page.url().includes("/login")) break;
}
if (page.url().includes("/login")) {
  console.error("login falhou");
  await browser.close();
  process.exit(1);
}
console.log("login ok\n");

// ── 1. /contatos ───────────────────────────────────────────────────────────
console.log("/contatos (lista completa):");
await page.goto(`${BASE}/contatos`, { waitUntil: "networkidle2", timeout: 90_000 });
await sleep(2500);

const cabecalhos = await page.$$eval("table thead th", (ths) =>
  ths.map((t) => (t.textContent ?? "").trim()).filter(Boolean),
);
console.log(`cabeçalhos: ${cabecalhos.join(" | ")}`);
await check("não tem mais a coluna Oportunidade", !cabecalhos.some((h) => /oportunidade/i.test(h)));
await check("não tem mais a coluna Responsável", !cabecalhos.some((h) => /respons/i.test(h)));
await check(
  "as colunas que ficam continuam lá",
  ["Contato & Empresa", "Canal & Contato", "E-mail / Cidade", "Etiquetas", "Última Interação", "Ações"].every((h) =>
    cabecalhos.includes(h),
  ),
);
const celulas = await page.$$eval("table tbody tr:first-child td", (tds) => tds.length);
await check("linha tem 7 células (checkbox + 6 colunas)", celulas === 7, `(${celulas})`);
const semResponsavel = await page.evaluate(
  () => !/Não atribuído/.test(document.body.textContent ?? ""),
);
await check("sumiu o texto 'Não atribuído' da tabela", semResponsavel);
await page.screenshot({ path: `${SHOTS}/8-contatos.png` });

// nome comprido: busca pelo consultório da Dra. Thais
console.log("\n/contatos?q=Thais (nome comprido):");
await page.goto(`${BASE}/contatos?q=Thais`, { waitUntil: "networkidle2", timeout: 90_000 });
await sleep(2000);
const nome = await page.evaluate(() => {
  const a = Array.from(document.querySelectorAll("table tbody a")).find((x) =>
    /Thais/i.test(x.textContent ?? ""),
  );
  if (!a) return null;
  const cs = getComputedStyle(a);
  return {
    texto: a.textContent ?? "",
    title: a.getAttribute("title"),
    overflow: cs.overflow,
    textOverflow: cs.textOverflow,
    whiteSpace: cs.whiteSpace,
    display: cs.display,
    clientWidth: a.clientWidth,
    scrollWidth: a.scrollWidth,
    larguraColuna: a.closest("td")?.getBoundingClientRect().width ?? 0,
  };
});
console.log("  ", JSON.stringify(nome));
await check("achou o contato de nome comprido", Boolean(nome));
await check("nome está cortado (scrollWidth > clientWidth)", Boolean(nome && nome.scrollWidth > nome.clientWidth));
await check("corte com reticências (text-overflow: ellipsis)", nome?.textOverflow === "ellipsis");
await check("não quebra linha (white-space: nowrap)", nome?.whiteSpace === "nowrap");
await check("nome completo disponível no title", Boolean(nome?.title && nome.title.length > 40), `(${nome?.title?.slice(0, 30)}…)`);
// A largura que importa é a do NOME (o td estica junto com a tabela fluida; o texto não).
await check(
  "nome limitado a ~224px (corta em vez de esticar a linha)",
  Boolean(nome && nome.clientWidth <= 240),
  `(${nome?.clientWidth}px de ${nome?.scrollWidth}px de texto)`,
);
await check(
  "sem a mudança o nome ocuparia o texto inteiro (>700px)",
  Boolean(nome && nome.scrollWidth > 700),
  `(${nome?.scrollWidth}px)`,
);
await page.screenshot({ path: `${SHOTS}/9-contatos-nome-longo.png` });

// ── 2. /conversas ──────────────────────────────────────────────────────────
console.log("\n/conversas (sem apagar nada):");
const escritas = [];
page.on("request", (r) => {
  if (r.method() === "POST") escritas.push(new URL(r.url()).pathname);
});
await page.goto(`${BASE}/conversas`, { waitUntil: "networkidle2", timeout: 90_000 });
await sleep(4000);

const temBotao = await page.evaluate(() =>
  Array.from(document.querySelectorAll("button")).some(
    (b) => (b.textContent ?? "").trim().startsWith("Apagar conversa"),
  ),
);
await check("existe o botão 'Apagar conversa'", temBotao);
const tituloBotao = await page.evaluate(() => {
  const b = Array.from(document.querySelectorAll("button")).find((x) =>
    (x.textContent ?? "").trim().startsWith("Apagar conversa"),
  );
  return b?.getAttribute("title") ?? null;
});
await check("botão explica que o contato continua", /contato continua/i.test(String(tituloBotao)), `(${tituloBotao})`);
const aindaLimpar = await page.evaluate(() =>
  Array.from(document.querySelectorAll("button")).some((b) => (b.textContent ?? "").trim().startsWith("Limpar histórico")),
);
await check("'Limpar histórico' continua existindo", aindaLimpar);

// abre o diálogo e cancela — prova que dá para conferir antes e que cancelar não grava
const antes = escritas.length;
await page.evaluate(() => {
  const b = Array.from(document.querySelectorAll("button")).find((x) =>
    (x.textContent ?? "").trim().startsWith("Apagar conversa"),
  );
  b?.click();
});
await sleep(1200);
const dialogo = await page.$eval('[role="dialog"]', (d) => d.textContent ?? "").catch(() => "");
console.log(`  diálogo: ${dialogo.slice(0, 220).replace(/\s+/g, " ")}`);
await check("abriu o diálogo de confirmação", dialogo.length > 0);
await check("diálogo diz quantas mensagens vão junto", /mensagem\(ns\) vão junto/i.test(dialogo));
await check("diálogo avisa que o contato continua", /contato continua cadastrado/i.test(dialogo));
await check("diálogo avisa que o WhatsApp do lead não é tocado", /no WhatsApp do lead nada é apagado/i.test(dialogo));
await check("diálogo avisa que a conversa volta se ele escrever", /volta vazia/i.test(dialogo));
await page.screenshot({ path: `${SHOTS}/10-dialogo-apagar-conversa.png` });

await page.evaluate(() => {
  const b = Array.from(document.querySelectorAll('[role="dialog"] button')).find(
    (x) => (x.textContent ?? "").trim() === "Cancelar",
  );
  b?.click();
});
await sleep(1500);
await check("cancelar não disparou nenhuma ação de escrita", escritas.length === antes, `(${escritas.slice(antes).join(", ")})`);
const dialogoFechou = await page.$$eval('[role="dialog"]', (els) => els.length === 0);
await check("diálogo fechou ao cancelar", dialogoFechou);
const conversasAindaLa = await page.evaluate(
  () => document.querySelectorAll("button.w-full.flex-col").length,
);
console.log(`  conversas na lista: ${conversasAindaLa}`);
await check("lista de conversas continua igual", conversasAindaLa > 0);
await page.screenshot({ path: `${SHOTS}/11-conversas.png` });

await browser.close();
console.log(`\n${ok} verificações ok${falhas.length ? ` · ${falhas.length} FALHAS: ${falhas.join(", ")}` : " — todas"}`);
if (problemas.length) {
  console.log("\nproblemas de console:");
  for (const p of [...new Set(problemas)].slice(0, 6)) console.log(` - ${p}`);
}
process.exit(falhas.length ? 1 : 0);
