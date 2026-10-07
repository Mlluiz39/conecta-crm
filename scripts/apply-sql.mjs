#!/usr/bin/env node
/**
 * Aplica um arquivo .sql no Postgres do Supabase (migrations deste projeto).
 *
 * Uso (a senha NÃO precisa ser digitada no terminal nem no chat):
 *   1. cole a URI completa em DATABASE_URL="..." no .env.local (arquivo ignorado pelo git)
 *   2. rode: node scripts/apply-sql.mjs supabase/migrations/<arquivo>.sql
 *
 * Também aceita a string como 2º argumento ou pela variável DATABASE_URL do ambiente.
 * A connection string fica em Supabase → Project Settings → Database → Connection string (URI).
 *
 * ⚠ O host `db.<ref>.supabase.co` (conexão direta) responde **só em IPv6**: em rede sem rota
 * IPv6 a conexão fica pendurada até o timeout. Nesse caso use a URI do **pooler** (IPv4) —
 * `...aws-0-<região>.pooler.supabase.com:5432` com usuário `postgres.<ref>` — em
 * DATABASE_URL_POOLER no .env.local: é ela que este script tenta depois da direta.
 *
 * Roda statement por statement (DDL como ALTER TYPE ... ADD VALUE não aceita transação)
 * e é idempotente: erros de "já existe" são apenas avisados.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const file = process.argv[2];

/** Lê uma variável do .env.local (arquivo ignorado pelo git) — evita colar senha no chat. */
function doEnvFile(nome) {
  try {
    const raw = readFileSync(resolve(".env.local"), "utf8");
    const line = raw.split(/\r?\n/).find((l) => l.startsWith(`${nome}=`));
    if (!line) return null;
    const value = line.slice(nome.length + 1).trim().replace(/^["']|["']$/g, "");
    return value || null;
  } catch {
    return null;
  }
}

const direta = process.argv[3] ?? process.env.DATABASE_URL ?? doEnvFile("DATABASE_URL");
/** Pooler (IPv4): o caminho que funciona onde a conexão direta (IPv6) não passa. */
const pooler = process.env.DATABASE_URL_POOLER ?? doEnvFile("DATABASE_URL_POOLER");

if (!file) {
  console.error(
    'Uso: node scripts/apply-sql.mjs <arquivo.sql> "postgresql://..."   (ou DATABASE_URL no ambiente)',
  );
  process.exit(1);
}
if (!direta && !pooler) {
  console.error(
    "Faltou a connection string do Postgres.\n" +
      "  • mais seguro: cole a URI em DATABASE_URL=\"...\" no .env.local (fora do git) e rode:\n" +
      `      node scripts/apply-sql.mjs ${file}\n` +
      "  • ou passe como 2º argumento / variável DATABASE_URL do ambiente.",
  );
  process.exit(1);
}

let pg;
try {
  pg = await import("pg");
} catch {
  console.error("Dependência 'pg' não instalada. Rode:\n  npm_config_cache=/tmp/npm-cache npm i -D pg");
  process.exit(1);
}

const sql = readFileSync(resolve(file), "utf8");

/** Tenta TLS primeiro; se o servidor não completar o handshake, cai para conexão direta. */
async function connectWithFallback() {
  const attempts = [direta, pooler]
    .filter(Boolean)
    .flatMap((connectionString, i) => [
      { label: i === 0 ? "TLS (direta)" : "TLS (pooler)", config: { connectionString, ssl: { rejectUnauthorized: false } } },
      { label: i === 0 ? "sem TLS (direta)" : "sem TLS (pooler)", config: { connectionString } },
    ]);
  let lastError = null;
  for (const { label, config } of attempts) {
    const client = new pg.Client({ ...config, connectionTimeoutMillis: 12000 });
    try {
      await client.connect();
      if (label === "sem TLS") {
        console.warn("aviso: conectado SEM TLS (handshake TLS não completou nesta rede)");
      }
      return { client, label };
    } catch (err) {
      lastError = err;
      await client.end().catch(() => {});
    }
  }
  throw lastError ?? new Error("não foi possível conectar");
}

let client;
try {
  const conn = await connectWithFallback();
  client = conn.client;
  console.log(`conectado ✓ (${conn.label}) · aplicando ${file}`);

  // Remove comentários de linha ANTES de separar por ';' (senão um bloco
  // que começa com comentário seria descartado inteiro).
  const withoutComments = sql
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

  const statements = withoutComments
    .split(/;\s*(?:\n|$)/)
    .map((s) => s.trim())
    .filter(Boolean);

  let applied = 0;
  let skipped = 0;

  for (const statement of statements) {
    const label = statement.split("\n").find((l) => !l.trim().startsWith("--"))?.slice(0, 90) ?? "";
    try {
      await client.query(statement);
      applied++;
      console.log("  ✓", label);
    } catch (err) {
      const message = String(err.message);
      if (/already exists|does not exist|não existe/i.test(message)) {
        skipped++;
        console.log("  • já aplicado:", label);
      } else {
        throw err;
      }
    }
  }

  console.log(`\npronto: ${applied} aplicado(s), ${skipped} já estava(m) aplicado(s).`);
} catch (err) {
  console.error("falhou:", err.message);
  process.exitCode = 1;
} finally {
  // `client` fica undefined quando NENHUMA tentativa conectou
  await client?.end().catch(() => {});
}
