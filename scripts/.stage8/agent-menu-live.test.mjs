import { getEnv } from "../.ops/_db.mjs";
import { createClient } from "@supabase/supabase-js";

const url = `https://${getEnv("SUPABASE_PROJECT_REF")}.supabase.co`;
const key = getEnv("SUPABASE_SERVICE_ROLE_KEY");
const admin = createClient(url, key, { auth: { persistSession: false } });
const si = createClient(url, key, { auth: { persistSession: false } });

const MENU = [
  ["See my results", "show my results"],
  ["Find new contacts", "find new contacts"],
  ["Who should I email?", "who should i email"],
  ["Start a campaign", "start a campaign"],
  ["Who's unsubscribed?", "who has unsubscribed"],
  ["Sender reputation", "sender reputation"],
];

const email = `menu-${Date.now()}@example.com`;
const cu = await admin.auth.admin.createUser({ email, password: "Pr0be-pass-123!", email_confirm: true });
const uid = cu.data.user.id;
await admin.from("profiles").update({ name: "Menu Probe", plan: "growth" }).eq("id", uid);
const { data: s } = await si.auth.signInWithPassword({ email, password: "Pr0be-pass-123!" });
const h = { Authorization: `Bearer ${s.session.access_token}`, "Content-Type": "application/json" };

let failures = 0;
const check = (n, c, e = "") => {
  if (!c) { failures++; console.log(`  FAIL ${n}${e ? " - " + e : ""}`); }
};

const ledger = async () => {
  const { data } = await admin.from("ai_spend_ledger").select("id").eq("user_id", uid);
  return data?.length ?? 0;
};

const before = await ledger();
console.log(`ledger rows before menu clicks: ${before}`);

for (const [label, message] of MENU) {
  const r = await fetch(`${url}/functions/v1/agent`, {
    method: "POST", headers: h,
    body: JSON.stringify({ message, viaMenu: true }),
  });
  const b = await r.json();
  check(`${label}: HTTP ${r.status}`, r.status === 200, JSON.stringify(b).slice(0, 160));
  check(`${label}: source=menu`, b.source === "menu", `source=${b.source}`);
  check(`${label}: usedAi=false`, b.usedAi === false, `usedAi=${b.usedAi}`);
  check(`${label}: got a reply`, typeof b.text === "string" && b.text.length > 0, String(b.text));
  console.log(`  [${b.source}] ${label} -> ${String(b.text).replace(/\s+/g, " ").slice(0, 84)}`);
}

const after = await ledger();
check("0 AI calls spent on 6 menu clicks", after === before, `before=${before} after=${after}`);
console.log(`ledger rows after: ${after} (delta ${after - before})`);

// Control: a typed question still uses the AI path, so we know the gate did
// not accidentally disable understanding for everyone.
const ctl = await fetch(`${url}/functions/v1/agent`, {
  method: "POST", headers: h,
  body: JSON.stringify({ message: "what plan am I on and how many leads do I have?" }),
});
const cb = await ctl.json();
console.log(`  control (typed, no viaMenu): source=${cb.source} usedAi=${cb.usedAi}`);
const afterCtl = await ledger();
check("typed question still reaches the model", afterCtl > after, `ledger ${after} -> ${afterCtl}`);

// Cleanup.
await admin.from("ai_spend_ledger").delete().eq("user_id", uid);
await admin.from("ai_cost_state").delete().eq("profile_id", uid);
await admin.from("agent_messages").delete().eq("user_id", uid);
await admin.from("agent_conversations").delete().eq("user_id", uid);
await admin.from("profiles").delete().eq("id", uid);
await admin.auth.admin.deleteUser(uid);

console.log(failures === 0 ? "NO FAILURES" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);