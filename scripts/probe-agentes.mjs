/**
 * Verificação da tela /agentes: modo leitura por padrão e botão Editar liberando a edição.
 *
 * Uso (com o CRM rodando; em dev `npm run dev`, em produção `npm run build && npm start`):
 *   CRM_TEST_PASSWORD="..." node scripts/probe-agentes.mjs
 *   CRM_TEST_PASSWORD="..." node scripts/probe-agentes.mjs --url=http://127.0.0.1:8081 --shots=.probe
 *
 * A senha vem de CRM_TEST_PASSWORD (ou ADMIN_PASSWORD) — nunca fica no arquivo. O padrão é
 * logar como admin@conectacrm.com.br, o mesmo dos outros probes de UI (scripts/ui-probe.mjs).
 *
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
  // "Failed to load resource" é o favicon.ico (404 esperado — o app não tem ícone). Recurso
  // quebrado de verdade é coberto pelo listener de `response` abaixo, que ignora o favicon.
  if (m.type() === "error" && !/Failed to load resource/i.test(m.text())) {
    problemas.push(`console.error: ${m.text().slice(0, 200)}`);
  }
});
page.on("response", (r) => {
  if (r.status() >= 400 && !/favicon/.test(r.url())) {
    problemas.push(`HTTP ${r.status()} ${r.request().method()} ${r.url().slice(0, 120)}`);
  }
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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

/** Conta elementos visíveis de um seletor. */
const contar = (sel) => page.$$eval(sel, (els) => els.filter((e) => e.offsetParent !== null).length).catch(() => 0);
const texto = (sel) =>
  page.$eval(sel, (e) => e.textContent?.trim() ?? "").catch(() => "");

await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60_000 });
await page.waitForSelector('input[name="email"]', { timeout: 30_000 });
// O Next em dev compila a página na primeira visita: clicar antes da hidratação faz o form
// fazer POST nativo e nada acontece. Por isso a espera e as tentativas.
await sleep(2500);
for (let tentativa = 1; tentativa <= 3; tentativa++) {
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
  console.log(`login: tentativa ${tentativa} não saiu do /login, tentando de novo...`);
}
if (page.url().includes("/login")) {
  const erro = await page
    .$$eval('[role="alert"], .text-destructive', (els) => els.map((e) => e.textContent?.trim()).join(" | "))
    .catch(() => "");
  console.error(`login falhou${erro ? ` — tela diz: ${erro}` : " — sem mensagem de erro na tela"}`);
  await browser.close();
  process.exit(1);
}
console.log("login ok");

// ── 1. modo leitura é o padrão ao entrar na página ──────────────────────────
await page.goto(`${BASE}/agentes`, { waitUntil: "networkidle2", timeout: 90_000 });
await sleep(2500);
await page.screenshot({ path: `${SHOTS}/1-leitura-prompt.png` });

const cards = await contar("a[href^='/agentes?agent=']");
console.log(`agentes listados: ${cards}`);
await check("abre em só leitura (sem textarea de prompt)", (await contar("textarea")) === 0);
await check("mostra o botão Editar", (await texto("body")).includes("Editar"));
await check("cabeçalho diz 'só leitura'", (await texto("body")).includes("· só leitura"));
await check("mostra a seção 'Prompt em uso'", (await texto("body")).includes("Prompt em uso"));

// ── 2. Editar libera os campos ─────────────────────────────────────────────
const clicarPorTexto = async (t) => {
  const achou = await page.evaluate((alvo) => {
    const b = Array.from(document.querySelectorAll("button")).find((x) =>
      (x.textContent ?? "").trim().startsWith(alvo),
    );
    if (!b) return false;
    b.click();
    return true;
  }, t);
  await sleep(1200);
  return achou;
};

await check("clicou em Editar", await clicarPorTexto("Editar"));
await check("modo edição tem textarea do prompt", (await contar("textarea")) >= 1);
const corpoEdicao = await texto("body");
await check("modo edição mostra Salvar rascunho/Publicar", corpoEdicao.includes("Publicar versão"));
await check("modo edição mostra o campo de nome", corpoEdicao.includes("Salvar nome"));
await check("cabeçalho diz 'editando'", corpoEdicao.includes("· editando"));
await page.screenshot({ path: `${SHOTS}/2-edicao-prompt.png` });

// ── 3. Cancelar volta para leitura sem salvar ──────────────────────────────
await check("clicou em Cancelar edição", await clicarPorTexto("Cancelar edição"));
await check("voltou para leitura (sem textarea)", (await contar("textarea")) === 0);

// ── 4. abas em modo leitura: nada clicável que grave ───────────────────────
for (const aba of ["Canais", "Ferramentas", "Handoff"]) {
  const foiTab = await page.evaluate((alvo) => {
    const b = Array.from(document.querySelectorAll("button")).find(
      (x) => (x.textContent ?? "").trim() === alvo,
    );
    if (!b) return false;
    b.click();
    return true;
  }, aba);
  await sleep(900);
  const textoAba = await texto("body");
  const botoesDeAcao = await page.evaluate(() =>
    Array.from(document.querySelectorAll("button")).filter(
      (b) => b.offsetParent !== null && /^(Ativar|Ativo)$/.test((b.textContent ?? "").trim()),
    ).length,
  );
  const toggles = await page.evaluate(
    () => document.querySelectorAll("button.h-5.w-9").length,
  );
  console.log(`aba ${aba}: clicou=${foiTab} botoesAtivar=${botoesDeAcao} toggles=${toggles}`);
  await check(`aba ${aba}: sem botão de Ativar/transferir em leitura`, botoesDeAcao === 0);
  await check(`aba ${aba}: sem toggle de liga/desliga em leitura`, toggles === 0);
  await page.screenshot({ path: `${SHOTS}/3-leitura-${aba.toLowerCase()}.png` });
}

// ── 5. edição na aba Canais: aí sim os botões aparecem ─────────────────────
await check("clicou em Editar (aba Canais)", await clicarPorTexto("Editar"));
// volta para a aba Canais: o laço anterior deixou o painel na aba Handoff
await page.evaluate(() => {
  const b = Array.from(document.querySelectorAll("button")).find(
    (x) => (x.textContent ?? "").trim() === "Canais",
  );
  b?.click();
});
await sleep(1200);
const botoesEdicao = await page.evaluate(() =>
  Array.from(document.querySelectorAll("button")).filter(
    (b) => b.offsetParent !== null && (b.textContent ?? "").includes("Ativar"),
  ).length,
);
await check("em edição a aba Canais volta a ter botões Ativar", botoesEdicao > 0, `(${botoesEdicao})`);
await check("texto de aviso fala em transferir o canal", (await texto("body")).includes("transfere o canal"));
await page.screenshot({ path: `${SHOTS}/4-edicao-canais.png` });
await clicarPorTexto("Cancelar edição");
const leituraCanais = await texto("body");
await check(
  "leitura (aba Canais) lista os canais com estado",
  leituraCanais.includes("WhatsApp") &&
    (leituraCanais.includes("Ativo") || leituraCanais.includes("—")) &&
    leituraCanais.includes("clique em Editar"),
);
await page.screenshot({ path: `${SHOTS}/4b-leitura-canais.png` });

// ── 6. navegar em modo leitura não dispara NENHUMA escrita ─────────────────
await page.goto(`${BASE}/agentes`, { waitUntil: "networkidle2", timeout: 60_000 });
await sleep(2000);
const escritas = [];
const contaEscrita = (req) => {
  if (req.method() === "POST") escritas.push(req.url().slice(0, 90));
};
page.on("request", contaEscrita);
for (const aba of ["Memória", "Canais", "Ferramentas", "Handoff", "Voz", "Prompt"]) {
  await page.evaluate((alvo) => {
    const b = Array.from(document.querySelectorAll("button")).find(
      (x) => (x.textContent ?? "").trim() === alvo,
    );
    b?.click();
  }, aba);
  await sleep(600);
  // Clica em TODO botão dentro do painel do agente, menos o "Editar"
  const clicados = await page.evaluate(() => {
    const editar = Array.from(document.querySelectorAll("button")).find((x) =>
      (x.textContent ?? "").trim().startsWith("Editar"),
    );
    const painel = editar?.closest("div.rounded-2xl.border.bg-card");
    if (!painel) return -1;
    let n = 0;
    for (const b of Array.from(painel.querySelectorAll("button"))) {
      if (b === editar) continue;
      b.click();
      n++;
    }
    return n;
  });
  if (clicados < 0) problemas.push("não achei o painel do agente para o teste de escrita");
}
page.off("request", contaEscrita);
await sleep(1200);
await check(
  "clicar em tudo no modo leitura não gravou nada",
  escritas.length === 0,
  `(${escritas.length} POSTs: ${escritas.join(" | ")})`,
);

// ── 7. trocar de agente volta para leitura ─────────────────────────────────
if (cards > 1) {
  await page.goto(`${BASE}/agentes`, { waitUntil: "networkidle2", timeout: 60_000 });
  await sleep(2000);
  const links = await page.$$("a[href^='/agentes?agent=']");
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60_000 }).catch(() => null),
    links[1].click(),
  ]);
  await sleep(2500);
  const t = await texto("body");
  await check("outro agente abre em só leitura", t.includes("· só leitura") && (await contar("textarea")) === 0);
  await page.screenshot({ path: `${SHOTS}/5-segundo-agente.png` });
} else {
  console.log("(só um agente cadastrado: pulei o teste de troca de agente)");
}

// ── 8. aba Voz: leitura mostra a voz atual; edição mostra o seletor ────────
/** O painel do agente é o Card que contém a aba "Voz" (funciona nos dois modos). */
const painelSel = () =>
  page.evaluate(() => {
    const abaVoz = Array.from(document.querySelectorAll("button")).find(
      (x) => (x.textContent ?? "").trim() === "Voz",
    );
    const p = abaVoz?.closest("div.rounded-2xl.border.bg-card");
    if (!p) return null;
    return {
      selects: p.querySelectorAll("select").length,
      opcoes: Array.from(p.querySelectorAll("select option")).map((o) => o.value).filter(Boolean),
      valor: p.querySelector("select")?.value ?? null,
      salvarDesabilitado: (() => {
        const b = Array.from(p.querySelectorAll("button")).find((x) =>
          (x.textContent ?? "").trim().startsWith("Salvar voz"),
        );
        return b ? b.disabled : null;
      })(),
    };
  });

const irParaAba = async (nome) => {
  await page.evaluate((alvo) => {
    const b = Array.from(document.querySelectorAll("button")).find(
      (x) => (x.textContent ?? "").trim() === alvo,
    );
    b?.click();
  }, nome);
  await sleep(900);
};

await page.goto(`${BASE}/agentes`, { waitUntil: "networkidle2", timeout: 60_000 });
await sleep(2000);
await irParaAba("Voz");
const leituraVoz = await texto("body");
await check("aba Voz (leitura) mostra a voz atual", leituraVoz.includes("Voz para respostas em áudio"));
await check("aba Voz (leitura) traz o identificador", /piper:\w+|mlvoice:\w+/.test(leituraVoz));
const painelLeitura = await painelSel();
await check("aba Voz (leitura) não tem seletor", painelLeitura?.selects === 0, `(${painelLeitura?.selects})`);
await page.screenshot({ path: `${SHOTS}/6-leitura-voz.png` });

await clicarPorTexto("Editar");
await sleep(1000);
const painelEdicao = await painelSel();
const MLVOICE = ["mlvoice:rafael", "mlvoice:jane", "mlvoice:vera", "mlvoice:peter_yearsley", "mlvoice:george"];
const PIPER = ["piper:faber", "piper:jeff", "piper:cadu", "piper:edresson"];
await check("seletor de voz aparece na edição", painelEdicao?.selects === 1, `(${painelEdicao?.selects})`);
await check(
  "oferece as 5 vozes do MLVoice Engine v2",
  MLVOICE.every((v) => painelEdicao?.opcoes.includes(v)),
  `(${painelEdicao?.opcoes.join(", ")})`,
);
await check("mantém as 4 vozes do Piper", PIPER.every((v) => painelEdicao?.opcoes.includes(v)));
await check(
  "vem marcado com a voz atual do agente",
  /^(piper|mlvoice):/.test(String(painelEdicao?.valor)),
  `(${painelEdicao?.valor})`,
);
await check(
  "Salvar voz começa desabilitado (abrir o seletor não grava)",
  painelEdicao?.salvarDesabilitado === true,
);
await page.screenshot({ path: `${SHOTS}/7-edicao-voz.png` });
await clicarPorTexto("Cancelar edição");

await browser.close();
console.log(`\n${ok} verificações ok${falhas.length ? ` · ${falhas.length} FALHAS: ${falhas.join(", ")}` : " — todas"}`);
if (problemas.length) {
  console.log("\nproblemas de console/rede:");
  for (const p of [...new Set(problemas)].slice(0, 8)) console.log(` - ${p}`);
}
console.log(`screenshots em ${SHOTS}`);
process.exit(falhas.length || problemas.length ? 1 : 0);
