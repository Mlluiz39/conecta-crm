import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env";
import { enviarLembretes } from "@/services/push/lembretes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export const maxDuration = 120;

/**
 * Lembrete de follow-up no celular: leads que ficaram sem resposta.
 *
 * Query: ?horas=24 (janela mínima) · ?simular=1 (só relata, não notifica)
 * Protegido pelo mesmo CRON_SECRET dos outros jobs.
 */
export async function GET(request: NextRequest) {
  const secret = serverEnv().cronSecret;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }

  const url = new URL(request.url);
  const horas = Number(url.searchParams.get("horas") ?? 24);
  const simular = url.searchParams.get("simular") === "1";

  try {
    const admin = createAdminClient();
    const { data: org } = await admin.from("organizations").select("id").limit(1).single();
    if (!org) return NextResponse.json({ ok: false, error: "nenhuma organização" }, { status: 500 });

    const resultado = await enviarLembretes({
      organizationId: org.id,
      horas,
      simular,
    });

    return NextResponse.json({ ok: true, horas, simular, ...resultado });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
