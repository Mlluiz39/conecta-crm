import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth/session";
import { saveLeadOpportunity, setLeadTemperature } from "@/lib/data/actions";
import type { LeadTemperature } from "@/lib/data/lead-temperature";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AcaoRecebida =
  | { id: string; tipo: "temperatura"; contatoId: string; temperatura: LeadTemperature | null }
  | { id: string; tipo: "valor"; contatoId: string; valor: number };

/**
 * Aplica as ações que o celular guardou enquanto estava sem conexão.
 * Devolve os ids que deram certo; o que falhar continua na fila do aparelho.
 */
export async function POST(request: Request) {
  await requireProfile(); // garante sessão; as actions repetem a checagem por organização

  const corpo = (await request.json().catch(() => null)) as { acoes?: AcaoRecebida[] } | null;
  const acoes = Array.isArray(corpo?.acoes) ? corpo!.acoes.slice(0, 100) : [];
  if (acoes.length === 0) return NextResponse.json({ aplicadas: [] });

  const aplicadas: string[] = [];
  const falhas: { id: string; erro: string }[] = [];

  for (const acao of acoes) {
    try {
      if (acao.tipo === "temperatura") {
        await setLeadTemperature(acao.contatoId, acao.temperatura ?? null);
        aplicadas.push(acao.id);
      } else if (acao.tipo === "valor") {
        const valor = Number(acao.valor);
        if (!Number.isFinite(valor) || valor <= 0) throw new Error("valor inválido");
        await saveLeadOpportunity({ contactId: acao.contatoId, value: valor });
        aplicadas.push(acao.id);
      } else {
        throw new Error("tipo desconhecido");
      }
    } catch (erro) {
      falhas.push({ id: acao.id, erro: (erro as Error).message.slice(0, 120) });
    }
  }

  return NextResponse.json({ aplicadas, falhas });
}
