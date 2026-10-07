// Every menu button must be answerable with ZERO AI calls. A chip that the
// keyword router cannot match silently falls through to understand() and costs
// a call - the exact thing the menu exists to avoid.
import { routeIntent } from "../../supabase/functions/_shared/agent-router.ts";

let failures = 0;
const check = (name, cond, extra = "") => {
  if (!cond) {
    failures++;
    console.log(`  FAIL ${name}${extra ? ` - ${extra}` : ""}`);
  }
};

// label -> the canonical phrase the frontend sends as `message`
const EXPECTED = [
  ["See my results", "show my results", "campaign_stats"],
  ["Find new contacts", "find new contacts", "find_contacts"],
  ["Who should I email?", "who should i email", "suggest_targeting"],
  ["Start a campaign", "start a campaign", "create_campaign_draft"],
  ["Pause a campaign", "pause a campaign", "pause_campaign"],
  ["Who's unsubscribed?", "who has unsubscribed", "compliance_check"],
];

// The shipped menu in agent.tsx must match what we assert here, so editing one
// without the other fails the build instead of silently costing AI calls.
const src = await Deno.readTextFile(new URL("../../src/routes/_authenticated/agent.tsx", import.meta.url));
for (const [label, message] of EXPECTED) {
  check(`menu contains "${label}"`, src.includes(`label: "${label}"`), "update EXPECTED if you renamed it");
  check(`menu sends "${message}"`, src.includes(`message: "${message}"`));
}

for (const [label, message, intent] of EXPECTED) {
  const r = routeIntent(message);
  check(`${label} -> ${intent}`, r?.intent === intent, `got ${r?.intent ?? "null (falls through to AI)"}`);
}

// --- The router must not swallow more specific questions ---
const guards = [
  ["find me dentists in London", "find_contacts"],
  ["who has unsubscribed", "compliance_check"],
  ["sender reputation", "sender_health"],
  ["pause campaign called Spring Sale", "pause_campaign"],
  ["show me my campaigns", "list_campaigns"],
  ["how many emails have I sent", "campaign_stats"],
];
for (const [message, intent] of guards) {
  const r = routeIntent(message);
  check(`guard: "${message}" -> ${intent}`, r?.intent === intent, `got ${r?.intent ?? "null"}`);
}

// suggest_targeting must be reachable (it had no router branch before) but must
// not steal from find_contacts or compliance_check.
check("suggest_targeting reachable", routeIntent("who should i email")?.intent === "suggest_targeting");
check("suggest not stealing compliance", routeIntent("who has unsubscribed")?.intent !== "suggest_targeting");

// The menu fast path must run BEFORE understand(), or a click still costs an
// AI call. Static check: the menuHit branch must appear above the understand call.
const idx = await Deno.readTextFile(new URL("../../supabase/functions/agent/index.ts", import.meta.url));
const menuPos = idx.indexOf("const menuHit");
const understandPos = idx.indexOf("await understand(");
check("menu branch exists", menuPos > 0, "menuHit not found");
check("menu branch precedes understand()", menuPos > 0 && understandPos > 0 && menuPos < understandPos,
  `menuPos=${menuPos} understandPos=${understandPos}`);
check("menu branch consumes no quota", /menuHit[\s\S]{0,400}source = "menu"/.test(idx) &&
  !/consume_ai_quota[\s\S]{0,200}menuHit/.test(idx));

console.log(failures === 0 ? "NO FAILURES" : `FAILURES: ${failures}`);
Deno.exit(failures === 0 ? 0 : 1);