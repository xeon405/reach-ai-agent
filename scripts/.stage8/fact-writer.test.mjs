// Fact writer: the only path from facts to a draft. Offline, deterministic.
//
// Run: node scripts/.stage8/fact-writer.test.mjs
import {
  factsFromLead,
  listingUrl,
  parseWriterJson,
  guardDraft,
  stripUnsupportedPlaces,
} from "../../supabase/functions/_shared/fact-writer.ts";

let passed = 0;
const failures = [];
function check(ok, label, detail) {
  if (ok) { passed++; console.log(`  ok   ${label}${detail ? " — " + detail : ""}`); }
  else { failures.push(label); console.log(`  FAIL ${label}${detail ? " — " + detail : ""}`); }
}

const NOW = "2026-11-10T09:00:00.000Z";

const LEAD = {
  name: "Bright Smile Dental",
  category: "Dental clinic",
  city: "Leeds",
  address: "12 Kirkgate, Leeds LS1 6BY",
  rating: 4.6,
  website: "https://brightsmile.example",
  phone: "+44 113 000 0000",
};

const facts = factsFromLead(LEAD, { now: NOW, listingUrl: listingUrl(LEAD.name, LEAD.address) });
const byKind = (k) => facts.find((f) => f.kind === k);

// ── facts from a lead ──────────────────────────────────────────────────────
{
  check(facts.length === 7, "seven facts from a full lead", String(facts.length));
  check(byKind("rating")?.value === "4.6", "numeric rating becomes a string fact");
  check(byKind("city")?.value === "Leeds", "city fact kept");
  check(facts.every((f) => f.id && f.quote && f.sourceUrl && f.checkedAt), "every fact carries id, quote, source and date");
  check(facts.every((f) => f.source === "listing"), "lead facts are listing facts");

  const sparse = factsFromLead({ name: "Cafe One", city: "  " }, { now: NOW });
  check(sparse.length === 1, "blank values create no fact", String(sparse.length));
  check(sparse[0].id === "f1", "ids stay dense after blanks");

  const url = listingUrl(LEAD.name, LEAD.address);
  check(/google\.com\/maps/.test(url), "listing link points at Google Maps");
  check(/Bright%20Smile%20Dental/.test(url) && !/ /.test(url), "listing link is query-encoded");
  check(listingUrl("", "") === "", "no name and no address means no link, not a guess");
}

// ── JSON parsing ───────────────────────────────────────────────────────────
{
  const raw = 'Here you go:\n```json\n{"draft":"Hi Sam,\\nShort note.","claims":[{"sentence":"Short note.","fact_ids":["f1"]}]}\n```\nThanks!';
  const parsed = parseWriterJson(raw);
  check(parsed !== null, "fences and surrounding prose are tolerated");
  check(parsed?.draft === "Hi Sam,\nShort note.", "line breaks survive");
  check(parsed?.claims.length === 1 && parsed.claims[0].fact_ids[0] === "f1", "claims survive");

  const bare = parseWriterJson('{"draft":"Hi.","claims":[]}');
  check(bare !== null && bare.claims.length === 0, "empty claims array is valid JSON");

  check(parseWriterJson("Sorry, I cannot help with that.") === null, "prose with no JSON is rejected");
  check(parseWriterJson('{"claims":[{"sentence":"x","fact_ids":["f1"]}]}') === null, "missing draft is rejected");
  check(parseWriterJson('{"draft":"   "}') === null, "blank draft is rejected");
  check(parseWriterJson('{"draft":"Hi","claims":[{"sentence":"Hi","fact_ids":[1,2]}]}')?.claims[0].fact_ids.length === 0, "non-string fact ids are dropped");

  const sendShape = parseWriterJson(
    '{"subject":"Quick question","body":"Hi Sam,\\nShort note.","claims":[{"sentence":"Short note.","fact_ids":["f1"]}]}',
  );
  check(sendShape?.draft === "Hi Sam,\nShort note.", "send-worker body is accepted as the draft");
  check(sendShape?.subject === "Quick question", "send-worker subject is parsed");
}

// ── a draft that cites nothing loses everything ────────────────────────────
{
  const out = guardDraft("I loved your website and the team behind it.", facts);
  check(out.empty === true, "uncited detail is removed, not sent");
  check(out.blocked.length > 0, "removal is reported, not silent");
  check(out.content === "", "no residue is left behind");
}

// ── the good path keeps sourced sentences ─────────────────────────────────
{
  const draft = [
    "Hi Sam,",
    "I saw Bright Smile Dental is in Leeds and rated 4.6.",
    "We help clinics fill quiet afternoon slots.",
    "Worth a quick call?",
    "Best regards, Alex",
  ].join("\n");

  const out = guardDraft(
    JSON.stringify({
      draft,
      claims: [
        { sentence: "I saw Bright Smile Dental is in Leeds and rated 4.6.", fact_ids: ["f1", "f3", "f5"] },
      ],
    }),
    facts,
  );

  check(/rated 4\.6/.test(out.content), "sourced sentence is kept");
  check(/Hi Sam,/.test(out.content), "greeting survives");
  check(/Best regards, Alex/.test(out.content), "sign-off survives");
  check(/Worth a quick call\?/.test(out.content), "plain question survives");
  check(/fill quiet afternoon slots/.test(out.content), "generic value line survives in lenient mode");
  check(out.empty === false, "a draft with one true sentence is sendable");

  // The same sentence plus an invented review count must be removed whole.
  const inflated = guardDraft(
    JSON.stringify({
      draft: "Hi Sam,\nI saw Bright Smile Dental is in Leeds and rated 4.6 by 120 reviews.\nBest regards, Alex",
      claims: [
        { sentence: "I saw Bright Smile Dental is in Leeds and rated 4.6 by 120 reviews.", fact_ids: ["f1", "f3", "f5"] },
      ],
    }),
    facts,
  );
  check(!/120 reviews/.test(inflated.content), "an invented review count does not ride along with a real rating");
  check(inflated.blocked.some((b) => /number no cited fact supports: 120/.test(b.reason)), "the invented number is reported");
}

// ── wrong city cannot pass ────────────────────────────────────────────────
{
  const out = guardDraft(
    JSON.stringify({
      draft: "Hi Sam,\nI noticed you are serving clients in Manchester.\nBest regards, Alex",
      claims: [{ sentence: "I noticed you are serving clients in Manchester.", fact_ids: ["f1"] }],
    }),
    facts,
  );
  check(!/Manchester/.test(out.content), "a city the facts do not mention is removed", out.content);
  check(out.blocked.some((b) => /place no fact supports: Manchester/.test(b.reason)), "wrong city is reported with the name");
}

{
  const kept = stripUnsupportedPlaces(
    ["We work with cafés near Headingley.", "Based in Leeds, we open at 8."],
    facts,
  );
  check(kept.kept.length === 1, "one supported place survives", String(kept.kept.length));
  check(/Based in Leeds/.test(kept.kept[0]), "the supported sentence is the right one");
  check(/Headingley/.test(kept.blocked[0].reason), "unsupported place is named");
}

// ── unknown citation is refused ───────────────────────────────────────────
{
  const out = guardDraft(
    JSON.stringify({
      draft: "Hi Sam,\nBright Smile Dental is in Leeds.\nBest regards, Alex",
      claims: [{ sentence: "Bright Smile Dental is in Leeds.", fact_ids: ["f99"] }],
    }),
    facts,
  );
  check(!/is in Leeds/.test(out.content), "a citation to a fact that does not exist is blocked");
  check(out.blocked.some((b) => /unknown fact/i.test(b.reason)), "unknown id is explained");
}

// ── no facts at all: no email ─────────────────────────────────────────────
{
  const out = guardDraft(
    JSON.stringify({ draft: "Hi Sam,\nHope you are well.\nBest regards, Alex", claims: [] }),
    [],
  );
  check(out.empty === true, "no facts produces nothing to send");
  check(out.content === "", "greetings alone are not an email");
  check(out.blocked.some((b) => /no verified fact/.test(b.reason)), "the reason is explicit");
  check(out.facts.length === 0, "the empty fact set is returned honestly");
}

// ── unparseable output fails closed ───────────────────────────────────────
{
  const out = guardDraft("Subject: Quick question\n\nHi Sam, ...", facts);
  check(out.empty === true && out.content === "", "non-JSON fails closed");
  check(/did not return a JSON draft/.test(out.blocked[0].reason), "failure reason is explicit");
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("FAILURES:\n  - " + failures.join("\n  - "));
  process.exit(1);
}
