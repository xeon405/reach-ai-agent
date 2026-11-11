// Graph shaping: the buckets behind the dashboard trend.
// Pure, no browser, no database.
//
// Run: node scripts/.stage8/trend.test.mjs
import {
  buildReplyTrend,
  pickTrendMode,
  trendTotals,
} from "../../src/lib/trend.ts";

let passed = 0;
const failures = [];
function check(ok, label, detail) {
  if (ok) { passed++; console.log(`  ok   ${label}${detail ? " — " + detail : ""}`); }
  else { failures.push(label); console.log(`  FAIL ${label}${detail ? " — " + detail : ""}`); }
}

const now = new Date(2026, 10, 11, 15, 0, 0); // local 11 Nov 2026
const iso = (d) => d.toISOString();
const daysAgo = (n) => new Date(2026, 10, 11 - n, 10, 0, 0);

// ── empty ────────────────────────────────────────────────────────────────
check(buildReplyTrend([], { fromIso: iso(daysAgo(30)), nowIso: iso(now) }).length === 0,
  "no emails means no points, not a flat zero line");

// ── one email, one week of history ───────────────────────────────────────
{
  const email = { sent_at: iso(daysAgo(5)), replied: true, reply_sentiment: "INTERESTED" };
  const points = buildReplyTrend([email], { fromIso: iso(daysAgo(5)), nowIso: iso(now) });
  check(points.length === 6, "a five-day-old account gets six daily points", String(points.length));
  check(points[0].sends === 1 && points[0].replies === 1 && points[0].interested === 1,
    "the send lands in its own day", JSON.stringify(points[0]));
  check(points.at(-1).sends === 0, "today is present as a real zero");
  check(points.filter((p) => p.sends === 0).length === 5, "the other days are zero, not missing");
  const totals = trendTotals(points);
  check(totals.sends === 1 && totals.replies === 1 && totals.interested === 1,
    "totals match the plotted points", JSON.stringify(totals));
}

// ── one email is not drawn as a single point ─────────────────────────────
{
  const email = { sent_at: iso(now), replied: false, reply_sentiment: null };
  const points = buildReplyTrend([email], { fromIso: iso(daysAgo(30)), nowIso: iso(now) });
  check(points.length === 31, "a 30-day range plots 31 daily buckets", String(points.length));
  check(points.filter((p) => p.sends > 0).length === 1, "only one bucket carries the send");
}

// ── 3 months, weekly buckets ─────────────────────────────────────────────
{
  const email = { sent_at: iso(daysAgo(3)), replied: true, reply_sentiment: "MAYBE" };
  const points = buildReplyTrend([email], { fromIso: iso(daysAgo(90)), nowIso: iso(now) });
  check(points.length >= 13 && points.length <= 15, "90 days becomes weekly buckets", String(points.length));
  check(pickTrendMode(iso(daysAgo(90)), iso(now)) === "week", "90 days picks weeks");
  check(trendTotals(points).replies === 1, "a MAYBE reply is a reply but not interested");
  check(trendTotals(points).interested === 0, "only INTERESTED counts as interested");
}

// ── long history, monthly buckets ────────────────────────────────────────
{
  const from = new Date(2026, 0, 15, 10, 0, 0);
  check(pickTrendMode(iso(from), iso(now)) === "month", "over six months picks months");
  const email = { sent_at: iso(from), replied: false };
  const points = buildReplyTrend([email], { fromIso: iso(from), nowIso: iso(now) });
  check(points.length >= 10 && points.length <= 13, "months span the history", String(points.length));
  check(points[0].sends === 1, "the oldest month keeps its send");
}

// ── totals are additive ─────────────────────────────────────────────────
{
  const emails = [
    { sent_at: iso(daysAgo(1)), replied: true, reply_sentiment: "INTERESTED" },
    { sent_at: iso(daysAgo(1)), replied: true, reply_sentiment: "NOT_INTERESTED" },
    { sent_at: iso(daysAgo(2)), replied: false, reply_sentiment: null },
  ];
  const points = buildReplyTrend(emails, { fromIso: iso(daysAgo(7)), nowIso: iso(now) });
  const totals = trendTotals(points);
  check(totals.sends === 3, "all sends are counted", String(totals.sends));
  check(totals.replies === 2, "only replied emails count as replies", String(totals.replies));
  check(totals.interested === 1, "one interested, case-insensitive", String(totals.interested));
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("FAILURES:\n  - " + failures.join("\n  - "));
  process.exit(1);
}
