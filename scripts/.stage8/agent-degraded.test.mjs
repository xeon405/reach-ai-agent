// Degraded-mode reply: fires when the model is unreachable but we still hold
// the account. The old line was "I could not work that out just now."
import { degradedReply } from "../../supabase/functions/_shared/business-context.ts";

let failures = 0;
const check = (name, cond, extra = "") => {
  if (!cond) {
    failures++;
    console.log(`  FAIL ${name}${extra ? ` - ${extra}` : ""}`);
  }
};

const snap = (o = {}) => ({
  plan: "growth",
  todaySent: 0,
  monthSent: 0,
  leads: 0,
  campaigns: 0,
  activeCampaigns: 0,
  ...o,
});

// The dead end must never come back.
for (const [label, facts] of [
  ["no snapshot", null],
  ["empty", snap()],
  ["populated", snap({ leads: 12, activeCampaigns: 2, monthSent: 34 })],
  ["named", snap({ name: "Sarah Jane Chen" })],
]) {
  const r = degradedReply(facts);
  check(`${label}: not the old dead end`, !/could not work that out/i.test(r), r);
  check(`${label}: admits the model is down`, /can't reach my language model/i.test(r), r);
  check(`${label}: does not invent an answer`, /won't guess/i.test(r), r);
  check(`${label}: ends complete`, /[.!?]\s*$/.test(r.trim()), r);
}

// Grammar traps that a template built from the prompt blocks would hit.
// Two-word given names must not be chopped into a greeting. This produced
// "Health, I can't reach..." from the name "Health Check" in a live run.
for (const nm of ["Sarah", "Health Check", "Mary Jane Watson", "  ", null]) {
  const r = degradedReply(snap({ name: nm, leads: 5 }));
  check(`no mangled greeting for ${JSON.stringify(nm)}`, !/^[^I]*,\s*I can't/.test(r), r);
  check(`no name leakage for ${JSON.stringify(nm)}`, !new RegExp((nm || "x").trim().split(/\s+/)[0] || "x", "i").test(r), r);
}

const one = degradedReply(snap({ leads: 1, activeCampaigns: 1, monthSent: 1, replies: 1 }));
check("singular lead", /1 saved lead\b/.test(one) && !/1 saved leads/.test(one), one);
check("singular campaign", /1 live campaign\b/.test(one), one);
check("singular reply", /1 reply\b/.test(one), one);

const many = degradedReply(snap({ leads: 5, activeCampaigns: 2, replies: 3 }));
check("plural lead", /5 saved leads/.test(many), many);
check("plural replies", /3 replies/.test(many), many);

const empty = degradedReply(snap());
check("empty account is not alarming", /nothing saved/i.test(empty), empty);

const noPlan = degradedReply(snap({ plan: "", leads: 2 }));
check("missing plan does not leave a gap", !/\s\./.test(noPlan) && !/undefined|null/i.test(noPlan), noPlan);

// It must stay short. A long canned paragraph during an incident is its own bug.
const len = degradedReply(snap({ name: "Sarah", leads: 12, activeCampaigns: 2, monthSent: 34, replies: 4 })).split(/\s+/).length;
check("stays short", len <= 60, `${len} words`);

console.log(failures === 0 ? "NO FAILURES" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);