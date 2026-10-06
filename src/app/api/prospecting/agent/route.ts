import { NextResponse, type NextRequest } from "next/server";
import { prospectWithAgent } from "@/lib/data/actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export const maxDuration = 300;

/**
 * Dispara a prospecção pelo agente para os contatos informados (mesma lógica do
 * botão da tela). Útil para automações/cron e para teste via API.
 *
 * Body: { contactIds: string[], offer?: string, goal?: string, notes?: string, value?: number }
 * Autenticação: sessão do CRM (cookie) — a action valida a organização do usuário.
 */
export async function POST(request: NextRequest) {
  let body: {
    contactIds?: string[];
    offer?: string;
    goal?: string;
    notes?: string;
    value?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const contactIds = (body.contactIds ?? []).filter(Boolean);
  if (contactIds.length === 0) {
    return NextResponse.json({ error: "informe contactIds" }, { status: 400 });
  }

  try {
    const result = await prospectWithAgent(contactIds, {
      offer: body.offer,
      goal: body.goal,
      notes: body.notes,
      value: body.value,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: (error as Error).message.replace(/^Error:\s*/, "") },
      { status: 200 },
    );
  }
}
