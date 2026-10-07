#!/usr/bin/env node
/**
 * Liga o Telegram como canal de atendimento do CRM.
 *
 * O que faz (idempotente — pode rodar de novo quantas vezes quiser):
 *   1. confere o bot pelo getMe (id/username) usando TELEGRAM_BOT_TOKEN;
 *   2. cria/atualiza o canal `channels` (type='telegram', cernio_channel_id=<id do bot>,
 *      config={provider:"telegram"} — o token NÃO fica no banco, vem do env);
 *   3. cria/atualiza o `agent_channels` do agente escolhido (default: o Gerente, que roteia
 *      para os especialistas, igual ao WhatsApp);
 *   4. registra o webhook da Bot API em <APP_URL>/api/webhooks/telegram com `secret_token`.
 *
 * Uso (na VPS, dentro do repo):
 *   node scripts/setup-telegram-channel.mjs                       # usa NEXT_PUBLIC_APP_URL
 *   node scripts/setup-telegram-channel.mjs https://crm.exemplo.com
 *   AGENTE="Ana Silva" node scripts/setup-telegram-channel.mjs
 *
 * Env necessário (o .env.local serve):
 *   TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, SUPABASE_SERVICE_ROLE_KEY,
 *   NODE_ENV=... NEXT_PUBLIC_SUPABASE_URL
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

/** Env do processo > .env.local > .env (os scripts rodam no host da VPS, sem o compose). */
function carregarEnv() {
  const arquivos = [".env.local", ".env"].map((f) => resolve(ROOT, f)).filter((p) => existsSync(p));
  for (const arquivo of arquivos) {
    for (const linha of readFileSync(arquivo, "utf8").split(/\r?\n/)) {
      const m = linha.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (!m) continue;
      const valor = m[2].trim().replace(/^["']|["']$/g, "");
      if (process.env[m[1]] === undefined) process.env[m[1]] = valor;
    }
  }
}
carregarEnv();

const TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
const SECRET = process.env.TELEGRAM_WEBHOOK_SECRET ?? "";
const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const APP_URL = (process.argv[2] ?? process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
const NOME_AGENTE = process.env.AGENTE ?? "Gerente";

for (const [chave, valor] of Object.entries({
  TELEGRAM_BOT_TOKEN: TOKEN,
  TELEGRAM_WEBHOOK_SECRET: SECRET,
  NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
  "APP_URL (arg ou NEXT_PUBLIC_APP_URL)": APP_URL,
})) {
  if (!valor) {
    console.error(`Faltou ${chave}. (o webhook secret sai de: openssl rand -hex 24)`);
    process.exit(1);
  }
}

// ── 1. quem é o bot ───────────────────────────────────────────────────────
const me = await fetch(`https://api.telegram.org/bot${TOKEN}/getMe`).then((r) => r.json());
if (!me?.ok) {
  console.error("Telegram recusou o token (getMe):", JSON.stringify(me).slice(0, 300));
  process.exit(1);
}
const botId = String(me.result.id);
const botUser = me.result.username ?? "(sem @)";
console.log(`bot: ${botId} @${botUser} — ${me.result.first_name}`);

// ── 2/3. canal + agente no banco ──────────────────────────────────────────
const rest = (path, init = {}) =>
  fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      authorization: `Bearer ${SERVICE_KEY}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });

const orgs = await rest("organizations?select=id&limit=1").then((r) => r.json());
const org = orgs?.[0]?.id;
if (!org) {
  console.error("Nenhuma organização no Supabase.");
  process.exit(1);
}

/** Canal: a chave de upsert é (organization_id, type, cernio_channel_id). */
const canalRes = await rest("channels?on_conflict=organization_id,type,cernio_channel_id", {
  method: "POST",
  headers: { prefer: "resolution=merge-duplicates,return=representation" },
  body: JSON.stringify({
    organization_id: org,
    type: "telegram",
    name: `Telegram (@${botUser})`,
    cernio_channel_id: botId,
    status: "conectado",
    config: { provider: "telegram" },
  }),
});
if (!canalRes.ok) {
  console.error(`Erro ao gravar o canal (${canalRes.status}): ${(await canalRes.text()).slice(0, 300)}`);
  process.exit(1);
}
const canal = (await canalRes.json())[0];
console.log(`canal: ${canal.id} (${canal.name})`);

const agentes = await rest(
  `agents?select=id,name,role,is_active&organization_id=eq.${org}&name=eq.${encodeURIComponent(NOME_AGENTE)}`,
).then((r) => r.json());
const agente = agentes?.[0];
if (!agente) {
  console.error(`Agente "${NOME_AGENTE}" não encontrado nesta organização.`);
  process.exit(1);
}
if (!agente.is_active) console.warn(`⚠ o agente "${agente.name}" está inativo — reative antes de usar`);

// Só UM agente ativo por canal (índice parcial agent_channel_active_uq): desliga os outros.
await rest(`agent_channels?organization_id=eq.${org}&channel=eq.telegram&agent_id=neq.${agente.id}`, {
  method: "PATCH",
  body: JSON.stringify({ is_active: false }),
});
// A chave de conflito é a PK (agent_id, channel) — o índice do "um ativo por canal" é
// PARCIAL (where is_active) e o PostgREST/Postgres não aceita usá-lo como arbiter de upsert.
const vinculoRes = await rest("agent_channels?on_conflict=agent_id,channel", {
  method: "POST",
  headers: { prefer: "resolution=merge-duplicates,return=representation" },
  body: JSON.stringify({
    organization_id: org,
    agent_id: agente.id,
    channel: "telegram",
    is_active: true,
  }),
});
if (!vinculoRes.ok) {
  console.error(`Erro ao vincular o agente (${vinculoRes.status}): ${(await vinculoRes.text()).slice(0, 300)}`);
  process.exit(1);
}
console.log(`agente: ${agente.name} (${agente.role}) atendendo o canal telegram`);

// ── 4. webhook da Bot API ─────────────────────────────────────────────────
const webhookUrl = `${APP_URL}/api/webhooks/telegram`;
const setRes = await fetch(`https://api.telegram.org/bot${TOKEN}/setWebhook`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    url: webhookUrl,
    secret_token: SECRET,
    allowed_updates: ["message", "edited_message"],
    drop_pending_updates: true, // /start antigos não viram atendimento retroativo
  }),
});
const setBody = await setRes.json();
if (!setBody?.ok) {
  console.error("setWebhook falhou:", JSON.stringify(setBody).slice(0, 300));
  process.exit(1);
}
console.log(`webhook: ${webhookUrl}`);

const info = await fetch(`https://api.telegram.org/bot${TOKEN}/getWebhookInfo`).then((r) => r.json());
console.log("getWebhookInfo:", JSON.stringify(info.result));
console.log(
  `\npronto. Fale com @${botUser} no Telegram — quem não estiver em TELEGRAM_ALLOWED_CHAT_IDS é ignorado.`,
);
