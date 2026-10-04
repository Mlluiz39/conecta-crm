import { getAgents, getAgentDetail } from "@/lib/data/queries";
import { PageHeader } from "@/components/ui/primitives";
import { AgentWorkbench } from "@/components/agentes/AgentWorkbench";

export const dynamic = "force-dynamic";

export default async function AgentesPage({
  searchParams,
}: {
  searchParams: { agent?: string };
}) {
  const agents = await getAgents();
  const selectedId = searchParams.agent ?? agents[0]?.id ?? null;
  const detail = selectedId ? await getAgentDetail(selectedId) : null;

  return (
    <div>
      <PageHeader
        title="Agentes de IA"
        subtitle="Prompt, canais, ferramentas, handoff e playground de teste"
      />
      <AgentWorkbench
        agents={agents as any}
        selectedId={selectedId}
        detail={detail ? (detail as any) : null}
      />
    </div>
  );
}
