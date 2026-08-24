import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-provider";
import { HeartHandshake, CheckCircle2, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/honesty")({
  component: HonestyPage,
});

const CHARTER = [
  {
    rule: "We disclose our flaws before you pay",
    detail:
      "Below is our complete list of current limitations. Read them before you buy — we would rather lose a sale than mislead a customer.",
  },
  {
    rule: "We hide nothing",
    detail:
      "Our live statistics come straight from production data — real sends, real replies, updated continuously. If numbers look small, it's because we are young and honest, not because we rounded up.",
    link: { to: "/stats", label: "See the real numbers" },
  },
  {
    rule: "We never exaggerate",
    detail:
      "Every claim on this site maps to a shipped feature you can test today. Our ROI calculator is labelled as an estimate based on typical performance — your results may be better or worse.",
  },
  {
    rule: "We take no false oaths",
    detail:
      "No fabricated testimonials. No fake user counters. No invented press logos. No countdown timers pretending things expire. What you see is everything there is.",
  },
  {
    rule: "We honor our commitments",
    detail:
      "Support answers within 24 hours. Paid features work as described. If we ever fail this standard, tell us and we will make it right — including refunds.",
    link: { to: "/terms", label: "Read our Terms" },
  },
  {
    rule: "We give exact measures",
    detail:
      "Every plan states its exact daily and monthly email caps. Your agent hard-stops at the limit — you will never be silently throttled or surprised with overage charges.",
  },
  {
    rule: "Our pricing is fully upfront",
    detail:
      "The price on the card is the entire price. All taxes and fees are shown clearly before you confirm payment. No hidden charges, no bait-and-switch.",
    link: { to: "/billing", label: "See plans" },
  },
  {
    rule: "We do not manipulate markets",
    detail:
      "No artificial scarcity ('only 3 spots left!'), no fake discounts from inflated 'original' prices, no dark patterns at checkout.",
  },
  {
    rule: "Your right of return is guaranteed",
    detail:
      "14-day money-back guarantee, no questions asked — even without a hidden defect. Email us within 14 days of payment and receive a full refund.",
    link: { to: "/terms", label: "Refund policy" },
  },
  {
    rule: "Reviews will only ever be real",
    detail:
      "When we add customer reviews, they will come from verified paid accounts only. We will never delete a genuine negative review, incentivise positive ones, or seed fake testimonials. Until real customers exist, we show no reviews at all.",
  },
  {
    rule: "Your data is a sacred trust",
    detail:
      "We never sell, rent, or share your data. Gmail tokens live in an isolated vault. Export or permanently delete everything with one click, anytime.",
    link: { to: "/security", label: "How we protect data" },
  },
];

const LIMITATIONS = [
  "AI-written drafts are strong but not perfect — we recommend reading the one-click AI replies before sending them.",
  "Email opens are not tracked yet; replies, bounces and sentiment are tracked accurately.",
  "Inbox placement depends partly on your own domain reputation. Our warm-up ramp protects you, but no tool can guarantee 100% inbox delivery.",
  "The Arabic experience currently covers the marketing site and emails to Arab leads; the app interior is English-only for now.",
  "Support is handled by our team — we respond within 24 hours, occasionally slightly slower across time zones.",
  "Scheduled sending delivers into each lead's local business morning; exact minute-level timing cannot be controlled.",
  "This is a young product. Some rough edges exist. We fix reported issues fast and publicly credit reporters.",
];

function HonestyPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5">
        <Link to="/" className="text-lg font-bold">Outreach<span className="text-primary">AI</span></Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link to="/auth"><Button variant="outline" size="sm">Open app</Button></Link>
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-4 pb-10 pt-8 text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-primary shadow-glow">
          <HeartHandshake className="h-8 w-8 text-primary-foreground" />
        </div>
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">Our Honesty Charter</h1>
        <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
          Ten binding rules we hold ourselves to — written down so you can hold us to them.
        </p>
      </section>

      <section className="mx-auto max-w-3xl space-y-4 px-4 pb-16">
        {CHARTER.map((c, i) => (
          <div key={c.rule} className="rounded-2xl border border-border bg-card p-6 shadow-card">
            <div className="flex items-start gap-4">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-success/15">
                <CheckCircle2 className="h-4 w-4 text-success" />
              </div>
              <div className="min-w-0">
                <h2 className="font-semibold">{i + 1}. {c.rule}</h2>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{c.detail}</p>
                {c.link && (
                  <Link to={c.link.to} className="mt-2 inline-block text-sm font-medium text-primary underline underline-offset-4 hover:opacity-80">
                    {c.link.label} →
                  </Link>
                )}
              </div>
            </div>
          </div>
        ))}

        <div className="rounded-2xl border border-warning/40 bg-warning/5 p-7">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-warning" />
            <h2 className="text-lg font-semibold">Full defect disclosure — what we can't do yet</h2>
          </div>
          <ul className="mt-4 space-y-2.5">
            {LIMITATIONS.map((l) => (
              <li key={l} className="flex gap-2.5 text-sm leading-relaxed text-muted-foreground">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />
                {l}
              </li>
            ))}
          </ul>
          <p className="mt-5 border-t border-warning/20 pt-4 text-xs text-muted-foreground">
            This page is updated whenever a limitation is fixed or discovered. Last update: August 2026.
          </p>
        </div>

        <p className="pt-2 text-center text-xs text-muted-foreground">
          Found us falling short of any rule? <a href="mailto:outreachai.team@gmail.com?subject=Falling%20short%20of%20the%20Charter" className="underline hover:text-foreground">contact our team</a> and we will make it right.
        </p>
      </section>
    </div>
  );
}
