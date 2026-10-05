import { readFileSync } from "node:fs";
import pg from "pg";

const raw = readFileSync(".env.local", "utf8");
const line = raw.split(/\r?\n/).find((l) => l.startsWith("DATABASE_URL="));
const dsn = line.slice("DATABASE_URL=".length).trim().replace(/^["']|["']$/g, "");
const u = new URL(dsn);
const ref = u.hostname.split(".")[0];            // db.<ref>.supabase.co
const pw = decodeURIComponent(u.password);
console.log("host:", u.hostname, "| user:", u.username, "| senha com", pw.length, "caracteres");

const variants = [
  ["direto + ssl relaxado", { connectionString: dsn, ssl: { rejectUnauthorized: false } }],
  ["direto + sem ssl", { connectionString: dsn }],
  ["pooler us-west-2 + ssl relaxado", { connectionString: `postgresql://postgres.${ref}:${encodeURIComponent(pw)}@aws-0-us-west-2.pooler.supabase.com:5432/postgres`, ssl: { rejectUnauthorized: false } }],
  ["pooler us-west-2 + sem ssl", { connectionString: `postgresql://postgres.${ref}:${encodeURIComponent(pw)}@aws-0-us-west-2.pooler.supabase.com:5432/postgres` }],
];

for (const [label, config] of variants) {
  const c = new pg.Client({ ...config, connectionTimeoutMillis: 12000 });
  const t0 = Date.now();
  try {
    await c.connect();
    const r = await c.query("select current_user");
    console.log(`OK   ${label} (${Date.now() - t0}ms) → ${r.rows[0].current_user}`);
    await c.end();
    break;
  } catch (e) {
    console.log(`FAIL ${label} (${Date.now() - t0}ms) → ${e.code || e.name}: ${String(e.message).slice(0, 80)}`);
    await c.end().catch(() => {});
  }
}
