import { Users, TrendingUp, MessagesSquare, CalendarCheck } from "lucide-react";
import { getDashboardKpis, getOpportunities, getStages } from "@/lib/data/queries";
import { Card, PageHeader, Badge } from "@/components/ui/primitives";
import { formatBRL } from "@/lib/utils";
import dynamic from "next/dynamic";

const PipelineMiniChart = dynamic(
  () => import("@/components/dashboard/PipelineMiniChart").then((m) => ({ default: m.PipelineMiniChart })),
  { ssr: false, loading: () => <div className="h-72 animate-pulse rounded-2xl bg-muted" /> },
);

export const revalidate = 15;

export default async function DashboardPage() {
  const [kpis, opportunities, stages] = await Promise.all([
    getDashboardKpis(),
    getOpportunities(),
    getStages(),
  ]);

  const cards = [
    { label: "Clientes Contactados", value: kpis.contacts, icon: Users, tone: "text-indigo-600" },
    { label: "Valor do Funil", value: formatBRL(kpis.pipelineValue), icon: TrendingUp, tone: "text-emerald-600" },
    { label: "Conversas Abertas", value: kpis.openConversations, icon: MessagesSquare, tone: "text-rose-600" },
    { label: "Visitas Agendadas", value: kpis.upcomingAppointments, icon: CalendarCheck, tone: "text-amber-600" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        subtitle={`${kpis.openCount} oportunidades abertas · ${kpis.conversionRate.toFixed(1)}% de conversão`}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(({ label, value, icon: Icon, tone }) => (
          <Card key={label} className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent">
              <Icon size={20} className={tone} />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">{label}</p>
              <p className="text-xl font-extrabold tracking-tight">{value}</p>
            </div>
          </Card>
        ))}
      </div>

      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-bold">Funil por etapa</h2>
          <Badge className="bg-accent text-accent-foreground">
            {opportunities.length} oportunidades
          </Badge>
        </div>
        <PipelineMiniChart opportunities={opportunities as any} stages={stages as any} />
      </Card>
    </div>
  );
}
