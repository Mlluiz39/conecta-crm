import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContactById } from "@/lib/data/queries";
import { requireProfile } from "@/lib/auth/session";
import { PageHeader, Badge } from "@/components/ui/primitives";
import { ContactTabs } from "@/components/contacts/ContactTabs";

export const revalidate = 15;

export default async function ContactDetailPage({
  params,
}: {
  params: { contactId: string };
}) {
  const { organizationId } = await requireProfile();
  const contact = await getContactById(params.contactId);
  if (!contact) notFound();

  const supabase = createClient();
  const [opportunities, appointments, notes, conversations, fields] = await Promise.all([
    supabase.from("opportunities").select("id, title, value, stage_id").eq("organization_id", organizationId).eq("contact_id", contact.id),
    supabase.from("appointments").select("id, title, starts_at, status").eq("organization_id", organizationId).eq("contact_id", contact.id).order("starts_at", { ascending: false }),
    supabase.from("conversation_notes").select("id, content, created_at").eq("organization_id", organizationId),
    supabase.from("conversations").select("id, channel_type, status, last_message_at").eq("organization_id", organizationId).eq("contact_id", contact.id),
    supabase.from("custom_field_definitions").select("key, label, type, options").eq("organization_id", organizationId).eq("entity", "contact").order("position"),
  ]);

  const custom = (contact.custom_fields ?? {}) as Record<string, any>;

  return (
    <div>
      <PageHeader
        title={contact.name}
        subtitle={[custom.empresa, contact.phone, contact.email].filter(Boolean).join(" · ")}
        action={
          <div className="flex gap-2">
            {contact.instagram_handle && (
              <Badge className="bg-pink-100 text-pink-700 dark:bg-pink-950 dark:text-pink-300">
                @{contact.instagram_handle}
              </Badge>
            )}
            {custom.cidade && (
              <Badge className="bg-accent text-accent-foreground">
                {custom.cidade}{custom.estado ? `, ${custom.estado}` : ""}
              </Badge>
            )}
          </div>
        }
      />

      <ContactTabs
        contact={{
          id: contact.id,
          name: contact.name,
          phone: contact.phone,
          email: contact.email,
          instagram_handle: contact.instagram_handle,
          custom_fields: custom,
        }}
        customFields={fields.data ?? []}
        opportunities={opportunities.data ?? []}
        appointments={appointments.data ?? []}
        notes={notes.data ?? []}
        conversations={conversations.data ?? []}
      />
    </div>
  );
}
