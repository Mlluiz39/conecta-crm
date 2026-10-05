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
 * Roda statement por statement (DDL como ALTER TYPE ... ADD VALUE não aceita transação)
 * e é idempotente: erros de "já existe" são apenas avisados.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const file = process.argv[2];

/** Lê DATABASE_URL do .env.local (arquivo ignorado pelo git) — evita colar senha no chat. */
function dsnFromEnvFile() {
  try {
    const raw = readFileSync(resolve(".env.local"), "utf8");
    const line = raw.split(/\r?\n/).find((l) => l.startsWith("DATABASE_URL="));
    if (!line) return null;
    const value = line.slice("DATABASE_URL=".length).trim().replace(/^["']|["']$/g, "");
    return value || null;
  } catch {
    return null;
  }
}

const dsn = process.argv[3] ?? process.env.DATABASE_URL ?? dsnFromEnvFile();

if (!file) {
  console.error(
    'Uso: node scripts/apply-sql.mjs <arquivo.sql> "postgresql://..."   (ou DATABASE_URL no ambiente)',
  );
  process.exit(1);
}
if (!dsn) {
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
const client = new pg.Client({ connectionString: dsn, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  console.log(`conectado ✓ · aplicando ${file}`);

  const statements = sql
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith("--"));

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
  await client.end().catch(() => {});
}
