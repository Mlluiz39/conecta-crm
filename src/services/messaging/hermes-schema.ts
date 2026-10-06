/**
 * Compatibilidade de schema do `state.db` do Hermes.
 *
 * O `messages` do Hermes mudou de forma entre versões: as mais novas têm a coluna
 * `message_uid` (identificador estável da mensagem, usado como chave de dedupe do
 * espelho), as mais antigas não têm — e consultar uma coluna inexistente derruba a
 * query inteira com `no such column: message_uid`.
 *
 * Foi exatamente o que aconteceu na VPS em 06/10/2026: o `hermes-sync` respondia
 * **500 em toda rodada** e nenhuma conversa do WhatsApp aparecia no CRM (as mensagens
 * que existiam lá vinham do próprio envio, não do espelho).
 *
 * Solução: montar o SELECT conforme o schema encontrado. Sem a coluna, o id da linha
 * faz o papel de chave (`hermes_<id>`), que continua sendo único.
 *
 * Módulo puro de propósito (sem `server-only`) para poder ser testado com `node --test`.
 */

/** Interface mínima do `DatabaseSync` do node:sqlite que usamos aqui. */
export type SqliteLike = {
  prepare(sql: string): { all(): unknown[] };
};

/** Nome da coluna de chave, ou um `NULL AS message_uid` quando ela não existe. */
export function messageUidSelect(db: SqliteLike): string {
  let colunas: unknown[] = [];
  try {
    colunas = db.prepare("PRAGMA table_info(messages)").all();
  } catch {
    colunas = [];
  }
  const tem = colunas.some((c) => {
    const nome = (c as { name?: unknown } | null)?.name;
    return String(nome ?? "").toLowerCase() === "message_uid";
  });
  return tem ? "message_uid" : "NULL AS message_uid";
}
