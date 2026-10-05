#!/usr/bin/env node
/**
 * Importa scripts/knowledge.json → knowledge_base_items (Supabase).
 * Upsert por título: item com mesmo título é atualizado, não duplicado.
 *
 * Uso:  node scripts/import-knowledge.mjs
 * Requer: .env.local com NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
  prefer: "return=representation",
};
const rest = `${url}/rest/v1`;

const items = JSON.parse(fs.readFileSync(path.join(__dirname, "knowledge.json"), "utf8"));
console.log(`knowledge.json: ${items.length} itens`);

// Organização (single-org: usa a primeira)
const orgs = await (await fetch(`${rest}/organizations?select=id`, { headers })).json();
if (!orgs.length) {
  console.error("Erro: nenhuma organização encontrada");
  process.exit(1);
}
const orgId = orgs[0].id;

// Upsert por título: remove itens com mesmo título e reinsere
let created = 0;
let updated = 0;
for (const item of items) {
  const clean = {
    organization_id: orgId,
    title: String(item.title).trim(),
    content: String(item.content).trim(),
    category: item.category ? String(item.category).trim() : null,
  };
  if (!clean.title || !clean.content) {
    console.warn(`  ! Pulado (título/conteúdo vazio): ${item.title}`);
    continue;
  }

  const existing = await (
    await fetch(
      `${rest}/knowledge_base_items?organization_id=eq.${orgId}&title=eq.${encodeURIComponent(clean.title)}&select=id`,
      { headers },
    )
  ).json();

  if (existing.length) {
    await fetch(`${rest}/knowledge_base_items?id=eq.${existing[0].id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(clean),
    });
    updated++;
    console.log(`  ~ atualizado: ${clean.title}`);
  } else {
    await fetch(`${rest}/knowledge_base_items`, {
      method: "POST",
      headers,
      body: JSON.stringify(clean),
    });
    created++;
    console.log(`  + criado: ${clean.title}`);
  }
}

const count = await (
  await fetch(`${rest}/knowledge_base_items?select=id&organization_id=eq.${orgId}`, { headers })
).json();

console.log(`\nPronto: ${created} criados, ${updated} atualizados. Total na base: ${count.length}`);
