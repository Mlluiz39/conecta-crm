"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatBRL } from "@/lib/utils";

type Stage = { id: string; name: string; color: string };
type Opportunity = { stage_id: string; value: number };

export function PipelineMiniChart({
  opportunities,
  stages,
}: {
  opportunities: Opportunity[];
  stages: Stage[];
}) {
  const data = stages.map((stage) => {
    const items = opportunities.filter((o) => o.stage_id === stage.id);
    return {
      name: stage.name,
      total: items.reduce((s, o) => s + Number(o.value), 0),
      qtd: items.length,
      color: stage.color,
    };
  });

  if (data.every((d) => d.qtd === 0)) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Nenhuma oportunidade no funil ainda.
      </p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={60} />
        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
        <Tooltip
          formatter={(value) => [formatBRL(Number(value)), "Valor"]}
          contentStyle={{ borderRadius: 12, fontSize: 12 }}
        />
        <Bar dataKey="total" radius={[6, 6, 0, 0]} fill="var(--primary)" />
      </BarChart>
    </ResponsiveContainer>
  );
}
