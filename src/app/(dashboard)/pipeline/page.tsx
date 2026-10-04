import { getStages, getOpportunities } from "@/lib/data/queries";
import { getLossReasons } from "@/lib/data/actions";
import { PageHeader } from "@/components/ui/primitives";
import dynamic from "next/dynamic";

const PipelineBoard = dynamic(
  () => import("@/components/pipeline/PipelineBoard").then((m) => ({ default: m.PipelineBoard })),
  { ssr: false, loading: () => <div className="h-96 animate-pulse rounded-2xl bg-muted" /> },
);

export const revalidate = 15;

export default async function PipelinePage() {
  const [stages, opportunities, lossReasons] = await Promise.all([
    getStages(),
    getOpportunities(),
    getLossReasons(),
  ]);

  return (
    <div>
      <PageHeader title="Pipeline" subtitle="Arraste os cards entre as etapas" />
      <PipelineBoard
        stages={stages as any}
        opportunities={opportunities as any}
        lossReasons={lossReasons}
      />
    </div>
  );
}
