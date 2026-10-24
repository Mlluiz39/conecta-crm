import "server-only";
import webpush from "web-push";
import { serverEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { resumirMensagem } from "@/services/push/mensagem";

export { resumirMensagem };

/**
 * Notificação push para o celular (o app instalado na tela inicial).
 *
 * Sem tabela nova: as inscrições vivem em `organizations.settings.push_subscriptions`
 * (jsonb). A organização é a dona da lista porque a notificação é do time — quem
 * respondeu é o lead, e qualquer pessoa da equipe que tenha ativado recebe.
 *
 * Regra de convivência: push é aviso, não verdade. Quem manda é o banco; se uma
 * inscrição morre (aparelho desinstalou), o serviço de push devolve 404/410 e a
 * gente remove da lista na hora.
 */

export type AvisoPush = {
  titulo: string;
  corpo: string;
  /** Caminho aberto ao tocar na notificação. */
  url: string;
  /** Agrupa notificações do mesmo assunto (o SO substitui a anterior). */
  tag?: string;
};

/** Teto de aparelhos por organização: lista em jsonb não pode virar lixo infinito. */
const MAX_INSCRICOES = 25;

function configurado(): boolean {
  const { vapid } = serverEnv();
  if (!vapid.publicKey || !vapid.privateKey) return false;
  try {
    webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
    return true;
  } catch (erro) {
    console.warn("[push] VAPID inválido:", (erro as Error).message);
    return false;
  }
}

/** Avisa se o servidor tem chave configurada (a tela usa para explicar o estado). */
export function pushConfigurado(): boolean {
  return configurado();
}

export function chavePublica(): string {
  return serverEnv().vapid.publicKey;
}

export async function contarInscricoes(organizationId: string): Promise<number> {
  const supabase = createAdminClient();
  const { count } = await supabase
    .from("push_subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId);
  return count ?? 0;
}

/** Guarda (ou atualiza) a inscrição deste aparelho. */
export async function salvarInscricao(
  organizationId: string,
  inscricao: { endpoint: string; keys: { p256dh: string; auth: string }; aparelho?: string; userId?: string },
): Promise<{ total: number }> {
  const supabase = createAdminClient();

  // O endpoint é único: o mesmo aparelho reinscrito atualiza a linha em vez de duplicar.
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      organization_id: organizationId,
      user_id: inscricao.userId ?? null,
      endpoint: inscricao.endpoint,
      p256dh: inscricao.keys.p256dh,
      auth: inscricao.keys.auth,
      aparelho: inscricao.aparelho?.slice(0, 120) ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" },
  );
  if (error) throw new Error(error.message);

  // Teto por organização: navegador reinstalado não pode inflar a lista para sempre.
  const { data } = await supabase
    .from("push_subscriptions")
    .select("id")
    .eq("organization_id", organizationId)
    .order("updated_at", { ascending: false });
  const excedentes = (data ?? []).slice(MAX_INSCRICOES).map((r) => r.id);
  if (excedentes.length > 0) {
    await supabase.from("push_subscriptions").delete().in("id", excedentes);
  }

  return { total: Math.min((data ?? []).length, MAX_INSCRICOES) };
}

export async function removerInscricao(organizationId: string, endpoint: string): Promise<number> {
  const supabase = createAdminClient();
  await supabase
    .from("push_subscriptions")
    .delete()
    .eq("organization_id", organizationId)
    .eq("endpoint", endpoint);
  return contarInscricoes(organizationId);
}

/** Status de erro que significa "esta inscrição não existe mais". */
function inscricaoMorta(statusCode?: number): boolean {
  return statusCode === 404 || statusCode === 410;
}

/**
 * Envia o aviso para todos os aparelhos da organização.
 * Nunca lança: notificação não pode derrubar o atendimento.
 */
export async function notificarEquipe(
  organizationId: string,
  aviso: AvisoPush,
): Promise<{ enviadas: number; removidas: number }> {
  if (!configurado()) return { enviadas: 0, removidas: 0 };

  const supabase = createAdminClient();
  const { data: linhas } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("organization_id", organizationId);
  const inscricoes = (linhas ?? []) as { endpoint: string; p256dh: string; auth: string }[];
  if (inscricoes.length === 0) return { enviadas: 0, removidas: 0 };

  const corpo = JSON.stringify(aviso);
  const mortas: string[] = [];
  let enviadas = 0;

  await Promise.all(
    inscricoes.map(async (inscricao) => {
      try {
        await webpush.sendNotification(
          { endpoint: inscricao.endpoint, keys: { p256dh: inscricao.p256dh, auth: inscricao.auth } },
          corpo,
          { TTL: 600, urgency: "high" },
        );
        enviadas++;
      } catch (erro) {
        const status = (erro as { statusCode?: number }).statusCode;
        if (inscricaoMorta(status)) {
          mortas.push(inscricao.endpoint);
        } else {
          console.warn(`[push] falha ao enviar (${status ?? "sem status"}):`, (erro as Error).message.slice(0, 120));
        }
      }
    }),
  );

  // Aparelho que respondeu 404/410 nunca mais recebe: sai da lista na hora.
  if (mortas.length > 0) {
    const { error } = await supabase.from("push_subscriptions").delete().in("endpoint", mortas);
    if (error) console.warn("[push] não consegui limpar inscrição morta:", error.message);
  }

  return { enviadas, removidas: mortas.length };
}

