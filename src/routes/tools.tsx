import { createFileRoute, Link } from "@tanstack/react-router";
import { EnOnlyNotice } from "@/components/EnOnlyNotice";
import { useState } from "react";
import { Check, Copy, Loader2, MailCheck, Sparkles, X } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/tools")({
  head: () => ({
    meta: [
      { title: "Free Email Tools — Validate Lists & Generate Subject Lines | OutreachAI" },
      {
        name: "description",
        content:
          "Free tools, no signup: check if your email list can actually receive mail, and generate cold-email subject lines that get opens.",
      },
    ],
  }),
  component: ToolsPage,
});

type ValidationResult = { email: string; deliverable: boolean; reason: string };

function ToolsPage() {
  const [listText, setListText] = useState("");
  const [validating, setValidating] = useState(false);
  const [results, setResults] = useState<ValidationResult[] | null>(null);

  const [offer, setOffer] = useState("");
  const [audience, setAudience] = useState("");
  const [subjects, setSubjects] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  async function callTools(payload: Record<string, unknown>) {
    const res = await fetch(`${"https://zvohdvopmvzsujktrdmu.supabase.co"}/functions/v1/tools`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return res.json();
  }

  async function validate() {
    const emails = listText.split(/[\s,;]+/).map((e) => e.trim()).filter(Boolean).slice(0, 25);
    if (emails.length === 0) return;
    setValidating(true);
    setResults(null);
    const data = await callTools({ action: "validate", emails });
    setValidating(false);
    setResults(data.results ?? []);
  }

  async function generate() {
    if (!offer.trim() || !audience.trim()) return;
    setGenerating(true);
    setSubjects([]);
    const data = await callTools({ action: "subjects", offer, audience });
    setGenerating(false);
    setSubjects(data.subjects ?? []);
  }

  return (
    <div className="min-h-screen bg-background">
        <EnOnlyNotice />
      <header className="border-b border-border/50">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Logo />
          <Button asChild size="sm" className="bg-gradient-primary shadow-glow">
            <Link to="/auth">Start free</Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-14 px-6 py-14">
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight md:text-5xl">Free email tools</h1>
          <p className="mt-3 text-muted-foreground">No signup. No credit card. Just useful.</p>
        </div>

        <section className="rounded-2xl border border-border bg-card p-6 shadow-card">
          <div className="flex items-center gap-2 text-xl font-semibold">
            <MailCheck className="h-5 w-5 text-primary" />
            Email list validator
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Paste up to 25 emails — we check each domain's mail server live (the same check our agent runs before every send).
          </p>
          <textarea
            className="mt-4 min-h-24 w-full rounded-xl border border-border bg-background p-3 text-sm outline-none focus:border-primary"
            placeholder={"jane@company.com\njohn@othercorp.com"}
            value={listText}
            onChange={(e) => setListText(e.target.value)}
          />
          <Button onClick={validate} disabled={validating || !listText.trim()} className="mt-3 bg-gradient-primary">
            {validating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Validate list
          </Button>
          {results && (
            <div className="mt-4 space-y-1.5">
              {results.map((r) => (
                <div key={r.email} className="flex items-center gap-2 text-sm">
                  {r.deliverable ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <X className="h-4 w-4 text-red-500" />
                  )}
                  <span>{r.email}</span>
                  {!r.deliverable && <span className="text-xs text-muted-foreground">({r.reason})</span>}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-card p-6 shadow-card">
          <div className="flex items-center gap-2 text-xl font-semibold">
            <Sparkles className="h-5 w-5 text-primary" />
            Subject line generator
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Describe what you sell and who you're emailing — get 5 open-worthy subject lines.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="t-offer">What you offer</Label>
              <Input id="t-offer" placeholder="AI bookkeeping for freelancers" value={offer} onChange={(e) => setOffer(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-audience">Who you're emailing</Label>
              <Input id="t-audience" placeholder="agency owners" value={audience} onChange={(e) => setAudience(e.target.value)} />
            </div>
          </div>
          <Button onClick={generate} disabled={generating || !offer.trim() || !audience.trim()} className="mt-3 bg-gradient-primary">
            {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Generate subjects
          </Button>
          {subjects.length > 0 && (
            <div className="mt-4 space-y-2">
              {subjects.map((s, i) => (
                <div key={i} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background px-4 py-2.5 text-sm">
                  <span>{s}</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(s);
                      setCopiedIdx(i);
                      setTimeout(() => setCopiedIdx(null), 1500);
                    }}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    {copiedIdx === i ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-primary/30 bg-primary/5 p-8 text-center">
          <h2 className="text-2xl font-bold">Like these? The full agent does everything.</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
            Finds leads worldwide, validates them, writes and sends personalized emails at the perfect hour, follows up three times, sorts replies — automatically.
          </p>
          <Button asChild size="lg" className="mt-5 bg-gradient-primary shadow-glow">
            <Link to="/auth">Start free — no card needed</Link>
          </Button>
        </section>
      </main>

      <footer className="border-t border-border/50 py-6 text-center text-xs text-muted-foreground">
        <Link to="/" className="hover:text-foreground">Home</Link>
        {" · "}
        <a href="/terms" className="hover:text-foreground">Terms</a>
        {" · "}
        <a href="/privacy" className="hover:text-foreground">Privacy</a>
      </footer>
    </div>
  );
}
