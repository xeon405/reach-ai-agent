// Print timestamps (HH:MM:SS) of function-internal REST calls matching patterns, to
// confirm cron ticks succeeded around/after the CRON_SECRET rotation. Reads JSON from stdin.
let s = "";
process.stdin.on("data", (d) => (s += d)).on("end", () => {
  const j = JSON.parse(s);
  const rows = j.result || [];
  const out = [];
  for (const r of rows) {
    const m = r.event_message || "";
    if (/agent_config|autopilot|claim_queue_jobs_v2|lead_score\?select=lead_id%2Cscore%2Ctier/.test(m)) {
      const t = r.timestamp ? new Date(Number(r.timestamp) / 1000).toISOString().slice(11, 19) : "";
      const which = m.includes("claim_queue_jobs_v2") ? "claim_v2" : m.includes("autopilot") ? "inbox_scan" : m.includes("lead_score%2Ctier") ? "score_read" : "agent_config";
      out.push(`${t}  ${which}  ${m.split(" | ")[1]}`);
    }
  }
  out.sort();
  for (const l of out) console.log(l);
  console.log("count:", out.length);
});