import { NextResponse, type NextRequest } from "next/server";
import { requireProfile } from "@/lib/auth/session";
import {
  hermesBotState,
  pauseHermesBot,
  resumeHermesBot,
} from "@/services/messaging/hermes-control";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

/** Estado atual (GET) ou pausa/retomada do bot (POST { paused, reason }). */
export async function GET() {
  await requireProfile();
  return NextResponse.json(hermesBotState());
}

export async function POST(request: NextRequest) {
  await requireProfile();
  let body: { paused?: boolean; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const result = body.paused
    ? await pauseHermesBot(body.reason ?? "assumido no CRM")
    : await resumeHermesBot();

  return NextResponse.json({ ...result, state: hermesBotState() });
}
