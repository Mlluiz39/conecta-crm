import { Download } from "lucide-react";
import { getReportData } from "@/lib/data/reports";
import { PageHeader, Card, Badge, EmptyState } from "@/components/ui/primitives";
import { formatBRL } from "@/lib/utils";
import dynamic from "next/dynamic";

const ReportsCharts = dynamic(
  () => import("@/components/reports/ReportsCharts").then((m) => ({ default: m.ReportsCharts })),
  { ssr: false, loading: () => <div className="grid grid-cols-1 gap-4 lg:grid-cols-2"><div className="h-72 animate-pulse rounded-2xl bg-muted" /><div className="h-72 animate-pulse rounded-2xl bg-muted" /></div> },
);

export const revalidate = 60;

export default async function RelatoriosPage() {
  const data = await getReportData(6);

  const kpis = [
    { label: "Receita (período)", value: formatBRL(data.kpis.receita) },
    { label: "Leads Novos", value: data.kpis.leadsNovos },
    { label: "Taxa de Conversão", value: `${data.kpis.taxaConversao.toFixed(1)}%` },
    { label: "TMR", value: data.kpis.tmrMinutos == null ? "—" : `${data.kpis.tmrMinutos.toFixed(0)} min` },
    { label: "Ticket Médio", value: formatBRL(data.kpis.ticketMedio) },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Relatórios"
        subtitle="Métricas consolidadas dos últimos 6 meses"
        action={
          <a
            href="/api/export"
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            <Download size={15} /> Exportar CSV
          </a>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {kpis.map((k) => (
          <Card key={k.label}>
            <p className="text-xs font-medium text-muted-foreground">{k.label}</p>
            <p className="mt-1 text-lg font-extrabold tracking-tight">{k.value}</p>
          </Card>
        ))}
      </div>

      <ReportsCharts monthly={data.monthly} byChannel={data.byChannel} />

      <Card>
        <h2 className="mb-3 text-sm font-bold">Desempenho por atendente</h2>
        {data.byAgent.length === 0 ? (
          <EmptyState label="Ainda não há atendimentos no período." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-semibold">Atendente</th>
                  <th className="px-3 py-2 font-semibold">Tipo</th>
                  <th className="px-3 py-2 font-semibold">Conversas</th>
                  <th className="px-3 py-2 font-semibold">Convertidos</th>
                  <th className="px-3 py-2 text-right font-semibold">Receita</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.byAgent.map((a) => (
                  <tr key={`${a.tipo}-${a.nome}`}>
                    <td className="px-3 py-2 font-semibold">{a.nome}</td>
                    <td className="px-3 py-2">
                      <Badge className={a.tipo === "IA" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}>
                        {a.tipo === "IA" ? "🤖 IA" : "👤 Humano"}
                      </Badge>
                    </td>
                    <td className="px-3 py-2">{a.conversas}</td>
                    <td className="px-3 py-2">{a.convertidos}</td>
                    <td className="px-3 py-2 text-right font-semibold text-emerald-600">
                      {formatBRL(a.receita)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
