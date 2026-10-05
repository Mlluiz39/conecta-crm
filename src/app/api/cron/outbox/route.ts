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
  // Lote reduzido: 1,5s de delay entre envios (anti-flood) — 20 msgs ≈ 35s
  const sent = await flushOutbox(20);
  return NextResponse.json({ ok: true, sent });
}
