export interface GeminiChatRequest {
  systemPrompt: string;
  message: string;
  history?: Array<{ role: 'user' | 'agent'; text: string }>;
  tone?: string;
  agentRole?: string;
  variables?: Record<string, string | number>;
}

export interface GeminiChatResponse {
  reply: string;
  tokensUsed: number;
  latencyMs: number;
  isFallback: boolean;
  error?: string;
}

export async function sendAgentMessageToGemini(
  payload: GeminiChatRequest
): Promise<GeminiChatResponse> {
  const startTime = Date.now();
  try {
    const res = await fetch('/api/gemini/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `HTTP ${res.status}`);
    }

    const data: GeminiChatResponse = await res.json();
    return data;
  } catch (err: any) {
    console.warn('Fallback ativado no Playground Gemini:', err);
    // Realistic fallback generation if server is offline or during prototype
    const latency = Date.now() - startTime;
    return {
      reply: `Olá! Prazer enorme falar com você. Aqui é a Sofia da ${payload.variables?.nome_empresa || 'ConectaCRM'}. Como posso agilizar o atendimento da sua equipe hoje?`,
      tokensUsed: 48,
      latencyMs: latency < 100 ? 210 : latency,
      isFallback: true,
      error: err?.message,
    };
  }
}
