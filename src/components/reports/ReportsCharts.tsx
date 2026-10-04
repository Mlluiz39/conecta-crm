"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from "recharts";
import { Card } from "@/components/ui/primitives";
import { formatBRL } from "@/lib/utils";
import { CHANNEL_LABEL, type ChannelType } from "@/types/domain";

const CHANNEL_COLORS: Record<string, string> = {
  whatsapp: "#10b981",
  instagram: "#ec4899",
  messenger: "#3b82f6",
  web: "#6366f1",
  manual: "#94a3b8",
};

export function ReportsCharts({
  monthly,
  byChannel,
}: {
  monthly: { mes: string; receita: number; leads: number; ganhos: number }[];
  byChannel: { canal: string; leads: number }[];
}) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <h2 className="mb-4 text-sm font-bold">Receita mensal</h2>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={monthly}>
            <defs>
              <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.5} />
                <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} vertical={false} />
            <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip formatter={(v) => [formatBRL(Number(v)), "Receita"]} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
            <Area type="monotone" dataKey="receita" stroke="var(--primary)" fill="url(#rev)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </Card>

      <Card>
        <h2 className="mb-4 text-sm font-bold">Leads e conversões</h2>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={monthly}>
            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} vertical={false} />
            <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="leads" name="Leads" fill="var(--primary)" radius={[4, 4, 0, 0]} />
            <Bar dataKey="ganhos" name="Ganhos" fill="#10b981" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Card className="lg:col-span-2">
        <h2 className="mb-4 text-sm font-bold">Leads por canal</h2>
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie
              data={byChannel}
              dataKey="leads"
              nameKey="canal"
              innerRadius={60}
              outerRadius={100}
              paddingAngle={2}
            >
              {byChannel.map((c) => (
                <Cell key={c.canal} fill={CHANNEL_COLORS[c.canal] ?? "#94a3b8"} />
              ))}
            </Pie>
            <Tooltip
              formatter={(v, _n, p) => [v, CHANNEL_LABEL[(p as any)?.payload?.canal as ChannelType] ?? (p as any)?.payload?.canal]}
              contentStyle={{ borderRadius: 12, fontSize: 12 }}
            />
            <Legend
              wrapperStyle={{ fontSize: 11 }}
              formatter={(v) => CHANNEL_LABEL[v as ChannelType] ?? v}
            />
          </PieChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}
