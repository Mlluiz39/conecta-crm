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

/** Cria/atualiza o evento do agendamento no Google Calendar (best-effort). */
export async function syncEventToGoogle(organizationId: string, appointmentId: string) {
  const admin = createAdminClient();
  const { data: appt } = await admin
    .from("appointments")
    .select("id, title, description, starts_at, ends_at, location, google_event_id, contact:contacts(name)")
    .eq("id", appointmentId)
    .eq("organization_id", organizationId)
    .single();
  if (!appt) return;

  const { data: conn } = await admin
    .from("google_calendar_connections")
    .select("sync_token")
    .eq("organization_id", organizationId)
    .maybeSingle();

  // Se houver token configurado em sync_token
  const token = conn?.sync_token;
  if (!token) return;

  const body = {
    summary: appt.title,
    description: appt.description ?? undefined,
    location: appt.location ?? undefined,
    start: { dateTime: appt.starts_at, timeZone: "America/Sao_Paulo" },
    end: { dateTime: appt.ends_at, timeZone: "America/Sao_Paulo" },
  };

  const url = appt.google_event_id
    ? `${CALENDAR_API}/calendars/primary/events/${appt.google_event_id}`
    : `${CALENDAR_API}/calendars/primary/events`;
  const res = await fetch(url, {
    method: appt.google_event_id ? "PATCH" : "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) return;

  const event = (await res.json()) as { id: string };
  await admin
    .from("appointments")
    .update({ google_event_id: event.id, updated_at: new Date().toISOString() })
    .eq("id", appointmentId);
}
