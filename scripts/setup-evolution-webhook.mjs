#!/usr/bin/env node
/**
 * Registra o webhook da Evolution API apontando para o CRM.
 * Uso: node scripts/setup-evolution-webhook.mjs https://URL-PUBLICA.com
 * (após reiniciar túnel/deploy — a URL quick tunnel muda sempre)
 */
const base = (process.env.EVOLUTION_API_URL || "https://www.evolutionapi.vps10473.panel.icontainer.net").replace(/\/+$/, "");
const apiKey = process.env.EVOLUTION_API_KEY || "5A5406FF71D2-43AB-8FEA-B632841BCCC7";
const instance = process.env.EVOLUTION_INSTANCE || "mlluiz39";

const baseUrl = process.argv[2];
if (!baseUrl) {
  console.error("Uso: node scripts/setup-evolution-webhook.mjs https://URL-PUBLICA.com");
  process.exit(1);
}

const url = `${baseUrl.replace(/\/$/, "")}/api/webhooks/evolution`;
const res = await fetch(`${base}/webhook/set/${instance}`, {
  method: "POST",
  headers: { apikey: apiKey, "content-type": "application/json" },
  body: JSON.stringify({
    webhook: { enabled: true, url, events: ["MESSAGES_UPSERT"], byEvents: false, base64: false },
  }),
});
const body = await res.text();
if (!res.ok) {
  console.error(`Erro ${res.status}: ${body}`);
  process.exit(1);
}
console.log("Webhook registrado:", JSON.parse(body).url);
