import { NextResponse, type NextRequest } from "next/server";
import { serverEnv } from "@/lib/env";
import { flushOutbox } from "@/services/messaging/inbound.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Flush da fila de saída. Protegido por CRON_SECRET (Vercel Cron). */
export async function GET(request: NextRequest) {
  const secret = serverEnv().cronSecret;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }
  const sent = await flushOutbox(50);
  return NextResponse.json({ ok: true, sent });
}
