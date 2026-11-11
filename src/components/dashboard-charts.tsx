import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

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

/** Which series the owner asked to see. "all" keeps the three-line trend;
 *  a single metric is the readable view when sending and replies differ by
 *  orders of magnitude. */
export type TrendMetric = "all" | "sends" | "replies" | "interested";

export const TREND_METRICS: Array<{ value: TrendMetric; label: string; color?: string }> = [
  { value: "all", label: "All" },
  { value: "sends", label: "Sent", color: "var(--muted-foreground)" },
  { value: "replies", label: "Replies", color: "var(--primary)" },
  { value: "interested", label: "Interested", color: "var(--success)" },
];

/** Period totals straight from the plotted points, so the number above the
 *  graph and the graph itself can never disagree. */
export function trendTotals(data: ReplyTrendPoint[]): {
  sends: number;
  replies: number;
  interested: number;
} {
  return data.reduce(
    (acc, point) => ({
      sends: acc.sends + point.sends,
      replies: acc.replies + point.replies,
      interested: acc.interested + point.interested,
    }),
    { sends: 0, replies: 0, interested: 0 },
  );
}

export function ReplyTrendChart({
  data,
  metric = "all",
}: {
  data: ReplyTrendPoint[];
  metric?: TrendMetric;
}) {
  const config = {
    sends: { label: "Sent", color: "var(--muted-foreground)" },
    replies: { label: "Replies", color: "var(--primary)" },
    interested: { label: "Interested", color: "var(--success)" },
  } satisfies ChartConfig;

  const show = (key: Exclude<TrendMetric, "all">) => metric === "all" || metric === key;

  return (
    <ChartContainer config={config} className="aspect-auto h-[260px] w-full">
      <AreaChart data={data} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="fillSends" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-sends)" stopOpacity={0.18} />
            <stop offset="95%" stopColor="var(--color-sends)" stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="fillReplies" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-replies)" stopOpacity={0.35} />
            <stop offset="95%" stopColor="var(--color-replies)" stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="fillInterested" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-interested)" stopOpacity={0.3} />
            <stop offset="95%" stopColor="var(--color-interested)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" strokeOpacity={0.3} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
        <YAxis
          hide={metric === "all"}
          allowDecimals={false}
          tickLine={false}
          axisLine={false}
          width={28}
        />
        <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
        {show("sends") && (
          <Area
            dataKey="sends"
            type="monotone"
            stroke="var(--color-sends)"
            strokeWidth={2}
            fill="url(#fillSends)"
            dot={{ r: 2.5, strokeWidth: 0, fillOpacity: 0.7 }}
            activeDot={{ r: 4 }}
          />
        )}
        {show("replies") && (
          <Area
            dataKey="replies"
            type="monotone"
            stroke="var(--color-replies)"
            strokeWidth={3}
            fill="url(#fillReplies)"
            dot={{ r: 3, strokeWidth: 0, fillOpacity: 0.9 }}
            activeDot={{ r: 5 }}
          />
        )}
        {show("interested") && (
          <Area
            dataKey="interested"
            type="monotone"
            stroke="var(--color-interested)"
            strokeWidth={2}
            fill="url(#fillInterested)"
            dot={{ r: 2.5, strokeWidth: 0, fillOpacity: 0.85 }}
            activeDot={{ r: 5 }}
          />
        )}
      </AreaChart>
    </ChartContainer>
  );
}
