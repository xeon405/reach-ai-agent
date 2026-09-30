// Pure text sanitising for prompts, with no network imports so it stays usable
// (and unit-testable) outside the Deno runtime.

/** Neutralizes newlines/braces/length so user data can't hijack a prompt. */
export function sanitizeForPrompt(input: unknown, maxLen = 200): string {
  return String(input ?? "")
    .replace(/[\r\n]+/g, " ")
    .replace(/[`{}]/g, "'")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, maxLen);
}
