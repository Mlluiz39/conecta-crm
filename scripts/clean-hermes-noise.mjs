#!/usr/bin/env node
/**
 * clean-hermes-noise.mjs — limpa o log do bridge que ficou gravado nas mensagens do CRM.
 *
 * O `whatsapp_manager.py` (template whatsappkit / hermes-whatsapp-mixed) imprime o log do
 * boot no stdout, e esse texto foi colado NA FRENTE da resposta que o lead recebeu:
 *
 *     [whatsapp-manager] Inicializando /opt/data/SOUL.md a partir de https://raw...
 *     [whatsapp-manager] ✓ Skills registradas: google-oauth, research-sources, ...
 *     Olá, Clínica São Paulo Dental Studio! A MLLuiz DevTech cria sites, ...
 *
 * Este script percorre as mensagens espelhadas do Hermes (external_id `hermes_%`), descarta
 * as linhas de log e mantém a conversa:
 *   - mensagem com log + conversa  -> content reescrito só com a conversa;
 *   - mensagem só de log           -> apagada (não é conversa).
 *
 * As regras são as mesmas do runtime (`src/services/messaging/hermes-noise.ts`).
 *
 * Uso:
 *   node scripts/clean-hermes-noise.mjs             # dry-run: só mostra o que faria
 *   node scripts/clean-hermes-noise.mjs --apply     # grava de verdade
 *
 * Requer: .env.local com NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stripLogLines, isLogLine } from "../src/services/messaging/hermes-noise.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APPLY = process.argv.includes("--apply");

function loadEnv() {
  const env = {};
  const file = path.join(__dirname, "..", ".env.local");
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^([A-Z_]+)="?(.*?)"?$/);
      if (m) env[m[1]] = m[2];
    }
  }
  return env;
}

const env = loadEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Erro: NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios (.env.local)");
  process.exit(1);
}

const headers = {
  apikey: key,
  authorization: `Bearer ${key}`,
  "content-type": "application/json",
};

const PAGE = 500;

/** Todas as mensagens espelhadas do Hermes (paginado). */
async function fetchMirrored() {
  const rows = [];
  for (let offset = 0; ; offset += PAGE) {
    const res = await fetch(
      `${url}/rest/v1/messages?select=id,conversation_id,content,created_at,external_id` +
        `&external_id=like.hermes_*&order=created_at&limit=${PAGE}&offset=${offset}`,
      { headers },
    );
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const page = await res.json();
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

/** A mensagem tem pelo menos uma linha de log interno? */
function temLog(content) {
  return String(content ?? "")
    .split("\n")
    .some((linha) => isLogLine(linha));
}

async function atualizar(id, content) {
  const res = await fetch(`${url}/rest/v1/messages?id=eq.${id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error(`PATCH ${id} → ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

async function apagar(id) {
  const res = await fetch(`${url}/rest/v1/messages?id=eq.${id}`, { method: "DELETE", headers });
  if (!res.ok) throw new Error(`DELETE ${id} → ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

const todas = await fetchMirrored();
const sujas = todas.filter((m) => temLog(m.content));

console.log(`${APPLY ? "APLICANDO" : "DRY-RUN"} — mensagens do Hermes: ${todas.length}`);
console.log(`${sujas.length} mensagem(ns) com log interno.\n`);

let reescritas = 0;
let apagadas = 0;
const amostras = [];

for (const m of sujas) {
  const limpo = stripLogLines(m.content);
  if (!limpo) {
    apagadas++;
    if (amostras.length < 5) amostras.push({ tipo: "APAGAR (só log)", antes: m.content, depois: "" });
    if (APPLY) await apagar(m.id);
  } else {
    reescritas++;
    if (amostras.length < 5) amostras.push({ tipo: "LIMPAR", antes: m.content, depois: limpo });
    if (APPLY) await atualizar(m.id, limpo);
  }
}

console.log(`reescrever (tirar o log, manter a conversa): ${reescritas}`);
console.log(`apagar (era só log, não é conversa):        ${apagadas}`);

for (const a of amostras) {
  console.log(`\n--- ${a.tipo} ---`);
  console.log(`antes:  ${JSON.stringify(String(a.antes).slice(0, 160))}`);
  console.log(`depois: ${JSON.stringify(String(a.depois).slice(0, 160))}`);
}

if (!APPLY) {
  console.log("\nNada foi gravado. Rode com --apply para aplicar.");
} else {
  console.log("\n✓ pronto.");
}
