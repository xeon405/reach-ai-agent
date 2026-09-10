// Stage 6 synthetic-data proof.
//
// Drives the REAL read contract from supabase/functions/_shared/intelligence-reads.ts
// (bundled unmodified by build-stage6-test.mjs) plus semantic mirrors of the two
// new wiring decisions. Scenarios (the user-approved Stage 6 proof bar):
//   A. sequenceHintSuffix / strategyRef helpers behave (advisory framing, trim,
//      length cap, empty => "", ref format).
//   B. Owner-takeover guard predicate (inbox-agent fix): our own newest AI-sent
//      message never parks the thread; a genuine owner reply (non-own id AND
//      internalDate strictly after our last AI send) still does; anything older
//      than our last AI send stays excluded. [SEMANTIC MIRROR — the real guard
//      is inline in the inbox-agent bundle which imports esm.sh/supabase-js and
//      Deno; live verification is the fire-probe after deploy.]
//   C. Queue priority reorders the claim band but NEVER raises the daily volume:
//      same dispatch simulation as Stage 5 Scenario D, run on priority-ordered
//      claims. Count stays <= sender_health cap; hot leads just move first.
// Exits nonzero on any assertion failure.

const IR = await import("./.stage6/intelligence-reads.test.mjs");

let failures = 0;
const line = (ok, msg) => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${msg}`);
  if (!ok) failures++;
};

// ---------------------------------------------------------------------------
// SCENARIO A — next_sequence_hint consumer helpers (real, from the bundle)
// ---------------------------------------------------------------------------
console.log("SCENARIO A — sequenceHintSuffix + strategyRef");
{
  line(IR.sequenceHintSuffix("") === "", "empty hint => empty suffix");
  line(IR.sequenceHintSuffix("   ") === "", "whitespace-only hint => empty suffix");
  const s = IR.sequenceHintSuffix("  Double-tap the pain in reply 2  ");
  line(s.startsWith("\nSEQUENCE HINT ") && s.includes("Double-tap the pain") && !s.includes("  Double") && !s.trimEnd().endsWith("  "), "trim + advisory framing applied");
  const long = "x".repeat(400);
  line(IR.sequenceHintSuffix(long).includes("x".repeat(180)) && !IR.sequenceHintSuffix(long).includes("x".repeat(181)), "hint length capped at 180 chars");
  line(IR.strategyRef("c1", 3) === "campaign_learning:c1@v3", "strategyRef format campaign_learning:<id>@v<version>");
}

// ---------------------------------------------------------------------------
// SCENARIO B — owner-takeover guard predicate (semantic mirror)
// ---------------------------------------------------------------------------
console.log("SCENARIO B — takeover guard (own-id + internalDate gate)");
{
  // Semantic mirror of inbox-agent guard (lines ~785-830 post-fix):
  //   takeover fires ONLY when candidateId not in ownIds AND sentAtMs > lastAiMs.
  const shouldTakeover = (candidateId, ownIds, sentAtMs, lastAiMs) =>
    !ownIds.has(candidateId) && sentAtMs > lastAiMs;

  const ownIds = new Set(["gid_ai_1", "gid_fu_2"]);
  const lastAiMs = 1_000_000_000_000; // our last AI send (12-digit epoch ms)

  line(shouldTakeover("gid_ai_1", ownIds, 1_000_000_100, lastAiMs) === false, "our own just-sent reply (probe #408 pattern) => NO takeover");
  line(shouldTakeover("gid_ai_1", ownIds, 1_000_539_500, lastAiMs) === false, "our own older send re-detected (probe #413 residue) => NO takeover");
  line(shouldTakeover("gid_owner", ownIds, lastAiMs + 90_000, lastAiMs) === true, "genuine owner reply, newer than our last AI send => takeover");
  line(shouldTakeover("gid_owner", ownIds, lastAiMs + 1_000, lastAiMs) === true, "owner reply a second later (human typing real-time) => takeover");
  line(shouldTakeover("gid_owner", ownIds, lastAiMs, lastAiMs) === false, "message stamped AT our last AI send => excluded (never self-match)");
  line(shouldTakeover("gid_owner", ownIds, lastAiMs - 50_000, lastAiMs) === false, "message older than our last AI send => date-bound excludes");
  line(shouldTakeover("gid_ai_1", new Set(), lastAiMs, lastAiMs) === false, "own send stamped AT lastAi with empty ownIds => internalDate gate (<=) saves us");
  line(shouldTakeover("gid_ai_1", new Set(), lastAiMs + 800, lastAiMs) === true, "RESIDUAL (honest): empty ownIds + own send stamped >lastAiMs => takeover — own-id exclusion is the workhorse; gate only kills same-moment collisions");
  line(shouldTakeover("gid_owner", new Set(), lastAiMs + 5_000, lastAiMs) === true, "non-own newer send with empty ownIds (read failure, genuine) => takeover still possible");
}

// ---------------------------------------------------------------------------
// SCENARIO C — priority shapes ORDER within the band; volume never raised
// ---------------------------------------------------------------------------
console.log("SCENARIO C — claim order vs volume invariant");
{
  // Simulate claim_queue_jobs_v2's `order by priority desc, created_at` on a
  // worker over a 50-job cap with 80 jobs (30 hot = priority 1.0, 50 cool =
  // 0.2). p_limit 3, claim in priority order.
  const cap = 50, pLimit = 3, jobs = [];
  for (let i = 0; i < 50; i++) jobs.push({ id: i, priority: 0.2, created: i });
  for (let i = 0; i < 30; i++) jobs.push({ id: 100 + i, priority: 1.0, created: 500 + i });

  let sent = 0;
  const pending = [...jobs].sort((a, b) => b.priority - a.priority || a.created - b.created);
  const claimed = new Set();
  while (pending.length && sent < cap) {
    const batch = pending.splice(0, Math.min(pLimit, cap - sent));
    for (const j of batch) { claimed.add(j.id); sent++; }
  }
  line(sent === cap, "hot + cool mix still caps at exactly 50 (volume unchanged)");
  line([...claimed].filter((id) => id >= 100).length === 30, "all 30 hot leads got priority dispatch before cool ones ran out");

  // Cleaner invariant: of the sent 50, high-priority jobs are a superset of the
  // first dispatched — i.e., no cool job was sent while a hot one waited.
  const hotSent = [...claimed].filter((id) => id >= 100).length;
  const coolSent = [...claimed].filter((id) => id < 100).length;
  line(hotSent + coolSent === cap, "sent = cap exactly, no overshoot");
  line(hotSent === 30 && coolSent === 20, "30 hot + 20 cool: hot leads claimed before cool");

  // And the SAME worker with no scores (all 0.5) => strict FIFO, still capped.
  const jobsFifo = [];
  for (let i = 0; i < 80; i++) jobsFifo.push({ id: i, priority: 0.5, created: i });
  const pendingFifo = [...jobsFifo].sort((a, b) => b.priority - a.priority || a.created - b.created);
  const claimedFifo = [];
  for (const j of pendingFifo) { if (claimedFifo.length >= cap) break; claimedFifo.push(j.id); }
  line(claimedFifo.length === cap, "no scores => still exactly cap claimed");
  line(claimedFifo.every((id, i) => id === i), "no scores => strict FIFO (created_at) preserved");
}

// ---------------------------------------------------------------------------
// SCENARIO D — sustained contention: can a normal-priority lead starve?
// Mirrors claim_queue_jobs_v2 mechanics on 30 simulated days: daily cap 50,
// p_limit 3, worker claims each hour, and a CONTINUOUS stream of 72 hot (1.0)
// newcomers/day arrives behind a single cool (0.5) lead created day 0.
// ---------------------------------------------------------------------------
console.log("SCENARIO D — sustained contention (starvation vs aging bound)");
{
  const HORIZON_DAYS = 30, CAP_PER_DAY = 50, P_LIMIT = 3, AGING_DAYS = 2;
  const effPri = (j, nowDay, agingDays) => (agingDays && nowDay - j.createdDay >= agingDays) ? 1 : j.priority;
  const orderJobs = (jobs, nowDay, agingDays) =>
    [...jobs].sort((a, b) => (effPri(b, nowDay, agingDays) - effPri(a, nowDay, agingDays)) || (a.createdDay - b.createdDay));

  function simulate({ agingDays, allDefault = false }) {
    const jobs = [{ id: "cool", priority: 0.5, createdDay: 0 }];
    let coolClaimed = null;
    for (let d = 0; d < HORIZON_DAYS && !coolClaimed; d++) {
      let cap = CAP_PER_DAY;
      for (let h = 0; h < 24 && !coolClaimed; h++) {
        const nowDay = d + h / 24;
        for (let i = 0; i < 3; i++) jobs.push({ id: `hot_${d}_${h}_${i}`, priority: allDefault ? 0.5 : 1, createdDay: nowDay });
        if (cap <= 0) continue;
        const batch = orderJobs(jobs.filter((j) => j.sentDay == null), nowDay, agingDays)
          .slice(0, Math.min(P_LIMIT, cap));
        for (const j of batch) { j.sentDay = nowDay; cap--; }
        const cool = jobs.find((j) => j.id === "cool");
        if (cool.sentDay != null) coolClaimed = cool.sentDay;
      }
    }
    return coolClaimed;
  }

  const noAging = simulate({ agingDays: null });
  line(noAging === null, "PURE priority (no aging): cool 0.5 lead UNSENT after 30 days of continuous hot arrivals — infinite starvation is real");
  const aged = simulate({ agingDays: AGING_DAYS });
  line(aged !== null && aged < AGING_DAYS + 0.2, `aging window ${AGING_DAYS}d: cool lead claimed at day ${aged.toFixed(2)} — bounded (window + one pass)`);

  // FIFO-default (all 0.5, e.g. kill-switch OFF) even under the same hot stream:
  // ties break on created_at, and the cool lead is OLDEST => claims immediately.
  const fifo = simulate({ agingDays: AGING_DAYS, allDefault: true });
  line(fifo !== null && fifo === 0, `no scores (all 0.5) => cool lead claims immediately (day ${fifo === null ? "never" : fifo.toFixed(2)}) — pure FIFO preserved`);
}

// ---------------------------------------------------------------------------
// SCENARIO E — kill-switch gating (send-campaign fill): OFF means no score is
// even read; every job gets 0.5 => pure FIFO. ON + fresh => score shapes.
// ---------------------------------------------------------------------------
console.log("SCENARIO E — lead_score.enabled gating at enqueue");
{
  const priorityFor = (leadId, scoreByLead, scoreToggle) => scoreToggle ? (scoreByLead.get(leadId) ?? 0.5) : 0.5;
  const scored = new Map([["l1", 0.9]]);
  line(priorityFor("l1", scored, false) === 0.5, "kill-switch OFF + fresh score PRESENT => ignored, 0.5 (pure FIFO)");
  line(priorityFor("l2", scored, false) === 0.5, "kill-switch OFF + no row => 0.5");
  line(priorityFor("l1", scored, true) === 0.9, "kill-switch ON + fresh score => score used");
  line(priorityFor("l2", scored, true) === 0.5, "kill-switch ON + missing/stale => 0.5 default");
}

// ---------------------------------------------------------------------------
console.log(`\n${failures === 0 ? "ALL ASSERTIONS PASSED" : `${failures} ASSERTION(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);