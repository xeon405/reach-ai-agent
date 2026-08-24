import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Users, Send, Reply, Trophy, Plus, Mail } from "lucide-react";
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
  const [bookingLink, setBookingLink] = useState(false);

  useEffect(() => { void load(); }, []);

  async function load() {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { data: profile } = await supabase.from("profiles").select("onboarded, booking_link").eq("id", u.user.id).single();
    if (profile && !profile.onboarded) { navigate({ to: "/onboarding" }); return; }
    setBookingLink(Boolean(profile?.booking_link));

    const [leads, emails, replies, meetings, camps, act] = await Promise.all([
      supabase.from("leads").select("id", { count: "exact", head: true }),
      supabase.from("emails_sent").select("id", { count: "exact", head: true }),
      supabase.from("emails_sent").select("id", { count: "exact", head: true }).eq("replied", true),
      supabase.from("leads").select("id", { count: "exact", head: true }).eq("status", "won"),
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
    { label: "🏆 Meetings Won", value: stats.meetings, icon: Trophy, color: "text-success" },
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
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
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

          <h2 className="mb-4 text-lg font-semibold">❤️ Campaign health</h2>
          {(() => {
            const replyRate = stats.emails ? stats.replies / stats.emails : 0;
            let score = 0; const tips: string[] = [];
            if (stats.emails === 0) {
              score = 20;
              tips.push("No emails sent yet — activate your campaign and the agent starts working.");
            } else {
              score = Math.round(Math.min(85, 40 + replyRate * 500));
              if (stats.meetings > 0) score = Math.min(100, score + 15);
              if (stats.replies === 0 && stats.emails >= 20) tips.push("20+ emails but no replies — try a different offer angle in the AI Email Generator.");
              else if (replyRate >= 0.08) tips.push("Reply rate is excellent — consider upgrading your plan to send more per day.");
              if (!bookingLink) tips.push("Add your booking link in Settings so interested leads can schedule instantly.");
              if (stats.leads < 25) tips.push("Lead list is thin — import more leads or use Find Leads to keep the agent busy.");
            }
            const grade = score >= 80 ? "Excellent" : score >= 60 ? "Good" : score >= 40 ? "Needs attention" : "Just starting";
            return (
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                <div className="flex items-center gap-4">
                  <div className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-xl font-extrabold ${
                    score >= 80 ? "bg-success/15 text-success" : score >= 60 ? "bg-primary/10 text-primary" : score >= 40 ? "bg-warning/15 text-warning" : "bg-muted text-muted-foreground"
                  }`}>{score}</div>
                  <div>
                    <div className="font-semibold">{grade}</div>
                    <div className="text-xs text-muted-foreground">
                      {stats.replies} replies · {(replyRate * 100).toFixed(1)}% reply rate · {stats.meetings} won
                    </div>
                  </div>
                </div>
                {tips.length > 0 && (
                  <ul className="min-w-0 flex-1 space-y-1.5 border-t border-border pt-3 text-sm text-muted-foreground sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
                    {tips.map((tip) => <li key={tip} className="flex gap-2"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />{tip}</li>)}
                  </ul>
                )}
              </div>
            );
          })()}
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
