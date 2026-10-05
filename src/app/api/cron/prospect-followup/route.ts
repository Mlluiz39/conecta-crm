import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env";
import { runFollowups } from "@/services/prospecting/followup.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

/**
 * Follow-up de fechamento: leads contatados que não responderam recebem UMA
 * retomada curta escrita pelo agente.
 *
 * Query: ?hours=24 (tempo mínimo desde o primeiro contato), &limit=5, &dryRun=1,
 *        &offer=...&goal=... (briefing opcional)
 */
export async function GET(request: NextRequest) {
  const secret = serverEnv().cronSecret;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const hours = Math.max(1, Number(params.get("hours") ?? 24) || 24);
  const limit = Math.min(20, Math.max(1, Number(params.get("limit") ?? 5) || 5));
  const dryRun = ["1", "true", "yes"].includes((params.get("dryRun") ?? "").toLowerCase());

  try {
    const admin = createAdminClient();
    const { data: org } = await admin.from("organizations").select("id").limit(1).single();
    if (!org) return NextResponse.json({ ok: false, error: "nenhuma organização" }, { status: 500 });

    const result = await runFollowups({
      organizationId: org.id,
      hours,
      limit,
      dryRun,
      briefing: {
        offer: params.get("offer") ?? undefined,
        goal: params.get("goal") ?? undefined,
        notes: params.get("notes") ?? undefined,
      },
    });

    return NextResponse.json({ ok: true, dryRun, hours, ...result });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
