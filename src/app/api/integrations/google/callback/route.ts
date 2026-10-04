import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { exchangeCode } from "@/services/calendar/google";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Troca o code por tokens e guarda a integração (service role). */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const organizationId = request.nextUrl.searchParams.get("state");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;

  if (!code || !organizationId) {
    return NextResponse.redirect(`${appUrl}/calendario?google=erro`);
  }

  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI ?? `${appUrl}/api/integrations/google/callback`;

  try {
    const tokens = await exchangeCode(code, redirectUri);
    const admin = createAdminClient();
    await admin.from("integrations").upsert(
      {
        organization_id: organizationId,
        provider: "google_calendar",
        status: "connected",
        credentials: {
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          scope: tokens.scope,
        },
        scopes: tokens.scope.split(" "),
        expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      },
      { onConflict: "organization_id,provider" },
    );
    return NextResponse.redirect(`${appUrl}/calendario?google=conectado`);
  } catch (err) {
    console.error("[google callback]", err);
    return NextResponse.redirect(`${appUrl}/calendario?google=erro`);
  }
}
