#!/usr/bin/env node
/**
 * Liga cada agente à sua voz no serviço local de TTS.
 *
 * Dois motores:
 *   piper (padrão)  — as vozes já estão instaladas no serviço (arquivos .onnx). Aqui só
 *                     gravamos `agents.voice = "piper:<voz>"` pelo PAPEL do agente.
 *   chatterbox      — o motor clona o timbre de uma amostra de ~10s: o script envia os
 *                     arquivos de uma pasta e depois liga os agentes (`chatterbox:<nome>`).
 *
 * Uso (na VPS, dentro do repo):
 *   node scripts/setup-voices.mjs                       # piper, mapa padrão dos papéis
 *   node scripts/setup-voices.mjs --motor chatterbox ~/vozes
 *
 * Mapa papel→voz no Piper (troque com a env `VOZES_PAPEL`):
 *   vendedor=faber,suporte=jeff,atendente=cadu,agendador=edresson,gerente=faber
 *
 * Env: PIPER_URL (4124) / CHATTERBOX_URL (4123), NEXT_PUBLIC_SUPABASE_URL,
 *      SUPABASE_SERVICE_ROLE_KEY, TTS_LANGUAGE.
 */
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { basename, extname, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

function carregarEnv() {
  for (const arquivo of [".env.local", ".env"].map((f) => resolve(ROOT, f))) {
    if (!existsSync(arquivo)) continue;
    for (const linha of readFileSync(arquivo, "utf8").split(/\r?\n/)) {
      const m = linha.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (!m) continue;
      if (process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
      }
    }
  }
}
carregarEnv();

const args = process.argv.slice(2);
const motor = (args.includes("--motor") ? args[args.indexOf("--motor") + 1] : "piper").toLowerCase();
const soLer = args.includes("--somente-listar");
const pasta = resolve(args.find((a) => !a.startsWith("--") && a !== motor) ?? resolve(ROOT, "deploy/tts/voices"));

const PIPER_URL = (process.env.PIPER_URL ?? "http://127.0.0.1:4124").replace(/\/+$/, "");
const CHATTERBOX_URL = (process.env.CHATTERBOX_URL ?? "http://127.0.0.1:4123").replace(/\/+$/, "");
const IDIOMA = process.env.TTS_LANGUAGE ?? "pt";
const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const MAPA_PADRAO = {
  vendedor: "faber",
  suporte: "jeff",
  atendente: "cadu",
  agendador: "edresson",
  gerente: "faber",
};
const MAPA = Object.fromEntries(
  (process.env.VOZES_PAPEL ?? "")
    .split(",")
    .map((par) => par.split("=").map((v) => v.trim()))
    .filter(([papel, voz]) => papel && voz)
    .map(([papel, voz]) => [papel, voz]),
);

const EXTENSOES = new Set([".mp3", ".wav", ".ogg", ".m4a", ".opus", ".flac", ".webm"]);

// ── Supabase (para gravar agents.voice) ───────────────────────────────────
async function agentes() {
  if (!SUPABASE_URL || !SERVICE_KEY) return null;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/agents?select=id,name,role,voice`, {
    headers: { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}` },
  });
  return res.ok ? res.json() : null;
}

async function gravarVoz(agentId, valor) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/agents?id=eq.${agentId}`, {
    method: "PATCH",
    headers: {
      apikey: SERVICE_KEY,
      authorization: `Bearer ${SERVICE_KEY}`,
      "content-type": "application/json",
      prefer: "return=minimal",
    },
    body: JSON.stringify({ voice: valor }),
  });
  return res.ok;
}

async function ligarAgentes(vozesDisponiveis) {
  const lista = await agentes();
  if (!lista) {
    console.warn("Sem Supabase no ambiente: pulei a ligação dos agentes.");
    return;
  }
  for (const agente of lista) {
    const papel = String(agente.role ?? "").toLowerCase();
    const mapa = { ...MAPA_PADRAO, ...MAPA };
    const alvo = mapa[papel];
    if (!alvo) {
      console.log(`  • ${agente.name} (${papel}): sem voz definida no mapa — mantido "${agente.voice ?? ""}"`);
      continue;
    }
    if (!vozesDisponiveis.includes(alvo)) {
      console.log(`  ! ${agente.name} (${papel}): voz "${alvo}" não existe no serviço — mantido`);
      continue;
    }
    const valor = `${motor}:${alvo}`;
    if (agente.voice === valor) {
      console.log(`  = ${agente.name} (${papel}) → ${valor} (já estava)`);
      continue;
    }
    const ok = await gravarVoz(agente.id, valor);
    console.log(`  ${ok ? "✓" : "✗"} ${agente.name} (${papel}) → ${valor}`);
  }
}

// ── Piper: as vozes já estão no serviço ───────────────────────────────────
if (motor === "piper") {
  let estado;
  try {
    estado = await fetch(`${PIPER_URL}/health`, { signal: AbortSignal.timeout(10_000) }).then((r) => r.json());
  } catch (err) {
    console.error(`Serviço Piper não respondeu em ${PIPER_URL}: ${(err?.message ?? String(err))}`);
    console.error("Suba antes: ./deploy/tts/piper/setup.sh");
    process.exit(1);
  }
  const vozes = estado?.voices ?? [];
  console.log(`serviço: ${PIPER_URL} — ${vozes.length} voz(es): ${vozes.join(", ") || "nenhuma"}`);
  if (vozes.length === 0) {
    console.error("Nenhuma voz instalada. Rode ./deploy/tts/piper/setup.sh (baixa faber, jeff, cadu, edresson).");
    process.exit(1);
  }
  console.log("\nvozes por papel (mude com VOZES_PAPEL=\"vendedor=faber,atendente=cadu\"):");
  for (const [papel, voz] of Object.entries({ ...MAPA_PADRAO, ...MAPA })) {
    console.log(`  ${papel.padEnd(10)} → ${voz}${vozes.includes(voz) ? "" : "  (não instalada!)"}`);
  }
  if (!soLer) {
    console.log("\nligando os agentes:");
    await ligarAgentes(vozes);
  }
  console.log("\npronto. No CRM: TTS_PROVIDER=piper no .env.local e recriar os containers.");
  process.exit(0);
}

// ── Chatterbox: envia amostras e liga os agentes ──────────────────────────
if (!existsSync(pasta)) {
  console.error(`Pasta de amostras não encontrada: ${pasta}`);
  process.exit(1);
}
const arquivos = readdirSync(pasta).filter((f) => EXTENSOES.has(extname(f).toLowerCase()));
if (arquivos.length === 0) {
  console.error(`Nenhum áudio em ${pasta}. Aceito: ${[...EXTENSOES].join(", ")}`);
  process.exit(1);
}

const vozes = [];
for (const arquivo of arquivos) {
  const nome = basename(arquivo, extname(arquivo)).toLowerCase().replace(/[^a-z0-9_-]/g, "-");
  const bytes = readFileSync(resolve(pasta, arquivo));
  const form = new FormData();
  form.append("voice_file", new Blob([new Uint8Array(bytes)], { type: "audio/mpeg" }), arquivo);
  form.append("voice_name", nome);
  form.append("language", IDIOMA);

  const res = await fetch(`${CHATTERBOX_URL}/voices`, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) {
    console.error(`  ✗ ${nome}: HTTP ${res.status} — ${(await res.text()).slice(0, 200)}`);
    continue;
  }
  console.log(`  ✓ ${nome} (${(statSync(resolve(pasta, arquivo)).size / 1024).toFixed(0)} KB)`);
  vozes.push(nome);
}

if (vozes.length === 0) {
  console.error("Nenhuma voz cadastrada.");
  process.exit(1);
}
console.log("\nligando os agentes:");
await ligarAgentes(vozes);
console.log("\npronto. No CRM: TTS_PROVIDER=chatterbox no .env.local e recriar os containers.");
