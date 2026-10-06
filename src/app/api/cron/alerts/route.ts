import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env";
import { alertConfig, runAlertsCycle } from "@/services/alerts/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export const maxDuration = 120;

/**
 * Alertas em tempo real: detecta leads contatados/respostas/intenção de fechar/calls
 * e avisa no Telegram. Roda a cada minuto (local) ou pelo cron de produção.
 */
export async function GET(request: NextRequest) {
  const secret = serverEnv().cronSecret;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }

  try {
    const admin = createAdminClient();
    const { data: org } = await admin.from("organizations").select("id").limit(1).single();
    if (!org) return NextResponse.json({ ok: false, error: "nenhuma organização" }, { status: 500 });

    const { detected, notified } = await runAlertsCycle(org.id);
    return NextResponse.json({
      ok: true,
      telegram: alertConfig().telegramEnabled,
      detected,
      notified,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
