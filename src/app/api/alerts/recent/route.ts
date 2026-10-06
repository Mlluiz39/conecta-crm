import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

/** Últimos alertas da organização (feed do dashboard). */
export async function GET() {
  const { organizationId } = await requireProfile();
  const supabase = createClient();

  const { data } = await supabase
    .from("alerts")
    .select("id, type, title, body, created_at, notified_at, contact_id, conversation_id")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(12);

  return NextResponse.json({
    alerts: (data ?? []).map((a) => ({
      id: String(a.id),
      type: String(a.type),
      title: String(a.title ?? ""),
      body: a.body ? String(a.body) : null,
      createdAt: String(a.created_at),
      notifiedAt: a.notified_at ? String(a.notified_at) : null,
      contactId: a.contact_id ? String(a.contact_id) : null,
      conversationId: a.conversation_id ? String(a.conversation_id) : null,
    })),
  });
}
