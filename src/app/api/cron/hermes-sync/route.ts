import { NextResponse, type NextRequest } from "next/server";
import { serverEnv } from "@/lib/env";
import { syncHermesState } from "@/services/messaging/hermes-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Espelha ~/.hermes/state.db (conversas WhatsApp) no Supabase. Protegido por CRON_SECRET. */
export async function GET(request: NextRequest) {
  const secret = serverEnv().cronSecret;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }
  try {
    const result = await syncHermesState();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
