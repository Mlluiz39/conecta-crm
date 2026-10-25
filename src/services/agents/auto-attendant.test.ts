import { test } from "node:test";
import assert from "node:assert/strict";
import { detectarAtendimentoAutomatico } from "./auto-attendant.ts";

/**
 * Todas as amostras abaixo são **mensagens reais** do banco do CRM (outubro/2026),
 * transcritas como entraram. Metade é o atendimento automático que a IA confundiu
 * com o lead; a outra metade é gente de verdade que NÃO pode ser silenciada.
 */

const BOTS: { nome: string; texto: string }[] = [
  {
    nome: "Centro Odontológico — menu numerado",
    texto:
      "Olá! 😊 Seja bem-vindo(a) ao Centro Odontológico Campinas. Recebemos sua mensagem e, em breve, retornaremos. Para agilizar seu atendimento, responda com o número da opção desejada: 1️⃣ Agendar uma consulta 2️⃣ Falar com a recepção",
  },
  {
    nome: "Bijukeiras — template de boas-vindas",
    texto:
      "Olá, tudo bem? Seja bem vinda(o) à Bijukeiras💋Esmalteria. Qual seu nome? *Aguarde um momento que iniciaremos seu atendimento.**",
  },
  {
    nome: "Viana Automotive — aviso de horário",
    texto:
      "Obrigado por entrar em contato! Iremos responder assim que possível. Nosso horário de atendimento é de segunda a sexta das 8:30 às 18:00",
  },
  {
    nome: "Marcello's Cortes — aviso de endereço",
    texto:
      "🚨Leia com Atenção 🚨 ENDEREÇO e HORÁRIO: 📍 Roma, 563 - Lapa / SP 📆 De Segunda à Sábado ⏰ 08:00 até 20:00 Nos feriados deixamos avisos no status do WhatsApp.",
  },
  {
    nome: "Queens 258 — boas-vindas com link da agenda",
    texto:
      "�Bem-Vindo a Barberia Queens 258! 💈 É um prazer receber voce aqui! 👊🏼😎 Para conhecer a barbearia e agendar um atendimento acesse o link de nossa agenda Online: https://barbeariaqueens258.booksy.com/",
  },
  {
    nome: "Street Brothers — pergunta de central",
    texto: "Barbearia Street Brothers agradece seu contato. Como podemos ajudar?",
  },
  {
    nome: "Novus Barbearia — template assinado por pessoa",
    texto:
      "Olá, seja muito bem-vindo à Novus Barbearia Studio ! Dipaula falando🫡. Aqui, atendo apenas com agendamento, para garantir conforto, praticidade e um atendimento exclusivo pra você, Para agendar seu horário acesse o link",
  },
];

const HUMANOS: { nome: string; texto: string }[] = [
  {
    nome: "Elite barbearia — número errado",
    texto: "Oi, boa tarde, número errado",
  },
  {
    nome: "Elite barbearia — dono reclamando",
    texto: "Não sei, pq ele está perdendo um monte de cliente alguém tem que ir até a loja presencialmente para corrigir isso",
  },
  {
    nome: "Guga / Verus — recepção, não decide",
    texto:
      "Esse número é só pra agenda e atendimento dos clientes, eu não sou a pessoa que decide sobre site ou automação. Se quiser, me manda um e-mail de contato de vocês que eu passo pra Duda avaliar quando der.",
  },
  {
    nome: "Guga / Verus — oferece corte",
    texto:
      "Se em algum momento você ou alguém da equipe quiser cortar ou fazer barba/trança com a gente, é só chamar por aqui.",
  },
  {
    nome: "Marcelo Luiz — interesse real",
    texto: "Oi Rafael, bom dia. Eu gostaria de saber a respeito de criação de landing page.",
  },
  {
    nome: "Marcelo Luiz — pedindo preço",
    texto:
      "bom então você consegue fazer essa lã de beijo para mim como é que funciona qual os prazos preço",
  },
  {
    nome: "Marcelo Luiz — reclamando da resposta",
    texto: "Não entendi direito, dá para fazer essa página ou não?",
  },
  { nome: "saudação curta", texto: "Ola bom dia" },
  { nome: "pedido de humano", texto: "quero falar com um atendente, por favor" },
];

test("atendimento automático real é detectado", () => {
  for (const caso of BOTS) {
    const r = detectarAtendimentoAutomatico({ mensagem: caso.texto });
    assert.equal(r.detectado, true, `deveria detectar (${caso.nome})`);
    assert.ok(r.sinais.length > 0, `deveria dizer por quê (${caso.nome})`);
  }
});

test("gente de verdade nunca é silenciada", () => {
  for (const caso of HUMANOS) {
    const r = detectarAtendimentoAutomatico({ mensagem: caso.texto });
    assert.equal(r.detectado, false, `NÃO deveria detectar (${caso.nome}) → sinais: ${r.sinais.join(", ")}`);
  }
});

test("template repetido na mesma conversa é loop de máquina", () => {
  const template =
    "Olá, tudo bem? Seja bem vinda(o) à Bijukeiras💋Esmalteria. Qual seu nome? *Aguarde um momento que iniciaremos seu atendimento.**";
  const r = detectarAtendimentoAutomatico({
    mensagem: template,
    historicoInbound: [template],
  });
  assert.equal(r.detectado, true);
  assert.equal(r.repeticao, true);
});

test("repetição só conta para texto com corpo", () => {
  const r = detectarAtendimentoAutomatico({ mensagem: "oi", historicoInbound: ["oi"] });
  assert.equal(r.detectado, false);
});

test("mensagem vazia não é detectada", () => {
  for (const texto of ["", "   ", "\n"]) {
    const r = detectarAtendimentoAutomatico({ mensagem: texto });
    assert.equal(r.detectado, false);
    assert.deepEqual(r.sinais, []);
  }
});

test("um sinal médio sozinho não basta", () => {
  const r = detectarAtendimentoAutomatico({
    mensagem: "Seja bem-vindo! Depois me conta como posso te ajudar com o site.",
  });
  assert.equal(r.detectado, false);
});
