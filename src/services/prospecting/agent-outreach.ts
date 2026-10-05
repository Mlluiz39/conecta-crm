/**
 * Prospecção feita pelo agente: gera a primeira abordagem personalizada por lead
 * (via Hermes CLI, que roda com a persona de vendedor) e entrega no outbox.
 *
 * O envio em si continua no padrão do projeto: messages.status = 'pendente'
 * → flushOutbox() → provider (Hermes/WhatsApp).
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { serverEnv } from "@/lib/env";

const execFileAsync = promisify(execFile);

const GENERATION_TIMEOUT_MS = 120_000;

export type LeadInput = {
  id: string;
  name: string | null;
  phone?: string | null;
  email?: string | null;
  context?: string | null;
};

export type Briefing = {
  /** O que estamos oferecendo (ex.: "site institucional", "sistema de agendamento"). */
  offer?: string;
  /** Objetivo do contato (ex.: "agendar uma call de 20 min"). */
  goal?: string;
  /** Tom/instruções extras do operador. */
  notes?: string;
};

const SYSTEM_PROMPT = `Você é o vendedor consultivo da MLLuiz DevTech (agência de sites, sistemas e automação), falando pelo WhatsApp.

Escreva UMA primeira mensagem de prospecção (primeiro contato) para o lead abaixo.

Regras obrigatórias:
- português do Brasil, tom humano e direto, sem parecer robô;
- no máximo 4 linhas curtas;
- comece com um cumprimento usando só o primeiro nome;
- apresente em uma frase o que a MLLuiz DevTech faz (sites, sistemas e automação sob medida);
- termine com UMA única pergunta que abra conversa e ajude a qualificar o lead;
- não cite preço, prazo ou desconto;
- não invente cases, clientes, números ou resultados;
- não diga que é IA, bot ou assistente virtual;
- sem markdown, sem listas, no máximo 1 emoji.

Responda APENAS com o texto da mensagem, nada antes ou depois.`;

function firstName(name: string | null | undefined): string {
  const n = (name ?? "").trim();
  if (!n) return "";
  return n.split(/\s+/)[0];
}

/** Remove ruído do CLI (session_id, avisos, fences de código). */
function cleanGenerated(raw: string): string {
  let text = (raw ?? "").toString();
  text = text.replace(/^\s*session_id:.*$/gim, "");
  text = text.replace(/```[a-z]*\n?/gi, "");
  text = text.replace(/^(mensagem|resposta|texto)\s*:\s*/i, "");
  text = text.trim();
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'"))
  ) {
    text = text.slice(1, -1).trim();
  }
  return text;
}

function fallbackMessage(lead: LeadInput, briefing: Briefing): string {
  const primeiroNome = firstName(lead.name);
  const ola = primeiroNome ? `Oi ${primeiroNome}!` : "Oi!";
  const oferta = (briefing.offer ?? "").trim();
  const alvo = oferta
    ? `A gente trabalha com ${oferta}`
    : "A gente trabalha com sites, sistemas e automação sob medida";
  const pergunta = (briefing.goal ?? "").trim()
    ? `Faz sentido eu te mostrar como isso funcionaria pra ${briefing.goal!.trim()}?`
    : "Faz sentido eu te mostrar como isso funcionaria no seu caso?";
  return `${ola} Aqui é a MLLuiz DevTech. ${alvo}. ${pergunta}`;
}

/**
 * Gera a primeira mensagem para o lead usando o Hermes (persona de vendas).
 * Se o Hermes não estiver configurado ou falhar, cai num template seguro.
 */
export async function generateFirstTouch(
  lead: LeadInput,
  briefing: Briefing = {},
): Promise<{ text: string; source: "agent" | "template" }> {
  const { hermes } = serverEnv();
  if (!hermes.bin) {
    return { text: fallbackMessage(lead, briefing), source: "template" };
  }

  const leadLines = [
    `- nome: ${lead.name ?? "(sem nome)"}`,
    lead.phone ? `- telefone: ${lead.phone}` : null,
    lead.email ? `- e-mail: ${lead.email}` : null,
    lead.context ? `- contexto/observações: ${lead.context}` : null,
  ].filter(Boolean);

  const prompt = [
    SYSTEM_PROMPT,
    "",
    "LEAD:",
    ...leadLines,
    "",
    briefing.offer ? `OFERTA A DESTACAR: ${briefing.offer}` : null,
    briefing.goal ? `OBJETIVO DO CONTATO: ${briefing.goal}` : null,
    briefing.notes ? `INSTRUÇÕES DO OPERADOR: ${briefing.notes}` : null,
    "",
    "MENSAGEM:",
  ]
    .filter((l) => l !== null)
    .join("\n");

  try {
    const { stdout } = await execFileAsync(
      hermes.bin,
      ["chat", "-q", prompt, "--oneshot", "-Q"],
      {
        timeout: GENERATION_TIMEOUT_MS,
        maxBuffer: 4 * 1024 * 1024,
        env: {
          ...process.env,
          HERMES_HOME: hermes.home,
          HERMES_GUEST_ONBOARDING: "1",
        },
      },
    );
    const text = cleanGenerated(stdout);
    if (text.length >= 20) return { text, source: "agent" };
    console.warn("[prospect/agent] geração vazia — usando template");
  } catch (error) {
    console.warn(
      "[prospect/agent] falha ao gerar mensagem:",
      (error as Error).message,
    );
  }

  return { text: fallbackMessage(lead, briefing), source: "template" };
}

const FOLLOWUP_PROMPT = `Você é o vendedor consultivo da MLLuiz DevTech (agência de sites, sistemas e automação), retomando uma conversa de WhatsApp que ficou sem resposta.

Escreva UMA mensagem curta de retomada (follow-up) para o lead abaixo.

Regras obrigatórias:
- português do Brasil, tom leve e humano;
- no máximo 2 linhas curtas;
- NÃO cobre resposta, NÃO peça desculpa por insistir, NÃO diga "não obtive retorno";
- traga algo de valor: uma ideia, um ângulo ou uma pergunta específica sobre o negócio dele;
- termine com UMA pergunta simples e fácil de responder;
- não cite preço, prazo ou desconto;
- não invente cases, clientes, números ou resultados;
- não diga que é IA, bot ou assistente virtual;
- sem markdown, sem listas, no máximo 1 emoji.

Responda APENAS com o texto da mensagem, nada antes ou depois.`;

function fallbackFollowup(lead: LeadInput, briefing: Briefing): string {
  const primeiroNome = firstName(lead.name);
  const ola = primeiroNome ? `${primeiroNome}, ` : "";
  const oferta = (briefing.offer ?? "").trim();
  const foco = oferta ? oferta : "site, sistema ou automação";
  return `${ola}deixei uma ideia separada aqui sobre ${foco} para o seu caso. Quer que eu te mostre em 2 minutos?`;
}

/**
 * Gera a mensagem de retomada (follow-up) para lead que não respondeu.
 * `hermesConfigured=false` força o template (útil em teste/rodada rápida).
 */
export async function generateFollowUp(
  lead: LeadInput,
  briefing: Briefing = {},
  hermesConfigured = true,
): Promise<{ text: string; source: "agent" | "template" }> {
  const { hermes } = serverEnv();
  if (!hermes.bin || !hermesConfigured) {
    return { text: fallbackFollowup(lead, briefing), source: "template" };
  }

  const prompt = [
    FOLLOWUP_PROMPT,
    "",
    "LEAD:",
    `- nome: ${lead.name ?? "(sem nome)"}`,
    lead.phone ? `- telefone: ${lead.phone}` : null,
    lead.context ? `- contexto/observações: ${lead.context}` : null,
    "",
    briefing.offer ? `OFERTA A DESTACAR: ${briefing.offer}` : null,
    briefing.goal ? `OBJETIVO DO CONTATO: ${briefing.goal}` : null,
    briefing.notes ? `INSTRUÇÕES DO OPERADOR: ${briefing.notes}` : null,
    "",
    "MENSAGEM:",
  ]
    .filter((l) => l !== null)
    .join("\n");

  try {
    const { stdout } = await execFileAsync(hermes.bin, ["chat", "-q", prompt, "--oneshot", "-Q"], {
      timeout: GENERATION_TIMEOUT_MS,
      maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, HERMES_HOME: hermes.home, HERMES_GUEST_ONBOARDING: "1" },
    });
    const text = cleanGenerated(stdout);
    if (text.length >= 15) return { text, source: "agent" };
  } catch (error) {
    console.warn("[prospect/agent] falha ao gerar follow-up:", (error as Error).message);
  }

  return { text: fallbackFollowup(lead, briefing), source: "template" };
}

const EMAIL_PROMPT = `Você é o vendedor consultivo da MLLuiz DevTech (agência de sites, sistemas e automação), escrevendo um primeiro e-mail de prospecção.

Responda EXATAMENTE neste formato, sem nada antes ou depois:

ASSUNTO: <assunto curto, até 60 caracteres, sem enfeite e sem CAIXA ALTA>
CORPO:
<corpo do e-mail>

Regras do corpo:
- português do Brasil, profissional e humano, sem parecer robô;
- até 120 palavras, em parágrafos curtos;
- primeira linha: cumprimente pelo primeiro nome;
- diga em uma frase o que a MLLuiz DevTech faz (sites, sistemas e automação sob medida);
- conecte com o contexto do lead quando houver informação disponível;
- termine com um convite claro para uma conversa rápida de 15 minutos;
- não cite preço, prazo ou desconto;
- não invente cases, clientes, números ou resultados;
- não diga que é IA, bot ou assistente virtual;
- assine como "Equipe MLLuiz DevTech".`;

export type GeneratedEmail = {
  subject: string;
  body: string;
  source: "agent" | "template";
};

function fallbackEmail(lead: LeadInput, briefing: Briefing): GeneratedEmail {
  const primeiroNome = firstName(lead.name);
  const oferta = (briefing.offer ?? "").trim();
  const alvo = oferta
    ? `Trabalhamos com ${oferta}`
    : "Trabalhamos com sites, sistemas e automação sob medida";
  return {
    subject: primeiroNome ? `${primeiroNome}, uma ideia rápida para o seu negócio` : "Uma ideia rápida para o seu negócio",
    body: [
      primeiroNome ? `Olá, ${primeiroNome}!` : "Olá!",
      "",
      `Aqui é a equipe da MLLuiz DevTech. ${alvo}.`,
      "Podemos conversar 15 minutos para entender o seu cenário e te mostrar o que faria sentido?",
      "",
      "Equipe MLLuiz DevTech",
    ].join("\n"),
    source: "template",
  };
}

/** Gera assunto + corpo do primeiro e-mail de prospecção. */
export async function generateFirstTouchEmail(
  lead: LeadInput,
  briefing: Briefing = {},
): Promise<GeneratedEmail> {
  const { hermes } = serverEnv();
  if (!hermes.bin) return fallbackEmail(lead, briefing);

  const leadLines = [
    `- nome: ${lead.name ?? "(sem nome)"}`,
    lead.email ? `- e-mail: ${lead.email}` : null,
    lead.phone ? `- telefone: ${lead.phone}` : null,
    lead.context ? `- contexto/observações: ${lead.context}` : null,
  ].filter(Boolean);

  const prompt = [
    EMAIL_PROMPT,
    "",
    "LEAD:",
    ...leadLines,
    "",
    briefing.offer ? `OFERTA A DESTACAR: ${briefing.offer}` : null,
    briefing.goal ? `OBJETIVO DO CONTATO: ${briefing.goal}` : null,
    briefing.notes ? `INSTRUÇÕES DO OPERADOR: ${briefing.notes}` : null,
  ]
    .filter((l) => l !== null)
    .join("\n");

  try {
    const { stdout } = await execFileAsync(
      hermes.bin,
      ["chat", "-q", prompt, "--oneshot", "-Q"],
      {
        timeout: GENERATION_TIMEOUT_MS,
        maxBuffer: 4 * 1024 * 1024,
        env: {
          ...process.env,
          HERMES_HOME: hermes.home,
          HERMES_GUEST_ONBOARDING: "1",
        },
      },
    );

    const raw = cleanGenerated(stdout);
    const match = raw.match(/ASSUNTO:\s*(.+?)\s*(?:\n|$)[\s\S]*?CORPO:\s*([\s\S]+)/i);
    if (match) {
      const subject = match[1].trim().slice(0, 120);
      const body = match[2].trim();
      if (subject && body.length >= 40) {
        return { subject, body, source: "agent" };
      }
    }
    // Sem o formato esperado: usa o texto inteiro como corpo
    if (raw.length >= 60) {
      const primeiroNome = firstName(lead.name);
      return {
        subject: primeiroNome
          ? `${primeiroNome}, uma ideia rápida para o seu negócio`
          : "Uma ideia rápida para o seu negócio",
        body: raw,
        source: "agent",
      };
    }
    console.warn("[prospect/agent] e-mail vazio — usando template");
  } catch (error) {
    console.warn("[prospect/agent] falha ao gerar e-mail:", (error as Error).message);
  }

  return fallbackEmail(lead, briefing);
}
