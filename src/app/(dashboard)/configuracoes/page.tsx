import { requireProfile } from "@/lib/auth/session";
import { publicEnv } from "@/lib/env";
import {
  getBusinessPresets,
  getCustomFields,
  getKnowledgeItems,
  getOrganization,
  getTeam,
} from "@/lib/data/presets";
import { listCaptureSources, listPipelineStages } from "@/lib/data/capture";
import { PageHeader } from "@/components/ui/primitives";
import { SettingsPanel } from "@/components/settings/SettingsPanel";

export const revalidate = 60;

export default async function ConfiguracoesPage() {
  const { role } = await requireProfile();
  const [org, presets, fields, team, knowledge, captureSources, stages] = await Promise.all([
    getOrganization(),
    getBusinessPresets(),
    getCustomFields(),
    getTeam(),
    getKnowledgeItems(),
    listCaptureSources(),
    listPipelineStages(),
  ]);

  return (
    <div>
      <PageHeader
        title="Configurações"
        subtitle="Tipo de negócio, base de conhecimento, campos personalizados, equipe, captação e regras de atendimento"
      />
      <SettingsPanel
        org={(org as any) ?? { name: "", business_type: "outro", settings: {} }}
        presets={presets as any}
        fields={fields as any}
        team={team as any}
        knowledge={knowledge as any}
        myRole={role}
        captureSources={captureSources}
        stages={stages}
        appUrl={publicEnv.appUrl}
      />
    </div>
  );
}
