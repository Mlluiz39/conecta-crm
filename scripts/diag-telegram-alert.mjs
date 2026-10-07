#!/usr/bin/env node
/**
 * Diagnóstico do HTTP 400 do Telegram nos alertas.
 *
 * Reconstrói exatamente a mensagem que o `notifyAlerts` monta para os alertas que falharam
 * (lidos do banco) e tenta enviar de duas formas: com `parse_mode: Markdown` e sem.
 * A resposta do Telegram diz o motivo exato do 400.
 *
 * A credencial vem do CRM (process.env ou .env.local) — o bot é o do CRM. O `.env` do
 * Hermes só é usado como último recurso, e o script avisa quando cai nele.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
/** Onde a credencial do bot do CRM mora, na ordem em que o app a lê. */
const CRM_ENVS = [
  resolve(ROOT, ".env.local"),
  resolve(ROOT, ".env"),
  resolve(ROOT, ".env.vps"),
].filter((p) => existsSync(p));
const HERMES_ENV = resolve(ROOT, ".hermes-home/.hermes/.env");

function envVar(files, name) {
  for (const arquivo of files) {
    const linha = readFileSync(arquivo, "utf8")
      .split(/\r?\n/)
      .find((l) => l.startsWith(`${name}=`));
    if (linha) return linha.slice(name.length + 1).trim().replace(/^["']|["']$/g, "");
  }
  return "";
}

const tokenCrm = process.env.TELEGRAM_BOT_TOKEN || envVar(CRM_ENVS, "TELEGRAM_BOT_TOKEN");
const chatCrm = process.env.ALERTS_TELEGRAM_CHAT_ID || envVar(CRM_ENVS, "ALERTS_TELEGRAM_CHAT_ID");
const legado = !tokenCrm && existsSync(HERMES_ENV);

const TOKEN = tokenCrm || envVar([HERMES_ENV], "TELEGRAM_BOT_TOKEN");
const CHAT = chatCrm || envVar([HERMES_ENV], "TELEGRAM_CHAT_ID");
if (!TOKEN || !CHAT) {
  console.error("sem token/chat do CRM — preencha TELEGRAM_BOT_TOKEN e ALERTS_TELEGRAM_CHAT_ID no .env.local");
  process.exit(1);
}
if (legado) console.warn("⚠ usando o .env do Hermes: o CRM não tem TELEGRAM_BOT_TOKEN próprio");
console.log(`bot: ${TOKEN.split(":")[0]} · chat: ${CHAT}`);

const alertas = JSON.parse(readFileSync(resolve(ROOT, ".probe/failing-alerts.json"), "utf8"));
const escapar = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const linhas = [];
linhas.push(`<b>${escapar("Marcelo Luiz")} — ${alertas.length} novidades</b>`);
for (const a of alertas) {
  const label = escapar(String(a.title).split(" — ")[0].trim());
  const texto = String(a.body ?? "").trim().replace(/\s+/g, " ");
  linhas.push(texto ? `• ${label}\n  <i>"${escapar(texto.slice(0, 160))}"</i>` : `• ${label}`);
}
const texto = `[teste de diagnóstico — pode ignorar]\n${linhas.join("\n")}`;
console.log(`mensagem: ${texto.length} caracteres`);
console.log("--- prévia ---");
console.log(texto.slice(0, 500));
console.log("-------------");

async function tentar(rotulo, extra) {
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: CHAT, text: texto, ...extra }),
    signal: AbortSignal.timeout(20_000),
  });
  const corpo = await res.text();
  console.log(`\n[${rotulo}] http=${res.status}`);
  console.log("  resposta:", corpo.slice(0, 400));
  return res.ok;
}

const comMarkdown = await tentar("parse_mode=HTML (novo formato)", { parse_mode: "HTML", disable_web_page_preview: true });
if (comMarkdown) {
  console.log("\n✔ enviou com HTML (formato novo funciona)");
} else {
  const semMarkdown = await tentar("sem parse_mode", { disable_web_page_preview: true });
  console.log(semMarkdown ? "\n→ HTML também falhou, mas texto puro passa" : "\n→ falha mesmo sem parse_mode (conteúdo/limite?)");
}
