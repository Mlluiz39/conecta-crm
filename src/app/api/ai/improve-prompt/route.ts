import { NextResponse, type NextRequest } from "next/server";
import { getAnthropic } from "@/services/agents/claude";
import { serverEnv } from "@/lib/env";
import { requireProfile } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IMPROVEMENT_SYSTEM = `Você é um especialista em engenharia de prompts para agentes de atendimento comercial brasileiros.
Reescreva o system prompt recebido para torná-lo mais claro, específico e eficaz, sem inventar informações nem mudar o objetivo do negócio.
Mantenha obrigatoriamente as variáveis {{nome_empresa}}, {{nome_contato}}, {{horario_atendimento}}, {{canal}} e {{nome_agente}} quando presentes.
Responda APENAS com o prompt melhorado, em português do Brasil, sem comentários, títulos ou cercas de código.`;

/** Reescreve o system prompt do agente com o Claude. */
export async function POST(request: NextRequest) {
  await requireProfile();
  const body = await request.json().catch(() => null);
  const prompt = (body?.prompt as string | undefined)?.trim();
  if (!prompt) return NextResponse.json({ error: "prompt é obrigatório" }, { status: 400 });

  const anthropic = getAnthropic();
  try {
    const res = await anthropic.messages.create({
      model: serverEnv().defaultModel,
      max_tokens: 1500,
      system: IMPROVEMENT_SYSTEM,
      messages: [{ role: "user", content: prompt }],
    });
    const improved = res.content
      .filter((b): b is any => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    return NextResponse.json({ improved });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
