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
  const config = mode === "rate" ? RATE_CONFIG : COUNTS_CONFIG;

  return (
    <ChartContainer config={config} className="aspect-auto h-[260px] w-full">
      <LineChart data={points} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeOpacity={0.35} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
        <YAxis hide allowDecimals={false} />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              formatter={mode === "rate" ? (value) => `${Number(value).toFixed(1)}%` : undefined}
            />
          }
        />
        {mode === "rate" ? (
          <>
            <Line
              dataKey="replyRate"
              type="monotone"
              stroke="var(--color-replyRate)"
              strokeWidth={3}
              dot={false}
            />
            <Line
              dataKey="interestedRate"
              type="monotone"
              stroke="var(--color-interestedRate)"
              strokeWidth={2}
              dot={false}
            />
          </>
        ) : (
          <>
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
              strokeWidth={3}
              dot={false}
            />
            <Line
              dataKey="interested"
              type="monotone"
              stroke="var(--color-interested)"
              strokeWidth={2}
              dot={false}
            />
          </>
        )}
      </LineChart>
    </ChartContainer>
  );
}
