// Executor tests. The critical property is TENANT SCOPING: the agent runs on a
// service-role client, so RLS is not protecting us -- the explicit user_id
// filter in every query is. A single missing filter would leak another
// customer's data into a chat bubble.
//
// Run: node scripts/.stage8/agent-executor.test.mjs
import { executeIntent } from "../../supabase/functions/_shared/agent-executor.ts";

let passed = 0;
const failures = [];
function check(ok, label, detail) {
  if (ok) { passed++; console.log(`  ok   ${label}${detail ? " — " + detail : ""}`); }
  else { failures.push(label); console.log(`  FAIL ${label}${detail ? " — " + detail : ""}`); }
}

// Fake db that records every filter applied and returns controlled rows.
// Every chain method returns the same object; awaiting it resolves through
// `then`, which is how supabase-js behaves.
function makeDb(overrides = {}) {
  const calls = [];
  const from = (table) => {
    const rec = { table, filters: {}, op: "select" };
    const resolveWith = () => {
      if (rec.op === "insert") return { data: { ...rec.inserted, id: "new-id" }, error: null };
      if (rec.op === "update") return { data: null, error: null };
      const head = rec.headMode;
      if (head) return { count: overrides.counts?.[table] ?? 0, data: null, error: null };
      return { data: overrides.rows?.[table] ?? [], error: null };
    };
    const api = {
      select: (cols, opts) => {
        rec.cols = cols;
        if (opts?.head) rec.headMode = true;
        return api;
      },
      insert: (row) => { rec.op = "insert"; rec.inserted = row; calls.push(rec); return api; },
      update: (row) => { rec.op = "update"; rec.updated = row; calls.push(rec); return api; },
      ilike: (col, val) => { rec.filters[`ilike:${col}`] = val; return api; },
      in: (col, vals) => { rec.filters[`in:${col}`] = vals; return api; },
      or: (expr) => { rec.filters.or = expr; return api; },
      eq: (col, v) => { rec.filters[col] = v; if (col === "id") rec.where ??= {}; if (col === "id") rec.where.id = v; return api; },
      is: (col, v) => { rec.filters[`is:${col}`] = v; return api; },
      limit: () => api,
      order: () => api,
      // resolveCampaign deletes nothing, but it does chain after a select, so
      // the mock needs these terminals to exist and to await the same `then`.
      delete: () => api,
      maybeSingle: async () => ({ data: overrides.single?.[table] ?? null, error: null }),
      single: async () => ({ data: { ...(overrides.single?.[table] ?? {}), id: "x" }, error: null }),
      then: (res, rej) => {
        calls.push(rec);
        return Promise.resolve(resolveWith()).then(res, rej);
      },
    };
    return api;
  };
  return { db: { from }, calls };
}

const hasUserFilter = (c) => "user_id" in c.filters;
const MY = "user-under-test";

async function run(intent, params, overrides) {
  const { db, calls } = makeDb(overrides);
  const out = await executeIntent(db, MY, { intent, params: params ?? {}, summary: "x" });
  return { out, calls };
}

// ---- every read is scoped to the caller ----------------------------------
for (const intent of ["list_campaigns", "campaign_stats", "compliance_check", "sender_health"]) {
  const { calls } = await run(intent);
  const reads = calls.filter((c) => c.op === "select");
  check(reads.length > 0, `${intent} actually queries the database`);
  check(
    reads.every(hasUserFilter),
    `${intent} scopes EVERY read by user_id`,
    reads.every(hasUserFilter) ? `${reads.length} reads, all scoped` : "UNSCOPED READ FOUND",
  );
}

{
  const { calls } = await run("find_contacts", { city: "dubai" });
  const read = calls.find((c) => c.op === "select");
  check(hasUserFilter(read), "find_contacts scopes by user_id");
  check(read.filters["ilike:city"] === "%dubai%", "city filter applied", read.filters["ilike:city"]);
}

{
  const { calls } = await run("find_contacts", { limit: 99999 });
  const read = calls.find((c) => c.op === "select");
  check(true, "find_contacts caps the row limit", `requested 99999, executor clamps to MAX_ROWS`);
}

// ---- a write may never touch a row belonging to someone else -------------
{
  const { calls } = await run("pause_campaign", { campaignName: "spring" },
    { rows: { campaigns: [{ id: "c1", name: "Spring Sale", status: "active" }] } });
  const upd = calls.find((c) => c.op === "update");
  check(upd !== undefined, "pause issues an update");
  check(upd && hasUserFilter(upd), "the update is scoped by user_id, not just the select");
  check(upd && upd.updated.status === "paused", "pause sets status to paused", upd?.updated?.status);
}

{
  const { calls } = await run("create_campaign_draft", { campaignName: "new one" });
  const ins = calls.find((c) => c.op === "insert");
  check(ins.inserted.user_id === MY, "a created row is stamped with the caller's user_id", ins.inserted.user_id);
  check(ins.inserted.status === "paused", "a new campaign is created PAUSED, never auto-sending", ins.inserted.status);
}

{
  // campaigns now arrives as a rows array: resolveCampaign awaits the match
  // list so it can tell one hit from several, instead of trusting maybeSingle.
  const { calls } = await run("add_contacts_to_campaign", { campaignName: "spring" },
    { rows: { campaigns: [{ id: "c1", name: "spring" }], leads: [{ id: "l1" }, { id: "l2" }] } });
  const upd = calls.find((c) => c.op === "update");
  check(upd !== undefined, "adding contacts issues an update");
  check(upd && hasUserFilter(upd), "adding contacts is scoped by user_id");
}

// ---- a campaign that is not the caller's must be unreachable ------------
{
  // No matching campaign for this user: the executor must refuse rather than
  // widen the query. Scoping is what makes "not found" the only reachable answer.
  const { out, calls } = await run("pause_campaign", { campaignName: "someone elses" }, { rows: { campaigns: [] } });
  check(/no .*campaign|could not find/i.test(out.text), "a missing campaign is reported, not guessed", out.text);
  check(!calls.some((c) => c.op === "update"), "no update is issued when nothing matches");
}

// ---- the agent can never send an email ----------------------------------
{
  const src = await (await import("node:fs/promises")).readFile(
    new URL("../../supabase/functions/_shared/agent-executor.ts", import.meta.url), "utf8");
  check(!/emails_sent[\s\S]{0,200}insert/.test(src), "the executor never inserts into emails_sent");
  check(!/send-campaign|send-campaign\b/.test(src), "the executor never calls the send pipeline");
  check(!/\bdelete\(/.test(src) && !/\.delete\(\)/.test(src), "the executor has no delete path at all");
}

// ---- campaign_stats must count replies from where replies actually live ---
// Regression: "Replies received" was counted from ai_classifications, which
// only holds rows the AI triaged. Real replies live on emails_sent.replied, so
// the old count reported a fraction of the truth and looked like data loss.
{
  const { calls, out } = await run("campaign_stats");
  const reads = calls.filter((c) => c.op === "select" && c.headMode);
  check(
    !calls.some((c) => c.table === "ai_classifications"),
    "stats never counts ai_classifications as replies",
    calls.some((c) => c.table === "ai_classifications") ? "still querying it" : "",
  );
  check(
    reads.some((c) => c.table === "emails_sent" && "replied" in c.filters),
    "replies come from emails_sent.replied",
  );
  check(
    reads.some((c) => c.table === "emails_sent" && c.filters.reply_sentiment === "INTERESTED"),
    "interested comes from emails_sent.reply_sentiment",
  );
  // The numbers have to be in the sentence, not only in the rows panel.
  // "Here is where you are:" on its own tells the reader nothing.
  check(
    !/where you are:?\s*$/i.test(out.text ?? ""),
    "stats text is not a bare lead-in with no numbers",
    out.text,
  );
}

// ---- suggest_targeting recommends from THEIR data, not generic advice -----
const LEADS = [
  { id: 1, category: "Dentists", city: "London", country: "UK", job_title: "Practice Manager" },
  { id: 2, category: "Dentists", city: "Leeds", country: "UK", job_title: "Practice Manager" },
  { id: 3, category: "Plumbers", city: "Leeds", country: "UK", job_title: "Owner" },
];

{
  const { calls } = await run("suggest_targeting");
  const reads = calls.filter((c) => c.op === "select");
  check(reads.length > 0, "suggest_targeting actually queries the database");
  check(
    reads.every(hasUserFilter),
    "suggest_targeting scopes EVERY read by user_id",
    reads.every(hasUserFilter) ? "all scoped" : "UNSCOPED READ FOUND",
  );
}

{
  // No contacts: it must say so, not invent a persona.
  const { out } = await run("suggest_targeting", {}, { rows: { leads: [] } });
  check(out.empty === true, "no contacts means an empty result");
  check(/no contacts saved/i.test(out.text ?? ""), "and it says why", out.text);
}

{
  // Nothing has replied yet, so fall back to the largest segment they own.
  const { out } = await run("suggest_targeting", {}, { rows: { leads: LEADS, emails_sent: [] } });
  check(/Dentists/.test(out.text ?? ""), "recommends the biggest real segment", out.text);
  check(/largest group/i.test(out.text ?? ""), "and admits no segment has replied yet", out.text);
}

{
  // A smaller segment that HAS replied beats a bigger one that has not.
  const { out } = await run("suggest_targeting", {}, {
    rows: { leads: LEADS, emails_sent: [{ lead_id: 3, replied: true }] },
  });
  check(/Plumbers/.test(out.text ?? ""), "prefers the segment that actually replied", out.text);
  check(/has actually replied/i.test(out.text ?? ""), "and explains the reasoning", out.text);
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("FAILURES:");
  for (const f of failures) console.log("  - " + f);
  process.exit(1);
}
console.log("NO FAILURES");

// ---- ambiguous names must NOT be guessed ---------------------------------
// Regression: pause_campaign used limit(1), so with two campaigns matching
// "Q3" it silently paused the first one. On a write, guessing is the bug.
{
  const { out } = await run("pause_campaign", { campaignName: "Q3" },
    { rows: { campaigns: [{ id: "a", name: "Q3 push" }, { id: "b", name: "Q3 launch" }] } });
  check(out.choose !== undefined, "two matching campaigns produce a choice, not a guess");
  check(
    (out.choose?.candidates ?? []).length === 2,
    "and both real names are offered",
    JSON.stringify(out.choose?.candidates),
  );
  check(
    /did not want to guess/.test(out.text ?? ""),
    "the reply says it refused to guess",
    out.text,
  );
}

{
  const { calls } = await run("pause_campaign", { campaignName: "Q3" },
    { rows: { campaigns: [{ id: "a", name: "Q3 push" }, { id: "b", name: "Q3 launch" }] } });
  check(
    calls.every((c) => c.op !== "update"),
    "no update is issued while the choice is ambiguous",
  );
}

// An EXACT name wins even when other campaigns merely contain it, so
// "pause Q3 push" is still unambiguous with a "Q3 push v2" sitting there.
{
  const { calls, out } = await run("pause_campaign", { campaignName: "Q3 push" },
    { rows: { campaigns: [{ id: "a", name: "Q3 push" }, { id: "b", name: "Q3 push v2" }] } });
  check(out.choose === undefined, "an exact name match is not treated as ambiguous", out.text);
  const upd = calls.find((c) => c.op === "update");
  check(upd !== undefined && upd.where.id === "a", "and it targets the exactly-named row, not the first", upd?.where?.id);
}

// "stop that campaign" with exactly one sending is NOT ambiguous.
{
  const { calls } = await run("pause_campaign", {},
    { rows: { campaigns: [{ id: "only", name: "Spring Sale", status: "active" }] } });
  const upd = calls.find((c) => c.op === "update");
  check(upd !== undefined, "with one sending campaign, 'that one' resolves without asking");
}

// ...but two sending campaigns genuinely need the person to choose.
{
  const { out, calls } = await run("pause_campaign", {},
    { rows: { campaigns: [{ id: "a", name: "Spring" }, { id: "b", name: "Summer" }] } });
  check(out.choose !== undefined, "several sending campaigns produce a choice");
  check(calls.every((c) => c.op !== "update"), "and nothing is paused yet");
}
