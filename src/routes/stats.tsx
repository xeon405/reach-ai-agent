import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Activity, Flame, Users } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/stats")({
  head: () => ({
    meta: [
      { title: "Live Stats — OutshipAi" },
      {
        name: "description",
        content: "Radical transparency: live numbers from the OutshipAi platform — agents running, cold emails sent, replies detected.",
      },
    ],
  }),
  component: StatsPage,
});

function StatCard({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-card">
      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
        {icon}
      </div>
      <div className="text-4xl font-bold tracking-tight md:text-5xl">{value}</div>
      <div className="mt-1 text-sm text-muted-foreground">{label}</div>
    </div>
  );
}

function StatsPage() {
  const [stats, setStats] = useState<{ emails_sent: number; agents: number; replies_detected?: number } | null>(null);

  useEffect(() => {
    supabase.rpc("public_stats").then(({ data }) => {
      if (data) setStats(Array.isArray(data) ? data[0] as { emails_sent: number; agents: number; replies_detected?: number } : data as { emails_sent: number; agents: number; replies_detected?: number });
    });
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/50">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Logo />
          <Button asChild size="sm" className="bg-gradient-primary shadow-glow">
            <Link to="/auth">Start free</Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-14">
        <div className="text-center">
          <h1 className="flex items-center justify-center gap-2 text-4xl font-bold tracking-tight md:text-5xl">
            <Activity className="h-9 w-9 text-primary" /> Live stats
          </h1>
          <p className="mt-3 text-muted-foreground">Real numbers, updated the moment they change. No marketing math.</p>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-3">
          <StatCard icon={<Users className="h-5 w-5" />} value={String(stats?.agents ?? "—")} label="AI agents running" />
          <StatCard icon={<Flame className="h-5 w-5" />} value={String(stats?.emails_sent ?? "—")} label="Cold emails sent" />
          <StatCard icon={<Activity className="h-5 w-5" />} value={String(stats?.replies_detected ?? "—")} label="Replies detected & sorted" />
        </div>

        <section className="mt-16 rounded-2xl border border-primary/30 bg-primary/5 p-8 text-center">
          <h2 className="text-2xl font-bold">Your agent could be part of these numbers</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
            Free to start, no credit card, delete your data anytime. The stats above include every send our community's agents make.
          </p>
          <Button asChild size="lg" className="mt-5 bg-gradient-primary shadow-glow">
            <Link to="/auth">Launch my agent</Link>
          </Button>
        </section>
      </main>

      <footer className="border-t border-border/50 py-6 text-center text-xs text-muted-foreground">
        <Link to="/" className="hover:text-foreground">Home</Link>
        {" · "}
        <a href="/tools" className="hover:text-foreground">Free tools</a>
        {" · "}
        <a href="/terms" className="hover:text-foreground">Terms</a>
        {" · "}
        <a href="/privacy" className="hover:text-foreground">Privacy</a>
      </footer>
    </div>
  );
}
