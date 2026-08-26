import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Pause, Play, Plus, Trash2, Sparkles, Loader2, Send, Pencil } from "lucide-react";
import { toast } from "sonner";
import { TEMPLATES } from "@/lib/templates";

export const Route = createFileRoute("/_authenticated/campaigns")({
  component: CampaignsPage,
});

type Campaign = { id: string; name: string; status: string; created_at: string; ab_test?: boolean; autopilot?: boolean };

function CampaignsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Campaign[]>([]);
  const [stats, setStats] = useState<Record<string, { leads: number; emails: number; replies: number }>>({});
  const [abStats, setAbStats] = useState<Record<string, { a: number; aOpen: number; b: number; bOpen: number }> | null>(null);
  const [open, setOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [name, setName] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generatedEmail, setGeneratedEmail] = useState("");
  const [spam, setSpam] = useState<{ score: number; grade: string; issues: { message: string }[]; good: string[] } | null>(null);
  const [checkingSpam, setCheckingSpam] = useState(false);
  const [sending, setSending] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [aiForm, setAiForm] = useState({
    leadName: "", leadCompany: "", leadJobTitle: "",
    yourCompany: "OutreachAI",
    yourOffer: "AI-powered cold email automation that finds leads and books meetings automatically",
  });

  useEffect(() => { void load(); }, []);

  async function load() {
    const { data } = await supabase.from("campaigns").select("*").order("created_at", { ascending: false });
    setItems((data as Campaign[]) ?? []);
    if (data && data.length) {
      const s: typeof stats = {};
      const ab: Record<string, { a: number; aOpen: number; b: number; bOpen: number }> = {};
      for (const c of data) {
        const [l, e, r] = await Promise.all([
          supabase.from("leads").select("id", { count: "exact", head: true }).eq("campaign_id", c.id),
          supabase.from("emails_sent").select("id", { count: "exact", head: true }).eq("campaign_id", c.id),
          supabase.from("emails_sent").select("id", { count: "exact", head: true }).eq("campaign_id", c.id).eq("replied", true),
        ]);
        s[c.id] = { leads: l.count ?? 0, emails: e.count ?? 0, replies: r.count ?? 0 };
        const [va, vb] = await Promise.all([
          supabase.from("emails_sent").select("opened").eq("campaign_id", c.id).eq("variant", "A"),
          supabase.from("emails_sent").select("opened").eq("campaign_id", c.id).eq("variant", "B"),
        ]);
        if (c.ab_test) {
          const rowsA = (va.data as { opened: boolean }[] | null) ?? [];
          const rowsB = (vb.data as { opened: boolean }[] | null) ?? [];
          ab[c.id] = {
            a: rowsA.length,
            aOpen: rowsA.filter((x) => x.opened).length,
            b: rowsB.length,
            bOpen: rowsB.filter((x) => x.opened).length,
          };
        }
      }
      setStats(s);
      setAbStats(ab);
    }
  }

  async function setFlag(c: Campaign, key: "ab_test" | "autopilot", value: boolean) {
    const patch = key === "ab_test" ? { ab_test: value } : { autopilot: value };
    const { error } = await supabase.from("campaigns").update(patch).eq("id", c.id);
    if (error) toast.error(error.message);
    else toast.success(value ? "Enabled" : "Disabled");
    load();
  }

  async function create() {
    if (!name.trim()) return;
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { error } = await supabase.from("campaigns").insert({ user_id: u.user.id, name, status: "active" });
    if (error) toast.error(error.message);
    else { toast.success("Campaign created"); setName(""); setOpen(false); load(); }
  }

  async function saveRename(c: Campaign) {
    const trimmed = editingName.trim();
    if (!trimmed || trimmed === c.name) { setEditingId(null); return; }
    const { error } = await supabase.from("campaigns").update({ name: trimmed }).eq("id", c.id);
    if (error) toast.error(error.message);
    else { toast.success("Campaign renamed"); load(); }
    setEditingId(null);
  }

  async function toggle(c: Campaign) {
    const status = c.status === "active" ? "paused" : "active";
    await supabase.from("campaigns").update({ status }).eq("id", c.id);
    load();
  }

  async function remove(id: string) {
    await supabase.from("campaigns").delete().eq("id", id);
    toast.success("Deleted");
    load();
  }

  async function launchCampaign(campaignId: string) {
    setSending(campaignId);
    toast.info("Queueing campaign...");

    try {
      const { data, error } = await supabase.functions.invoke("send-campaign", {
        body: { campaignId },
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      if (data?.queued > 0) {
        toast.success(`📥 ${data.message}`);
        // stats refresh as the background worker sends
        setTimeout(() => load(), 15000);
        setTimeout(() => load(), 45000);
      } else {
        toast.info(data?.message ?? "Nothing new to send.");
      }
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to launch campaign");
    } finally {
      setSending(null);
    }
  }

  async function handleGenerateEmail() {
    if (!aiForm.leadName || !aiForm.leadCompany || !aiForm.leadJobTitle) {
      toast.error("Please fill in all lead details");
      return;
    }
    setGenerating(true);
    setGeneratedEmail("");
    try {
      const { data, error } = await supabase.functions.invoke("generate-email", {
        body: aiForm,
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      setGeneratedEmail(data.content);
      toast.success("Email generated by AI!");
    } catch {
      toast.error("Failed to generate email. Please try again.");
    }
    setGenerating(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Campaigns</h1>
          <p className="text-sm text-muted-foreground">Manage your outbound campaigns.</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={aiOpen} onOpenChange={setAiOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="border-primary text-primary">
                <Sparkles className="mr-2 h-4 w-4" /> Generate AI Email
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>✨ AI Email Generator</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium">📚 Start from a proven template</label>
                  <select
                    className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value=""
                    onChange={(e) => {
                      const t = TEMPLATES[Number(e.target.value)];
                      if (!t) return;
                      setAiForm({ ...aiForm, yourOffer: t.body.slice(0, 300) });
                      setGeneratedEmail(t.body.replace(/{{booking_link}}/g, "https://cal.com/you/15min"));
                      toast.success(`Template loaded: ${t.name}`);
                    }}
                  >
                    <option value="">Choose a niche template…</option>
                    {Array.from(new Set(TEMPLATES.map((t) => t.niche))).map((niche) => (
                      <optgroup key={niche} label={niche}>
                        {TEMPLATES.map((t, i) =>
                          t.niche === niche ? <option key={t.name} value={i}>{t.name}</option> : null
                        )}
                      </optgroup>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="text-sm font-medium">Lead Name</label>
                    <Input placeholder="John Smith" value={aiForm.leadName}
                      onChange={(e) => setAiForm({ ...aiForm, leadName: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Lead Company</label>
                    <Input placeholder="Acme Corp" value={aiForm.leadCompany}
                      onChange={(e) => setAiForm({ ...aiForm, leadCompany: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Job Title</label>
                    <Input placeholder="Marketing Manager" value={aiForm.leadJobTitle}
                      onChange={(e) => setAiForm({ ...aiForm, leadJobTitle: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Your Company</label>
                    <Input placeholder="OutreachAI" value={aiForm.yourCompany}
                      onChange={(e) => setAiForm({ ...aiForm, yourCompany: e.target.value })} />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium">What you offer</label>
                  <Input placeholder="AI-powered cold email automation..." value={aiForm.yourOffer}
                    onChange={(e) => setAiForm({ ...aiForm, yourOffer: e.target.value })} />
                </div>
                <Button onClick={handleGenerateEmail} disabled={generating} className="w-full bg-gradient-primary">
                  {generating ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating...</>
                    : <><Sparkles className="mr-2 h-4 w-4" /> Generate Email</>}
                </Button>
                {generatedEmail && (
                  <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
                    <div className="mb-2 text-xs font-semibold uppercase text-primary">Generated Email</div>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">{generatedEmail}</p>
                    {spam && (
                      <div className={`mt-3 rounded-lg border p-3 text-xs ${
                        spam.score >= 70 ? "border-success/30 bg-success/10" : spam.score >= 50 ? "border-warning/40 bg-warning/10" : "border-destructive/40 bg-destructive/10"
                      }`}>
                        <div className="font-bold">🛡️ Deliverability score: {spam.score}/100 — {spam.grade}</div>
                        {spam.issues?.length > 0 && (
                          <ul className="mt-2 list-disc space-y-1 pl-4">
                            {spam.issues.map((i: { message: string }, k: number) => <li key={k}>{i.message}</li>)}
                          </ul>
                        )}
                        {spam.good?.length > 0 && <div className="mt-2 opacity-80">✓ {spam.good.join(" · ")}</div>}
                      </div>
                    )}
                    <div className="mt-3 flex gap-2">
                      <Button className="flex-1" variant="outline" disabled={checkingSpam}
                        onClick={async () => {
                          setCheckingSpam(true);
                          try {
                            const { data } = await supabase.functions.invoke("spam-check", {
                              body: { subject: "", body: generatedEmail },
                            });
                            if (!data || data.error) throw new Error();
                            setSpam(data);
                          } catch { toast.error("Spam check failed"); }
                          setCheckingSpam(false);
                        }}>
                        {checkingSpam ? "Checking…" : "🛡️ Check spam score"}
                      </Button>
                      <Button className="flex-1" variant="outline"
                        onClick={() => { navigator.clipboard.writeText(generatedEmail); toast.success("Copied!"); }}>
                        Copy Email
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-primary shadow-glow">
                <Plus className="mr-2 h-4 w-4" /> New Campaign
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create campaign</DialogTitle></DialogHeader>
              <Input placeholder="Campaign name" value={name} onChange={(e) => setName(e.target.value)} />
              <DialogFooter>
                <Button onClick={create} className="bg-gradient-primary">Create</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid gap-4">
        {items.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground">
            No campaigns yet. Click "New Campaign" to get started.
          </div>
        )}
        {items.map((c) => {
          const s = stats[c.id] ?? { leads: 0, emails: 0, replies: 0 };
          const ab = abStats?.[c.id];
          const replyRate = s.emails ? Math.round((s.replies / s.emails) * 100) : 0;
          return (
            <div key={c.id} className="rounded-2xl border border-border bg-card p-6 shadow-card">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    {editingId === c.id ? (
                      <input
                        autoFocus
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onBlur={() => saveRename(c)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveRename(c);
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        className="rounded-md border border-input bg-background px-2 py-1 text-lg font-semibold outline-none focus:ring-2 focus:ring-ring"
                      />
                    ) : (
                      <h3
                        className="cursor-pointer rounded-md px-2 py-1 text-lg font-semibold transition-colors hover:bg-muted/50"
                        onClick={() => { setEditingId(c.id); setEditingName(c.name); }}
                        title="Click to rename"
                      >
                        {c.name}
                      </h3>
                    )}
                    <Badge variant="secondary" className={c.status === "active" ? "bg-success/15 text-success" : ""}>
                      {c.status}
                    </Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-3 text-sm sm:gap-6">
                    <Stat label="Leads targeted" value={s.leads} />
                    <Stat label="Emails sent" value={s.emails} />
                    <Stat label="Reply rate" value={`${replyRate}%`} />
                  </div>
                  {ab && (ab.a > 0 || ab.b > 0) ? (
                    <div className="mt-2 text-xs text-muted-foreground">
                      A/B: A opened {ab.aOpen}/{ab.a} · B opened {ab.bOpen}/{ab.b}
                      {ab.a >= 10 && ab.b >= 10
                        ? ` — winner: ${ab.aOpen / ab.a >= ab.bOpen / ab.b ? "A" : "B"}`
                        : " — need 10+ sends each for a winner"}
                    </div>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setFlag(c, "ab_test", !c.ab_test)}
                      className={`rounded-full border px-3 py-1 text-xs transition-colors ${c.ab_test ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
                    >
                      🧪 A/B subjects {c.ab_test ? "ON" : "OFF"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setFlag(c, "autopilot", !c.autopilot)}
                      className={`rounded-full border px-3 py-1 text-xs transition-colors ${c.autopilot ? "border-success bg-success/10 text-success" : "border-border text-muted-foreground hover:text-foreground"}`}
                    >
                      🤖 Autopilot replies {c.autopilot ? "ON" : "OFF"}
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    className="bg-gradient-primary"
                    disabled={sending === c.id || c.status !== "active"}
                    onClick={() => launchCampaign(c.id)}
                  >
                    {sending === c.id
                      ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending...</>
                      : <><Send className="mr-2 h-4 w-4" /> Launch</>}
                  </Button>
                  <Button size="icon" variant="outline" onClick={() => navigate({ to: "/campaign-edit/$campaignId", params: { campaignId: c.id } })} aria-label="Edit campaign">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="outline" onClick={() => toggle(c)}>
                    {c.status === "active" ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  </Button>
                  <Button size="icon" variant="outline" onClick={() => remove(c.id)} className="text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-xl font-semibold">{value}</div>
    </div>
  );
}