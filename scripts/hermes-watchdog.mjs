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
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { createConnection } from "node:net";
import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const HERMES_HOME =
  process.env.WATCHDOG_HERMES_HOME || process.env.HERMES_HOME || resolve(ROOT, ".hermes-home/.hermes");
const LOG = resolve(ROOT, ".hermes-home/watchdog.log");
const INTERVAL = Number(
  (process.argv.find((a) => a.startsWith("--interval=")) ?? "--interval=30").split("=")[1],
) || 30;
const quiet = process.argv.includes("--quiet");

const BRIDGE_HEALTH = "http://127.0.0.1:3005/health";
// /login é pública (as rotas /api/* são redirecionadas pelo middleware)
const CRM_HEALTH = process.env.CRM_HEALTH_URL || "http://127.0.0.1:8081/login";

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

/**
 * O gateway está VIVO? Pergunta no socket de controle dele (`identify`).
 *
 * Por que não usar `hermes gateway status` nem `ps`: aqui cada comando roda num
 * namespace de PID próprio, então o gateway (rodando em outro namespace) não
 * aparece no ps e o status responde "não está rodando" com ele no ar. O socket
 * de controle mora no sistema de arquivos compartilhado e, segundo o próprio
 * Hermes, um `identify` bem respondido É prova de vida.
 */
function gatewayAlive(timeoutMs = 3_000) {
  const pointer = resolve(HERMES_HOME, "gateway.sock.path");
  let socketPath = resolve(HERMES_HOME, "gateway.sock");
  if (existsSync(pointer)) {
    try {
      const apontado = readFileSync(pointer, "utf8").trim();
      if (apontado) socketPath = apontado;
    } catch {
      // mantém o caminho padrão
    }
  }
  return new Promise((resolve_) => {
    let buf = "";
    let settled = false;
    const done = (ok) => {
      if (settled) return;
      settled = true;
      try {
        socket.destroy();
      } catch {
        // socket já fechado
      }
      resolve_(ok);
    };
    const socket = createConnection(socketPath);
    socket.setTimeout(timeoutMs, () => done(false));
    socket.on("connect", () => {
      socket.write(`${JSON.stringify({ verb: "identify", id: 1, protocol: 1 })}\n`);
    });
    socket.on("data", (chunk) => {
      buf += chunk.toString();
      const linha = buf.split("\n")[0];
      if (!linha) return;
      try {
        const json = JSON.parse(linha);
        done(json.ok === true && json.result?.kind === "hermes-gateway");
      } catch {
        done(false);
      }
    });
    socket.on("error", () => done(false));
  });
}

/** Em container não subimos nada: a restart policy do Docker é quem ressuscita. */
const NO_SPAWN = ["1", "true", "yes", "on"].includes(String(process.env.WATCHDOG_NO_SPAWN || "").toLowerCase());

/** Sobe um comando destacado (sobrevive ao vigia). */
function spawnDetached(command, args, env) {
  if (NO_SPAWN) {
    log(`(WATCHDOG_NO_SPAWN=1 — não vou subir "${command} ${args.join(" ")}"; o Docker reinicia)`);
    return 0;
  }
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

let lastGatewayStart = 0;
let ultimoAvisoFallback = 0;
// Cooldown dos "levantar de novo": sem isso o vigia entra em ciclo (subir o gateway
// reinicia o bridge do WhatsApp, o bridge parece caído e o vigia sobe outro gateway...).
const COOLDOWN_ACAO = 10 * 60_000;
const GRACA_POS_GATEWAY = 90_000; // gateway recém-subido ainda está anexando o bridge
let ultimoSpawn = { gateway: 0, bridge: 0, crm: 0 };

/** Modelo configurado como principal (config.yaml) e o que o atendimento usou por último. */
function modeloDoConfig() {
  try {
    const cfg = readFileSync(resolve(HERMES_HOME, "config.yaml"), "utf8");
    const bloco = cfg.match(/^model:\n(?:[ \t].*\n)+/m)?.[0] ?? "";
    const provider = bloco.match(/provider:\s*(\S+)/)?.[1] ?? "";
    const modelo = bloco.match(/default:\s*(\S+)/)?.[1] ?? "";
    return { provider: provider.toLowerCase(), modelo };
  } catch {
    return { provider: "", modelo: "" };
  }
}

/** Último modelo que atendeu de fato (state.db do Hermes). */
function ultimoModeloUsado() {
  try {
    const db = new DatabaseSync(resolve(HERMES_HOME, "state.db"), { readOnly: true });
    // só canais de cliente (WhatsApp/e-mail/Telegram) — teste no CLI não conta
    const linha = db
      .prepare(
        `select u.model as model, u.billing_provider as billing_provider, u.last_seen as last_seen
           from session_model_usage u
           join sessions s on s.id = u.session_id
          where s.source in ('whatsapp', 'email', 'telegram')
          order by u.last_seen desc limit 1`,
      )
      .get();
    db.close();
    if (!linha) return null;
    const idadeMin = (Date.now() / 1000 - Number(linha.last_seen)) / 60;
    return { model: String(linha.model ?? ""), provider: String(linha.billing_provider ?? "").toLowerCase(), idadeMin };
  } catch {
    return null;
  }
}

/** Avisa (no máximo 1x a cada 6h) quando o atendimento está rodando no modelo de fallback. */
async function checarFallback() {
  const cfg = modeloDoConfig();
  const uso = ultimoModeloUsado();
  if (!cfg.provider || !uso || uso.idadeMin > 10) return { emFallback: false };
  const emFallback = Boolean(uso.provider) && uso.provider !== cfg.provider;
  if (emFallback && Date.now() - ultimoAvisoFallback > 6 * 60 * 60_000) {
    ultimoAvisoFallback = Date.now();
    log(`atendimento em fallback: config=${cfg.provider}/${cfg.modelo} usando=${uso.provider}/${uso.model}`);
    await notify(
      "fallback",
      `⚠️ O ${cfg.provider} (${cfg.modelo}) parou de responder (provavelmente cota) e o atendimento ` +
        `caiu no modelo de reserva (${uso.provider}/${uso.model}).\n` +
        "A trava de saída continua ativa. Se quiser o Gemini de volta, libere a cota (billing) ou me chame.",
    );
  }
  return { emFallback, cfg, uso };
}
// Falha isolada (ex.: restart do gateway balançando o bridge) não gera alarme: só na 2ª checagem seguida.
const falhas = { gateway: 0, bridge: 0, crm: 0 };
const precisouDeDuas = (chave, ok) => {
  falhas[chave] = ok ? 0 : (falhas[chave] ?? 0) + 1;
  return falhas[chave] >= 2;
};

async function checkOnce() {
  // 0) gateway do Hermes (quem responde WhatsApp/e-mail) — o bridge pode estar de pé
  //    com o gateway morto, e aí o cliente manda mensagem e ninguém responde.
  const gatewayOk = await gatewayAlive();
  if (!precisouDeDuas("gateway", gatewayOk)) {
    // primeira falha: espera a próxima checagem antes de agir
  } else {
    const agora = Date.now();
    log("gateway do Hermes não responde no socket de controle");
    if (agora - lastGatewayStart > COOLDOWN_ACAO) {
      lastGatewayStart = agora;
      ultimoSpawn.gateway = agora;
      spawnDetached("hermes", ["gateway", "run"], hermesEnv);
      log("→ tentativa de subir o gateway disparada (host-lock do Hermes evita duplicar)");
    }
    await notify(
      "gateway",
      "⚠️ O gateway do Hermes não respondeu no socket — tentei subir de novo. " +
        "WhatsApp e e-mail podem ficar sem resposta por ~1 min. Se repetir, me chame.",
    );
  }

  // 1) bridge do WhatsApp (o gateway morre junto com ele)
  const bridgeOk = await alive(BRIDGE_HEALTH, "connected");
  const recemSubido = Date.now() - ultimoSpawn.gateway < GRACA_POS_GATEWAY;
  if (precisouDeDuas("bridge", bridgeOk) && !recemSubido) {
    if (Date.now() - ultimoSpawn.bridge > COOLDOWN_ACAO) {
      ultimoSpawn.bridge = Date.now();
      log("bridge do WhatsApp caiu → reiniciando gateway");
      spawnDetached("hermes", ["gateway", "run"], hermesEnv);
      await notify("bridge", "⚠️ WhatsApp do Hermes caiu — reiniciei o gateway agora.");
    } else {
      log("bridge caído, mas já reiniciei há pouco — aguardando");
    }
  }

  // 2) CRM (dev) — sem ele não há espelho no CRM nem alertas
  const crmOk = await alive(CRM_HEALTH, "ConectaCRM");
  if (precisouDeDuas("crm", crmOk) && Date.now() - ultimoSpawn.crm > COOLDOWN_ACAO) {
    ultimoSpawn.crm = Date.now();
    log("CRM (dev 8081) caiu → reiniciando");
    spawnDetached("npm", ["run", "dev"], hermesEnv);
    await notify("crm", "⚠️ CRM (dev 8081) caiu — reiniciei agora. Alertas voltam em ~1 min.");
  }

  const fallback = await checarFallback();

  if (gatewayOk && bridgeOk && crmOk && !quiet) {
    log(`tudo de pé (gateway + bridge + CRM)${fallback.emFallback ? " — atencao: em fallback" : ""}`);
  }
  return { gatewayOk, bridgeOk, crmOk, emFallback: fallback.emFallback };
}

log(`vigia iniciado (intervalo ${INTERVAL}s) — monitorando gateway (socket), bridge 3005 e CRM 8081`);

if (process.argv.includes("--once")) {
  const estado = await checkOnce();
  log(`checagem única: ${JSON.stringify(estado)}`);
  process.exit(estado.gatewayOk && estado.bridgeOk && estado.crmOk ? 0 : 1);
}

// primeira checagem e depois loop
await checkOnce();
setInterval(() => {
  void checkOnce();
}, INTERVAL * 1000);
