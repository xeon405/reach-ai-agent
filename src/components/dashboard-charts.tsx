import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

const FUNNEL_COLORS = [
  "#6366f1",
  "#8b5cf6",
  "#a855f7",
  "#d946ef",
  "#ec4899",
  "#f43f5e",
  "#f97316",
  "#f59e0b",
  "#10b981",
];

export type FunnelPoint = { label: string; value: number; pct: number };

export function OutreachFunnelChart({ data }: { data: FunnelPoint[] }) {
  const config = { value: { label: "Count", color: "#6366f1" } } satisfies ChartConfig;
  return (
    <ChartContainer config={config} className="aspect-auto h-[330px] w-full">
      <BarChart data={data} layout="vertical" margin={{ left: 4, right: 44, top: 4, bottom: 4 }}>
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="label"
          width={104}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11 }}
        />
        <ChartTooltip
          cursor={{ fill: "var(--muted)" }}
          content={<ChartTooltipContent hideLabel nameKey="value" />}
        />
        <Bar dataKey="value" radius={4} maxBarSize={26} isAnimationActive={false}>
          {data.map((_, i) => (
            <Cell key={i} fill={FUNNEL_COLORS[i % FUNNEL_COLORS.length]} />
          ))}
          <LabelList
            dataKey="value"
            position="right"
            offset={8}
            fill="currentColor"
            fontSize={11}
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

export type TrendPoint = { label: string; sends: number; opens: number; replies: number };

export function PerformanceTrendChart({ data }: { data: TrendPoint[] }) {
  const config = {
    sends: { label: "Sends", color: "#6366f1" },
    opens: { label: "Opens", color: "#06b6d4" },
    replies: { label: "Replies", color: "#10b981" },
  } satisfies ChartConfig;
  return (
    <ChartContainer config={config} className="aspect-auto h-[280px] w-full">
      <AreaChart data={data} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="fillSends" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-sends)" stopOpacity={0.55} />
            <stop offset="95%" stopColor="var(--color-sends)" stopOpacity={0.05} />
          </linearGradient>
          <linearGradient id="fillOpens" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-opens)" stopOpacity={0.55} />
            <stop offset="95%" stopColor="var(--color-opens)" stopOpacity={0.05} />
          </linearGradient>
          <linearGradient id="fillReplies" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-replies)" stopOpacity={0.6} />
            <stop offset="95%" stopColor="var(--color-replies)" stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeOpacity={0.4} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
        <YAxis hide allowDecimals={false} />
        <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
        <Area
          dataKey="sends"
          type="monotone"
          fill="url(#fillSends)"
          stroke="var(--color-sends)"
          strokeWidth={2}
        />
        <Area
          dataKey="opens"
          type="monotone"
          fill="url(#fillOpens)"
          stroke="var(--color-opens)"
          strokeWidth={2}
        />
        <Area
          dataKey="replies"
          type="monotone"
          fill="url(#fillReplies)"
          stroke="var(--color-replies)"
          strokeWidth={2}
        />
      </AreaChart>
    </ChartContainer>
  );
}

export type SentimentPoint = { key: string; label: string; value: number; color: string };

export function SentimentDonut({ data }: { data: SentimentPoint[] }) {
  const config: ChartConfig = {};
  data.forEach((d) => {
    config[d.key] = { label: d.label, color: d.color };
  });
  const total = data.reduce((sum, d) => sum + d.value, 0);
  return (
    <ChartContainer config={config} className="mx-auto aspect-square h-[240px]">
      <PieChart>
        <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
        <Pie
          data={data}
          dataKey="value"
          nameKey="key"
          innerRadius={58}
          outerRadius={92}
          paddingAngle={2}
          strokeWidth={2}
          isAnimationActive={false}
        >
          {data.map((d) => (
            <Cell key={d.key} fill={d.color} />
          ))}
          <LabelList
            dataKey="value"
            position="inside"
            fill="#ffffff"
            fontSize={11}
            formatter={(v: number) => (total > 0 && v / total >= 0.08 ? String(v) : "")}
          />
        </Pie>
      </PieChart>
    </ChartContainer>
  );
}
