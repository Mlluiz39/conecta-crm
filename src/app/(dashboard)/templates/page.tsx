import { getTemplates } from "@/lib/data/templates";
import { PageHeader } from "@/components/ui/primitives";
import { TemplatesManager } from "@/components/templates/TemplatesManager";

export const revalidate = 30;

export default async function TemplatesPage() {
  const templates = await getTemplates();

  return (
    <div>
      <PageHeader
        title="Templates WhatsApp"
        subtitle="Crie, pré-visualize e submeta modelos à aprovação da Meta"
      />
      <TemplatesManager templates={templates as any} />
    </div>
  );
}
