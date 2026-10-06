#!/usr/bin/env node
/**
 * Vigia do Hermes + CRM (watchdog).
 *
 * Verifica a cada N segundos se o gateway (bridge do WhatsApp) e o CRM (dev)
 * estão de pé. Se algo caiu, levanta de novo e avisa no Telegram.
 *
 * Uso: node scripts/hermes-watchdog.mjs [--interval=30] [--quiet]
 *
 * Limite conhecido: se o ambiente inteiro (sandbox/máquina) for reiniciado,
 * este vigia cai junto — produção deve rodar com systemd/Vercel.
 */

import { spawn } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const HERMES_HOME = resolve(ROOT, ".hermes-home/.hermes");
const LOG = resolve(ROOT, ".hermes-home/watchdog.log");
const INTERVAL = Number(
  (process.argv.find((a) => a.startsWith("--interval=")) ?? "--interval=30").split("=")[1],
) || 30;
const quiet = process.argv.includes("--quiet");

const BRIDGE_HEALTH = "http://127.0.0.1:3005/health";
// /login é pública (as rotas /api/* são redirecionadas pelo middleware)
const CRM_HEALTH = "http://127.0.0.1:8081/login";

function log(message) {
  const line = `${new Date().toISOString()} ${message}`;
  try {
    appendFileSync(LOG, `${line}\n`);
  } catch {
    // sem log persistente: segue
  }
  if (!quiet) console.log(line);
}

function envVar(name) {
  try {
    const raw = readFileSync(resolve(HERMES_HOME, ".env"), "utf8");
    const line = raw.split(/\r?\n/).find((l) => l.startsWith(`${name}=`));
    return line ? line.slice(name.length + 1).trim().replace(/^["']|["']$/g, "") : "";
  } catch {
    return "";
  }
}

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || envVar("TELEGRAM_BOT_TOKEN");
const CHAT = process.env.ALERTS_TELEGRAM_CHAT_ID || envVar("TELEGRAM_CHAT_ID");

let lastNotified = { at: 0, key: "" };

/** Avisa no Telegram com cooldown de 10 min por tipo de aviso. */
async function notify(key, text) {
  if (!TOKEN || !CHAT) return;
  const now = Date.now();
  if (lastNotified.key === key && now - lastNotified.at < 10 * 60_000) return;
  lastNotified = { at: now, key };
  try {
    await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: CHAT, text, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(15_000),
    });
    log(`[aviso enviado] ${key}`);
  } catch (error) {
    log(`[aviso falhou] ${key}: ${error.message}`);
  }
}

async function alive(url, expect) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return false;
    if (!expect) return true;
    const body = await res.text();
    return body.includes(expect);
  } catch {
    return false;
  }
}

/** Sobe um comando destacado (sobrevive ao vigia). */
function spawnDetached(command, args, env) {
  const child = spawn(command, args, {
    cwd: ROOT,
    detached: true,
    stdio: "ignore",
    env: { ...process.env, ...env },
  });
  child.unref();
  return child.pid;
}

const hermesEnv = {
  HOME: resolve(ROOT, ".hermes-home"),
  HERMES_HOME,
  HERMES_GUEST_ONBOARDING: "1",
  PATH: `${resolve(ROOT, ".hermes-home/.local/bin")}:/home/mlluiz/.nvm/versions/node/v24.21.0/bin:${process.env.PATH}`,
  npm_config_cache: "/tmp/npm-cache",
};

async function checkOnce() {
  // 1) bridge do WhatsApp (o gateway morre junto com ele)
  const bridgeOk = await alive(BRIDGE_HEALTH, "connected");
  if (!bridgeOk) {
    log("bridge do WhatsApp caiu → reiniciando gateway");
    spawnDetached("hermes", ["gateway", "run"], hermesEnv);
    await notify("bridge", "⚠️ WhatsApp do Hermes caiu — reiniciei o gateway agora.");
  }

  // 2) CRM (dev) — sem ele não há espelho no CRM nem alertas
  const crmOk = await alive(CRM_HEALTH, "ConectaCRM");
  if (!crmOk) {
    log("CRM (dev 8081) caiu → reiniciando");
    spawnDetached("npm", ["run", "dev"], hermesEnv);
    await notify("crm", "⚠️ CRM (dev 8081) caiu — reiniciei agora. Alertas voltam em ~1 min.");
  }

  if (bridgeOk && crmOk && !quiet) log("tudo de pé (bridge + CRM)");
  return { bridgeOk, crmOk };
}

log(`vigia iniciado (intervalo ${INTERVAL}s) — monitorando bridge 3005 e CRM 8081`);

// primeira checagem e depois loop
await checkOnce();
setInterval(() => {
  void checkOnce();
}, INTERVAL * 1000);
