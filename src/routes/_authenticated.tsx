import { createFileRoute, Outlet, useNavigate, Link, useRouterState } from "@tanstack/react-router";
import { useLang } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import {
  LayoutDashboard,
  Users,
  Megaphone,
  Mail,
  CreditCard,
  Settings,
  LogOut,
  Ellipsis,
  Menu,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  Sparkles,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { SupportChat } from "@/components/support-chat";
import { ThemeToggle } from "@/components/theme-provider";
import { NotificationBell } from "@/components/notification-bell";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

const nav = [
  { tKey: "app_dash", url: "/dashboard", icon: LayoutDashboard },
  { tKey: "app_agent", url: "/agent", icon: Sparkles },
  { tKey: "app_leads", url: "/leads", icon: Users },
  { tKey: "app_campaigns", url: "/campaigns", icon: Megaphone },
  { tKey: "app_emails", url: "/emails", icon: Mail },
  { tKey: "app_billing", url: "/billing", icon: CreditCard },
  { tKey: "app_settings", url: "/settings", icon: Settings },
] as const;

const pageTitles: Array<[string, string]> = [
  ["/dashboard", "Dashboard"],
  ["/agent", "Agent"],
  ["/leads", "Contacts"],
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
  const currentTitle =
    pageTitles.find(([p]) => path === p)?.[1] ??
    pageTitles.find(([p]) => path.startsWith(p + "/"))?.[1] ??
    "OutshipAi";
  const { autoSync } = usePushNotifications();
  const [moreOpen, setMoreOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // Restore the sidebar collapse preference once mounted (guard for SSR).
  useEffect(() => {
    try {
      if (localStorage.getItem("app-sidebar-collapsed") === "1") setCollapsed(true);
    } catch {
      // localStorage unavailable (e.g., storage blocked) — keep default state.
    }
  }, []);

  function toggleCollapsed() {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem("app-sidebar-collapsed", next ? "1" : "0");
      } catch {
        // localStorage unavailable — the click still toggles for this session.
      }
      return next;
    });
  }

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
    return () => {
      cancelled = true;
    };
  }, [loading, user, navigate]);

  if (loading || !user) {
    return (
      <div className="flex h-dvh w-full bg-background">
        <div className="hidden w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar p-4 lg:flex">
          <Skeleton className="mb-6 h-8 w-32 bg-sidebar-accent" />
          <div className="space-y-2">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-9 w-full bg-sidebar-accent" />
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
      {/* Desktop sidebar — theme-aware and collapsible to an icon rail */}
      <aside
        data-collapsible={collapsed ? "icon" : ""}
        className={cn(
          "group hidden shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground lg:flex",
          "border-sidebar-border transition-[width] duration-200",
          collapsed ? "w-16" : "w-60",
        )}
      >
        <div
          className={cn(
            "flex h-14 shrink-0 items-center",
            collapsed ? "justify-center" : "justify-between px-3",
          )}
        >
          <Link
            to="/dashboard"
            className={cn(
              "flex min-w-0 items-center gap-2",
              !collapsed && "overflow-hidden"
            )}
          >
            <Logo className="text-sidebar-foreground" showText={!collapsed} />
          </Link>
          <button
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="rounded-md p-2 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
          {nav.map((item) => (
            <Link
              key={item.tKey}
              to={item.url}
              title={collapsed ? t(item.tKey) : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                collapsed && "justify-center px-0",
                isActive(path, item.url)
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span className="truncate">{t(item.tKey)}</span>}
            </Link>
          ))}
        </nav>
        <div className="shrink-0 border-t border-sidebar-border p-2">
          {collapsed ? (
            <button
              onClick={signOut}
              aria-label="Sign out"
              title="Sign out"
              className="flex w-full items-center justify-center rounded-lg px-3 py-2 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <LogOut className="h-4 w-4 shrink-0" />
            </button>
          ) : (
            <>
              <div className="truncate px-3 pb-1.5 pt-1 text-xs text-sidebar-foreground/60">
                {user.email}
              </div>
              <button
                onClick={signOut}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              >
                <LogOut className="h-4 w-4 shrink-0" />
                <span>Sign out</span>
              </button>
            </>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top app bar */}
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-muted/40 px-4">
          <button
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="truncate text-sm font-semibold">{currentTitle}</span>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <NotificationBell />
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto p-4 pb-24 md:p-6 lg:pb-6">
          <Outlet />
        </main>

        {/* Mobile slide-over drawer with the full menu */}
        {menuOpen && (
          <>
            <div
              className="fixed inset-0 z-40 bg-black/40 lg:hidden"
              onClick={() => setMenuOpen(false)}
            />
            <div className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85%] flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-xl lg:hidden">
              <div className="flex h-14 shrink-0 items-center justify-between px-3">
                <Link to="/dashboard" onClick={() => setMenuOpen(false)}>
                  <Logo className="text-sidebar-foreground" />
                </Link>
                <button
                  onClick={() => setMenuOpen(false)}
                  aria-label="Close menu"
                  className="rounded-md p-2 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-2">
                {nav.map((item) => (
                  <Link
                    key={item.tKey}
                    to={item.url}
                    onClick={() => setMenuOpen(false)}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                      isActive(path, item.url)
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "hover:bg-sidebar-accent/70",
                    )}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {t(item.tKey)}
                  </Link>
                ))}
              </nav>
              <div className="shrink-0 border-t border-sidebar-border p-3">
                <div className="truncate px-2 pb-1.5 text-xs text-sidebar-foreground/60">
                  {user.email}
                </div>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    signOut();
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-destructive transition-colors hover:bg-sidebar-accent"
                >
                  <LogOut className="h-4 w-4 shrink-0" />
                  Sign out
                </button>
              </div>
            </div>
          </>
        )}

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
                      isActive(path, item.url)
                        ? "bg-accent text-accent-foreground"
                        : "hover:bg-accent/60"
                    }`}
                  >
                    <item.icon className="h-4 w-4" />
                    {t(item.tKey)}
                  </Link>
                ))}
                <button
                  onClick={() => {
                    setMoreOpen(false);
                    signOut();
                  }}
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
                moreItems.some((i) => isActive(path, i.url))
                  ? "text-primary"
                  : "text-muted-foreground"
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
