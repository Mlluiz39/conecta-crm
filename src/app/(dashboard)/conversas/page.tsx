import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/session";
import { getConversations } from "@/lib/data/queries";
import { PageHeader } from "@/components/ui/primitives";
import { Inbox } from "@/components/conversas/Inbox";

export const revalidate = 10;

export default async function ConversasPage({
  searchParams,
}: {
  searchParams?: { c?: string };
}) {
  const { organizationId } = await requireProfile();
  const conversations = await getConversations(50);
  const supabase = createClient();

  // ?c=<id> abre a conversa pedida (links do dashboard); senão, a mais recente
  const requested = searchParams?.c;
  const firstId =
    (requested && conversations.some((c) => c.id === requested) ? requested : conversations[0]?.id) ??
    undefined;
  const [messagesRes, notesRes] = await Promise.all([
    firstId
      ? supabase
          .from("messages")
          .select("id, direction, sender_type, content, created_at, status")
          .eq("organization_id", organizationId)
          .eq("conversation_id", firstId)
          .order("created_at")
          .limit(100)
      : Promise.resolve({ data: [] }),
    firstId
      ? supabase
          .from("conversation_notes")
          .select("id, content, created_at")
          .eq("organization_id", organizationId)
          .eq("conversation_id", firstId)
          .order("created_at", { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [] }),
  ]);

  return (
    <div>
      <PageHeader title="Conversas" subtitle="Caixa de entrada unificada — WhatsApp, Instagram e Messenger" />
      <Inbox
        organizationId={organizationId}
        initialConversations={conversations as any}
        initialMessages={firstId ? { [firstId]: (messagesRes.data ?? []) as any } : {}}
        initialNotes={firstId ? { [firstId]: (notesRes.data ?? []) as any } : {}}
        initialActiveId={firstId}
      />
    </div>
  );
}
