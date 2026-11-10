// Page facts: URL safety and page-fact selection for the public demo.
// Offline; no network.
//
// Run: node scripts/.stage8/page-facts.test.mjs
import {
  ipIsPrivate,
  hostIsPrivate,
  normalizeDemoUrl,
  firstVisibleHeading,
  pickPageFacts,
} from "../../supabase/functions/_shared/page-facts.ts";

let passed = 0;
const failures = [];
function check(ok, label, detail) {
  if (ok) { passed++; console.log(`  ok   ${label}${detail ? " — " + detail : ""}`); }
  else { failures.push(label); console.log(`  FAIL ${label}${detail ? " — " + detail : ""}`); }
}

const NOW = "2026-11-10T10:00:00.000Z";

// ── private addresses ──────────────────────────────────────────────────────
{
  for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "0.0.0.0", "224.0.0.1", "100.64.0.1", "::1", "fc00::1", "fe80::1", "::ffff:127.0.0.1"]) {
    check(ipIsPrivate(ip), `private: ${ip}`);
  }
  for (const ip of ["8.8.8.8", "1.1.1.1", "203.0.113.5", "2606:4700:4700::1111"]) {
    check(!ipIsPrivate(ip), `public: ${ip}`);
  }
  check(hostIsPrivate("localhost"), "localhost rejected");
  check(hostIsPrivate("api.internal"), ".internal rejected");
  check(hostIsPrivate("printer.local"), ".local rejected");
  check(!hostIsPrivate("example.com"), "normal host accepted");
}

// ── URL normalisation ─────────────────────────────────────────────────────
{
  check(normalizeDemoUrl("example.com")?.href === "https://example.com/", "bare domain becomes https");
  check(normalizeDemoUrl("http://example.com/path")?.href === "http://example.com/path", "http kept");
  check(normalizeDemoUrl("https://example.com/#x")?.href === "https://example.com/", "fragment dropped");
  for (const bad of ["", "   ", "javascript:alert(1)", "file:///etc/passwd", "ftp://example.com", "http://localhost:3000", "http://127.0.0.1", "http://169.254.169.254/latest/meta-data", "https://user:pass@example.com", "http://example.com:8080"]) {
    check(normalizeDemoUrl(bad) === null, `refused: ${bad || "(empty)"}`);
  }
}

// ── headings must be visible ──────────────────────────────────────────────
{
  check(firstVisibleHeading("<h1>Bright Smile Dental</h1>") === "Bright Smile Dental", "visible h1 is the name");
  check(firstVisibleHeading('<div style="display:none"><h1>Hidden Co</h1></div>') === "", "hidden h1 is not the name");
  check(firstVisibleHeading('<h1 aria-hidden="true">Fake Co</h1>') === "", "aria-hidden h1 is not the name");
  check(firstVisibleHeading("") === "", "no heading, no name");
}

// ── fact selection ────────────────────────────────────────────────────────
{
  const html = `
    <html><head><title>Bright Smile</title>
      <meta name="description" content="contact us at owner@brightsmile.example">
    </head><body>
      <h1>Bright Smile Dental</h1>
      <p>Bright Smile Dental is a family clinic in Leeds that has looked after local families since 2009.</p>
      <p>We offer gentle checkups, emergency appointments and cosmetic work for nervous patients.</p>
      <p>Email us at hello@brightsmile.example or call us to book.</p>
      <div style="display:none">We have treated 40,000 patients and won the 2019 award.</div>
      <p>Our practice is open on Saturdays and late on Tuesdays for people who work during the week.</p>
      <p>All rights reserved. Cookie preferences.</p>
      <p>Short.</p>
    </body></html>`;

  const out = pickPageFacts({ html, sourceUrl: "https://brightsmile.example", checkedAt: NOW, limit: 5 });
  const quotes = out.facts.map((f) => f.quote).join(" | ");

  check(out.businessName === "Bright Smile Dental", "business name from h1");
  check(out.facts.some((f) => f.kind === "name" && f.value === "Bright Smile Dental"), "name fact exists");
  check(/family clinic in Leeds/.test(quotes), "first real sentence becomes a fact");
  check(/gentle checkups/.test(quotes), "second real sentence becomes a fact");
  check(/open on Saturdays/.test(quotes), "useful sentence survives");
  check(!/40,000 patients/.test(quotes), "hidden text never becomes a fact");
  check(!/hello@brightsmile\.example/.test(quotes), "no email address in a fact");
  check(!/owner@brightsmile/.test(quotes), "no meta description fact");
  check(!/All rights reserved/i.test(quotes), "boilerplate removed");
  check(out.facts.length <= 6, "fact count is capped", String(out.facts.length));
  check(out.facts.every((f) => f.source === "page" && f.sourceUrl === "https://brightsmile.example" && f.checkedAt === NOW), "every fact carries source and date");
  check(out.facts.every((f) => f.quote.length >= 12), "every fact has a usable quote");
}

// ── a JS-only page yields nothing ─────────────────────────────────────────
{
  const out = pickPageFacts({
    html: '<html><body><div id="root"></div><script src="/app.js"></script></body></html>',
    sourceUrl: "https://example.com",
    checkedAt: NOW,
  });
  check(out.facts.length === 0, "empty shell yields zero facts");
  check(out.businessName === "", "no invented name");
}

// ── duplicates and near-duplicates ────────────────────────────────────────
{
  const sentence = "We are a small bakery in Leeds making sourdough bread every morning for the neighbourhood.";
  const html = `<body><p>${sentence}</p><p>${sentence}</p></body>`;
  const out = pickPageFacts({ html, sourceUrl: "https://example.com", checkedAt: NOW });
  check(out.facts.length === 1, "the same sentence is not counted twice", String(out.facts.length));
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("FAILURES:\n  - " + failures.join("\n  - "));
  process.exit(1);
}
