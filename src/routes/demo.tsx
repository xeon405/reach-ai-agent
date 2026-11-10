import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/site-header";
import { EnOnlyNotice } from "@/components/EnOnlyNotice";
import { WhyThisEmail, type ProofBlocked, type ProofClaim, type ProofFact } from "@/components/why-this-email";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, ExternalLink, Loader2, ShieldCheck, Sparkles } from "lucide-react";

export const Route = createFileRoute("/demo")({
  head: () => ({
    meta: [
      { title: "Live demo — paste a website, see 3 sourced emails | OutshipAi" },
      {
        name: "description",
        content:
          "Paste any public business website and see three cold emails written from facts we can point to on the page. No signup, nothing sent, no email addresses shown.",
      },
    ],
  }),
  component: DemoPage,
});

type DemoEmail = {
  angle: string;
  content: string;
  claims: ProofClaim[];
  blocked: ProofBlocked[];
  empty: boolean;
};

type DemoResult = {
  business: string;
  sourceUrl: string;
  checkedAt: string;
  facts: ProofFact[];
  emails: DemoEmail[];
  notice?: string;
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "just now"
    : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function DemoPage() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DemoResult | null>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim() || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("demo", {
        body: { url: url.trim() },
      });
      if (invokeError) throw new Error(invokeError.message);
      if (data?.error) throw new Error(String(data.error));
      setResult(data as DemoResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The demo could not run. Try again.");
    } finally {
      setLoading(false);
    }
  }

  const emails = result?.emails ?? [];
  const hasEmails = emails.some((e) => !e.empty);

  return (
    <div className="min-h-screen bg-background">
      <EnOnlyNotice />
      <SiteHeader
        nav={[
          { label: "How it works", to: "/about" },
          { label: "Pricing", href: "/#pricing" },
          { label: "Free tools", to: "/tools" },
        ]}
        secondaryCta="Log in"
        cta="Start free"
        ctaVariant="primary"
      />

      <main className="mx-auto max-w-5xl px-4 pb-20 pt-10">
        <div className="mx-auto max-w-2xl text-center">
          <Badge variant="secondary" className="mb-4">
            <Sparkles className="mr-1.5 h-3.5 w-3.5" /> No signup
          </Badge>
          <h1 className="font-serif text-3xl font-extrabold tracking-tight md:text-5xl">
            Paste a website. See three emails.
          </h1>
          <p className="mt-4 text-muted-foreground">
            We read the public page, keep only what it actually says, and write three short emails. Every sentence
            shows the fact behind it and where we found it. Nothing is sent. Email addresses are never read or shown.
          </p>
        </div>

        <form onSubmit={run} className="mx-auto mt-8 flex max-w-xl flex-col gap-2 sm:flex-row">
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="brightsmiledental.com"
            inputMode="url"
            autoComplete="url"
            aria-label="Business website address"
            className="h-11"
          />
          <Button type="submit" size="lg" disabled={loading || !url.trim()} className="h-11 shrink-0">
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {loading ? "Reading the page" : "Show me 3 emails"}
          </Button>
        </form>
        <p className="mx-auto mt-2 max-w-xl text-center text-xs text-muted-foreground">
          Six demos an hour per visitor. We never ask for a card and never send anything from this page.
        </p>

        {error && (
          <div className="mx-auto mt-6 max-w-2xl rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
            {error}
          </div>
        )}

        {loading && (
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-56 animate-pulse rounded-2xl border border-border bg-muted/30" />
            ))}
          </div>
        )}

        {result && !loading && (
          <div className="mt-10 space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">{result.business}</h2>
                <p className="text-xs text-muted-foreground">
                  Read from{" "}
                  <a
                    href={result.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-0.5 text-primary hover:underline"
                  >
                    {result.sourceUrl.replace(/^https?:\/\//, "").slice(0, 60)}
                    <ExternalLink className="h-3 w-3" />
                  </a>{" "}
                  on {formatDate(result.checkedAt)}
                </p>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
                <ShieldCheck className="h-4 w-4" />
                {result.facts.length} checked fact{result.facts.length === 1 ? "" : "s"}
              </div>
            </div>

            {!hasEmails ? (
              <div className="rounded-2xl border border-border bg-muted/20 p-6 text-sm">
                <p className="font-medium">No email was written, and we will not pretend otherwise.</p>
                <p className="mt-1 text-muted-foreground">
                  {result.notice ??
                    "We could not read enough real text on that page to write anything true. A page with a few sentences about the business works best."}
                </p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-3">
                {emails.map((email) => (
                  <article key={email.angle} className="flex flex-col rounded-2xl border border-border bg-card p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{email.angle}</p>
                    {email.empty ? (
                      <div className="mt-3 flex-1">
                        <p className="text-sm font-medium">No citable draft.</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {email.blocked[0]?.reason ?? "Nothing in this angle could be backed by a fact."}
                        </p>
                      </div>
                    ) : (
                      <>
                        <p className="mt-3 flex-1 whitespace-pre-wrap text-sm leading-relaxed">{email.content}</p>
                        <div className="mt-4 border-t border-border pt-3">
                          <WhyThisEmail facts={result.facts} claims={email.claims} blocked={email.blocked} />
                        </div>
                      </>
                    )}
                  </article>
                ))}
              </div>
            )}

            <div className="rounded-2xl border border-primary/20 bg-primary/5 p-6 text-center">
              <p className="text-sm font-medium">This is the part most tools skip: proof.</p>
              <p className="mx-auto mt-1 max-w-xl text-sm text-muted-foreground">
                Start free with 50 emails, 10 a day. Connect Gmail, add your brand and street address, and every draft
                you review shows the same proof you just saw.
              </p>
              <Link to="/auth" className="mt-4 inline-flex">
                <Button size="lg">
                  Start free <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        )}

        <div className="mx-auto mt-14 max-w-2xl rounded-2xl border border-border p-5 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">What this demo does not do</p>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            <li>It does not create an account or ask for your email.</li>
            <li>It does not send anything, to anyone.</li>
            <li>It does not read, store or display email addresses.</li>
            <li>It does not guarantee a reply. Nobody honest can.</li>
          </ul>
        </div>
      </main>
    </div>
  );
}
