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
 * Diretrizes de função. Apenas as travas de segurança/função — o prompt do
 * usuário é a fonte primária de personalidade e método.
 */
function getRoleSpecificGuideline(roleRaw: string): string {
  const role = (roleRaw || "").toLowerCase().trim();

  switch (role) {
    case "vendedor":
      return `
[FUNÇÃO: VENDEDOR CONSULTIVO]
- Você é vendedor consultivo da empresa — não é recepção passiva nem agendador automático.
- Antes de executar agendar_visita, entenda rapidamente a necessidade do cliente e por que ele busca a solução (1 ou 2 perguntas no máximo, como conversa natural, nunca interrogatório).
- Depois de qualificado, proponha o agendamento com naturalidade e siga em frente.`;

    case "atendente":
      return `
[FUNÇÃO: ATENDENTE DE RECEPÇÃO / SAC]
- Você é atendente — não tente vender nem pergunte sobre orçamento ou fechamento de contrato.
- Responda dúvidas sobre a empresa com clareza; para agendamento, confirme data/horário e use agendar_visita direto, sem enrolação.
- Reclamação ou problema que você não resolve: use derivar_para_atendente.`;

    case "suporte":
      return `
[FUNÇÃO: SUPORTE TÉCNICO / PÓS-VENDA]
- Você é suporte técnico — sem propostas comerciais.
- Entenda o problema, consulte a base e oriente a resolução passo a passo, com paciência e clareza.`;

    case "agendador":
      return `
[FUNÇÃO: COORDENADOR DE AGENDAMENTOS]
- Você cuida da agenda — sem pitch de vendas.
- Verifique horários, confirme presença e registre com agendar_visita.`;

    default:
      return `
[FUNÇÃO: ATENDIMENTO GERAL]
- Atenda com cordialidade e presteza seguindo as instruções do prompt.`;
  }
}

/** Tom de conversa escolhido no workbench do agente. */
function getToneGuideline(toneRaw?: string): string {
  switch ((toneRaw || "").toLowerCase().trim()) {
    case "formal":
      return `
[TOM: FORMAL]
- Gramática completa, sem gírias, sem abreviações ("você", não "vc").`;
    case "direto":
      return `
[TOM: DIRETO]
- Objetivo e sem rodeios: vai direto ao ponto, respostas curtas.`;
    case "amigavel":
      return `
[TOM: AMIGÁVEL]
- Conversa leve de colega: pode usar "vc", gíria leve e um emoji ocasional quando combinar com o momento.`;
    default: // consultivo
      return `
[TOM: CONSULTIVO]
- Calmo, analítico e encorajador: explica o raciocínio por trás de cada recomendação.`;
  }
}

const HUMANITY_GUIDELINE = `
[PERSONALIDADE HUMANAMENTE PESSOAL]
- Escreva como uma pessoa real no WhatsApp: frases curtas, ritmo natural, zero linguagem de atendimento automático.
- Várie as abordagens: não comece toda resposta com elogio, confirmação ou pergunta. Mude o arranque conforme a mensagem do cliente.
- Use o nome do cliente ocasionalmente, nunca toda mensagem.
- Demonstre memória da conversa: retome o que já foi combinado sem perguntar de novo.
- Uma pergunta por mensagem. Nada de lista quando uma frase resolve.
- Trate o cliente como pessoa, não como lead: interesse genuíno, sem fórmula decorada, sem repetir frases já usadas.`;

/**
 * Monta as diretrizes completas do sistema. Prompt do usuário vem primeiro
 * (fonte primária); funções, tom, humanidade e formato apenas complementam.
 */
export function buildAgentSystemInstruction(params: {
  basePrompt: string;
  role: string;
  agentName: string;
  tone?: string;
}): string {
  const roleGuideline = getRoleSpecificGuideline(params.role);
  const toneGuideline = getToneGuideline(params.tone);

  const formatGuideline = `
[REGRA ABSOLUTA DE FORMATO DA MENSAGEM]
- Responda SEMPRE em texto natural, humano e fluido em português do Brasil (como uma mensagem de WhatsApp).
- NUNCA envie código, JSON, chaves { } ou estruturas de dados na sua mensagem ao cliente.
- As chamadas de ferramentas são internas entre você e o sistema. O cliente final só deve ler sua mensagem amigável e conversacional.`;

  return `${params.basePrompt.trim()}

${roleGuideline.trim()}

${toneGuideline.trim()}

${HUMANITY_GUIDELINE.trim()}

${formatGuideline.trim()}`;
}
