import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { ReplyTrendPoint } from "@/lib/trend";

/** One palette for the bars and the totals above them, so a colour always means
 *  the same series. Sent/Replied/Interested are separate colours on purpose:
 *  when every email is replied and interested the three values are identical,
 *  and overlaid areas hid two of them behind the last one drawn. */
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

  return (
    <ChartContainer config={config} className="aspect-auto h-[260px] w-full">
      <BarChart
        data={data}
        margin={{ left: 0, right: 8, top: 8, bottom: 0 }}
        barGap={2}
        barCategoryGap="18%"
      >
        <CartesianGrid vertical={false} strokeDasharray="3 3" strokeOpacity={0.3} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
        {/* Counts, so the scale must be readable. A hidden axis made a bar of 1
            look like the same shape as a bar of 100. */}
        <YAxis
          allowDecimals={false}
          width={28}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 10 }}
        />
        <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
        <Bar dataKey="sends" fill="var(--color-sends)" radius={[2, 2, 0, 0]} maxBarSize={16} />
        <Bar dataKey="replies" fill="var(--color-replies)" radius={[2, 2, 0, 0]} maxBarSize={16} />
        <Bar
          dataKey="interested"
          fill="var(--color-interested)"
          radius={[2, 2, 0, 0]}
          maxBarSize={16}
        />
      </BarChart>
    </ChartContainer>
  );
}
