import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Bell, Check, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

type AlertRow = {
  id: number;
  lead_id: string | null;
  kind: string | null;
  title: string | null;
  body: string | null;
  priority: string | null;
  read: boolean | null;
  created_at: string | null;
};

/** A navigation target: path plus optional query, kept separate so the router
 *  never has to parse a query string out of the path itself. */
type Target = { to: string; search?: Record<string, string> };

/**
 * Where a notification should take the owner.
 *
 * The lead detail page is `/lead-edit/$leadId` -- there is no `/leads/:id`
 * route, so pointing there bounced the user to the home page. Alerts about a
 * known lead go to that lead; alerts about the account itself (Gmail token
 * lost, reputation degraded, a referral credit) have no lead to open, so they
 * go to the page where the owner can actually fix them.
 */
function routeFor(kind: string | null, leadId: string | null): Target {
  const lead = (): Target | null => (leadId ? { to: `/lead-edit/${leadId}` } : null);

  switch (kind) {
    // Conversations the agent handled or handed to the owner. When we know the
    // lead we deep-link to that exact thread so the owner lands on the message
    // the notification is about, not the top of an undifferentiated inbox.
    case "first_reply":
    case "reply":
    case "handoff":
    case "takeover":
    case "review":
    case "question":
    case "objection":
      return leadId ? { to: "/emails", search: { lead: leadId } } : { to: "/emails" };

    // A lead-level event: open that lead's history.
    case "booking":
    case "opt_out":
    case "bounce":
    case "unsubscribe":
    case "interested":
    case "not_interested":
      return lead() ?? { to: "/emails" };

    // Delivery / sending health: these are about the mailbox, not a thread.
    case "bounce_spike":
    case "reputation":
    case "warmup":
    case "daily_digest":
      return { to: "/emails" };

    // Account-level events with no lead attached.
    case "referral_reward":
      return { to: "/settings" };

    case "gmail_error":
    case "gmail_token":
    case "system":
      return { to: "/settings" };

    default:
      // Never silently dump the owner on the dashboard: prefer the lead, then
      // the inbox. Home is not a useful destination for any alert.
      return lead() ?? { to: "/emails" };
  }
}

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const secs = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h`;
  return `${Math.floor(secs / 86400)}d`;
}

export function NotificationBell({ className = "" }: { className?: string }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<AlertRow[]>([]);
  const [open, setOpen] = useState(false);
  const [ok, setOk] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from("owner_alerts")
        .select("id, lead_id, kind, title, body, priority, read, created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      if (data) setItems(data as AlertRow[]);
    } catch {
      setOk(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let disposed = false;
    load();
    const channel = supabase
      .channel("owner_alerts_live_" + user.id)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "owner_alerts",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const row = payload.new as AlertRow;
          setItems((prev) => [row, ...prev.filter((a) => a.id !== row.id)].slice(0, 50));
        }
      )
      .subscribe();
    return () => {
      disposed = true;
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, load]);

  const unread = items.filter((a) => !a.read).length;

  async function markRead(id: number, target: Target) {
    // Mark read first, then navigate. Persisting before the route change means
    // the badge is correct even if the navigation is interrupted.
    setItems((prev) => prev.map((a) => (a.id === id ? { ...a, read: true } : a)));
    await supabase.from("owner_alerts").update({ read: true }).eq("id", id);
    setOpen(false);
    navigate({ to: target.to, search: target.search as never });
  }

  async function markAllRead() {
    if (!user) return;
    setItems((prev) => prev.map((a) => ({ ...a, read: true })));
    await supabase.from("owner_alerts").update({ read: true }).eq("user_id", user.id);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn("relative", className)}
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-4 py-2">
          <span className="text-sm font-medium">Notifications</span>
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={markAllRead} disabled={unread === 0}>
            <CheckCheck className="h-3.5 w-3.5" />
            Mark all read
          </Button>
        </div>
        {!ok ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">Couldn't load notifications.</p>
        ) : items.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">No notifications yet.</p>
        ) : (
          <ScrollArea className="max-h-80">
            <ul className="divide-y">
              {items.map((a) => (
                <li key={a.id}>
                  <button
                    onClick={() => markRead(a.id, routeFor(a.kind, a.lead_id))}
                    className={cn(
                      "flex w-full items-start gap-2 px-4 py-3 text-left hover:bg-accent",
                      a.read ? "opacity-70" : ""
                    )}
                  >
                    <span
                      className={cn(
                        "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                        a.priority === "high" ? "bg-destructive" : a.priority === "medium" ? "bg-primary" : "bg-muted-foreground/40"
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-medium">{a.title}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(a.created_at)}</span>
                      </span>
                      {a.body && <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{a.body}</span>}
                    </span>
                    {!a.read && <Check className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />}
                  </button>
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
      </PopoverContent>
    </Popover>
  );
}