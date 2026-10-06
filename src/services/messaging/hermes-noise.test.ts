import { test } from "node:test";
import assert from "node:assert/strict";
import { isLogLine, isOnlyLogLines, stripLogLines } from "./hermes-noise.ts";

/**
 * Caso real: mensagem entregue a um lead em 06/10/2026, espelhada no CRM.
 * O log do boot do `whatsapp_manager` veio colado na frente da resposta de verdade.
 */
const VAZAMENTO_REAL = [
  "[whatsapp-manager] Inicializando /opt/data/SOUL.md a partir de https://raw.githubusercontent.com/empreendedorserial/hermes-whatsapp-mixed/main/deploy/SOUL.md...",
  "[whatsapp-manager] Inicializando /opt/data/SOUL_WHATSAPP.md a partir de https://raw.githubusercontent.com/empreendedorserial/hermes-whatsapp-mixed/main/deploy/SOUL_WHATSAPP.md...",
  "[whatsapp-manager] Inicializando /opt/data/SOUL_EMAIL.md a partir de https://raw.githubusercontent.com/empreendedorserial/hermes-whatsapp-mixed/main/deploy/SOUL_EMAIL.md...",
  "[whatsapp-manager] Inicializando /opt/data/support_rules.md a partir de https://raw.githubusercontent.com/empreendedorserial/hermes-whatsapp-mixed/main/deploy/support_rules.md...",
  "[whatsapp-manager] ✓ Skills registradas: google-oauth, research-sources, whatsapp-logs-diagnostics",
  "[whatsapp-manager] [owner-status] Cache de notificações carregado: 0 contato(s)",
  "[whatsapp-manager] [turn-dedup] Restaurado do disco: 1 chaves válidas (0 expiradas)",
  "[whatsapp-manager] Puxando últimas configurações e personas do GitHub no boot...",
  "[whatsapp-manager] Verificando atualizações de código do plugin no boot...",
  "[whatsapp-manager] ✅ Agendador periódico (24h) de sincronização iniciado com sucesso.",
  "[whatsapp-manager] [post_llm_call] chamado — kwargs keys: ['session_id', 'task_id', 'turn_id', 'user_message', 'assistant_response', 'conversation_history', 'model', 'platform', 'telemetry_schema_version'] args count: 0",
].join("\n");

const RESPOSTA_REAL =
  "Olá, Clínica São Paulo Dental Studio! A MLLuiz DevTech cria sites, sistemas e automação sob medida para negócios como o de vocês. Como vocês organizam hoje o atendimento e os agendamentos?";

test("caso real: tira o bloco de log e mantém a mensagem que o lead deveria ler", () => {
  const limpo = stripLogLines(`${VAZAMENTO_REAL}\n${RESPOSTA_REAL}`);
  assert.equal(limpo, RESPOSTA_REAL);
});

test("mensagem só de log é reconhecida como ruído puro", () => {
  assert.equal(isOnlyLogLines(VAZAMENTO_REAL), true);
  assert.equal(stripLogLines(VAZAMENTO_REAL), "");
});

test("resposta normal passa intacta", () => {
  const texto = "Oi, Marcelo! Tudo bem?\n\nVocê comentou sobre o sistema de agendamento — é para clínica mesmo?";
  assert.equal(stripLogLines(texto), texto);
  assert.equal(isOnlyLogLines(texto), false);
});

test("não confunde conversa com marcação entre colchetes", () => {
  // Sem letra na tag: não é log (evita comer listas do tipo [1]).
  assert.equal(isLogLine("[1] orçamento aprovado"), false);
  const texto = "Fechamos assim:\n[1] site institucional\n[2] painel de agendamento";
  assert.equal(stripLogLines(texto), texto);
});

test("remove metadado de sessão do CLI", () => {
  const texto = "session_id: abc123\nmodel: gemini-3.8-flash\nPerfeito, Marcelo! Vou confirmar com o responsável.";
  assert.equal(stripLogLines(texto), "Perfeito, Marcelo! Vou confirmar com o responsável.");
});

test("linha interna sem tag (caminho do container, bootstrap) também cai", () => {
  const texto = [
    "✓ /opt/data/SOUL_WHATSAPP.md baixado com sucesso.",
    "Puxando últimas configurações e personas do GitHub no boot...",
    "Olá, tudo bem?",
  ].join("\n");
  assert.equal(stripLogLines(texto), "Olá, tudo bem?");
});

test("nunca corta o meio de uma frase do cliente", () => {
  const texto = "O prazo de sincronização iniciado com sucesso na semana passada foi bom.";
  // Frase do cliente que por acaso contém o trecho: a linha não é descartada.
  assert.equal(stripLogLines(texto), texto);
});

test("texto vazio ou só espaços vira string vazia", () => {
  assert.equal(stripLogLines("   \n\n  "), "");
  assert.equal(stripLogLines(""), "");
  assert.equal(isOnlyLogLines(""), true);
});
