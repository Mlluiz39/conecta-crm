import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const SCOPES = ["https://www.googleapis.com/auth/calendar.events"];

export function googleAuthUrl(state: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `${GOOGLE_AUTH}?${params}`;
}

export async function exchangeCode(code: string, redirectUri: string) {
  const res = await fetch(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Google token: HTTP ${res.status}`);
  return (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope: string;
  };
}

async function refreshAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Google refresh: HTTP ${res.status}`);
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

async function getValidAccessToken(organizationId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("integrations")
    .select("credentials, expires_at")
    .eq("organization_id", organizationId)
    .eq("provider", "google_calendar")
    .maybeSingle();
  if (!data?.credentials?.refresh_token) return null;

  const expired = data.expires_at && new Date(data.expires_at) < new Date();
  if (!expired && data.credentials.access_token) return data.credentials.access_token;

  const token = await refreshAccessToken(data.credentials.refresh_token);
  await admin
    .from("integrations")
    .update({
      credentials: { ...data.credentials, access_token: token },
      expires_at: new Date(Date.now() + 3500_000).toISOString(),
    })
    .eq("organization_id", organizationId)
    .eq("provider", "google_calendar");
  return token;
}

/** Cria/atualiza o evento do agendamento no Google Calendar (best-effort). */
export async function syncEventToGoogle(organizationId: string, appointmentId: string) {
  const admin = createAdminClient();
  const { data: appt } = await admin
    .from("appointments")
    .select("id, title, description, starts_at, ends_at, timezone, location, google_event_id, contact:contacts(name)")
    .eq("id", appointmentId)
    .eq("organization_id", organizationId)
    .single();
  if (!appt) return;

  const token = await getValidAccessToken(organizationId);
  if (!token) {
    await admin.from("appointments").update({ sync_status: "not_applicable" }).eq("id", appointmentId);
    return;
  }

  const body = {
    summary: appt.title,
    description: appt.description ?? undefined,
    location: appt.location ?? undefined,
    start: { dateTime: appt.starts_at, timeZone: appt.timezone },
    end: { dateTime: appt.ends_at, timeZone: appt.timezone },
    attendees: (appt as any).contact?.name ? undefined : undefined,
  };

  const url = appt.google_event_id
    ? `${CALENDAR_API}/calendars/primary/events/${appt.google_event_id}`
    : `${CALENDAR_API}/calendars/primary/events`;
  const res = await fetch(url, {
    method: appt.google_event_id ? "PATCH" : "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    await admin.from("appointments").update({ sync_status: "failed" }).eq("id", appointmentId);
    return;
  }
  const event = (await res.json()) as { id: string };
  await admin
    .from("appointments")
    .update({ google_event_id: event.id, sync_status: "synced" })
    .eq("id", appointmentId);
}
