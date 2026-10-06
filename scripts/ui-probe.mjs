/**
 * Probe de UI com Chrome headless (CDP) — diagnostica "interface travou".
 *
 * Uso: node scripts/ui-probe.mjs [--url=http://127.0.0.1:8081] [--shots=/tmp/ui-probe]
 *
 * Faz login, visita cada pagina, coleta erros de console / excecoes nao tratadas /
 * requests que falharam, e testa se a pagina continua INTERATIVA depois de clicar
 * nos botoes de acao (navegacao client-side deve responder).
 */
import puppeteer from "puppeteer-core";
import { mkdirSync, writeFileSync } from "node:fs";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);

const BASE = args.url ?? "http://127.0.0.1:8081";
const SHOTS = (args.shots ?? ".probe").replace(/\/$/, "");
const IMG = (name) => `${SHOTS}/${name}`;
const EMAIL = process.env.CRM_TEST_EMAIL || "admin@conectacrm.com.br";
const PASSWORD = process.env.CRM_TEST_PASSWORD || process.env.ADMIN_PASSWORD || "";
if (!PASSWORD) {
  console.error("defina CRM_TEST_PASSWORD (ou ADMIN_PASSWORD) para rodar este teste");
  process.exit(2);
}

mkdirSync(SHOTS, { recursive: true });

const events = [];
const problems = [];

const browser = await puppeteer.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: true,
  args: [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--window-size=1440,900",
  ],
  defaultViewport: { width: 1440, height: 900 },
});

const page = await browser.newPage();

const timeline = [];
page.on("request", (req) => {
  const url = req.url();
  if (req.method() === "POST" || /_rsc=/.test(url)) {
    timeline.push({ t: Date.now(), phase: "start", method: req.method(), url: url.slice(0, 120) });
  }
});
page.on("requestfinished", (req) => {
  const url = req.url();
  if (req.method() === "POST" || /_rsc=/.test(url)) {
    const r = req.response();
    timeline.push({
      t: Date.now(),
      phase: "done",
      method: req.method(),
      url: url.slice(0, 120),
      status: r?.status() ?? null,
      ms: Math.round(req.timing?.()?.responseEnd ?? -1),
    });
  }
});
page.on("console", (msg) => {
  const type = msg.type();
  const text = msg.text();
  events.push({ kind: `console.${type}`, text });
  if (type === "error") problems.push(`console.error: ${text.slice(0, 400)}`);
});
page.on("pageerror", (err) => {
  events.push({ kind: "pageerror", text: err.message });
  problems.push(`EXCECAO NAO TRATADA: ${err.message.slice(0, 400)}`);
});
page.on("requestfailed", (req) => {
  const f = req.failure();
  const line = `request failed ${req.method()} ${req.url()} — ${f?.errorText}`;
  events.push({ kind: "requestfailed", text: line });
  const prefetchAbort = /_rsc=/.test(req.url()) && f?.errorText === "net::ERR_ABORTED";
  if (!/favicon/.test(req.url()) && !prefetchAbort) problems.push(line.slice(0, 300));
});
page.on("response", (res) => {
  const status = res.status();
  if (status >= 400 && !/favicon/.test(res.url())) {
    problems.push(`HTTP ${status} ${res.request().method()} ${res.url()}`);
  }
});

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function visibleText(sel) {
  return page.$eval(sel, (el) => el.textContent?.trim() ?? "").catch(() => "");
}

// ---------- login ----------
async function login() {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForSelector('input[name="email"]', { timeout: 30_000 });
  await page.type('input[name="email"]', EMAIL, { delay: 10 });
  await page.type('input[name="password"]', PASSWORD, { delay: 10 });
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 60_000 }).catch(() => null),
    page.click('button[type="submit"]'),
  ]);
  await sleep(1500);
  const url = page.url();
  if (url.includes("/login")) throw new Error(`login falhou (ainda em ${url})`);
  return url;
}

/** Testa se a pagina ainda responde: navegação client-side após clicar num link. */
async function interactiveCheck(label) {
  const before = page.url();
  const aqui = new URL(before).pathname;
  const target = aqui === "/contatos" ? "/dashboard" : "/contatos";
  const clicked = await page.evaluate((alvo) => {
    const links = Array.from(document.querySelectorAll("a[href]"));
    const link = links.find((a) => a.getAttribute("href") === alvo);
    if (!link) return false;
    link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    return true;
  }, target);
  if (!clicked) return { label, ok: null, note: "sem link de navegacao visivel" };
  const t0 = Date.now();
  while (Date.now() - t0 < 12_000) {
    if (page.url() !== before) {
      return { label, ok: true, ms: Date.now() - t0, to: page.url() };
    }
    await sleep(200);
  }
  problems.push(`INTERFACE TRAVADA (${label}): clique de navegacao nao respondeu em 12s`);
  return { label, ok: false, ms: 12_000, note: `preso em ${before}`, target };
}

const report = { base: BASE, login: null, pages: [], interactions: [], problems: [] };

try {
  report.login = await login();
  console.log(`login ok -> ${report.login}`);

  for (const path of ["/dashboard", "/prospeccao", "/conversas", "/contatos", "/pipeline"]) {
    const t0 = Date.now();
    const res = await page
      .goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 60_000 })
      .catch((e) => ({ status: () => `erro: ${e.message}` }));
    const loadMs = Date.now() - t0;
    await sleep(3500); // deixa os pollers rodarem pelo menos 1 ciclo
    const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 400));
    const shot = IMG(`${path.replace(/\//g, "_")}.png`);
    await page.screenshot({ path: shot, fullPage: false });
    const entry = { path, httpStatus: res.status?.() ?? null, loadMs, shot, bodyHead: bodyText.replace(/\s+/g, " ").slice(0, 160) };
    report.pages.push(entry);
    console.log(`${path} http=${entry.httpStatus} load=${loadMs}ms shot=${shot}`);
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 60_000 }).catch(() => null);
    await sleep(1200);
    report.interactions.push(await interactiveCheck(path));
  }

  // Ação crítica: assumir conversa / reativar bot
  await page.goto(`${BASE}/conversas`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await sleep(3000);
  const convClicked = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"));
    // primeiro item da lista de conversas
    const item = btns.find((b) => /5511|@s\.whatsapp|gmail|Marcelo/i.test(b.textContent ?? ""));
    if (!item) return false;
    item.click();
    return true;
  });
  await sleep(1500);
  const btnLabel = await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll("button")).find((x) =>
      /Assumir conversa|Reativar bot/i.test(x.textContent ?? ""),
    );
    return b?.textContent?.trim() ?? null;
  });
  if (btnLabel) {
    const t0 = Date.now();
    await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll("button")).find((x) =>
        /Assumir conversa|Reativar bot/i.test(x.textContent ?? ""),
      );
      b?.click();
    });
    let labelAfter = null;
    while (Date.now() - t0 < 30_000) {
      labelAfter = await page.evaluate(() => {
        const b = Array.from(document.querySelectorAll("button")).find((x) =>
          /Assumir conversa|Reativar bot/i.test(x.textContent ?? ""),
        );
        return b?.textContent?.trim() ?? null;
      });
      if (labelAfter && labelAfter !== btnLabel) break;
      await sleep(500);
    }
    report.interactions.push({
      label: "clique botao bot",
      clicked: btnLabel,
      after: labelAfter,
      responded: labelAfter !== btnLabel,
      ms: Date.now() - t0,
    });
    console.log(`botao "${btnLabel}" -> "${labelAfter}" em ${Date.now() - t0}ms`);
    await page.screenshot({ path: IMG("_after-bot-button.png") });

    // o clique muda o estado real: devolve tudo como estava ANTES de navegar para fora
    if (labelAfter && labelAfter !== btnLabel) {
      await page.evaluate(() => {
        const b = Array.from(document.querySelectorAll("button")).find((x) =>
          /Assumir conversa|Reativar bot/i.test(x.textContent ?? ""),
        );
        b?.click();
      });
      const t1 = Date.now();
      while (Date.now() - t1 < 25_000) {
        const atual = await page.evaluate(() => {
          const b = Array.from(document.querySelectorAll("button")).find((x) =>
            /Assumir conversa|Reativar bot/i.test(x.textContent ?? ""),
          );
          return b?.textContent?.trim() ?? null;
        });
        if (atual === btnLabel) break;
        await sleep(500);
      }
      report.interactions.push({ label: "estado restaurado", para: btnLabel });
    }

    report.interactions.push(await interactiveCheck("depois do botao do bot"));
  } else {
    report.interactions.push({ label: "clique botao bot", clicked: null, note: "botao nao encontrado" });
  }
} catch (error) {
  problems.push(`FALHA DO PROBE: ${error.message}`);
} finally {
  report.problems = [...new Set(problems)];
  writeFileSync(`${SHOTS}/report.json`, JSON.stringify({ ...report, events, timeline }, null, 2));
  console.log("\n===== PROBLEMAS =====");
  if (report.problems.length === 0) console.log("nenhum");
  else report.problems.forEach((p) => console.log(`- ${p}`));
  console.log(`\nrelatorio: ${SHOTS}/report.json`);
  console.log("\n===== TIMELINE (POST/RSC) =====");
  timeline.slice(-40).forEach((e) => console.log(`${e.phase.padEnd(5)} ${e.method} ${e.url} ${e.status ?? ""} ${e.ms ?? ""}`));
  await browser.close();
  process.exit(report.problems.length ? 1 : 0);
}
