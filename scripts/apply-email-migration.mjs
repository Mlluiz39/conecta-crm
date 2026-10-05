#!/usr/bin/env node
/**
 * Aplica a migration do canal de e-mail (Gmail) direto no Postgres do Supabase.
 *
 * A migration só faz DDL simples e idempotente:
 *   - adiciona 'email' ao enum channel_type
 *   - adiciona access_token / refresh_token / expires_at / scopes em google_calendar_connections
 *
 * Uso:
 *   node scripts/apply-email-migration.mjs "postgresql://postgres.<ref>:<senha>@<host>:5432/postgres"
 *
 * A connection string está em Supabase → Project Settings → Database → Connection string (URI).
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const dsn = process.argv[2] ?? process.env.DATABASE_URL;
if (!dsn) {
  console.error(
    "Informe a connection string do Postgres do Supabase:\n" +
      '  node scripts/apply-email-migration.mjs "postgresql://postgres.<ref>:<senha>@<host>:5432/postgres"',
  );
  process.exit(1);
}

let pg;
try {
  pg = await import("pg");
} catch {
  console.error(
    "Dependência 'pg' não instalada. Rode:\n  npm_config_cache=/tmp/npm-cache npm i -D pg",
  );
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const sqlPath = join(here, "..", "supabase", "migrations", "20261005_email_channel_gmail_tokens.sql");
const sql = readFileSync(sqlPath, "utf8");

const client = new pg.Client({ connectionString: dsn, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  console.log("conectado ao Postgres ✓");

  // ALTER TYPE ... ADD VALUE não roda dentro de transação: executa statement a statement.
  const statements = sql
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith("--"));

  for (const statement of statements) {
    const label = statement.split("\n")[0].slice(0, 70);
    try {
      await client.query(statement);
      console.log("✓", label);
    } catch (err) {
      if (String(err.message).includes("already exists")) {
        console.log("• já aplicado:", label);
      } else {
        throw err;
      }
    }
  }

  const { rows: enumRows } = await client.query(
    "select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'channel_type' and e.enumlabel = 'email'",
  );
  const { rows: colRows } = await client.query(
    "select column_name from information_schema.columns where table_name = 'google_calendar_connections' and column_name in ('access_token','refresh_token','expires_at','scopes')",
  );

  console.log("\nverificação:");
  console.log("  enum 'email':", enumRows.length === 1 ? "OK" : "FALTANDO");
  console.log("  colunas de token:", colRows.map((r) => r.column_name).join(", ") || "FALTANDO");
  console.log(
    enumRows.length === 1 && colRows.length === 4
      ? "\nMigration aplicada. Agora reconecte o Google em /conexoes para autorizar o envio de e-mail."
      : "\nMigration incompleta — confira o SQL acima.",
  );
} catch (err) {
  console.error("falhou:", err.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
