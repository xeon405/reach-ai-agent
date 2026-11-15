// Rules and signing: the parts a send decision depends on.
// Pure, no browser, no database.
//
// Run: node scripts/.stage8/developer.test.mjs
import {
  DEFAULT_RULES,
  hmacSha256Hex,
  inQuietHours,
  isNeverEmail,
  minutesInZone,
  sha256Hex,
} from "../../supabase/functions/_shared/developer.ts";

let passed = 0;
const failures = [];
function check(ok, label, detail) {
  if (ok) { passed++; console.log(`  ok   ${label}${detail ? " — " + detail : ""}`); }
  else { failures.push(label); console.log(`  FAIL ${label}${detail ? " — " + detail : ""}`); }
}

// ── never-email list ─────────────────────────────────────────────────────
check(isNeverEmail("bob@example.com", ["bob@example.com"]), "an exact address blocks");
check(isNeverEmail("BOB@Example.COM", ["bob@example.com"]), "matching ignores case");
check(!isNeverEmail("alice@example.com", ["bob@example.com"]), "another address is not blocked");
check(isNeverEmail("bob@example.com", ["example.com"]), "a domain blocks its addresses");
check(isNeverEmail("bob@mail.example.com", ["example.com"]), "a domain blocks subdomains");
check(isNeverEmail("bob@example.com", ["@example.com"]), "a leading @ is accepted");
check(!isNeverEmail("bob@notexample.com", ["example.com"]), "a suffix alone does not match");
check(!isNeverEmail("bob@example.com.evil.co", ["example.com"]), "lookalike domains do not match");
check(!isNeverEmail("not-an-address", ["example.com"]), "a non-address cannot match");
check(!isNeverEmail("bob@example.com", []), "an empty list blocks nothing");
check(isNeverEmail("bob@example.com", ["  ", "EXAMPLE.COM "]), "spaces are ignored");

// ── quiet hours ──────────────────────────────────────────────────────────
const utc = (iso) => new Date(iso);
const night = { ...DEFAULT_RULES, quiet_start: "22:00", quiet_end: "08:00", timezone: "UTC" };
check(inQuietHours(night, utc("2026-11-12T23:30:00Z")), "inside a window that crosses midnight");
check(inQuietHours(night, utc("2026-11-12T02:00:00Z")), "after midnight is still inside");
check(!inQuietHours(night, utc("2026-11-12T12:00:00Z")), "noon is outside");
check(!inQuietHours(night, utc("2026-11-12T08:00:00Z")), "the end minute is outside");
check(inQuietHours(night, utc("2026-11-12T22:00:00Z")), "the start minute is inside");

const day = { ...DEFAULT_RULES, quiet_start: "09:00", quiet_end: "17:00", timezone: "UTC" };
check(inQuietHours(day, utc("2026-11-12T09:01:00Z")), "a same-day window is inside");
check(!inQuietHours(day, utc("2026-11-12T18:00:00Z")), "a same-day window ends");

check(!inQuietHours({ ...DEFAULT_RULES }, utc("2026-11-12T03:00:00Z")), "no window never blocks");
check(!inQuietHours({ ...night, quiet_start: "10:00", quiet_end: "10:00" }, utc("2026-11-12T10:00:00Z")),
  "equal start and end means no quiet hours");
check(!inQuietHours({ ...night, timezone: "Not/AZone" }, utc("2026-11-12T23:30:00Z")),
  "an invalid timezone fails open (never silently blocks all sends)");

check(minutesInZone(utc("2026-11-12T00:00:00Z"), "Asia/Kolkata") === 330,
  "Kolkata is UTC+5:30", String(minutesInZone(utc("2026-11-12T00:00:00Z"), "Asia/Kolkata")));

// ── hashing and signing ──────────────────────────────────────────────────
check(await sha256Hex("abc") === "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  "SHA-256 matches the known vector");
check(await hmacSha256Hex("key", "The quick brown fox jumps over the lazy dog") ===
  "f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8",
  "HMAC-SHA256 matches the known vector");

// ── defaults ─────────────────────────────────────────────────────────────
check(DEFAULT_RULES.daily_cap === null && DEFAULT_RULES.never_emails.length === 0,
  "a missing rules row adds no restrictions");

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("FAILURES:\n  - " + failures.join("\n  - "));
  process.exit(1);
}
