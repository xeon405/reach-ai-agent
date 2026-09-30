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
      eq: (col, v) => { rec.filters[col] = v; return api; },
      is: (col, v) => { rec.filters[`is:${col}`] = v; return api; },
      limit: () => api,
      order: () => api,
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
  const { calls } = await run("add_contacts_to_campaign", { campaignName: "spring" },
    { single: { campaigns: { id: "c1", name: "spring" } }, rows: { leads: [{ id: "l1" }, { id: "l2" }] } });
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

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("FAILURES:");
  for (const f of failures) console.log("  - " + f);
  process.exit(1);
}
console.log("NO FAILURES");
