import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { exchangeCode } from "@/services/calendar/google";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Troca o code por tokens e registra na tabela google_calendar_connections */
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

    // Obtém o primeiro membro admin da organização
    const { data: member } = await admin
      .from("organization_members")
      .select("user_id")
      .eq("organization_id", organizationId)
      .limit(1)
      .single();

    if (member) {
      await admin.from("google_calendar_connections").upsert(
        {
          organization_id: organizationId,
          user_id: member.user_id,
          sync_token: tokens.access_token,
          calendar_id: "primary",
        },
        { onConflict: "organization_id,user_id" },
      );
    }

    return NextResponse.redirect(`${appUrl}/calendario?google=conectado`);
  } catch (err) {
    console.error("[google callback]", err);
    return NextResponse.redirect(`${appUrl}/calendario?google=erro`);
  }
}
