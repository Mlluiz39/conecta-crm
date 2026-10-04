import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/session";
import { getConversations } from "@/lib/data/queries";
import { PageHeader } from "@/components/ui/primitives";
import { Inbox } from "@/components/conversas/Inbox";

export const dynamic = "force-dynamic";

export default async function ConversasPage() {
  const { organizationId } = await requireProfile();
  const conversations = await getConversations();
  const supabase = createClient();

  const firstId = conversations[0]?.id;
  const [messagesRes, notesRes] = await Promise.all([
    firstId
      ? supabase
          .from("messages")
          .select("id, direction, sender_type, content, created_at, status")
          .eq("organization_id", organizationId)
          .eq("conversation_id", firstId)
          .order("created_at")
      : Promise.resolve({ data: [] }),
    firstId
      ? supabase
          .from("conversation_notes")
          .select("id, content, created_at")
          .eq("organization_id", organizationId)
          .eq("conversation_id", firstId)
          .order("created_at", { ascending: false })
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
      />
    </div>
  );
}
