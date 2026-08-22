import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Users, Send, Reply, CalendarCheck, Plus, Mail } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

type Stats = { leads: number; emails: number; replies: number; meetings: number };
type Campaign = { id: string; name: string; status: string };
type Activity = { id: string; subject: string | null; sent_at: string; lead?: { name: string | null; email: string | null } | null };

function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats>({ leads: 0, emails: 0, replies: 0, meetings: 0 });
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [activity, setActivity] = useState<Activity[]>([]);

  useEffect(() => { void load(); }, []);

  async function load() {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { data: profile } = await supabase.from("profiles").select("onboarded").eq("id", u.user.id).single();
    if (profile && !profile.onboarded) { navigate({ to: "/onboarding" }); return; }

    const [leads, emails, replies, meetings, camps, act] = await Promise.all([
      supabase.from("leads").select("id", { count: "exact", head: true }),
      supabase.from("emails_sent").select("id", { count: "exact", head: true }),
      supabase.from("emails_sent").select("id", { count: "exact", head: true }).eq("replied", true),
      supabase.from("meetings").select("id", { count: "exact", head: true }),
      supabase.from("campaigns").select("*").order("created_at", { ascending: false }).limit(1),
      supabase.from("emails_sent").select("id, subject, sent_at, lead:leads(name,email)").order("sent_at", { ascending: false }).limit(8),
    ]);
    setStats({ leads: leads.count ?? 0, emails: emails.count ?? 0, replies: replies.count ?? 0, meetings: meetings.count ?? 0 });
    setCampaign(camps.data?.[0] ?? null);
    setActivity((act.data as Activity[]) ?? []);
  }

  async function toggleStatus(active: boolean) {
    if (!campaign) return;
    const status = active ? "active" : "paused";
    setCampaign({ ...campaign, status });
    const { error } = await supabase.from("campaigns").update({ status }).eq("id", campaign.id);
    if (error) toast.error(error.message);
    else toast.success(`Campaign ${status}`);
  }

  const cards = [
    { label: "Total Leads Found", value: stats.leads, icon: Users, color: "text-primary" },
    { label: "Emails Sent", value: stats.emails, icon: Send, color: "text-primary-glow" },
    { label: "Replies Received", value: stats.replies, icon: Reply, color: "text-success" },
    { label: "Meetings Booked", value: stats.meetings, icon: CalendarCheck, color: "text-warning" },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Your AI agent activity at a glance.</p>
        </div>
        <Button asChild className="bg-gradient-primary shadow-glow">
          <Link to="/campaigns"><Plus className="mr-2 h-4 w-4" /> Add New Campaign</Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-2xl border border-border bg-card p-6 shadow-card">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{c.label}</span>
              <c.icon className={`h-5 w-5 ${c.color}`} />
            </div>
            <div className="mt-3 text-3xl font-bold tracking-tight">{c.value}</div>
          </div>
        ))}
      </div>

      {campaign && (
        <div className="rounded-2xl border border-border bg-card p-6 shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm text-muted-foreground">Active campaign</div>
              <div className="mt-1 text-xl font-semibold">{campaign.name}</div>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant={campaign.status === "active" ? "default" : "secondary"}
                className={campaign.status === "active" ? "bg-success text-success-foreground" : ""}>
                {campaign.status}
              </Badge>
              <div className="flex items-center gap-2 text-sm">
                <Switch checked={campaign.status === "active"} onCheckedChange={toggleStatus} />
                <span className="text-muted-foreground">{campaign.status === "active" ? "Active" : "Paused"}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-border bg-card p-6 shadow-card">
        <h2 className="mb-4 text-lg font-semibold">Recent activity</h2>
        {activity.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            <Mail className="mx-auto mb-3 h-8 w-8 opacity-50" />
            No emails sent yet — your AI agent is warming up.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {activity.map((a) => (
              <li key={a.id} className="flex items-center justify-between py-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{a.subject ?? "(no subject)"}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    To {a.lead?.name ?? a.lead?.email ?? "lead"}
                  </div>
                </div>
                <div className="shrink-0 text-xs text-muted-foreground">
                  {new Date(a.sent_at).toLocaleString()}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
