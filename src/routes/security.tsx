import { createFileRoute, Link } from "@tanstack/react-router";
import { EnOnlyNotice } from "@/components/EnOnlyNotice";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/site-header";
import { ShieldCheck, Lock, KeyRound, Trash2, Eye, FileJson } from "lucide-react";

export const Route = createFileRoute("/security")({
  head: () => ({
    meta: [
      { title: "Security & Privacy — No inbox access | OutshipAi" },
      {
        name: "description",
        content:
          "OutshipAi never accesses your inbox: no OAuth, no mailbox permissions, no email password. See how your data is protected with RLS storage, export and delete.",
      },
    ],
  }),
  component: SecurityPage,
});

const SECTIONS = [
  {
    icon: KeyRound,
    title: "No inbox access. Ever.",
    points: [
      "OutshipAi never connects to your email account and never asks for your Google password.",
      "We request no mailbox permissions — there is no OAuth token, so there is nothing to leak or revoke.",
      "Emails send from your own OutshipAi sending address on a domain we authenticate with DKIM and SPF.",
      "Replies arrive through our own inbound webhook, not by reading anyone's inbox.",
    ],
  },
  {
    icon: Lock,
    title: "How your data is protected",
    points: [
      "Your account data and sending history are stored with Row Level Security, scoped strictly to your user id.",
      "Your login can only read your own data — not from the app, not from the API, not with browser trickery.",
      "Only the server-side sending engine writes to the send queue, and only for the emails YOU ask it to send.",
      "Sender reputation is protected with warm-up caps and automatic bounce/complaint suppression.",
    ],
  },
  {
    icon: Eye,
    title: "What we see — and what we don't",
    points: [
      "Stored: your account email, your settings, the contact lists you create, the subject and body of every email your agent sends, and reply sentiment labels.",
      "NOT stored: any email password, emails from other senders in your inbox (we can't see them), your contacts outside our system, or your browsing history.",
      "We never sell, rent, or share your data with third parties. Period.",
    ],
  },
  {
    icon: FileJson,
    title: "Your data belongs to you",
    points: [
      "Export everything as JSON: Settings → Download my data. It's a single click, no support ticket needed.",
      "Permanent deletion: Settings → Danger zone → Delete account removes your profile, contacts and email history in one shot.",
      "Anyone who unsubscribes is permanently blocked from everything you send, automatically.",
    ],
  },
  {
    icon: ShieldCheck,
    title: "Built-in compliance",
    points: [
      "Every email we send includes a working unsubscribe path (reply-to opt-out honored automatically).",
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
      <SiteHeader />

      <section className="mx-auto max-w-3xl px-4 pb-10 pt-8 text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-primary shadow-glow">
          <ShieldCheck className="h-8 w-8 text-primary-foreground" />
        </div>
        <h1 className="font-display text-4xl font-black tracking-tight sm:text-5xl">
          Security at OutshipAi
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
          We never connect to your email account. Here is exactly how your data is protected — in
          plain English.
        </p>
      </section>

      <section className="mx-auto max-w-3xl space-y-5 px-4 pb-20">
        {SECTIONS.map((s) => (
          <div
            key={s.title}
            className="rounded-2xl border border-border bg-card p-6 shadow-card sm:p-7"
          >
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
          <a href="mailto:outshipai@gmail.com?subject=Security%20question">
            <Button className="mt-5 bg-gradient-primary">Contact us</Button>
          </a>
        </div>

        <p className="pt-2 text-center text-xs text-muted-foreground">
          Read also our{" "}
          <Link to="/privacy" className="underline hover:text-foreground">
            Privacy Policy
          </Link>{" "}
          and{" "}
          <Link to="/terms" className="underline hover:text-foreground">
            Terms of Service
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
