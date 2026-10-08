#!/usr/bin/env node
/**
 * Cadastra as vozes dos agentes no serviço local de TTS (Chatterbox) e liga cada agente à
 * sua voz.
 *
 * O Chatterbox clona o timbre a partir de uma amostra de ~10s (zero-shot). Aqui a amostra é
 * só a **referência**: depois de cadastrada, o serviço gera a voz localmente, de graça, sem
 * depender do provedor de onde a amostra veio.
 *
 * Uso (na VPS, dentro do repo):
 *   node scripts/setup-voices.mjs                     # usa deploy/tts/voices/*.{mp3,wav,ogg,m4a}
 *   node scripts/setup-voices.mjs ~/minhas-vozes      # pasta com as amostras
 *   node scripts/setup-voices.mjs ~/minhas-vozes --sem-vinculo   # só cadastra, não mexe nos agentes
 *
 * Nome do arquivo = nome da voz. Os agentes são ligados por PAPEL:
 *   vendedor.mp3 → agentes com role `vendedor` (voz "chatterbox:vendedor")
 *   suporte.mp3  → role `suporte`; atendente.mp3 → `atendente`; agendador/gerente idem.
 *
 * Env: CHATTERBOX_URL (default http://127.0.0.1:4123), TTS_LANGUAGE (default pt),
 *      NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (para gravar agents.voice).
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
const semVinculo = args.includes("--sem-vinculo");
const pasta = resolve(args.find((a) => !a.startsWith("--")) ?? resolve(ROOT, "deploy/tts/voices"));
const base = (process.env.CHATTERBOX_URL ?? "http://127.0.0.1:4123").replace(/\/+$/, "");
const idioma = process.env.TTS_LANGUAGE ?? "pt";
const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const EXTENSOES = new Set([".mp3", ".wav", ".ogg", ".m4a", ".opus", ".flac", ".webm"]);

if (!existsSync(pasta)) {
  console.error(`Pasta de amostras não encontrada: ${pasta}\nCrie com uma amostra de ~10s por voz (ex.: vendedor.mp3).`);
  process.exit(1);
}

const arquivos = readdirSync(pasta).filter((f) => EXTENSOES.has(extname(f).toLowerCase()));
if (arquivos.length === 0) {
  console.error(`Nenhum áudio em ${pasta}. Aceito: ${[...EXTENSOES].join(", ")}`);
  process.exit(1);
}

// ── 1. serviço no ar? ─────────────────────────────────────────────────────
try {
  const ping = await fetch(`${base}/health`, { signal: AbortSignal.timeout(10_000) });
  console.log(`serviço: ${base} (HTTP ${ping.status})`);
} catch (err) {
  console.error(`Serviço de TTS não respondeu em ${base}: ${(err as Error).message}`);
  console.error("Suba antes: cd /root/chatterbox-tts-api && docker compose -f docker/docker-compose.cpu.yml up -d");
  process.exit(1);
}

// ── 2. cadastra cada amostra como voz nomeada ─────────────────────────────
const vozes = [];
for (const arquivo of arquivos) {
  const nome = basename(arquivo, extname(arquivo)).toLowerCase().replace(/[^a-z0-9_-]/g, "-");
  const bytes = readFileSync(resolve(pasta, arquivo));
  const form = new FormData();
  form.append("voice_file", new Blob([new Uint8Array(bytes)], { type: "audio/mpeg" }), arquivo);
  form.append("voice_name", nome);
  form.append("language", idioma);

  const res = await fetch(`${base}/voices`, { method: "POST", body: form, signal: AbortSignal.timeout(120_000) });
  const corpo = (await res.text()).slice(0, 200);
  if (!res.ok) {
    console.error(`  ✗ ${nome}: HTTP ${res.status} — ${corpo}`);
    continue;
  }
  console.log(`  ✓ ${nome} (${(statSync(resolve(pasta, arquivo)).size / 1024).toFixed(0)} KB)`);
  vozes.push(nome);
}

if (vozes.length === 0) {
  console.error("Nenhuma voz cadastrada.");
  process.exit(1);
}

// ── 3. liga cada agente à voz do seu papel ────────────────────────────────
if (!semVinculo) {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.warn("Sem Supabase no ambiente: pulei a ligação dos agentes (rode de novo com .env.local).");
  } else {
    const hdr = {
      apikey: SERVICE_KEY,
      authorization: `Bearer ${SERVICE_KEY}`,
      "content-type": "application/json",
    };
    const agentes = await fetch(
      `${SUPABASE_URL}/rest/v1/agents?select=id,name,role,voice`,
      { headers: hdr },
    ).then((r) => r.json());

    for (const agente of agentes ?? []) {
      const papel = String(agente.role ?? "").toLowerCase();
      const alvo = vozes.includes(papel) ? papel : vozes.find((v) => v.startsWith(papel.slice(0, 5)));
      if (!alvo) {
        console.log(`  • ${agente.name} (${papel}): sem amostra correspondente — mantido "${agente.voice ?? ""}"`);
        continue;
      }
      const valor = `chatterbox:${alvo}`;
      if (agente.voice === valor) {
        console.log(`  = ${agente.name} (${papel}) → ${valor} (já estava)`);
        continue;
      }
      const res = await fetch(`${SUPABASE_URL}/rest/v1/agents?id=eq.${agente.id}`, {
        method: "PATCH",
        headers: { ...hdr, prefer: "return=minimal" },
        body: JSON.stringify({ voice: valor }),
      });
      console.log(`  ${res.ok ? "✓" : "✗"} ${agente.name} (${papel}) → ${valor}`);
    }
  }
}

console.log(
  `\npronto: ${vozes.length} voz(es) cadastrada(s) — ${vozes.join(", ")}.\n` +
    "Para o CRM usar: TTS_PROVIDER=chatterbox (ou a voz do agente com o prefixo chatterbox:) e reiniciar os containers.",
);
