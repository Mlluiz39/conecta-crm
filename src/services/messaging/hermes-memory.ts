import "server-only";
import { DatabaseSync } from "node:sqlite";
import { serverEnv } from "@/lib/env";

/**
 * Memória do Hermes (`state.db`): apagar mensagens que o CRM já não deve ter.
 *
 * Por que existe: o `hermes-sync` espelha o `state.db` para o CRM a cada rodada (60s).
 * Se o operador apaga uma mensagem só no CRM, o sync a **reimporta** na rodada seguinte —
 * e a IA continua "lembrando" dela no contexto do turno. Apagar de verdade exige remover
 * a linha aqui também.
 *
 * O vínculo entre os dois lados é o `external_id` do CRM: o sync grava
 * `hermes_<message_uid ?? id>` — o número no fim é o `id` da linha em `messages` do state.db.
 */

/** `hermes_123` -> 123 (null quando não é mensagem espelhada). */
export function hermesMessageId(externalId: string | null | undefined): number | null {
  const bruto = String(externalId ?? "");
  if (!bruto.startsWith("hermes_")) return null;
  const n = Number(bruto.slice("hermes_".length));
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Apaga do `state.db` as mensagens correspondentes e devolve quantas saíram.
 * Também reconstrói os índices de busca: os triggers ignoram mensagens antigas por design,
 * então sem isso o texto continuaria aparecendo em `session_search`.
 */
export async function deleteHermesMessages(
  externalIds: (string | null | undefined)[],
): Promise<{ encontradas: number; apagadas: number }> {
  const ids = externalIds.map(hermesMessageId).filter((n): n is number => n !== null);
  if (ids.length === 0) return { encontradas: 0, apagadas: 0 };

  const home = serverEnv().hermes.home;
  if (!home) return { encontradas: 0, apagadas: 0 };

  let db: DatabaseSync;
  try {
    db = new DatabaseSync(`${home}/state.db`);
  } catch (err) {
    console.error("[hermes-memory] não abri o state.db:", (err as Error).message);
    return { encontradas: 0, apagadas: 0 };
  }

  try {
    const existe = db.prepare("SELECT 1 FROM messages WHERE id = ?");
    const apagar = db.prepare("DELETE FROM messages WHERE id = ?");
    let encontradas = 0;
    let apagadas = 0;
    for (const id of ids) {
      // O CRM também usa `hermes_<timestamp>` nas mensagens que ELE enviou; essas não existem
      // aqui. Contar só o que existe evita aviso falso na tela.
      if (!existe.get(id)) continue;
      encontradas++;
      const r = apagar.run(id) as { changes?: number | bigint };
      apagadas += Number(r.changes ?? 0);
    }
    if (apagadas > 0) {
      for (const tabela of ["messages_fts", "messages_fts_trigram"]) {
        try {
          db.prepare(`INSERT INTO ${tabela}(${tabela}) VALUES('rebuild')`).run();
        } catch {
          // índice ausente nessa versão do Hermes: segue sem reconstruir
        }
      }
    }
    return { encontradas, apagadas };
  } catch (err) {
    console.error("[hermes-memory] falha ao apagar:", (err as Error).message);
    return { encontradas: 0, apagadas: 0 };
  } finally {
    db.close();
  }
}
