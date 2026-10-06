import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env";
import { outreachStatus, runOutreachCycle } from "@/services/prospecting/outreach-queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export const maxDuration = 300;

/**
 * Ciclo de disparo da prospecção (roda a cada poucos minutos).
 * Envia o que está vencido dentro da janela 9–18h e agenda o resto com
 * intervalos variados, respeitando o teto diário de 15–20 leads.
 *
 * Query: ?force=1 (ignora janela/teto — teste), &limit=N
 */
export async function GET(request: NextRequest) {
  const secret = serverEnv().cronSecret;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const force = ["1", "true", "yes"].includes((params.get("force") ?? "").toLowerCase());
  const limit = Number(params.get("limit") ?? 0) || undefined;

  try {
    const admin = createAdminClient();
    const { data: org } = await admin.from("organizations").select("id").limit(1).single();
    if (!org) return NextResponse.json({ ok: false, error: "nenhuma organização" }, { status: 500 });

    const result = await runOutreachCycle({ organizationId: org.id, force, limit });
    const status = await outreachStatus(org.id);
    return NextResponse.json({ ok: true, ...result, status });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
