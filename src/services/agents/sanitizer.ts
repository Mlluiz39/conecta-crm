/**
 * Limpa e higieniza a resposta da IA para garantir que NENHUM JSON bruto,
 * bloco de código ou retorno de ferramenta seja vazado para o cliente final.
 */
export function sanitizeAiReply(raw: string): string {
  if (!raw || typeof raw !== "string") return "";

  let text = raw.trim();

  // 1. Se a resposta inteira for um JSON (ex: {"resposta": "...", "mensagem": "..."})
  if (text.startsWith("{") && text.endsWith("}")) {
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed === "object" && parsed !== null) {
        // Se for um objeto com campo de texto explicito
        const candidate =
          parsed.resposta ||
          parsed.mensagem ||
          parsed.reply ||
          parsed.message ||
          parsed.content ||
          parsed.text;
        if (typeof candidate === "string" && candidate.trim()) {
          return candidate.trim();
        }

        // Se for apenas o retorno da ferramenta ecoado (ex: {"confirmado": true, ...})
        if (parsed.confirmado !== undefined || parsed.agendamento_id || parsed.status) {
          return parsed.mensagem ? String(parsed.mensagem) : "";
        }
      }
    } catch {
      // Não é JSON estrito, segue para limpeza de blocos
    }
  }

  // 2. Remove blocos de código com JSON (ex: ```json ... ```)
  text = text.replace(/```(?:json)?\s*[\s\S]*?```/gi, "").trim();

  // 3. Remove objetos JSON isolados no início da mensagem (ex: {"confirmado": true...} Olá! Sua consulta...)
  text = text.replace(/^\s*\{[\s\S]*?\}\s*(?=[A-Za-zÀ-ÖØ-öø-ÿ])/g, "").trim();

  // 4. Remove objetos JSON isolados no final da mensagem
  text = text.replace(/\s*\{[\s\S]*?\}\s*$/g, "").trim();

  // 5. Remove tags internas vazadas como <thinking>...</thinking>
  text = text.replace(/<thinking>[\s\S]*?<\/thinking>/gi, "").trim();

  return text;
}

/**
 * Monta as diretrizes do sistema com regras de vendas (qualificação)
 * e proteção contra vazamento de JSON.
 */
export function buildAgentSystemInstruction(params: {
  basePrompt: string;
  role: string;
  agentName: string;
}): string {
  const isVendedor = params.role.toLowerCase() === "vendedor";

  const salesGuideline = isVendedor
    ? `
[POSTURA COMERCIAL DO VENDEDOR CONSULTIVO]
- Você é um vendedor consultivo experiente e acolhedor.
- Quando o cliente demonstrar interesse em um serviço, consulta ou produto, NÃO agende cegamente de imediato sem antes QUALIFICAR o lead.
- Primeiro, ACOLHA o cliente com entusiasmo e faça perguntas estratégicas:
  * Pergunte qual é a necessidade específica ou serviço desejado (ex: "Para qual especialidade ou tratamento você busca atendimento?").
  * Pergunte se é a primeira vez ou se já é cliente.
  * Entenda a expectativa ou urgência do cliente.
- Apenas chame a ferramenta 'agendar_visita' quando o tipo de atendimento, data e horário estiverem claros e combinados com o cliente.
- Mantenha respostas curtas e objetivas (estilo WhatsApp, máximo 2 a 3 parágrafos).`
    : `
[POSTURA DE ATENDIMENTO]
- Acolha o cliente com empatia, clareza e cordialidade.
- Tire dúvidas usando a base de conhecimento e auxilie nos procedimentos com rapidez.
- Mantenha respostas curtas e diretas (estilo WhatsApp).`;

  const formatGuideline = `
[REGRA ABSOLUTA DE FORMATO DA MENSAGEM]
- Responda SEMPRE em texto natural, humano e fluido em português do Brasil.
- NUNCA envie código, JSON, chaves { } ou estruturas de dados na sua mensagem ao cliente.
- As chamadas de ferramentas são internas entre você e o sistema. O cliente final só deve ler sua mensagem calorosa e conversacional.`;

  return `${params.basePrompt.trim()}

${salesGuideline.trim()}

${formatGuideline.trim()}`;
}
