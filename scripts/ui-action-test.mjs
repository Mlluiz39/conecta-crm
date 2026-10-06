/**
 * Teste focado: o clique em "Assumir conversa" / "Reativar bot (IA)" completa?
 *
 * Uso: node scripts/ui-action-test.mjs [--url=http://127.0.0.1:8081] [--secs=45]
 *
 * Mede, no nível de rede (CDP), o POST do server action: quando comeca, se recebe
 * resposta, quanto tempo leva ate o corpo terminar, e se o botao muda de estado.
 */
import puppeteer from "puppeteer-core";
import { writeFileSync } from "node:fs";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);

const BASE = args.url ?? "http://127.0.0.1:8081";
const SECS = Number(args.secs ?? 45);
const EMAIL = process.env.CRM_TEST_EMAIL || "admin@conectacrm.com.br";
const PASSWORD = process.env.CRM_TEST_PASSWORD || process.env.ADMIN_PASSWORD || "";
if (!PASSWORD) {
  console.error("defina CRM_TEST_PASSWORD (ou ADMIN_PASSWORD) para rodar este teste");
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  defaultViewport: { width: 1440, height: 900 },
});
const page = await browser.newPage();

const posts = new Map(); // request -> registro
const log = [];

page.on("request", (req) => {
  if (req.method() === "GET" && /login|conversas/.test(req.url())) {
    log.push(`[${new Date().toISOString().slice(11, 19)}] GET   ${req.url()}`);
  }
  if (req.method() !== "POST") return;
  const rec = {
    url: req.url(),
    action: (req.headers()["next-action"] ?? "").slice(0, 12),
    t0: Date.now(),
    sent: false,
    responded: false,
    bodyDone: false,
    status: null,
  };
  posts.set(req, rec);
  log.push(`[${new Date().toISOString().slice(11, 19)}] SENT  POST ${rec.url} action=${rec.action}`);
});
page.on("response", async (res) => {
  const req = res.request();
  if (req.method() !== "POST") return;
  const rec = posts.get(req);
  if (!rec) return;
  rec.responded = true;
  rec.status = res.status();
  rec.msHeaders = Date.now() - rec.t0;
  log.push(
    `[${new Date().toISOString().slice(11, 19)}] HEAD  POST ${rec.url} status=${rec.status} headers=${rec.msHeaders}ms`,
  );
  try {
    const text = await Promise.race([
      res.text(),
      sleep(20_000).then(() => "__TIMEOUT__"),
    ]);
    rec.bodyDone = true;
    rec.msBody = Date.now() - rec.t0;
    rec.bodyHead = text === "__TIMEOUT__" ? "__TIMEOUT__" : text.slice(0, 300).replace(/\s+/g, " ");
    if (text !== "__TIMEOUT__") {
      const safe = rec.url.replace(/[^a-z0-9]/gi, "_") + "_" + rec.action;
      try {
        writeFileSync(`.probe/${safe}.txt`, text);
        rec.bodyFile = `.probe/${safe}.txt`;
      } catch {}
    }
    log.push(
      `[${new Date().toISOString().slice(11, 19)}] BODY  POST ${rec.url} body=${rec.msBody}ms len=${text.length}${
        text === "__TIMEOUT__" ? " (NUNCA TERMINOU EM 20s)" : ""
      }`,
    );
  } catch (e) {
    log.push(`[${new Date().toISOString().slice(11, 19)}] BODY  POST ${rec.url} ERRO: ${e.message}`);
  }
});
page.on("requestfailed", (req) => {
  const rec = posts.get(req);
  if (!rec) return;
  log.push(
    `[${new Date().toISOString().slice(11, 19)}] FAIL  POST ${rec.url} ${req.failure()?.errorText} apos ${
      Date.now() - rec.t0
    }ms`,
  );
});
page.on("pageerror", (e) => log.push(`PAGEERROR: ${e.message.slice(0, 200)}`));
page.on("console", (m) => {
  if (m.type() === "error") log.push(`CONSOLE.ERROR: ${m.text().slice(0, 200)}`);
});

const labelOf = () =>
  page.evaluate(() => {
    const b = Array.from(document.querySelectorAll("button")).find((x) =>
      /Assumir conversa|Reativar bot|Assumindo|Reativando/i.test(x.textContent ?? ""),
    );
    return b?.textContent?.trim() ?? null;
  });

let exit = 0;
try {
  // login
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.type('input[name="email"]', EMAIL, { delay: 10 });
  await page.type('input[name="password"]', PASSWORD, { delay: 10 });
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 60_000 }).catch(() => null),
    page.click('button[type="submit"]'),
  ]);

  // abre a inbox e seleciona a conversa
  await page.goto(`${BASE}/conversas`, { waitUntil: "networkidle2", timeout: 60_000 }).catch(() => null);
  await sleep(2500);
  const picked = await page.evaluate(() => {
    const item = Array.from(document.querySelectorAll("button")).find((b) =>
      /Marcelo|5511|gmail/i.test(b.textContent ?? ""),
    );
    item?.click();
    return item?.textContent?.replace(/\s+/g, " ").trim().slice(0, 60) ?? null;
  });
  await sleep(1500);
  console.log(`conversa selecionada: ${picked}`);

  if (args.note) {
    // caminho de nota interna: sem enviar nada para o cliente
    const texto = String(args.note);
    await page.evaluate(() => {
      Array.from(document.querySelectorAll("button"))
        .find((b) => /Nota interna/i.test(b.textContent ?? ""))
        ?.click();
    });
    await sleep(300);
    await page.type("textarea", texto, { delay: 5 });
    const t0nota = Date.now();
    await page.evaluate(() => {
      Array.from(document.querySelectorAll("button"))
        .find((b) => /^Salvar$/i.test((b.textContent ?? "").trim()))
        ?.click();
    });
    let apareceu = false;
    while (Date.now() - t0nota < 20_000) {
      apareceu = await page.evaluate((t) => document.body.innerText.includes(t), texto);
      if (apareceu) break;
      await sleep(300);
    }
    console.log(`nota interna aparece na tela: ${apareceu ? "SIM" : "NAO"} (${Date.now() - t0nota}ms)`);
    if (!apareceu) exit = 1;
  }

  const before = await labelOf();
  console.log(`botao antes: ${JSON.stringify(before)}`);
  if (!before) throw new Error("botao de assumir/reativar nao encontrado");

  posts.clear();
  log.length = 0;
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll("button")).find((x) =>
      /Assumir conversa|Reativar bot|Assumindo|Reativando/i.test(x.textContent ?? ""),
    );
    b?.click();
  });

  const t0 = Date.now();
  const seen = [];
  let changed = null;
  while (Date.now() - t0 < SECS * 1000) {
    const now = await labelOf();
    if (seen[seen.length - 1] !== now) {
      seen.push(now);
      console.log(`  [${Math.round((Date.now() - t0) / 100) / 10}s] botao: ${JSON.stringify(now)}`);
      const finalizado = now && !/Assumindo|Reativando/.test(now) && now !== before;
      if (finalizado) {
        changed = { label: now, ms: Date.now() - t0 };
        break;
      }
    }
    await sleep(500);
  }

  console.log("\n===== LOG DE REDE =====");
  log.forEach((l) => console.log(l));
  console.log("\n===== RESULTADO =====");
  console.log(`botao: ${JSON.stringify(before)} -> ${changed ? JSON.stringify(changed.label) : "NAO MUDOU"} ${changed ? `(${changed.ms}ms)` : `(${SECS}s)`}`);
  console.log(`sequencia: ${seen.map((l) => JSON.stringify(l)).join(" -> ")}`);
  for (const rec of posts.values()) {
    console.log(
      `POST ${rec.url} action=${rec.action} respondeu=${rec.responded} status=${rec.status} headers=${rec.msHeaders ?? "-"}ms corpo=${rec.bodyDone ? `${rec.msBody}ms` : "PENDENTE"} arquivo=${rec.bodyFile ?? "-"}`,
    );
    if (rec.bodyHead && rec.bodyHead !== "__TIMEOUT__") console.log(`   inicio do corpo: ${rec.bodyHead.slice(0, 220)}`);
  }
  if (!changed) exit = 1;
} catch (error) {
  console.log(`FALHA: ${error.message}`);
  exit = 2;
} finally {
  await browser.close();
  process.exit(exit);
}
