import { createFileRoute, Outlet, useNavigate, Link, useRouterState } from "@tanstack/react-router";
import { useLang } from "@/lib/i18n";import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarMenu,
  SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger, SidebarHeader, SidebarFooter,
} from "@/components/ui/sidebar";
import { LayoutDashboard, Users, Megaphone, Mail, Settings, CreditCard, LogOut } from "lucide-react";
import { Logo } from "@/components/Logo";
import { SupportChat } from "@/components/support-chat";
import { ThemeToggle } from "@/components/theme-provider";
import { NotificationBell } from "@/components/notification-bell";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { Button } from "@/components/ui/button";
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

function AuthenticatedLayout() {
  const { t } = useLang();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const currentTitle = pageTitles.find(([p]) => path === p)?.[1]
    ?? pageTitles.find(([p]) => path.startsWith(p + "/"))?.[1]
    ?? "OutshipAi";
  const { autoSync } = usePushNotifications();

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
        <div className="hidden w-64 shrink-0 border-r border-border/50 p-4 lg:block">
          <Skeleton className="mb-6 h-8 w-32" />
          <div className="space-y-2">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
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

  return (
    <SidebarProvider>
        <div className="flex h-dvh w-full min-w-0 bg-background overflow-hidden">
          <Sidebar collapsible="icon">
          <SidebarHeader className="border-b border-sidebar-border px-3 py-4">
            <div className="flex w-full items-center justify-between gap-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
              <Logo />
              <ThemeToggle className="shrink-0 group-data-[collapsible=icon]:hidden" />
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  {nav.map((item) => (
                    <SidebarMenuItem key={item.tKey}>
                      <SidebarMenuButton asChild isActive={path === item.url}>
                        <Link to={item.url} className="flex items-center gap-2">
                          <item.icon className="h-4 w-4" />
                          <span>{t(item.tKey)}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter className="border-t border-sidebar-border p-3">
            <div className="mb-2 truncate px-2 text-xs text-sidebar-foreground/70 group-data-[collapsible=icon]:hidden">{user.email}</div>
            <Button variant="ghost" size="sm" onClick={signOut} className="w-full justify-start group-data-[collapsible=icon]:justify-center">
              <LogOut className="group-data-[collapsible=icon]:mr-0 mr-2 h-4 w-4" />
              <span className="group-data-[collapsible=icon]:hidden">Sign out</span>
            </Button>
          </SidebarFooter>
        </Sidebar>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
            <SidebarTrigger />
            <span className="truncate text-sm font-medium">{currentTitle}</span>
            <div className="ml-auto flex items-center gap-1">
              <NotificationBell />
            </div>
          </header>
          <main className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
            <Outlet />
          </main>
          <SupportChat />
        </div>
      </div>
    </SidebarProvider>
  );
}
