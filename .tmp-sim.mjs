import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = {};
fs.readFileSync(".env.local","utf8").split("\n").forEach(l => { const m = l.match(/^([A-Z_]+)="?(.*?)"?$/); if (m) env[m[1]] = m[2]; });
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const ORG = "00000000-0000-0000-0000-000000000001";
const { data: conv } = await sb.from("conversations").select("id").eq("channel_type", "email").limit(1).single();
const texts = [
  "Boa tarde! Podemos marcar uma call amanhã às 15h?",
  "Antes disso, quanto custa e qual o prazo?",
];
for (const [i, t] of texts.entries()) {
  await sb.from("messages").insert({
    organization_id: ORG, conversation_id: conv.id, direction: "in", sender_type: "contact",
    content: t, status: "entregue", external_id: `kw_${Date.now()}_${i}`,
  });
}
console.log("  mensagens simuladas:", texts.length);
