/**
 * Verificação do diálogo de apagar conversa (caixa "Apagar o contato também") e do
 * Realtime: conversa apagada fora da tela some da lista sem recarregar.
 *
 * Uso (com o CRM rodando; em dev `npm run dev`, em produção `npm run build && npm start`):
 *   CRM_TEST_PASSWORD="..." node scripts/probe-apagar-conversa.mjs
 *   CRM_TEST_PASSWORD="..." node scripts/probe-apagar-conversa.mjs --url=http://127.0.0.1:8081 --shots=.probe
 *
 * A senha vem de CRM_TEST_PASSWORD (ou ADMIN_PASSWORD) — nunca fica no arquivo. O padrão é
 * logar como admin@conectacrm.com.br, o mesmo dos outros probes de UI (scripts/ui-probe.mjs).
 *
 * ATENÇÃO: cria um contato e uma conversa temporários (vazios, bot desligado) no banco
 * apontado por DATABASE_URL/…_POOLER (lido do .env.local) e apaga tudo no fim, inclusive
 * se algo falhar (try/finally). Não toca em dados existentes.
 */
import puppeteer from "puppeteer-core";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

/** Raiz do repositório (este arquivo vive em scripts/). */
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
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
const env = readFileSync(`${REPO}/.env.local`, "utf8").toString();
const CONN =
  process.env.DATABASE_URL_POOLER ||
  process.env.DATABASE_URL ||
  (env.match(/^DATABASE_URL_POOLER="?([^"\n]+)/m) || env.match(/^DATABASE_URL="?([^"\n]+)/m) || [])[1];
if (!CONN) {
  console.error("sem DATABASE_URL/_POOLER (no ambiente ou no .env.local) para criar a conversa de teste");
  process.exit(2);
}

const MARCA = `ZZ teste realtime ${Date.now().toString().slice(-6)}`;
const db = new pg.Client({ connectionString: CONN, ssl: { rejectUnauthorized: false } });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0;
const falhas = [];
function check(nome, cond, detalhe = "") {
  if (cond) {
    ok++;
    console.log(`  ok   ${nome}`);
  } else {
    falhas.push(nome);
    console.log(`  FALHA ${nome} ${detalhe}`);
  }
}

let contatoId = null;
let conversaId = null;
let browser = null;

try {
  await db.connect();
  const org = (await db.query("select id from organizations limit 1")).rows[0].id;
  const canal = (
    await db.query(
      "select channel_id, channel_type from conversations where channel_type='whatsapp' limit 1",
    )
  ).rows[0];
  if (!canal) throw new Error("não achei um canal de WhatsApp para o teste");

  browser = await puppeteer.launch({
    executablePath: "/usr/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    defaultViewport: { width: 1600, height: 1000 },
  });
  const page = await browser.newPage();
  const escritas = [];
  page.on("request", (r) => {
    if (r.method() === "POST") escritas.push(new URL(r.url()).pathname);
  });
  const excecoes = [];
  page.on("pageerror", (e) => excecoes.push(e.message));

  // login
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
  if (page.url().includes("/login")) throw new Error("login falhou");
  console.log("login ok\n");

  await page.goto(`${BASE}/conversas`, { waitUntil: "networkidle2", timeout: 90_000 });
  await sleep(4000);

  // ── (a) diálogo com a caixa de marcar ────────────────────────────────────
  console.log("(a) diálogo de apagar conversa:");
  const clicarApagarConversa = async () => {
    await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll("button")).find((x) =>
        (x.textContent ?? "").trim().startsWith("Apagar conversa"),
      );
      b?.click();
    });
    await sleep(1200);
  };

  const antes = escritas.length;
  await clicarApagarConversa();
  const dialogo = await page.$eval('[role="dialog"]', (d) => d.textContent ?? "").catch(() => "");
  const temCheckbox = await page.$eval('[role="dialog"] input[type="checkbox"]', () => true).catch(() => false);
  check("diálogo abriu", dialogo.length > 0);
  check("tem a caixa 'Apagar o contato também'", /Apagar o contato também/.test(dialogo));
  check("caixa existe de fato no DOM", temCheckbox);
  check("explica o que acontece se marcar", /sai de Contatos com as oportunidades/.test(dialogo));
  check("explica o que acontece se NÃO marcar", /Sem marcar, o contato continua cadastrado/.test(dialogo));
  check("vem desmarcada por padrão", (await page.$eval('[role="dialog"] input[type="checkbox"]', (el) => el.checked)) === false);

  // marca e desmarca, para conferir que o estado anda junto
  await page.click('[role="dialog"] input[type="checkbox"]');
  await sleep(300);
  check("marcar funciona", (await page.$eval('[role="dialog"] input[type="checkbox"]', (el) => el.checked)) === true);
  await page.click('[role="dialog"] input[type="checkbox"]');
  await sleep(300);
  check("desmarcar funciona", (await page.$eval('[role="dialog"] input[type="checkbox"]', (el) => el.checked)) === false);
  await page.screenshot({ path: `${SHOTS}/12-dialogo-contato-junto.png` });

  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('[role="dialog"] button')).find(
      (x) => (x.textContent ?? "").trim() === "Cancelar",
    );
    b?.click();
  });
  await sleep(1500);
  check("cancelar não gravou nada", escritas.length === antes, `(${escritas.slice(antes).join(", ")})`);
  check("diálogo fechou", (await page.$$eval('[role="dialog"]', (e) => e.length)) === 0);

  // ── (b) Realtime: conversa apagada fora da tela ───────────────────────────
  console.log("\n(b) Realtime DELETE:");
  contatoId = (
    await db.query(
      "insert into contacts (organization_id, name, phone) values ($1,$2,$3) returning id",
      [org, MARCA, "5511900000000"],
    )
  ).rows[0].id;
  conversaId = (
    await db.query(
      `insert into conversations (organization_id, contact_id, channel_id, channel_type, external_id, bot_active)
       values ($1,$2,$3,$4::channel_type,$5,false) returning id`,
      [org, contatoId, canal.channel_id, canal.channel_type, `zteste-realtime-${Date.now()}`],
    )
  ).rows[0].id;
  console.log(`  criados: contato ${contatoId.slice(0, 8)} · conversa ${conversaId.slice(0, 8)} ("${MARCA}")`);

  const urlAntes = page.url();
  await page.reload({ waitUntil: "networkidle2", timeout: 60_000 });
  await sleep(3500);
  /**
   * Lê só as LINHAS da lista. `document.body.textContent` não serve: ele inclui o conteúdo dos
   * <script> com o payload RSC da primeira carga, onde o nome continua mesmo depois de a
   * conversa sair da tela (foi o que me deu um falso negativo antes).
   */
  const listaTexto = () =>
    page.evaluate(() =>
      Array.from(document.querySelectorAll("button.w-full.flex-col"))
        .map((b) => b.textContent ?? "")
        .join(" | "),
    );
  check("a conversa de teste aparece na lista", (await listaTexto()).includes(MARCA));

  // apaga pelo banco, como se fosse outra aba
  await db.query("delete from conversations where id=$1", [conversaId]);
  const sumiuEm = await (async () => {
    const t0 = Date.now();
    while (Date.now() - t0 < 20_000) {
      if (!(await listaTexto()).includes(MARCA)) return Date.now() - t0;
      await sleep(500);
    }
    return null;
  })();
  check(
    "sumiu da lista sozinha, sem recarregar",
    sumiuEm !== null,
    sumiuEm === null ? "(continuou na tela por 20s)" : "",
  );
  if (sumiuEm !== null) console.log(`  sumiu em ${(sumiuEm / 1000).toFixed(1)}s`);
  check("a página não recarregou nesse meio", page.url() === urlAntes);
  await page.screenshot({ path: `${SHOTS}/13-realtime-sumiu.png` });

  // apaga a conversa direto no banco de novo, agora apagando o CONTATO (cascata) e conferindo
  const conversa2 = (
    await db.query(
      `insert into conversations (organization_id, contact_id, channel_id, channel_type, external_id, bot_active)
       values ($1,$2,$3,$4::channel_type,$5,false) returning id`,
      [org, contatoId, canal.channel_id, canal.channel_type, `zteste-realtime-2-${Date.now()}`],
    )
  ).rows[0].id;
  await page.reload({ waitUntil: "networkidle2", timeout: 60_000 });
  await sleep(3000);
  check("a segunda conversa de teste aparece", (await listaTexto()).includes(MARCA));
  await db.query("delete from contacts where id=$1", [contatoId]);
  contatoId = null;
  const sumiu2 = await (async () => {
    const t0 = Date.now();
    while (Date.now() - t0 < 20_000) {
      if (!(await listaTexto()).includes(MARCA)) return Date.now() - t0;
      await sleep(500);
    }
    return null;
  })();
  check("apagar o CONTATO também tira a conversa da tela na hora", sumiu2 !== null);
  if (sumiu2 !== null) console.log(`  sumiu em ${(sumiu2 / 1000).toFixed(1)}s`);
  void conversa2;

  check("nenhuma exceção no console da página", excecoes.length === 0, excecoes.join(" | ").slice(0, 200));
} catch (err) {
  console.error("ERRO no teste:", err.message);
  falhas.push("execução do teste");
} finally {
  // limpeza: apaga o contato de teste (a conversa cai em cascata)
  try {
    if (contatoId) await db.query("delete from contacts where id=$1", [contatoId]);
    if (conversaId) await db.query("delete from conversations where id=$1", [conversaId]);
    const sobrou = await db.query("select count(*)::int n from contacts where name like 'ZZ teste realtime%'");
    console.log(`\nlimpeza: contatos de teste restantes = ${sobrou.rows[0].n}`);
    await db.end();
  } catch (e) {
    console.error("falha na limpeza:", e.message);
  }
  if (browser) await browser.close();
}

console.log(`\n${ok} verificações ok${falhas.length ? ` · ${falhas.length} FALHAS: ${falhas.join(", ")}` : " — todas"}`);
process.exit(falhas.length ? 1 : 0);
