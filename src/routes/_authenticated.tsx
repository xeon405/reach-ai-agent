import { createFileRoute, Outlet, useNavigate, Link, useRouterState } from "@tanstack/react-router";
import { useLang } from "@/lib/i18n";import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { LayoutDashboard, Users, Megaphone, Mail, CreditCard, Settings, LogOut, Ellipsis } from "lucide-react";
import { Logo } from "@/components/Logo";
import { SupportChat } from "@/components/support-chat";
import { ThemeToggle } from "@/components/theme-provider";
import { NotificationBell } from "@/components/notification-bell";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

const nav = [
  { tKey: "app_dash", url: "/dashboard", icon: LayoutDashboard },
  { tKey: "app_leads", url: "/leads", icon: Users },
  { tKey: "app_campaigns", url: "/campaigns", icon: Megaphone },
  { tKey: "app_emails", url: "/emails", icon: Mail },
  { tKey: "app_billing", url: "/billing", icon: CreditCard },
  { tKey: "app_settings", url: "/settings", icon: Settings },
] as const;

const pageTitles: Array<[string, string]> = [
  ["/dashboard", "Dashboard"],
  ["/leads", "Leads"],
  ["/campaigns", "Campaigns"],
  ["/emails", "Emails"],
  ["/billing", "Billing"],
  ["/settings", "Settings"],
];

function isActive(path: string, url: string) {
  return path === url || path.startsWith(url + "/");
}

function AuthenticatedLayout() {
  const { t } = useLang();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const currentTitle = pageTitles.find(([p]) => path === p)?.[1]
    ?? pageTitles.find(([p]) => path.startsWith(p + "/"))?.[1]
    ?? "OutshipAi";
  const { autoSync } = usePushNotifications();
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  // Keep any existing push subscription registered on this device in sync.
  useEffect(() => {
    if (user) autoSync();
  }, [user, autoSync]);

  // Onboarding guard: redirect to /onboarding if profile is incomplete
  useEffect(() => {
    if (loading || !user) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("onboarded")
        .eq("id", user.id)
        .single();
      if (!cancelled && data && !data.onboarded) {
        navigate({ to: "/onboarding" });
      }
    })();
    return () => { cancelled = true; };
  }, [loading, user, navigate]);

  if (loading || !user) {
    return (
      <div className="flex h-dvh w-full bg-background">
        <div className="hidden w-60 shrink-0 flex-col border-r border-neutral-800 bg-neutral-950 p-4 lg:flex">
          <Skeleton className="mb-6 h-8 w-32 bg-white/10" />
          <div className="space-y-2">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-9 w-full bg-white/10" />
            ))}
          </div>
        </div>
        <div className="flex-1 p-8">
          <Skeleton className="mb-8 h-7 w-40" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-36 w-full" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  async function signOut() {
    await supabase.auth.signOut();
    toast.success("Signed out");
    navigate({ to: "/" });
  }

  const desktopItems = nav.slice(0, 4);
  const moreItems = nav.slice(4);

  return (
    <div className="flex h-dvh w-full min-w-0 overflow-hidden bg-background">
      {/* Desktop dark sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-neutral-800 bg-neutral-950 text-neutral-400 lg:flex">
        <div className="flex h-14 shrink-0 items-center px-4">
          <Link to="/dashboard" className="flex items-center gap-2">
            <Logo className="text-white" />
          </Link>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
          {nav.map((item) => (
            <Link
              key={item.tKey}
              to={item.url}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                isActive(path, item.url)
                  ? "bg-white/10 text-white"
                  : "hover:bg-white/5 hover:text-neutral-200"
              }`}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{t(item.tKey)}</span>
            </Link>
          ))}
        </nav>
        <div className="shrink-0 border-t border-neutral-800 p-2">
          <div className="truncate px-3 pb-1.5 pt-1 text-xs text-neutral-500">{user.email}</div>
          <button
            onClick={signOut}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-white/5 hover:text-neutral-200"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top app bar */}
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-muted/40 px-4">
          <Link to="/dashboard" className="lg:hidden">
            <Logo className="h-6 scale-90 origin-left" />
          </Link>
          <span className="truncate text-sm font-semibold">{currentTitle}</span>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <NotificationBell />
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto p-4 pb-24 md:p-6 lg:pb-6">
          <Outlet />
        </main>

        {/* Mobile bottom tab bar */}
        <nav className="shrink-0 border-t border-border bg-background pb-[env(safe-area-inset-bottom)] lg:hidden">
          {moreOpen && (
            <>
              <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setMoreOpen(false)} />
              <div className="fixed inset-x-3 bottom-20 z-50 overflow-hidden rounded-xl border border-border bg-popover p-2 shadow-xl">
                {moreItems.map((item) => (
                  <Link
                    key={item.tKey}
                    to={item.url}
                    onClick={() => setMoreOpen(false)}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${
                      isActive(path, item.url) ? "bg-accent text-accent-foreground" : "hover:bg-accent/60"
                    }`}
                  >
                    <item.icon className="h-4 w-4" />
                    {t(item.tKey)}
                  </Link>
                ))}
                <button
                  onClick={() => { setMoreOpen(false); signOut(); }}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-destructive hover:bg-accent/60"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </div>
            </>
          )}
          <div className="grid grid-cols-5">
            {desktopItems.map((item) => (
              <Link
                key={item.tKey}
                to={item.url}
                className={`flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium ${
                  isActive(path, item.url) ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <item.icon className="h-5 w-5" />
                <span>{t(item.tKey)}</span>
              </Link>
            ))}
            <button
              onClick={() => setMoreOpen((v) => !v)}
              className={`flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium ${
                moreItems.some((i) => isActive(path, i.url)) ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <Ellipsis className="h-5 w-5" />
              <span>More</span>
            </button>
          </div>
        </nav>
      </div>

      <SupportChat />
    </div>
  );
}