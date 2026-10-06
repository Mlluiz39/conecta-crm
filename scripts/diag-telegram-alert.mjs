#!/usr/bin/env node
/**
 * Diagnóstico do HTTP 400 do Telegram nos alertas.
 *
 * Reconstrói exatamente a mensagem que o `notifyAlerts` monta para os alertas que falharam
 * (lidos do banco) e tenta enviar de duas formas: com `parse_mode: Markdown` e sem.
 * A resposta do Telegram diz o motivo exato do 400.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const HERMES_ENV = resolve(ROOT, ".hermes-home/.hermes/.env");

function envVar(name) {
  const linha = readFileSync(HERMES_ENV, "utf8")
    .split(/\r?\n/)
    .find((l) => l.startsWith(`${name}=`));
  return linha ? linha.slice(name.length + 1).trim().replace(/^["']|["']$/g, "") : "";
}

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || envVar("TELEGRAM_BOT_TOKEN");
const CHAT = process.env.ALERTS_TELEGRAM_CHAT_ID || envVar("TELEGRAM_CHAT_ID");
if (!TOKEN || !CHAT) {
  console.error("sem token/chat no .env do Hermes");
  process.exit(1);
}

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
