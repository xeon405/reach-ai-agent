import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Activity, Loader2, ShieldCheck } from "lucide-react";

type Health = {
  plan: string;
  planDaily: number;
  cap: number;
  usedToday: number;
  phase: "ramp" | "steady" | "recovery";
  measured: boolean;
  lastMeasuredAt: string | null;
  sends7d: number;
  bounces7d: number;
  unsubs7d: number;
  replies7d: number;
  bounceRate7d: number;
  unsubRate7d: number;
  error?: string;
};

const PHASE: Record<string, { label: string; cls: string }> = {
  ramp: { label: "Ramp", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
  steady: { label: "Steady", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" },
  recovery: { label: "Brakes on", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
};

function pct(n: number): string {
  return `${Math.round(n * 1000) / 10}%`;
}

/** Visible sending health: how much is going out, how much is bouncing, and
 *  the cap the brakes allow today. The data is measured, not estimated. */
export function SendingHealthCard() {
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    supabase.functions
      .invoke("sender-health-card")
      .then(({ data, error }) => {
        if (!alive) return;
        if (error || data?.error) {
          setHealth(null);
        } else {
          setHealth(data as Health);
        }
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const remaining = health ? Math.max(0, health.cap - health.usedToday) : 0;
  const progress = health && health.cap > 0 ? Math.min(100, Math.round((health.usedToday / health.cap) * 100)) : 0;
  const phase = PHASE[health?.phase ?? "ramp"] ?? PHASE.ramp;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <Activity className="mt-0.5 h-4 w-4 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">Sending health</p>
            <p className="text-xs text-muted-foreground">A gradual send ramp with automatic brakes.</p>
          </div>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${phase.cls}`}>
          {phase.label}
        </span>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-6 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking your mailbox…
        </div>
      ) : !health ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Health data is unavailable right now. Sending still follows the ramp and the brakes.
        </p>
      ) : (
        <>
          <div className="mt-4">
            <div className="flex items-baseline justify-between text-xs">
              <span className="font-medium">
                Today: {health.usedToday} of {health.cap}
              </span>
              <span className="text-muted-foreground">
                {remaining} left{health.cap >= health.planDaily ? " · full plan volume" : ""}
              </span>
            </div>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-muted/40 p-2">
              <p className="text-base font-semibold">{health.sends7d}</p>
              <p className="text-[11px] text-muted-foreground">Sent · 7 days</p>
            </div>
            <div className="rounded-lg bg-muted/40 p-2">
              <p className="text-base font-semibold">
                {health.bounces7d}
                {health.sends7d > 0 && (
                  <span className="ml-1 text-[11px] font-normal text-muted-foreground">{pct(health.bounceRate7d)}</span>
                )}
              </p>
              <p className="text-[11px] text-muted-foreground">Bounces · 7 days</p>
            </div>
            <div className="rounded-lg bg-muted/40 p-2">
              <p className="text-base font-semibold">
                {health.unsubs7d}
                {health.sends7d > 0 && (
                  <span className="ml-1 text-[11px] font-normal text-muted-foreground">{pct(health.unsubRate7d)}</span>
                )}
              </p>
              <p className="text-[11px] text-muted-foreground">Unsubscribes · 7 days</p>
            </div>
          </div>

          <div className="mt-3 flex items-start gap-1.5 text-[11px] text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" />
            <span>
              {health.phase === "recovery"
                ? "Bounces or unsubscribes crossed the line, so the cap is cut and grows back only after clean days."
                : health.measured
                  ? `Last measured ${new Date(health.lastMeasuredAt ?? "").toLocaleDateString()}. Above 3% bounces or 1% unsubscribes, the brakes cut the cap.`
                  : "We start at 5 a day and raise it while bounces and unsubscribes stay low. Above 3% bounces or 1% unsubscribes, the brakes cut the cap."}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
