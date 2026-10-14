import { Area, Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

export type ReplyTrendPoint = {
  label: string;
  sends: number;
  replies: number;
  interested: number;
};

export function ReplyTrendChart({ data }: { data: ReplyTrendPoint[] }) {
  const config = {
    sends: { label: "Sent", color: "var(--muted-foreground)" },
    replies: { label: "Replies", color: "var(--primary)" },
    interested: { label: "Interested", color: "var(--success)" },
  } satisfies ChartConfig;
  return (
    <ChartContainer config={config} className="aspect-auto h-[260px] w-full">
      <ComposedChart data={data} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="fillReplies" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-replies)" stopOpacity={0.35} />
            <stop offset="95%" stopColor="var(--color-replies)" stopOpacity={0.03} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeOpacity={0.35} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
        <YAxis hide allowDecimals={false} />
        <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
        <Bar
          dataKey="sends"
          fill="var(--color-sends)"
          fillOpacity={0.22}
          radius={[3, 3, 0, 0]}
          maxBarSize={26}
        />
        <Area
          dataKey="replies"
          type="monotone"
          fill="url(#fillReplies)"
          stroke="var(--color-replies)"
          strokeWidth={2}
        />
        <Line
          dataKey="interested"
          type="monotone"
          stroke="var(--color-interested)"
          strokeWidth={2}
          dot={false}
        />
      </ComposedChart>
    </ChartContainer>
  );
}
