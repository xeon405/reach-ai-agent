import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

export type ReplyTrendPoint = { label: string; replies: number; interested: number };

export function ReplyTrendChart({ data }: { data: ReplyTrendPoint[] }) {
  const config = {
    replies: { label: "Replies", color: "var(--primary)" },
    interested: { label: "Interested", color: "var(--success)" },
  } satisfies ChartConfig;
  return (
    <ChartContainer config={config} className="aspect-auto h-[260px] w-full">
      <AreaChart data={data} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="fillReplies" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-replies)" stopOpacity={0.35} />
            <stop offset="95%" stopColor="var(--color-replies)" stopOpacity={0.03} />
          </linearGradient>
          <linearGradient id="fillInterested" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-interested)" stopOpacity={0.5} />
            <stop offset="95%" stopColor="var(--color-interested)" stopOpacity={0.03} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeOpacity={0.35} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
        <YAxis hide allowDecimals={false} />
        <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
        <Area
          dataKey="replies"
          type="monotone"
          fill="url(#fillReplies)"
          stroke="var(--color-replies)"
          strokeWidth={2}
        />
        <Area
          dataKey="interested"
          type="monotone"
          fill="url(#fillInterested)"
          stroke="var(--color-interested)"
          strokeWidth={2}
        />
      </AreaChart>
    </ChartContainer>
  );
}
