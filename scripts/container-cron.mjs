#!/usr/bin/env node
/**
 * Cron do ConectaCRM rodando dentro do container.
 *
 * Substitui os loops `curl` que rodavam no host e espelha (com intervalo menor onde
 * importa) a agenda do `vercel.json`. Cada job tem guarda de "já tem um rodando?"
 * para nunca empilhar requisições quando o CRM responde devagar.
 *
 * Uso: node scripts/container-cron.mjs
 *
 * Env:
 *   CRM_BASE_URL        (default http://127.0.0.1:8081)
 *   CRON_SECRET         (vai no header Authorization: Bearer)
 *   CRON_OUTBOX_SEC     (default 60)
 *   CRON_SYNC_SEC       (default 60)
 *   CRON_ALERTS_SEC     (default 60)
 *   CRON_OUTREACH_SEC   (default 300)
 *   CRON_REMINDERS_SEC  (default 600)
 *   CRON_FOLLOWUP_SEC   (default 21600)
 */

const BASE = (process.env.CRM_BASE_URL ?? "http://127.0.0.1:8081").replace(/\/$/, "");
const SECRET = process.env.CRON_SECRET ?? "";
const TIMEOUT_MS = Number(process.env.CRON_TIMEOUT_MS ?? 120_000);

const num = (name, fallback) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
};

const JOBS = [
  { nome: "outbox", caminho: "/api/cron/outbox", segundos: num("CRON_OUTBOX_SEC", 60) },
  { nome: "hermes-sync", caminho: "/api/cron/hermes-sync", segundos: num("CRON_SYNC_SEC", 60) },
  { nome: "alerts", caminho: "/api/cron/alerts", segundos: num("CRON_ALERTS_SEC", 60) },
  { nome: "outreach", caminho: "/api/cron/outreach", segundos: num("CRON_OUTREACH_SEC", 300) },
  { nome: "reminders", caminho: "/api/cron/reminders", segundos: num("CRON_REMINDERS_SEC", 600) },
  {
    nome: "prospect-followup",
    caminho: "/api/cron/prospect-followup?hours=24&limit=5",
    segundos: num("CRON_FOLLOWUP_SEC", 21_600),
  },
];

const emAndamento = new Set();
let parando = false;

function log(msg) {
  console.log(`${new Date().toISOString()} ${msg}`);
}

async function rodar(job) {
  if (parando || emAndamento.has(job.nome)) return;
  emAndamento.add(job.nome);
  const t0 = Date.now();
  try {
    const res = await fetch(`${BASE}${job.caminho}`, {
      headers: SECRET ? { authorization: `Bearer ${SECRET}` } : {},
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    const corpo = (await res.text()).slice(0, 200).replace(/\s+/g, " ");
    const ms = Date.now() - t0;
    if (!res.ok) {
      log(`[${job.nome}] http=${res.status} em ${ms}ms — ${corpo}`);
    } else if (corpo && corpo !== "{}") {
      log(`[${job.nome}] ok em ${ms}ms — ${corpo}`);
    }
  } catch (erro) {
    log(`[${job.nome}] FALHOU em ${Date.now() - t0}ms — ${erro.message}`);
  } finally {
    emAndamento.delete(job.nome);
  }
}

log(`cron do ConectaCRM iniciado — alvo ${BASE}`);
for (const job of JOBS) {
  log(`  ${job.nome.padEnd(18)} a cada ${job.segundos}s`);
  // primeira rodada escalonada para não bater tudo no mesmo instante
  setTimeout(() => void rodar(job), 2_000 + JOBS.indexOf(job) * 1_500);
  setInterval(() => void rodar(job), job.segundos * 1000);
}

function encerrar(sinal) {
  log(`recebi ${sinal} — encerrando (jobs em andamento: ${[...emAndamento].join(", ") || "nenhum"})`);
  parando = true;
  setTimeout(() => process.exit(0), 1_500);
}
process.on("SIGTERM", () => encerrar("SIGTERM"));
process.on("SIGINT", () => encerrar("SIGINT"));
