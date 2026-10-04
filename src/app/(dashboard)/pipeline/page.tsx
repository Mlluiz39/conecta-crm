import { getStages, getOpportunities } from "@/lib/data/queries";
import { getLossReasons } from "@/lib/data/actions";
import { PageHeader } from "@/components/ui/primitives";
import { PipelineBoard } from "@/components/pipeline/PipelineBoard";

export const dynamic = "force-dynamic";

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
