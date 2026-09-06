import { createFileRoute, Link } from "@tanstack/react-router";
import { EnOnlyNotice } from "@/components/EnOnlyNotice";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-provider";
import { Compass } from "lucide-react";

export const Route = createFileRoute("/about")({
  component: AboutPage,
});

const PRINCIPLES = [
  {
    title: "Absolute honesty",
    body: "We publish our product's flaws on a public page. Our statistics come live from real data. If we ever fall short of a claim we made, we make it right — including refunds.",
  },
  {
    title: "Fair trade",
    body: "The price you see is the entire price. No hidden fees, no dynamic pricing tricks, no artificial scarcity. Plans state their exact limits and the system respects them — for you and for everyone.",
  },
  {
    title: "Mutual respect",
    body: "Your inbox, your data, your decision. Unsubscribing is one click. Exporting your data is one click. Deleting everything is one click. A business should be easy to leave — that's how trust is earned.",
  },
];

function AboutPage() {
  return (
    <div className="min-h-screen bg-background">
        <EnOnlyNotice />
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5">
        <Link to="/" className="text-lg font-bold">Outship<span className="text-primary">Ai</span></Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link to="/auth"><Button variant="outline" size="sm">Open app</Button></Link>
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-4 pb-10 pt-8 text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-primary shadow-glow">
          <Compass className="h-8 w-8 text-primary-foreground" />
        </div>
        <h1 className="font-display text-4xl font-black tracking-tight sm:text-5xl">About OutshipAi</h1>
        <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
          We build an AI sales agent so small teams can reach the world without hiring a sales department.
        </p>
      </section>

      <section className="mx-auto max-w-2xl px-4 pb-10">
        <p className="text-center text-lg leading-relaxed text-muted-foreground">
          OutshipAi started with a simple observation: great products lose to louder competitors
          because outreach is expensive, slow, and uncomfortable. We believed an AI agent — one
          that finds the right people, writes like a human, and respects every rule of good
          emailing — could level that field.
        </p>
      </section>

      <section className="mx-auto max-w-3xl space-y-4 px-4 pb-16">
        {PRINCIPLES.map((p) => (
          <div key={p.title} className="rounded-2xl border border-border bg-card p-7 shadow-card">
            <h2 className="font-semibold">{p.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{p.body}</p>
          </div>
        ))}

        <div className="rounded-2xl border border-primary/30 bg-primary/5 p-7 text-center">
          <p className="text-sm leading-relaxed text-muted-foreground">
            We run this business on a simple standard:{" "}
            <span className="font-semibold text-foreground">
              deal only in what you know, promise only what you deliver, and treat the other
              side the way you'd want to be treated.
            </span>{" "}
            That standard shows up in our{" "}
            <Link to="/honesty" className="text-primary underline underline-offset-4">Honesty Charter</Link>, our{" "}
            <Link to="/refunds" className="text-primary underline underline-offset-4">refund policy</Link>, and every
            email our agents send.
          </p>
        </div>

        <p className="pt-2 text-center text-xs text-muted-foreground">
          Questions? Our team responds at <a href="mailto:outreachai.team@gmail.com" className="underline hover:text-foreground">outreachai.team@gmail.com</a> within 24 hours.
        </p>
      </section>
    </div>
  );
}
