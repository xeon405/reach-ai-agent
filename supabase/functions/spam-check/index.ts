const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SPAM_WORDS = [
  "free", "guarantee", "guaranteed", "act now", "limited time", "risk-free", "risk free",
  "winner", "winning", "urgent", "buy now", "cheap", "credit card", "loan", "cash bonus",
  "click here", "100%", "make money fast", "no obligation", "congratulations", "dear friend",
  "exclusive deal", "double your", "earn $", "extra income", "miracle", "instant", "no cost",
  "this isn't spam", "this is not spam", "opportunity of a lifetime", "while supplies last",
];

function scoreEmail(subject: string, body: string) {
  const issues: { severity: "high" | "medium" | "low"; message: string }[] = [];
  let score = 100;
  const subj = subject || "";
  const bodyLower = body.toLowerCase();
  const subjLower = subj.toLowerCase();

  // Subject checks
  const capsWords = subj.match(/\b[A-Z]{4,}\b/g) ?? [];
  if (capsWords.length > 0) {
    score -= Math.min(20, capsWords.length * 8);
    issues.push({ severity: "high", message: `ALL-CAPS words in subject (${capsWords.join(", ")}) — major spam trigger` });
  }
  if (/[!]{2,}|\$\$\$/.test(subj)) {
    score -= 12;
    issues.push({ severity: "high", message: 'Excessive "!!!" or "$$$" in subject' });
  }
  if (subj.length > 60) {
    score -= 8;
    issues.push({ severity: "medium", message: `Subject is ${subj.length} chars — mobile clients truncate at ~45. Aim under 50.` });
  }
  if (subj.length < 10) {
    score -= 6;
    issues.push({ severity: "low", message: "Very short subject can look lazy or spammy" });
  }
  if (/^(re:|fwd:)/i.test(subj.trim())) {
    score -= 15;
    issues.push({ severity: "high", message: 'Fake "Re:/Fwd:" prefix — recipients notice and report it' });
  }

  // Body checks
  const found = SPAM_WORDS.filter((w) => bodyLower.includes(w));
  if (found.length > 0) {
    const hit = Math.min(25, found.length * 7);
    score -= hit;
    issues.push({ severity: found.length > 2 ? "high" : "medium", message: `Spam trigger words in body: ${found.slice(0, 5).join(", ")}` });
  }
  if (/^dear (sir|madam|friend)/im.test(body)) {
    score -= 8;
    issues.push({ severity: "medium", message: '"Dear Sir/Madam" greeting — impersonal and flagged by filters' });
  }
  const linkCount = (body.match(/https?:\/\//g) ?? []).length;
  if (linkCount > 3) {
    score -= (linkCount - 3) * 6;
    issues.push({ severity: "medium", message: `${linkCount} links in body — keep it to 1–2 for cold email` });
  }
  if (linkCount === 0 && !/reply|book|call/i.test(body)) {
    issues.push({ severity: "low", message: "No clear call-to-action (reply / book / call)" });
  }
  const letters = body.replace(/[^a-zA-Z]/g, "");
  if (letters.length > 80) {
    const upperRatio = (body.replace(/[^A-Z]/g, "").length) / letters.length;
    if (upperRatio > 0.3) {
      score -= 15;
      issues.push({ severity: "high", message: `${Math.round(upperRatio * 100)}% of body is UPPERCASE` });
    }
  }
  const wordCount = body.split(/\s+/).filter(Boolean).length;
  if (wordCount > 350) {
    score -= 6;
    issues.push({ severity: "low", message: `${wordCount} words — cold emails convert best under 150` });
  } else if (wordCount < 30) {
    score -= 5;
    issues.push({ severity: "low", message: "Very short body — add one line of context or value" });
  }

  // Good signals
  const good: string[] = [];
  if (/\{\{?first_name\}?}|Hi [A-Z]/.test(body)) { score = Math.min(100, score + 4); good.push("Personalized greeting"); }
  if (/unsubscribed?|opt.?out/i.test(body)) { score = Math.min(100, score + 4); good.push("Has opt-out option"); }
  if (/\?/.test(body)) { score = Math.min(100, score + 2); good.push("Contains a question (invites reply)"); }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const grade = score >= 85 ? "Excellent" : score >= 70 ? "Good" : score >= 50 ? "Risky" : "Likely spam";
  return { score, grade, issues, good };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { subject, body } = await req.json();
    const result = scoreEmail(String(subject ?? ""), String(body ?? ""));
    return new Response(JSON.stringify(result), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (_e) {
    return new Response(JSON.stringify({ error: "Invalid request" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
