// When the agent asks a question the person has to be able to answer it.
// Menu-first hides the reply box, so unless the `asked` signal is honoured the
// chat dead-ends on things like "What should the campaign be called?" - and an
// empty result must offer a next step rather than just stating the emptiness.

let failures = 0;
const check = (name, cond, extra = "") => {
  if (!cond) {
    failures++;
    console.log(`  FAIL ${name}${extra ? ` - ${extra}` : ""}`);
  }
};

const ui = await Deno.readTextFile(new URL("../../src/routes/_authenticated/agent.tsx", import.meta.url));
const idx = await Deno.readTextFile(new URL("../../supabase/functions/agent/index.ts", import.meta.url));
const exec = await Deno.readTextFile(
  new URL("../../supabase/functions/_shared/agent-executor.ts", import.meta.url),
);
const i18n = await Deno.readTextFile(new URL("../../src/lib/i18n.tsx", import.meta.url));

// --- 1. the reply box opens for exactly the turn the agent is waiting on ----
check("UI derives awaiting from asked", ui.includes("Boolean(lastBubble?.asked)"));
check("box opens on awaiting as well as typing", ui.includes("typing || awaiting"));
check("awaiting respects busy", ui.includes("const awaiting = !busy"));
check("asked survives the round trip", ui.includes("asked: Boolean(data.asked)"));
// A question that is NOT waiting on us must not force the box open, or the
// menu-first design collapses into a permanently visible input.
check("awaiting is driven by asked, not by question marks", !/lastBubble\?\.text.*\?/.test(ui));

// --- 2. offered choices are tappable, not a list telling them to type it ----
check("options survive the round trip", ui.includes("Array.isArray(data.options)"));
check("options render as buttons", ui.includes("b.options && b.options.length > 0"));
check("message options are sent", ui.includes("if (o.message) void send(o.message)"));
check("href options navigate", ui.includes("if (o.href)"));
check("backend sends choose candidates as options", idx.includes("options: pre.choose.candidates"));
check("backend sends outcome choose as options", idx.includes("options: outcome.choose.candidates"));
check("general return carries options", idx.includes("options: outcome.options"));
// The old shape told the user to type the name back at us.
check("no more 'Say the name to pick this one'", !idx.includes("Say the name to pick this one"));

// --- 3. every question path flags asked ------------------------------------
check("need path flags asked", (idx.match(/asked: true/g) ?? []).length >= 4,
  `found ${(idx.match(/asked: true/g) ?? []).length}`);

// --- 4. the empty-contacts dead end is gone --------------------------------
check("empty result offers Lead Finder", exec.includes('href: "/lead-finder"'));
check("empty result explains where contacts come from", exec.includes("New contacts come from Lead Finder"));
check("old dead-end copy removed", !exec.includes("I could not find any saved contacts"));
check("AgentOutcome declares options", exec.includes("options?: AgentOption[]"));

// --- 5. the placeholder for a forced answer exists in both languages --------
check("answer placeholder defined", i18n.includes("app_agent_answer_placeholder"));
check("answer placeholder has ar", /app_agent_answer_placeholder:[\s\S]{0,120}ar:/.test(ui + i18n));

console.log(failures === 0 ? "NO FAILURES" : `FAILURES: ${failures}`);
Deno.exit(failures === 0 ? 0 : 1);
