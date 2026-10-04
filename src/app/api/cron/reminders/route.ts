import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env";
import { dispatchDueReminders } from "@/services/calendar/reminders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Dispara lembretes vencidos. Protegido por CRON_SECRET. */
export async function GET(request: NextRequest) {
  const secret = serverEnv().cronSecret;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }
  const sent = await dispatchDueReminders(createAdminClient(), 100);
  return NextResponse.json({ ok: true, sent });
}
