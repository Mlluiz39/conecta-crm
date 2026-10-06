import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { TEMPERATURE_TAGS, type LeadTemperature } from "@/lib/data/lead-temperature";

/**
 * Aplica a temperatura (etiqueta) no contato a partir do admin client —
 * usado pelo classificador automático de conversas.
 * Devolve true quando a temperatura mudou (para gerar alerta).
 */
export type TemperatureChange = {
  changed: boolean;
  previous: LeadTemperature | null;
  current: LeadTemperature;
};

export async function applyContactTemperature(
  contactId: string,
  temperature: LeadTemperature,
): Promise<TemperatureChange> {
  const supabase = createAdminClient();

  const { data: contact } = await supabase
    .from("contacts")
    .select("id, organization_id, custom_fields")
    .eq("id", contactId)
    .maybeSingle();
  if (!contact) return { changed: false, previous: null, current: temperature };

  const organizationId = String(contact.organization_id);
  const custom =
    contact.custom_fields && typeof contact.custom_fields === "object"
      ? (contact.custom_fields as Record<string, unknown>)
      : {};
  const previous = ((custom.temperatura as string | undefined) ?? null) as LeadTemperature | null;
  if (previous === temperature) return { changed: false, previous, current: temperature };

  // garante as etiquetas de temperatura
  const names = Object.values(TEMPERATURE_TAGS).map((t) => t.name);
  const { data: existing } = await supabase
    .from("tags")
    .select("id, name")
    .eq("organization_id", organizationId)
    .in("name", names);
  const tagIdByName = new Map((existing ?? []).map((t) => [String(t.name), String(t.id)]));

  for (const def of Object.values(TEMPERATURE_TAGS)) {
    if (tagIdByName.has(def.name)) continue;
    const { data } = await supabase
      .from("tags")
      .insert({ organization_id: organizationId, name: def.name, color: def.color })
      .select("id, name")
      .single();
    if (data) tagIdByName.set(String(data.name), String(data.id));
  }

  const allIds = [...tagIdByName.values()];
  if (allIds.length > 0) {
    await supabase
      .from("contact_tags")
      .delete()
      .eq("contact_id", contactId)
      .in("tag_id", allIds);
  }

  const newTagId = tagIdByName.get(TEMPERATURE_TAGS[temperature].name);
  if (newTagId) {
    await supabase
      .from("contact_tags")
      .insert({ organization_id: organizationId, contact_id: contactId, tag_id: newTagId });
  }

  await supabase
    .from("contacts")
    .update({
      custom_fields: {
        ...custom,
        temperatura: temperature,
        temperatura_at: new Date().toISOString(),
      },
    })
    .eq("id", contactId);

  return { changed: true, previous, current: temperature };
}
