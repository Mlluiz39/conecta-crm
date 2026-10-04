import { requireProfile } from "@/lib/auth/session";
import {
  getBusinessPresets,
  getCustomFields,
  getOrganization,
  getTeam,
} from "@/lib/data/presets";
import { PageHeader } from "@/components/ui/primitives";
import { SettingsPanel } from "@/components/settings/SettingsPanel";

export const revalidate = 60;

export default async function ConfiguracoesPage() {
  const { role } = await requireProfile();
  const [org, presets, fields, team] = await Promise.all([
    getOrganization(),
    getBusinessPresets(),
    getCustomFields(),
    getTeam(),
  ]);

  return (
    <div>
      <PageHeader
        title="Configurações"
        subtitle="Tipo de negócio, campos personalizados, equipe e regras de atendimento"
      />
      <SettingsPanel
        org={(org as any) ?? { name: "", business_type: "outro", settings: {} }}
        presets={presets as any}
        fields={fields as any}
        team={team as any}
        myRole={role}
      />
    </div>
  );
}
