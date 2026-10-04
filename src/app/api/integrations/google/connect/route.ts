import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/session";
import { googleAuthUrl } from "@/services/calendar/google";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Inicia o OAuth do Google Calendar. `state` carrega a org (csrf básico). */
export async function GET(request: Request) {
  const { organizationId } = await requireProfile();
  const origin = new URL(request.url).origin;
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI ?? `${origin}/api/integrations/google/callback`;
  const url = googleAuthUrl(organizationId, redirectUri);
  return NextResponse.redirect(url);
}
