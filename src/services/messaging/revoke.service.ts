import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { providerFromConfig } from "./index";

export type RevokeOutcome = {
  /** Apagadas também no WhatsApp do lead (revoke). */
  revoked: number;
  /** Só saíram do CRM: mensagem do lead, sem `external_id` ou provider sem suporte. */
  localOnly: number;
  /** O WhatsApp recusou (mensagem antiga, sem permissão, fora da janela). */
  failures: number;
  /** Acima do teto de revogações por chamada ficaram só no CRM. */
  skipped: number;
};

/**
 * Teto de revogações por chamada: cada revoke é uma mensagem de protocolo no WhatsApp e
 * uma rajada grande derruba a sessão Baileys. "Limpar histórico" revoga as mais recentes.
 */
const REVOKE_MAX = 30;

/**
 * Apaga as mensagens no WhatsApp do lead além de apagá-las no CRM.
 *
 * Importante: precisa rodar ANTES do delete no banco — depois dele não existe mais
 * `external_id` nem o canal para montar o provider. Só mensagem enviada por nós pode ser
 * revogada; mensagem escrita pelo lead sai apenas do CRM.
 */
export async function revokeMessages(ids: string[], organizationId: string): Promise<RevokeOutcome> {
  const out: RevokeOutcome = { revoked: 0, localOnly: 0, failures: 0, skipped: 0 };
  if (!ids.length) return out;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("messages")
    .select(
      `id, direction, external_id, created_at,
       conversation:conversations!inner(
         id,
         channel:channels!inner(id, cernio_channel_id, config),
         contact:contacts(id, phone)
       )`,
    )
    .in("id", ids)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("[revoke] não consegui ler as mensagens:", error.message);
    out.localOnly = ids.length;
    return out;
  }

  let tentativas = 0;
  for (const row of (data ?? []) as any[]) {
    const ext = row.external_id as string | null;
    const phone: string | undefined = row.conversation?.contact?.phone;
    const provider = providerFromConfig(row.conversation?.channel?.config);
    const accountId = row.conversation?.channel?.cernio_channel_id || "default";

    if (row.direction !== "out" || !ext || !phone || !provider.deleteMessage) {
      out.localOnly++;
      continue;
    }
    if (tentativas >= REVOKE_MAX) {
      out.skipped++;
      continue;
    }
    tentativas++;

    const res = await provider.deleteMessage(accountId, { id: ext, from: phone });
    if (res.ok) {
      out.revoked++;
    } else {
      out.failures++;
      console.warn(`[revoke] ${ext} recusado: ${res.error}`);
    }
  }

  console.log(
    `[revoke] ${out.revoked} apagada(s) no WhatsApp, ${out.localOnly} só no CRM, ${out.failures} recusada(s), ${out.skipped} acima do teto`,
  );
  return out;
}
