import { NextResponse, type NextRequest } from "next/server";
import { handleInboundWebhook } from "@/services/messaging/inbound.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Entrada de webhooks de mensageria. Responde 200 em sucesso/duplicata,
 * 401 em assinatura inválida, 5xx só em falha real (o provider retenta).
 * Nunca chama a IA de forma síncrona dentro do timeout — o agente é
 * disparado no service, a resposta vai para a outbox e o cron envia.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { provider: string } },
) {
  // Corpo cru é obrigatório para validar a assinatura.
  const rawBody = await request.text();

  // DEBUG: capturar payload real do provider (remover após diagnóstico)
  if (rawBody.length < 4000) {
    console.log(`[webhook:${params.provider}] payload:`, rawBody);
  }

  try {
    const outcome = await handleInboundWebhook({
      providerName: params.provider,
      rawBody,
      headers: request.headers,
    });

    if (outcome.status === "invalid_signature") {
      return NextResponse.json({ error: "assinatura inválida" }, { status: 401 });
    }
    return NextResponse.json({ ok: true, ...outcome });
  } catch (err) {
    console.error(`[webhook:${params.provider}]`, err);
    return NextResponse.json({ error: "falha ao processar" }, { status: 500 });
  }
}

/** Alguns providers fazem verificação GET do endpoint. */
export async function GET() {
  return NextResponse.json({ ok: true });
}
