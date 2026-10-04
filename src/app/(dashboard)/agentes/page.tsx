import { getAgents, getAgentDetail } from "@/lib/data/queries";
import { PageHeader } from "@/components/ui/primitives";
import dynamic from "next/dynamic";

const AgentWorkbench = dynamic(
  () => import("@/components/agentes/AgentWorkbench").then((m) => ({ default: m.AgentWorkbench })),
  { ssr: false, loading: () => <div className="h-96 animate-pulse rounded-2xl bg-muted" /> },
);

export const revalidate = 15;

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
