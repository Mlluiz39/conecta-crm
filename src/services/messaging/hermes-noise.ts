/**
 * Ruído de log do Hermes/bridge que **não é conversa**.
 *
 * Problema real (06/10/2026): o `whatsapp_manager.py` (template `whatsappkit`) imprime
 * o log do boot dele no stdout, e esse texto acabou **dentro da própria resposta** que o
 * lead recebeu no WhatsApp:
 *
 *     [whatsapp-manager] Inicializando /opt/data/SOUL.md a partir de https://raw...
 *     [whatsapp-manager] ✓ Skills registradas: google-oauth, research-sources, ...
 *     [whatsapp-manager] [post_llm_call] chamado — kwargs keys: ['session_id', ...]
 *     Olá, Clínica São Paulo Dental Studio! A MLLuiz DevTech cria sites, ...
 *
 * Além de poluir a conversa no CRM, isso vaza caminho interno, URL de repositório e nome
 * de skill para o cliente. Este módulo é a fonte única dessas regras no lado do CRM:
 * `hermes-sync` usa para não espelhar lixo e `agent-outreach` usa para limpar o texto do CLI.
 *
 * O mesmo conjunto de regras existe em Python em
 * `deploy/hermes/plugins/crm-output-guard/__init__.py` (que corta antes de entregar).
 * **Mexeu aqui? Mexa lá também.**
 *
 * Módulo puro (sem `server-only`, sem I/O) para poder ser testado e usado por scripts.
 */

/**
 * Tag de log no começo da linha: `[whatsapp-manager]`, `[owner-status]`, `[post_llm_call]`,
 * e o caso aninhado `[whatsapp-manager] [owner-status] ...`.
 * Exige pelo menos uma letra na tag, então uma lista tipo `[1] item` não é tratada como log.
 */
const LOG_TAG = /^\s*(?:\[(?=[^\]]*[a-z])[a-z0-9][^\]\n]{0,40}\]\s*)+/i;

/** Metadado de sessão que o CLI às vezes emite como linha solta. */
const LOG_META = /^\s*(session_id|task_id|turn_id|conversation_id|chat_id|provider|model)\s*[:=]/i;

/**
 * Frases do bootstrap/plugin que aparecem **sem tag** no meio do bloco de log.
 * Comparadas em minúsculas, por substring. São específicas de propósito: uma frase
 * genérica ("baixado com sucesso") poderia casar com uma resposta legítima.
 */
const LOG_PHRASES: readonly string[] = [
  "/opt/data/", // caminho interno do container: nunca pertence a mensagem de cliente
  "puxando últimas configurações",
  "verificando atualizações de código",
  "skills registradas:",
  "cache de notificações carregado",
  "restaurado do disco:",
  "agendador periódico (24h)",
];

/** Esta linha é log interno (e não conversa)? */
export function isLogLine(line: string): boolean {
  const texto = (line ?? "").trim();
  if (!texto) return false;
  if (LOG_META.test(texto)) return true;
  const baixo = texto.toLowerCase();
  if (LOG_PHRASES.some((frase) => baixo.includes(frase))) return true;
  return LOG_TAG.test(texto);
}

/**
 * Remove as linhas de log, preservando a conversa. Só descarta a linha inteira —
 * nunca corta o meio de uma frase do cliente.
 */
export function stripLogLines(text: string): string {
  const linhas = String(text ?? "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((linha) => !isLogLine(linha));
  // Um bloco de log costuma deixar várias linhas vazias no lugar.
  return linhas.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** O texto é só log (nada de conversa sobrou)? */
export function isOnlyLogLines(text: string): boolean {
  const linhas = String(text ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (linhas.length === 0) return true;
  return linhas.every(isLogLine);
}
