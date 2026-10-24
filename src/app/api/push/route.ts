import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth/session";
import {
  chavePublica,
  contarInscricoes,
  pushConfigurado,
  removerInscricao,
  salvarInscricao,
} from "@/services/push/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Estado do push + chave pública (o navegador precisa dela para se inscrever). */
export async function GET() {
  const { organizationId, id: userId } = await requireProfile();
  const total = await contarInscricoes(organizationId);
  return NextResponse.json({
    disponivel: pushConfigurado(),
    publicKey: chavePublica(),
    aparelhos: total,
    userId,
  });
}

/** Salva a inscrição deste aparelho. */
export async function POST(request: Request) {
  const { organizationId, id: userId } = await requireProfile();
  if (!pushConfigurado()) {
    return NextResponse.json(
      { error: "Notificação não configurada no servidor (VAPID)." },
      { status: 503 },
    );
  }

  const corpo = (await request.json().catch(() => null)) as {
    subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
    aparelho?: string;
  } | null;

  const endpoint = corpo?.subscription?.endpoint;
  const p256dh = corpo?.subscription?.keys?.p256dh;
  const auth = corpo?.subscription?.keys?.auth;
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: "Inscrição inválida" }, { status: 400 });
  }

  const { total } = await salvarInscricao(organizationId, {
    endpoint,
    keys: { p256dh, auth },
    aparelho: corpo?.aparelho,
    userId,
  });
  return NextResponse.json({ ok: true, aparelhos: total });
}

/** Remove a inscrição (desligar notificação neste aparelho). */
export async function DELETE(request: Request) {
  const { organizationId } = await requireProfile();
  const corpo = (await request.json().catch(() => null)) as { endpoint?: string } | null;
  if (!corpo?.endpoint) return NextResponse.json({ error: "endpoint obrigatório" }, { status: 400 });
  const total = await removerInscricao(organizationId, corpo.endpoint);
  return NextResponse.json({ ok: true, aparelhos: total });
}
