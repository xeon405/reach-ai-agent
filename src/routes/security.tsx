import { createFileRoute, Link } from "@tanstack/react-router";
import { EnOnlyNotice } from "@/components/EnOnlyNotice";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-provider";
import { ShieldCheck, Lock, KeyRound, Trash2, Eye, FileJson } from "lucide-react";

export const Route = createFileRoute("/security")({
  component: SecurityPage,
});

const SECTIONS = [
  {
    icon: KeyRound,
    title: "Your Gmail. Your control.",
    points: [
      "We never see or store your Google password — connection happens through Google's official OAuth flow.",
      "We request only two permissions: send emails and read replies to your own sent messages.",
      "Disconnect anytime in Settings → Connected accounts. This instantly revokes our access.",
      "You can also revoke from your Google Account → Third-party access, anytime.",
    ],
  },
  {
    icon: Lock,
    title: "Token vault isolation",
    points: [
      "Gmail access tokens are stored in an isolated vault table protected by Row Level Security.",
      "Your regular login can NOT read this vault — not from the app, not from the API, not with any browser trickery.",
      "Only the sending engine (server-side) can use them, and only to send YOUR campaigns.",
      "Tokens are rotated on every send session and old values are overwritten within seconds.",
    ],
  },
  {
    icon: Eye,
    title: "What we see — and what we don't",
    points: [
      "Stored: your account email, campaign settings, lead lists you create, subjects/bodies of emails your agent sends, reply sentiment labels.",
      "NOT stored: your Gmail password, emails from other senders in your inbox, your contacts outside outreach, browsing history.",
      "We never sell, rent, or share your data with third parties. Period.",
    ],
  },
  {
    icon: FileJson,
    title: "Your data belongs to you",
    points: [
      "Export everything as JSON: Settings → Download my data. It's a single click, no support ticket needed.",
      "Permanent deletion: Settings → Danger zone → Delete account removes profile, campaigns, leads, email history AND token vault rows in one shot.",
      "Unsubscribed leads are permanently suppressed across all your campaigns automatically.",
    ],
  },
  {
    icon: ShieldCheck,
    title: "Built-in compliance",
    points: [
      "Every campaign email includes a working unsubscribe path (reply-to opt-out honored automatically).",
      "A physical sender address is included in all commercial emails (CAN-SPAM requirement).",
      "Safe daily sending caps protect your domain reputation and recipients' inboxes.",
      "MX verification ensures we never waste sends on dead addresses.",
    ],
  },
];

function SecurityPage() {
  return (
    <div className="min-h-screen bg-background">
        <EnOnlyNotice />
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5">
        <Link to="/" className="text-lg font-bold">Outreach<span className="text-primary">AI</span></Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link to="/auth"><Button variant="outline" size="sm">Open app</Button></Link>
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-4 pb-10 pt-8 text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-primary shadow-glow">
          <ShieldCheck className="h-8 w-8 text-primary-foreground" />
        </div>
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">Security at OutreachAI</h1>
        <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
          We treat your Gmail account like it's our own. Here is exactly how your data is protected — in plain English.
        </p>
      </section>

      <section className="mx-auto max-w-3xl space-y-5 px-4 pb-20">
        {SECTIONS.map((s) => (
          <div key={s.title} className="rounded-2xl border border-border bg-card p-6 shadow-card sm:p-7">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <s.icon className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-lg font-semibold">{s.title}</h2>
            </div>
            <ul className="mt-4 space-y-2.5">
              {s.points.map((p) => (
                <li key={p} className="flex gap-2.5 text-sm leading-relaxed text-muted-foreground">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                  {p}
                </li>
              ))}
            </ul>
          </div>
        ))}

        <div className="rounded-2xl border border-border bg-card p-7 text-center shadow-card">
          <Trash2 className="mx-auto h-6 w-6 text-muted-foreground" />
          <h2 className="mt-3 text-lg font-semibold">Questions about your data?</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Write to us — our team responds within 24 hours.
          </p>
          <a href="mailto:outreachai.team@gmail.com?subject=Security%20question">
            <Button className="mt-5 bg-gradient-primary">Contact us</Button>
          </a>
        </div>

        <p className="pt-2 text-center text-xs text-muted-foreground">
          Read also our{" "}
          <Link to="/privacy" className="underline hover:text-foreground">Privacy Policy</Link> and{" "}
          <Link to="/terms" className="underline hover:text-foreground">Terms of Service</Link>.
        </p>
      </section>
    </div>
  );
}
