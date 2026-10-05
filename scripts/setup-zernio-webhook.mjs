#!/usr/bin/env node
/**
 * Registra/ atualiza o webhook da Zernio apontando para o CRM.
 *
 * Uso:
 *   node scripts/setup-zernio-webhook.mjs https://SEU-DOMINIO.com
 *
 * Gera um segredo HMAC, cadastra o endpoint em POST /v1/webhooks/settings
 * e grava CERNIO_WEBHOOK_SECRET no .env.local para validação de assinatura.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envFile = path.join(__dirname, "..", ".env.local");

function loadEnv() {
  const env = {};
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, "utf8").split("\n")) {
      const m = line.match(/^([A-Z_]+)="?(.*?)"?$/);
      if (m) env[m[1]] = m[2];
    }
  }
  return env;
}

const baseUrl = process.argv[2];
if (!baseUrl) {
  console.error("Uso: node scripts/setup-zernio-webhook.mjs https://SEU-DOMINIO.com");
  process.exit(1);
}

const env = loadEnv();
const apiKey = env.CERNIO_API_KEY;
const apiUrl = (env.CERNIO_API_URL || "https://api.zernio.com").replace(/\/$/, "");
if (!apiKey) {
  console.error("Erro: CERNIO_API_KEY ausente no .env.local");
  process.exit(1);
}

const url = `${baseUrl.replace(/\/$/, "")}/api/webhooks/zernio`;
const secret = crypto.randomBytes(32).toString("hex");

const res = await fetch(`${apiUrl}/v1/webhooks/settings`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    authorization: `Bearer ${apiKey}`,
  },
  body: JSON.stringify({
    name: "ConectaCRM",
    url,
    secret,
    events: ["message.received"],
    isActive: true,
  }),
});

const body = await res.text();
if (!res.ok) {
  console.error(`Erro ${res.status}: ${body}`);
  process.exit(1);
}

console.log("Webhook registrado:");
console.log(JSON.stringify(JSON.parse(body), null, 2));
console.log(`\nURL: ${url}`);
console.log(`Secret: ${secret}`);

// Grava o secret no .env.local
let envText = fs.readFileSync(envFile, "utf8");
if (envText.includes("CERNIO_WEBHOOK_SECRET=")) {
  envText = envText.replace(
    /^CERNIO_WEBHOOK_SECRET=.*$/m,
    `CERNIO_WEBHOOK_SECRET="${secret}"`,
  );
} else {
  envText += `\nCERNIO_WEBHOOK_SECRET="${secret}"\n`;
}
fs.writeFileSync(envFile, envText);
console.log("\nCERNIO_WEBHOOK_SECRET gravado no .env.local (reinicie o dev server).");
