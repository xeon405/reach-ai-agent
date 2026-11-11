// ============================================================
// TREND SHAPING — pure, so the graph's data can be tested without a browser.
//
// The first version only created a bucket when an email was sent. With one day
// of history that meant one point, which Recharts drew as a single mark: it
// looked like a flat "1 sent / 1 replied / 1 interested" line no matter which
// range was selected. Buckets now cover the whole selected window, empty days
// included. A zero day is a real zero, not a guess.
// ============================================================

export type ReplyTrendPoint = {
  label: string;
  sends: number;
  replies: number;
  interested: number;
};

export type TrendMode = "day" | "week" | "month";

type TrendEmail = {
  sent_at: string;
  replied?: boolean | null;
  reply_sentiment?: string | null;
};

/** Bucket size follows real history, not just the selected range: a ten-day-old
 *  account on "All time" gets days, so its graph has more than one point. */
export function pickTrendMode(fromIso: string, nowIso: string): TrendMode {
  const spanDays = Math.max(
    0,
    (new Date(nowIso).getTime() - new Date(fromIso).getTime()) / 86_400_000,
  );
  return spanDays <= 31 ? "day" : spanDays <= 180 ? "week" : "month";
}

/** Builds the plotted points for [fromIso, nowIso], with every bucket present. */
export function buildReplyTrend(
  emails: ReadonlyArray<TrendEmail>,
  opts: { fromIso: string; nowIso: string },
): ReplyTrendPoint[] {
  if (emails.length === 0) return [];

  const mode = pickTrendMode(opts.fromIso, opts.nowIso);
  const bucketOf = (iso: string) => {
    const d = new Date(iso);
    if (mode === "day") {
      const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      return {
        key: start.toISOString().slice(0, 10),
        ts: start.getTime(),
        label: start.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      };
    }
    if (mode === "week") {
      const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const dow = (start.getDay() + 6) % 7;
      start.setDate(start.getDate() - dow);
      return {
        key: start.toISOString().slice(0, 10),
        ts: start.getTime(),
        label: start.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      };
    }
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    return {
      key: `${start.getFullYear()}-${start.getMonth()}`,
      ts: start.getTime(),
      label: start.toLocaleDateString(undefined, { month: "short", year: "2-digit" }),
    };
  };

  const from = bucketOf(opts.fromIso);
  const to = bucketOf(opts.nowIso);
  const buckets = new Map<string, ReplyTrendPoint & { ts: number }>();
  const cursor = new Date(from.ts);
  for (let guard = 0; cursor.getTime() <= to.ts && guard < 4000; guard++) {
    const b = bucketOf(cursor.toISOString());
    buckets.set(b.key, { ts: b.ts, label: b.label, sends: 0, replies: 0, interested: 0 });
    if (mode === "day") cursor.setDate(cursor.getDate() + 1);
    else if (mode === "week") cursor.setDate(cursor.getDate() + 7);
    else cursor.setMonth(cursor.getMonth() + 1);
  }

  for (const email of emails) {
    const b = bucketOf(email.sent_at);
    const row = buckets.get(b.key) ??
      { ts: b.ts, label: b.label, sends: 0, replies: 0, interested: 0 };
    row.sends++;
    if (email.replied) row.replies++;
    if ((email.reply_sentiment ?? "").toUpperCase() === "INTERESTED") row.interested++;
    buckets.set(b.key, row);
  }

  return [...buckets.values()]
    .sort((a, b) => a.ts - b.ts)
    .map(({ ts: _ts, ...point }) => point);
}

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
