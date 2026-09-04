import { createFileRoute, Link } from "@tanstack/react-router";
import { EnOnlyNotice } from "@/components/EnOnlyNotice";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-provider";
import { Undo2, ShieldCheck, Clock } from "lucide-react";

export const Route = createFileRoute("/refunds")({
  component: RefundsPage,
});

function RefundsPage() {
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

      <section className="mx-auto max-w-2xl px-4 pb-10 pt-8 text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-primary shadow-glow">
          <Undo2 className="h-8 w-8 text-primary-foreground" />
        </div>
        <h1 className="text-4xl font-extrabold tracking-tight">Return &amp; Refund Policy</h1>
        <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
          Short version: if you're not happy, you get your money back. Here are the exact terms.
        </p>
      </section>

      <section className="mx-auto max-w-2xl space-y-4 px-4 pb-20">
        <div className="rounded-2xl border border-success/30 bg-success/5 p-6">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-success" />
            <h2 className="font-semibold">14-day money-back guarantee</h2>
          </div>
          <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
            Every paid plan includes a full refund within <strong>14 calendar days of payment</strong> —
            no questions asked, no reason required, no forms to fight with. One email is enough.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-card">
          <h2 className="font-semibold">Hidden-defect guarantee (anytime)</h2>
          <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
            If a flaw exists that we failed to disclose — a feature that doesn't work as described,
            a limitation not listed on our{" "}
            <Link to="/honesty" className="text-primary underline underline-offset-4">Honesty Charter</Link> —
            you are entitled to a <strong>full refund at any point during your subscription</strong>,
            even beyond the 14-day window. What we know, you know; what we missed, we pay for.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-card">
          <div className="flex items-center gap-3">
            <Clock className="h-5 w-5 text-primary" />
            <h2 className="font-semibold">Timelines &amp; process</h2>
          </div>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li>• <strong>Request:</strong> email <a href="mailto:outreachai.team@gmail.com?subject=Refund%20request" className="text-primary underline underline-offset-4">outreachai.team@gmail.com</a> with the subject "Refund request"</li>
            <li>• <strong>Response:</strong> within 24 hours with confirmation</li>
            <li>• <strong>Processing:</strong> refunds are issued to your original payment method within 5–10 business days </li>
            <li>• <strong>Your data:</strong> refunding never locks you out early — your plan stays active until the period you paid for ends, and you can export or delete your data anytime</li>
          </ul>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-card">
          <h2 className="font-semibold">Cancelling without a refund</h2>
          <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
            You can cancel anytime from Settings → Billing. Cancellation stops all future charges immediately;
            nothing else changes until your paid period ends.
          </p>
        </div>

        <p className="pt-2 text-center text-xs text-muted-foreground">
          This policy is part of our{" "}
          <Link to="/terms" className="underline hover:text-foreground">Terms of Service</Link> and our{" "}
          <Link to="/honesty" className="underline hover:text-foreground">Honesty Charter</Link>.
        </p>
      </section>
    </div>
  );
}
