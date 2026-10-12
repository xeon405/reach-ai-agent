import { createFileRoute } from "@tanstack/react-router";
import { EnOnlyNotice } from "@/components/EnOnlyNotice";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/site-header";
import { Activity, RefreshCw, CheckCircle2, XCircle, Loader2 } from "lucide-react";

export const Route = createFileRoute("/status")({
  head: () => ({
    meta: [
      { title: "System Status — OutshipAi" },
      {
        name: "description",
        content:
          "Live status of OutshipAi services: website, login, database, AI sending engine, reply engine, and follow-up autopilot.",
      },
    ],
  }),
  component: StatusPage,
});

type CheckState = "checking" | "up" | "down";

const FN = "https://zvohdvopmvzsujktrdmu.supabase.co/functions/v1";

function StatusPage() {
  const [rows, setRows] = useState<{ name: string; detail: string; state: CheckState; ms: number | null }[]>([
    { name: "Website", detail: "Landing page & app shell", state: "checking", ms: null },
    { name: "Authentication", detail: "Supabase GoTrue login service", state: "checking", ms: null },
    { name: "Database", detail: "Emails, contacts, email history", state: "checking", ms: null },
    { name: "AI Sending Engine", detail: "email sending service", state: "checking", ms: null },
    { name: "AI Reply Engine", detail: "reply classification & drafts", state: "checking", ms: null },
    { name: "Follow-up Autopilot", detail: "scheduled follow-up runner", state: "checking", ms: null },
  ]);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);

  async function ping(index: number, fn: () => Promise<unknown>) {
    const t0 = performance.now();
    try {
      await fn();
      setRows((r) => r.map((x, i) => (i === index ? { ...x, state: "up", ms: Math.round(performance.now() - t0) } : x)));
    } catch {
      setRows((r) => r.map((x, i) => (i === index ? { ...x, state: "down", ms: null } : x)));
    }
  }

  async function runAll() {
    setRows((r) => r.map((x) => ({ ...x, state: "checking" as const, ms: null })));
    const key = { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string, Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` };

    await Promise.allSettled([
      ping(0, () => fetch(window.location.origin).then((res) => { if (!res.ok) throw new Error(); })),
      ping(1, () => fetch("https://zvohdvopmvzsujktrdmu.supabase.co/auth/v1/health", { headers: key }).then((res) => { if (!res.ok) throw new Error(); })),
      ping(2, async () => { await supabase.rpc("public_stats"); }),
      ping(3, () => fetch(`${FN}/send-worker?health=1`).then((res) => { if (!res.ok) throw new Error(); })),
      ping(4, () => fetch(`${FN}/inbox-agent?health=1`).then((res) => { if (!res.ok) throw new Error(); })),
      ping(5, () => fetch(`${FN}/send-worker?health=1&engine=followups`).then((res) => { if (!res.ok) throw new Error(); })),
    ]);
    setCheckedAt(new Date());
  }

  useEffect(() => {
    void runAll();
    const t = setInterval(() => void runAll(), 60_000);
    return () => clearInterval(t);
  }, []);

  const allUp = rows.every((r) => r.state === "up");

  return (
    <div className="min-h-screen bg-background">
        <EnOnlyNotice />
      <SiteHeader />

      <section className="mx-auto max-w-2xl px-4 pt-10 text-center">
        <div
          className={`mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl ${
            allUp ? "bg-success/15" : checkedAt ? "bg-warning/15" : "bg-primary/10"
          }`}
        >
          <Activity className={`h-8 w-8 ${allUp ? "text-success" : checkedAt ? "text-warning" : "text-primary"}`} />
        </div>
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          {checkedAt === null ? "Checking systems…" : allUp ? "All systems operational" : "Partial degradation"}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">Live health checks · auto-refreshes every 60 seconds</p>
        <Button variant="outline" size="sm" className="mt-4" onClick={() => void runAll()}>
          <RefreshCw className="mr-2 h-3.5 w-3.5" /> Refresh now
        </Button>
      </section>

      <section className="mx-auto max-w-2xl space-y-3 px-4 pb-24 pt-10">
        {rows.map((r) => (
          <div key={r.name} className="flex items-center justify-between rounded-xl border border-border bg-card px-5 py-4 shadow-card">
            <div className="flex items-center gap-4">
              {r.state === "up" && <CheckCircle2 className="h-5 w-5 text-success" />}
              {r.state === "down" && <XCircle className="h-5 w-5 text-destructive" />}
              {r.state === "checking" && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
              <div>
                <div className="text-sm font-semibold">{r.name}</div>
                <div className="text-xs text-muted-foreground">{r.detail}</div>
              </div>
            </div>
            <div className="text-xs font-medium text-muted-foreground">
              {r.state === "up" ? `Operational${r.ms !== null ? ` · ${r.ms}ms` : ""}` : r.state === "down" ? "Investigating" : "…"}
            </div>
          </div>
        ))}
        <p className="pt-4 text-center text-xs text-muted-foreground">
          Questions? Contact our team — we respond within 24 hours.
        </p>
      </section>
    </div>
  );
}
