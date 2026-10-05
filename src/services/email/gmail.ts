import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Envio de e-mail pela Gmail API usando a conexão OAuth do Google do CRM
 * (mesma conexão do Calendar, agora com scope gmail.send).
 *
 * Os tokens ficam em google_calendar_connections (access_token / refresh_token /
 * expires_at). Quando o access_token expira, renovamos com o refresh_token.
 */

const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const GMAIL_SEND = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";
const GMAIL_PROFILE = "https://gmail.googleapis.com/gmail/v1/users/me/profile";

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/gmail.send",
];

type Connection = {
  id: string;
  google_email: string | null;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
  sync_token: string | null;
};

async function loadConnection(organizationId: string): Promise<Connection | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("google_calendar_connections")
    .select("id, google_email, access_token, refresh_token, expires_at, sync_token")
    .eq("organization_id", organizationId)
    .maybeSingle();
  return (data as Connection | null) ?? null;
}

function isExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() - 60_000 <= Date.now();
}

/** Devolve um access_token válido, renovando via refresh_token quando necessário. */
export async function validAccessToken(organizationId: string): Promise<{
  token: string;
  connection: Connection;
} | null> {  const conn = await loadConnection(organizationId);
  if (!conn) return null;

  const stored = conn.access_token ?? conn.sync_token ?? null;
  if (stored && !isExpired(conn.expires_at)) {
    return { token: stored, connection: conn };
  }

  if (!conn.refresh_token) {
    // Conexão antiga (só access_token, sem refresh) — precisa reconectar.
    return stored ? { token: stored, connection: conn } : null;
  }

  const res = await fetch(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      refresh_token: conn.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    console.error("[gmail] refresh falhou:", res.status, await res.text().catch(() => ""));
    return null;
  }

  const json = (await res.json()) as { access_token: string; expires_in: number };
  const expiresAt = new Date(Date.now() + (json.expires_in ?? 3600) * 1000).toISOString();

  const admin = createAdminClient();
  await admin
    .from("google_calendar_connections")
    .update({ access_token: json.access_token, expires_at: expiresAt })
    .eq("id", conn.id);

  return { token: json.access_token, connection: { ...conn, access_token: json.access_token, expires_at: expiresAt } };
}

/** O e-mail está conectado (tem token utilizável)? */
export async function gmailStatus(organizationId: string): Promise<{
  connected: boolean;
  email: string | null;
  canSend: boolean;
}> {
  const conn = await loadConnection(organizationId);
  if (!conn) return { connected: false, email: null, canSend: false };
  const token = conn.access_token ?? conn.sync_token;
  return {
    connected: Boolean(token),
    email: conn.google_email,
    canSend: Boolean(token && (conn.refresh_token || !isExpired(conn.expires_at))),
  };
}

function encodeHeader(value: string): string {
  // Cabeçalhos com acento precisam de encoded-word
  return /^[\x20-\x7E]*$/.test(value)
    ? value
    : `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function buildRawMessage(params: {
  from: string;
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
}): string {
  const body = params.text.replace(/\r?\n/g, "\r\n");
  const lines = [
    `From: ${params.from}`,
    `To: ${params.to}`,
    params.replyTo ? `Reply-To: ${params.replyTo}` : null,
    `Subject: ${encodeHeader(params.subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    body,
  ].filter((l) => l !== null);
  return Buffer.from(lines.join("\r\n"), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export type SendEmailResult =
  | { ok: true; id: string; from: string }
  | { ok: false; error: string };

/** Envia um e-mail pelo Gmail do CRM. */
export async function sendEmail(params: {
  organizationId: string;
  to: string;
  subject: string;
  text: string;
}): Promise<SendEmailResult> {
  const auth = await validAccessToken(params.organizationId);
  if (!auth) return { ok: false, error: "Gmail não conectado (reconecte em Conexões)" };

  let from = auth.connection.google_email ?? "me";
  if (!auth.connection.google_email) {
    try {
      const prof = await fetch(GMAIL_PROFILE, {
        headers: { authorization: `Bearer ${auth.token}` },
      });
      if (prof.ok) {
        const info = (await prof.json()) as { emailAddress?: string };
        if (info.emailAddress) {
          from = info.emailAddress;
          const admin = createAdminClient();
          await admin
            .from("google_calendar_connections")
            .update({ google_email: info.emailAddress })
            .eq("id", auth.connection.id);
        }
      }
    } catch {
      // segue com "me"
    }
  }

  const raw = buildRawMessage({
    from,
    to: params.to,
    subject: params.subject,
    text: params.text,
  });

  const res = await fetch(GMAIL_SEND, {
    method: "POST",
    headers: {
      authorization: `Bearer ${auth.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ raw }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("[gmail] envio falhou:", res.status, detail.slice(0, 300));
    return { ok: false, error: `Gmail HTTP ${res.status}` };
  }

  const json = (await res.json()) as { id: string };
  return { ok: true, id: json.id, from };
}
