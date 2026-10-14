import { Area, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts";

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

export type ReplyTrendMode = "counts" | "rate";

const COUNTS_CONFIG = {
  sends: { label: "Sent", color: "var(--muted-foreground)" },
  replies: { label: "Replies", color: "var(--primary)" },
  interested: { label: "Interested", color: "var(--success)" },
} satisfies ChartConfig;

const RATE_CONFIG = {
  replyRate: { label: "Reply rate", color: "var(--primary)" },
  interestedRate: { label: "Interested rate", color: "var(--success)" },
} satisfies ChartConfig;

export function ReplyTrendChart({
  data,
  mode = "counts",
}: {
  data: ReplyTrendPoint[];
  mode?: ReplyTrendMode;
}) {
  const points = data.map((d) => ({
    ...d,
    replyRate: d.sends ? (d.replies / d.sends) * 100 : 0,
    interestedRate: d.sends ? (d.interested / d.sends) * 100 : 0,
  }));
  const showDots = points.length <= 20;
  const config = mode === "rate" ? RATE_CONFIG : COUNTS_CONFIG;

  return (
    <ChartContainer config={config} className="aspect-auto h-[260px] w-full">
      <ComposedChart data={points} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="fillReplies" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-replies)" stopOpacity={0.35} />
            <stop offset="95%" stopColor="var(--color-replies)" stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="fillInterested" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-interested)" stopOpacity={0.3} />
            <stop offset="95%" stopColor="var(--color-interested)" stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="fillReplyRate" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-replyRate)" stopOpacity={0.35} />
            <stop offset="95%" stopColor="var(--color-replyRate)" stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="fillInterestedRate" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-interestedRate)" stopOpacity={0.3} />
            <stop offset="95%" stopColor="var(--color-interestedRate)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" strokeOpacity={0.3} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
        {mode === "counts" ? (
          <>
            <YAxis yAxisId="hero" hide allowDecimals={false} />
            <YAxis yAxisId="sends" hide allowDecimals={false} />
          </>
        ) : (
          <YAxis hide width={0} domain={[0, 100]} />
        )}
        <ChartTooltip
          cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
          content={
            <ChartTooltipContent
              formatter={mode === "rate" ? (value) => `${Number(value).toFixed(1)}%` : undefined}
            />
          }
        />
        {mode === "counts" ? (
          <>
            <Area
              yAxisId="hero"
              dataKey="interested"
              type="monotone"
              stroke="var(--color-interested)"
              strokeWidth={2}
              fill="url(#fillInterested)"
              dot={showDots ? { r: 2.5, strokeWidth: 0 } : false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--background)" }}
            />
            <Area
              yAxisId="hero"
              dataKey="replies"
              type="monotone"
              stroke="var(--color-replies)"
              strokeWidth={3}
              fill="url(#fillReplies)"
              dot={showDots ? { r: 2.5, strokeWidth: 0 } : false}
              activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--background)" }}
            />
            <Line
              yAxisId="sends"
              dataKey="sends"
              type="monotone"
              stroke="var(--color-sends)"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--background)" }}
            />
          </>
        ) : (
          <>
            <Area
              dataKey="interestedRate"
              type="monotone"
              stroke="var(--color-interestedRate)"
              strokeWidth={2}
              fill="url(#fillInterestedRate)"
              dot={showDots ? { r: 2.5, strokeWidth: 0 } : false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--background)" }}
            />
            <Area
              dataKey="replyRate"
              type="monotone"
              stroke="var(--color-replyRate)"
              strokeWidth={3}
              fill="url(#fillReplyRate)"
              dot={showDots ? { r: 2.5, strokeWidth: 0 } : false}
              activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--background)" }}
            />
          </>
        )}
      </ComposedChart>
    </ChartContainer>
  );
}
