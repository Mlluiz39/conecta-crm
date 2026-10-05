import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/session";
import { serverEnv } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

/**
 * Quem está digitando agora (presença do WhatsApp via bridge do Hermes).
 *
 * Devolve `typing: { [conversationId]: true }` para as conversas da organização.
 * Best-effort: se o bridge não responder, devolve vazio (a tela segue normal).
 */
function digits(value: string | null | undefined): string | null {
  const d = String(value ?? "").replace(/\D/g, "");
  return d.length >= 10 ? d : null;
}

export async function GET() {
  const { organizationId } = await requireProfile();
  const supabase = createClient();
  const env = serverEnv();
  const bridgePort = process.env.HERMES_BRIDGE_PORT ?? "3005";
  const bridge = process.env.HERMES_BRIDGE_URL ?? `http://127.0.0.1:${bridgePort}`;

  const { data: convs } = await supabase
    .from("conversations")
    .select("id, external_id, channel_type, contact:contacts(phone)")
    .eq("organization_id", organizationId)
    .limit(50);

  const list = convs ?? [];
  if (list.length === 0) return NextResponse.json({ typing: {} });

  // jid do WhatsApp por conversa (best-effort) + assinatura de presença
  const convPhones = new Map<string, string>();
  const jids = new Set<string>();
  for (const c of list) {
    if (c.channel_type !== "whatsapp") continue;
    const phone = digits((c as { contact?: { phone?: string | null } | null }).contact?.phone) ?? digits(c.external_id);
    if (!phone) continue;
    convPhones.set(c.id, phone);
    jids.add(`${phone}@s.whatsapp.net`);
  }

  if (jids.size > 0) {
    await Promise.all(
      [...jids].map((jid) =>
        fetch(`${bridge}/presence/subscribe`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ chatId: jid }),
          signal: AbortSignal.timeout(4000),
        }).catch(() => null),
      ),
    );
  }

  let presence: { chatId?: string; phone?: string | null; typing?: boolean }[] = [];
  try {
    const res = await fetch(`${bridge}/presence`, {
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) {
      const json = (await res.json()) as { presence?: typeof presence };
      presence = json.presence ?? [];
    }
  } catch {
    // bridge fora do ar: sem indicador de digitação
  }

  const typingByPhone = new Set<string>();
  for (const p of presence) {
    if (!p.typing) continue;
    const phone = digits(p.phone) ?? digits(p.chatId);
    if (phone) typingByPhone.add(phone);
  }

  const typing: Record<string, boolean> = {};
  for (const [convId, phone] of convPhones) {
    if (typingByPhone.has(phone)) typing[convId] = true;
  }

  return NextResponse.json({ typing, bridge: env.hermes.home ? "configured" : "unset" });
}
