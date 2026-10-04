import { NextResponse, type NextRequest } from "next/server";
import { generateText } from "@/services/agents/claude";
import { requireProfile } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IMPROVEMENT_SYSTEM = `Você é um especialista em engenharia de prompts para agentes de atendimento comercial brasileiros.
Reescreva o system prompt recebido para torná-lo mais claro, específico e eficaz, sem inventar informações nem mudar o objetivo do negócio.
Mantenha obrigatoriamente as variáveis {{nome_empresa}}, {{nome_contato}}, {{horario_atendimento}}, {{canal}} e {{nome_agente}} quando presentes.
Responda APENAS com o prompt melhorado, em português do Brasil, sem comentários, títulos ou cercas de código.`;

/** Reescreve o system prompt do agente com a IA (9router ou Claude nativo). */
export async function POST(request: NextRequest) {
  await requireProfile();
  const body = await request.json().catch(() => null);
  const prompt = (body?.prompt as string | undefined)?.trim();
  if (!prompt) return NextResponse.json({ error: "prompt é obrigatório" }, { status: 400 });

  try {
    const improved = await generateText(prompt, IMPROVEMENT_SYSTEM);
    return NextResponse.json({ improved });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
