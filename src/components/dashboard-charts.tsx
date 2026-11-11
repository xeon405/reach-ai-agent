import { Area, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { ReplyTrendPoint } from "@/lib/trend";

/** One palette for the lines and the totals above them, so a colour always
 *  means the same series. */
export const TREND_COLORS = {
  sends: "#94a3b8",
  replies: "#3b82f6",
  interested: "#10b981",
} as const;

export function ReplyTrendChart({ data }: { data: ReplyTrendPoint[] }) {
  const config = {
    sends: { label: "Sent", color: TREND_COLORS.sends },
    replies: { label: "Replies", color: TREND_COLORS.replies },
    interested: { label: "Interested", color: TREND_COLORS.interested },
  } satisfies ChartConfig;

  // Enough points to read a line, few enough that the dots do not become noise.
  const showDots = data.length <= 40;

  return (
    <ChartContainer config={config} className="aspect-auto h-[260px] w-full">
      <ComposedChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="fillSends" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={TREND_COLORS.sends} stopOpacity={0.22} />
            <stop offset="95%" stopColor={TREND_COLORS.sends} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" strokeOpacity={0.3} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
        <YAxis
          allowDecimals={false}
          width={28}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 10 }}
        />
        <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
        {/* Sent is the shaded area, so its volume is readable at a glance. Sent,
            replied and interested are often the same number (every sent email
            answered, and answered with interest). Separate solid, dashed and
            dotted strokes keep all three visible instead of one hiding the
            others, and only one fill is used so the fills cannot stack. */}
        <Area
          dataKey="sends"
          type="monotone"
          stroke={TREND_COLORS.sends}
          strokeWidth={2}
          fill="url(#fillSends)"
          dot={showDots ? { r: 2.4, strokeWidth: 0, fill: TREND_COLORS.sends } : false}
          activeDot={{ r: 4 }}
        />
        <Line
          dataKey="replies"
          type="monotone"
          stroke={TREND_COLORS.replies}
          strokeWidth={2.5}
          strokeDasharray="8 4"
          dot={showDots ? { r: 2.2, strokeWidth: 0, fill: TREND_COLORS.replies } : false}
          activeDot={{ r: 4 }}
        />
        <Line
          dataKey="interested"
          type="monotone"
          stroke={TREND_COLORS.interested}
          strokeWidth={2.5}
          strokeDasharray="2 4"
          dot={showDots ? { r: 2, strokeWidth: 0, fill: TREND_COLORS.interested } : false}
          activeDot={{ r: 4 }}
        />
      </ComposedChart>
    </ChartContainer>
  );
}
