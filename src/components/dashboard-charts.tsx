import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

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
      <LineChart data={data} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeOpacity={0.35} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
        <YAxis hide allowDecimals={false} />
        <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
        <Line
          dataKey="sends"
          type="monotone"
          stroke="var(--color-sends)"
          strokeWidth={2}
          dot={false}
        />
        <Line
          dataKey="replies"
          type="monotone"
          stroke="var(--color-replies)"
          strokeWidth={2}
          dot={false}
        />
        <Line
          dataKey="interested"
          type="monotone"
          stroke="var(--color-interested)"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ChartContainer>
  );
}
