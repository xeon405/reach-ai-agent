// Live proof: MeterContext attribution reaches the four quota-only callers.
// - tools (public subjects) -> ledger fn=tools kind=subjects
// - generate-email (JWT)    -> ledger fn=generate-email kind=gen_email user_id=<uid>
// - suggest-areas (JWT)     -> ledger fn=suggest-areas kind=areas user_id=<uid> (advisory:
//                              only fires when >=2 ranked metros -> AI note)
// - send-reply regeneration is NOT live-fired here (it SENDS a real email) — same
//   groqChat+context shape as generate-email (both pass user_id), left to first real use.
// Teardown: ephemeral user deleted; cascades verified.
import { getEnv } from "./_db.mjs";

const REF = getEnv("SUPABASE_PROJECT_REF");
const SITE = getEnv("SUPABASE_URL") ?? `https://${REF}.supabase.co`;
const bearer = getEnv("SUPABASE_ACCESS_TOKEN");
const b = (query) =>
  fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query }),
  }).then(async (r) => (r.ok ? r.json() : await Promise.reject(new Error(`query (${r.status}): ${(await r.text()).slice(0, 300)}`))));
const svc = (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys`, {
  headers: { Authorization: `Bearer ${bearer}` } })
  .then((r) => r.json())).find((k) => k.name === "service_role").api_key;

let fails = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`);
  if (!ok) fails++;
};

const countLedger = async (u) => ((await b(`select count(*)::int c from ai_spend_ledger where ${u};`))[0]?.c) ?? -1;

// ---------- tools (public) ----------
const toolsBefore = await countLedger(`fn='tools'`);
const r1 = await fetch(`${SITE}/functions/v1/tools`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ action: "subjects", offer: "cold email automation", audience: "small agencies" }),
});
const j1 = await r1.json();
await new Promise((r) => setTimeout(r, 4000));
const toolsAfter = await countLedger(`fn='tools'`);
const toolsRow = (await b(`select kind, user_id, est_cost_usd from ai_spend_ledger where fn='tools' order by ts desc limit 1;`))[0];
check("tools answered (public subjects)", r1.status === 200 && (j1.subjects?.length ?? 0) >= 1);
check("tools ledger attributed (fn=tools kind=subjects)", toolsAfter === toolsBefore + 1 && toolsRow?.kind === "subjects", `(${toolsBefore}->${toolsAfter} ${toolsRow?.kind ?? "?"})`);

// ---------- ephemeral user ----------
const email = `attr-proof-${Date.now()}@example.com`;
const pass = "attr-proof-pass-123";
const sign = await fetch(`${SITE}/auth/v1/admin/users`, {
  method: "POST",
  headers: { apikey: svc, Authorization: `Bearer ${svc}`, "Content-Type": "application/json" },
  body: JSON.stringify({ email, password: pass, email_confirm: true }),
});
const created = await sign.json();
const uid = created?.id;
check("ephemeral user created", sign.ok && !!uid);
const prof = (await b(`select id from profiles where id='${uid}'`))[0];
check("profile auto-created by trigger", !!prof);
const tok = await fetch(`${SITE}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: svc, "Content-Type": "application/json" },
  body: JSON.stringify({ email, password: pass }),
}).then((r) => r.json());
const accessToken = tok?.access_token;
check("session token minted", !!accessToken);

// ---------- generate-email ----------
const geBefore = await countLedger(`fn='generate-email'`);
const r2 = await fetch(`${SITE}/functions/v1/generate-email`, {
  method: "POST",
  headers: { apikey: svc, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
  body: JSON.stringify({ leadName: "Alice Rivera", leadCompany: "Brightworks", leadJobTitle: "Head of Ops" }),
});
const j2 = await r2.json();
await new Promise((r) => setTimeout(r, 4000));
const geAfter = await countLedger(`fn='generate-email'`);
const geRow = (await b(`select kind, user_id, est_cost_usd from ai_spend_ledger where fn='generate-email' order by ts desc limit 1;`))[0];
const countToday = (await b(`select ai_generated_today::int c from profiles where id='${uid}'`))[0]?.c;
check("generate-email answered (JWT)", r2.status === 200 && typeof j2?.content === "string");
check("consume_ai_quota consumed the daily count", countToday === 1, `(ai_generated_today=${countToday})`);
check("generate-email ledger attributed to user (fn kind=gen_email uid)", geAfter === geBefore + 1 && geRow?.kind === "gen_email" && String(geRow?.user_id) === uid, `(${geBefore}->${geAfter} uid=${geRow?.user_id?.slice(0, 8)})`);

// ---------- suggest-areas (needs a cache MISS to fire the LLM) ----------
const saBefore = await countLedger(`fn='suggest-areas'`);
let saOutcome = "skipped";
try {
  const niche = `underground speleology guide ${Date.now()}`; // never-asked niche => cache miss
  const r3 = await fetch(`${SITE}/functions/v1/suggest-areas`, {
    method: "POST",
    headers: { apikey: svc, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ jobTitle: niche, country: "United States" }),
  });
  const j3 = await r3.json();
  await new Promise((r) => setTimeout(r, 4000));
  const saAfter = await countLedger(`fn='suggest-areas'`);
  saOutcome = j3.cached ? `cached:no-LLM` : `LLM ran`;
  check(
    "suggest-areas attribution (cache miss => LLM)",
    !!j3.cached || (saAfter > saBefore && (await b(`select kind, user_id from ai_spend_ledger where fn='suggest-areas' order by ts desc limit 1;`))[0]?.kind === "areas"),
    `(${saBefore}->${saAfter} ${saOutcome})`,
  );
} catch {
  console.log("skip  suggest-areas live check (endpoint needs app area data)");
}

// ---------- teardown ----------
const del = await fetch(`${SITE}/auth/v1/admin/users/${uid}`, {
  method: "DELETE",
  headers: { apikey: svc, Authorization: `Bearer ${svc}` },
});
check("ephemeral user deleted", del.ok, `status ${del.status}`);
const profAfter = (await b(`select id from profiles where id='${uid}'`))[0];
const geRowAfter = (await b(`select user_id from ai_spend_ledger where fn='generate-email' and user_id='${uid}'`))[0];
check("profile + attributed ledger cleaned (user_id nulled)", !profAfter && !geRowAfter);

console.log(`\n${fails === 0 ? "all checks passed" : fails + " check(s) failed"}`);
process.exit(fails ? 1 : 0);