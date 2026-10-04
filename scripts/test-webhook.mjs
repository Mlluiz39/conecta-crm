/**
 * Script para simular uma mensagem real de um lead chegando pelo WhatsApp via Zernio
 *
 * Uso:
 *   node scripts/test-webhook.mjs
 *   node scripts/test-webhook.mjs "Olá, gostaria de agendar uma reunião amanhã às 15h"
 *   node scripts/test-webhook.mjs "Quero falar com um atendente humano"
 */

const messageText =
  process.argv[2] ||
  "Olá! Vi o anúncio de vocês e gostaria de saber mais informações e agendar uma demonstração.";

const phone = process.argv[3] || "5511999887766";
const name = process.argv[4] || "Carlos Eduardo";

async function testIncomingMessage() {
  const url = "http://localhost:3000/api/webhooks/zernio";

  const payload = {
    messages: [
      {
        id: `msg_${Date.now()}`,
        event_id: `evt_${Date.now()}`,
        channel: "whatsapp",
        account_id: "default",
        from: phone,
        from_name: name,
        type: "text",
        text: messageText,
        timestamp: new Date().toISOString(),
      },
    ],
  };

  console.log("\n=======================================================");
  console.log("📲 SIMULANDO MENSAGEM DO CLIENTE VIA WHATSAPP (ZERNIO)");
  console.log(`De: ${name} (${phone})`);
  console.log(`Mensagem: "${messageText}"`);
  console.log("=======================================================\n");

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    console.log("Status HTTP:", res.status);
    console.log("Resposta do Webhook:", JSON.stringify(data, null, 2));

    if (res.ok) {
      console.log("\n✅ Mensagem recebida pelo ConectaCRM com sucesso!");
      console.log("👉 O Agente de IA processou a mensagem e gerou a resposta.");
      console.log("👉 Abra http://localhost:3000/conversas para ver o atendimento ao vivo!");
    } else {
      console.error("\n❌ Falha no webhook:", data);
    }
  } catch (err) {
    console.error("Erro ao conectar em http://localhost:3000. O servidor 'npm run dev' está rodando?", err.message);
  }
}

testIncomingMessage();
