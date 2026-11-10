import { createFileRoute, Link } from "@tanstack/react-router";
import { EnOnlyNotice } from "@/components/EnOnlyNotice";
import { SiteHeader } from "@/components/site-header";
import { Ban, Check, Compass, Inbox, Mail, Search } from "lucide-react";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About OutshipAi — Who We Are & What We Refuse To Do" },
      {
        name: "description",
        content:
          "OutshipAi is an AI sales agent for people without a sales department. How it started, what it actually does, what we refuse to do, and how we make money.",
      },
    ],
  }),
  component: AboutPage,
});

const STEPS = [
  {
    icon: Search,
    title: "Find real businesses",
    body: "We find real companies — a name, a category, and usually a website. We check the site before we write to it. No purchased lists, no scraped consumer emails, no guessing an address into existence.",
  },
  {
    icon: Mail,
    title: "Write one email at a time",
    body: "Each email is built from that business's own details, not a template with a name dropped in. The rule is enforced in code, not in a prompt: every sentence must point at a stored fact with a quote and a source link. If a sentence has no fact behind it, we remove it before you ever see the draft. No fake prices, no invented phone numbers, no made-up results.",
  },
  {
    icon: Inbox,
    title: "Answer, then stop when told",
    body: "When someone replies, the agent answers questions, handles objections, and points to your booking link. If they ask for a human, it hands over. If they say stop, it stops immediately and suppresses them — one click, permanent.",
  },
];

const REFUSALS = [
  "We won't invent facts in an email — not a price, not a phone number, not a client name.",
  "We won't buy or sell contact lists. Every address comes from a business that exists and is checked.",
  "We won't send from a throwaway domain or disguise who is writing.",
  "We won't add a fee at checkout that wasn't on the page you read.",
  "We won't hold your data hostage — export is one click, deletion is one click.",
  "We won't delete anything without telling you exactly what goes with it.",
  "We won't promise a number of meetings or replies. Nobody honest can.",
];

const GOOD_FIT = [
  "Solo founders and small teams selling to other businesses.",
  "Agencies that want outreach running without hiring a salesperson.",
  "People who would rather send 50 researched emails than 5,000 identical ones.",
  "Anyone whose own domain reputation matters to them.",
];

const BAD_FIT = [
  "Anyone who wants maximum volume at any cost.",
  "Consumer lists, bought databases, or anything B2C at scale.",
  "A \"guaranteed meetings\" button — we don't sell outcomes.",
  "Companies wanting us to send from a domain they don't own.",
];

function AboutPage() {
  return (
    <div className="min-h-screen bg-background">
      <EnOnlyNotice />
      <SiteHeader />

      <section className="mx-auto max-w-3xl px-4 pb-10 pt-8 text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-primary shadow-glow">
          <Compass className="h-8 w-8 text-primary-foreground" />
        </div>
        <h1 className="font-display text-4xl font-black tracking-tight sm:text-5xl">About OutshipAi</h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
          An AI sales agent for people who don't have a sales department.
        </p>
      </section>

      <section className="mx-auto max-w-2xl space-y-4 px-4 pb-12">
        <h2 className="font-display text-2xl font-bold tracking-tight">Why this exists</h2>
        <p className="leading-relaxed text-muted-foreground">
          Most good products don't fail because they're bad. They fail because nobody hears about
          them. Reaching customers usually means cold email — and doing it well is a full-time job:
          find the right businesses, research each one, write something a human would actually
          answer, follow up without nagging, and reply fast when someone writes back.
        </p>
        <p className="leading-relaxed text-muted-foreground">
          Big companies hire a team for that. Small ones either skip it, or buy a tool that fires ten
          thousand identical emails, burns the sending domain, and teaches everyone on the other end
          to ignore the next one.
        </p>
        <p className="leading-relaxed text-muted-foreground">
          OutshipAi is meant to be the third option: one agent that does the whole job — slowly,
          carefully, and at a price a small business can actually pay.
        </p>
      </section>

      <section className="mx-auto max-w-5xl px-4 pb-14">
        <h2 className="mb-6 text-center font-display text-2xl font-bold tracking-tight">
          What it actually does
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.title} className="rounded-2xl border border-border bg-card p-6 shadow-card">
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <s.icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 pb-14">
        <h2 className="font-display text-2xl font-bold tracking-tight">What we refuse to do</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          These are the lines that decide whether a product like this is worth using. They aren't
          aspirations — they're rules built into the software.
        </p>
        <ul className="mt-5 space-y-3">
          {REFUSALS.map((r) => (
            <li key={r} className="flex gap-3 rounded-xl border border-border bg-card p-4">
              <Ban className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <span className="text-sm leading-relaxed text-muted-foreground">{r}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mx-auto grid max-w-5xl gap-4 px-4 pb-14 md:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-7 shadow-card">
          <h2 className="font-semibold">Who it's for</h2>
          <ul className="mt-3 space-y-2">
            {GOOD_FIT.map((g) => (
              <li key={g} className="flex gap-2 text-sm leading-relaxed text-muted-foreground">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                <span>{g}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border border-border bg-card p-7 shadow-card">
          <h2 className="font-semibold">Who it isn't for</h2>
          <ul className="mt-3 space-y-2">
            {BAD_FIT.map((b) => (
              <li key={b} className="flex gap-2 text-sm leading-relaxed text-muted-foreground">
                <Ban className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/60" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-3xl space-y-4 px-4 pb-14">
        <div className="rounded-2xl border border-border bg-card p-7 shadow-card">
          <h2 className="font-semibold">How we make money</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            One subscription, per account, covering one connected email address. There are no
            per-contact, per-lead or per-email charges, no "credits" that quietly expire, and no
            setup fee. Self-serve plans are{" "}
            <Link to="/" hash="pricing" className="text-primary underline underline-offset-4">
              $37, $79 or $149 per month
            </Link>{" "}
            depending on volume, and you can cancel at any time. If we run it for you as a service,
            that's priced separately and stated plainly on the{" "}
            <Link to="/agency" className="text-primary underline underline-offset-4">
              agency page
            </Link>
            . If something goes wrong, the{" "}
            <Link to="/refunds" className="text-primary underline underline-offset-4">
              refund policy
            </Link>{" "}
            is short and readable.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            One account sends from one address. A second address is a second account, not an add-on
            — the limit exists so one plan can't be split across several mailboxes.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Free is <strong className="text-foreground">50 emails in total</strong>, up to 10 a day,
            with no card and no expiry. It is finite on purpose: unlimited free sending is what
            spammers use, and their reputation damage follows every other customer's mail into the
            spam folder. We also allow one free trial per business, so a second account claiming the
            same business name and address has to confirm it owns that business's domain.
          </p>
        </div>

        <div className="rounded-2xl border border-primary/30 bg-primary/5 p-7">
          <h2 className="font-semibold">We publish our flaws</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Our{" "}
            <Link to="/honesty" className="text-primary underline underline-offset-4">
              Honesty Charter
            </Link>{" "}
            lists what the product can't do yet, with the real numbers, in public. It's the page most
            companies would never write. We'd rather you know the limits before you pay than discover
            them after.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-2xl px-4 pb-16 text-center">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Questions about your data? Read{" "}
          <Link to="/security" className="text-primary underline underline-offset-4">
            Security
          </Link>{" "}
          and{" "}
          <Link to="/privacy" className="text-primary underline underline-offset-4">
            Privacy
          </Link>
          .
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          Or write to{" "}
          <a href="mailto:outshipai@gmail.com" className="underline hover:text-foreground">
            outshipai@gmail.com
          </a>{" "}
          — a person reads it, usually within 24 hours.
        </p>
      </section>
    </div>
  );
}
