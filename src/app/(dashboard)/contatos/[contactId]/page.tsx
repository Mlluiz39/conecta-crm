import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContactById } from "@/lib/data/queries";
import { requireProfile } from "@/lib/auth/session";
import { PageHeader, Card, Badge, EmptyState } from "@/components/ui/primitives";
import { ContactTabs } from "@/components/contacts/ContactTabs";

export const dynamic = "force-dynamic";

export default async function ContactDetailPage({
  params,
}: {
  params: { contactId: string };
}) {
  const { organizationId } = await requireProfile();
  const contact = await getContactById(params.contactId);
  if (!contact) notFound();

  const supabase = createClient();
  const [opportunities, appointments, activities, conversations, fields] = await Promise.all([
    supabase.from("opportunities").select("id, title, value, status, pipeline_stage_id").eq("organization_id", organizationId).eq("contact_id", contact.id).is("deleted_at", null),
    supabase.from("appointments").select("id, title, starts_at, status, type").eq("organization_id", organizationId).eq("contact_id", contact.id).order("starts_at", { ascending: false }),
    supabase.from("activities").select("id, type, title, body, occurred_at").eq("organization_id", organizationId).eq("contact_id", contact.id).order("occurred_at", { ascending: false }).limit(30),
    supabase.from("conversations").select("id, channel, status, last_message_at").eq("organization_id", organizationId).eq("contact_id", contact.id),
    supabase.from("custom_field_defs").select("key, name, type").eq("organization_id", organizationId).eq("entity", "contact").eq("is_active", true).order("position"),
  ]);

  return (
    <div>
      <PageHeader
        title={contact.name}
        subtitle={[contact.company, contact.phone, contact.email].filter(Boolean).join(" · ")}
        action={
          <div className="flex gap-2">
            {contact.city && <Badge className="bg-accent text-accent-foreground">{contact.city}{contact.state ? `, ${contact.state}` : ""}</Badge>}
            <Badge className="bg-primary/10 text-primary">{contact.origin_channel ?? "manual"}</Badge>
          </div>
        }
      />

      <ContactTabs
        contact={{
          id: contact.id,
          name: contact.name,
          phone: contact.phone,
          email: contact.email,
          company: contact.company,
          city: contact.city,
          state: contact.state,
          custom_fields: contact.custom_fields ?? {},
        }}
        customFields={fields.data ?? []}
        opportunities={opportunities.data ?? []}
        appointments={appointments.data ?? []}
        activities={activities.data ?? []}
        conversations={conversations.data ?? []}
      />
    </div>
  );
}
