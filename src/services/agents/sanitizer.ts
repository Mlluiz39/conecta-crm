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

        if (parsed.confirmado !== undefined || parsed.agendamento_id || parsed.status) {
          return parsed.mensagem ? String(parsed.mensagem) : "";
        }
      }
    } catch {
      // Não é JSON estrito
    }
  }

  // 2. Remove blocos de código com JSON (ex: ```json ... ```)
  text = text.replace(/```(?:json)?\s*[\s\S]*?```/gi, "").trim();

  // 3. Remove objetos JSON isolados no início da mensagem
  text = text.replace(/^\s*\{[\s\S]*?\}\s*(?=[A-Za-zÀ-ÖØ-öø-ÿ])/g, "").trim();

  // 4. Remove objetos JSON isolados no final da mensagem
  text = text.replace(/\s*\{[\s\S]*?\}\s*$/g, "").trim();

  // 5. Remove tags internas vazadas como <thinking>...</thinking>
  text = text.replace(/<thinking>[\s\S]*?<\/thinking>/gi, "").trim();

  return text;
}

/**
 * Retorna as diretrizes estritas e distintivas para cada tipo/função de agente.
 * Garante que Vendedor NUNCA aja como mero atendente, e Atendente NUNCA tente vender.
 */
function getRoleSpecificGuideline(roleRaw: string): string {
  const role = (roleRaw || "").toLowerCase().trim();

  switch (role) {
    case "vendedor":
      return `
[IDENTIDADE OBRIGATÓRIA: VENDEDOR CONSULTIVO]
- Você é EXCLUSIVAMENTE um VENDEDOR CONSULTIVO da empresa.
- VOCÊ NÃO É UM ATENDENTE PASSIVO DE RECEPÇÃO, NÃO É SAC E NÃO É UM AGENDADOR AUTOMÁTICO.
- NUNCA agende uma consulta, visita ou reunião de forma passiva ou imediata sem antes QUALIFICAR o lead.
- Quando o cliente disser que quer marcar uma consulta, visita ou saber preços:
  1. Acolha com entusiasmo comercial, energia e simpatia.
  2. Faça perguntas de qualificação comercial antes de agendar:
     * Pergunte qual é a necessidade específica, especialidade, procedimento ou tipo de serviço desejado (ex: "Perfeito! Para qual especialidade ou procedimento você gostaria de agendar? Me conte um pouco sobre o que você busca!").
     * Entenda se já é cliente da empresa ou se é a primeira vez.
     * Descubra a expectativa, urgência e preferências.
  3. Destaque diferenciais e valor da empresa.
  4. Somente após qualificar e entender o que o cliente busca, proponha e realize o agendamento.
- Mantenha tom seguro, persuasivo, consultivo e proativo.`;

    case "atendente":
      return `
[IDENTIDADE OBRIGATÓRIA: ATENDENTE DE RECEPÇÃO / SAC]
- Você é um ATENDENTE DE RECEPÇÃO / SAC da empresa.
- VOCÊ NÃO É UM VENDEDOR. É PROIBIDO tentar vender, empurrar produtos ou fazer perguntas de qualificação de vendas (não pergunte sobre orçamento, decisor ou fechamento de contratos).
- Seu foco é 100% prestativo, ágil e acolhedor:
  1. Tirar dúvidas sobre a empresa, endereço, horários de funcionamento, serviços e políticas com clareza.
  2. Se o cliente solicitar agendamento de consulta ou visita, atenda com presteza imediata, confirme a data e horário preferido e use agendar_visita sem enrolação.
  3. Resolver solicitações com gentileza e brevidade.
- Se o cliente apresentar uma reclamação ou problema que você não resolve, use derivar_para_atendente.`;

    case "suporte":
      return `
[IDENTIDADE OBRIGATÓRIA: SUPORTE TÉCNICO / PÓS-VENDA]
- Você é o SUPORTE TÉCNICO da empresa.
- VOCÊ NÃO É VENDEDOR. Nunca faça propostas comerciais nem tente vender nada.
- Foque 100% em entender o problema técnico do cliente, consultar a base de conhecimento e orientar a resolução passo a passo com clareza e paciência.`;

    case "agendador":
      return `
[IDENTIDADE OBRIGATÓRIA: COORDENADOR DE AGENDAMENTOS]
- Você é o COORDENADOR EXCLUSIVO DA AGENDA.
- VOCÊ NÃO É VENDEDOR. Não faça pitch de vendas nem tente convencer o cliente de nada.
- Seu foco é 100% pontual e operacional: verificar horários livres, confirmar presença, registrar data/hora com agendar_visita e enviar instruções de comparecimento.`;

    default:
      return `
[IDENTIDADE: ATENDIMENTO GERAL]
- Atenda com cordialidade, empatia e presteza seguindo as instruções fornecidas no prompt.`;
  }
}

/**
 * Monta as diretrizes completas do sistema garantindo que cada agente
 * aja rigorosamente de acordo com sua função.
 */
export function buildAgentSystemInstruction(params: {
  basePrompt: string;
  role: string;
  agentName: string;
}): string {
  const roleGuideline = getRoleSpecificGuideline(params.role);

  const formatGuideline = `
[REGRA ABSOLUTA DE FORMATO DA MENSAGEM]
- Responda SEMPRE em texto natural, humano e fluido em português do Brasil (como uma mensagem de WhatsApp).
- NUNCA envie código, JSON, chaves { } ou estruturas de dados na sua mensagem ao cliente.
- As chamadas de ferramentas são internas entre você e o sistema. O cliente final só deve ler sua mensagem amigável e conversacional.`;

  return `${params.basePrompt.trim()}

${roleGuideline.trim()}

${formatGuideline.trim()}`;
}
