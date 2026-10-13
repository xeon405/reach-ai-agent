import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft, Loader2, Send, ShieldCheck, ShieldAlert, ShieldX, Shield,
  Mail, Check, AlertTriangle, Eye, Upload, X, Image as ImageIcon,
  Globe, Clock, Users, Zap, Pause, Rocket,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/campaign-review/$campaignId")({
  component: CampaignReviewPage,
});

type Lead = {
  id: string; name: string | null; email: string | null; company: string | null;
  job_title: string | null; country: string | null; city: string | null;
  phone: string | null; address: string | null; website: string | null;
  rating: number | null; category: string | null; lead_source: string | null;
  status: string; email_status: string | null; email_confidence: number | null;
  email_is_role: boolean | null; email_verification_reason: string | null;
  unsubscribed: boolean | null;
};

type Campaign = {
  id: string; name: string; status: string; ab_test: boolean;
  autopilot: boolean; campaign_image_url: string | null; created_at: string;
  followups_enabled: boolean;
};

type Profile = {
  id: string; name: string | null; offer: string | null;
  booking_link: string | null; website_url: string | null;
  signature: string | null; gmail_connected: boolean;
  plan: string | null; created_at: string;
  emails_sent_today: number | null; emails_sent_date: string | null;
};

const PLAN_LIMITS: Record<string, number> = { free: 10, starter: 50, growth: 200, agency: 500 };

function CampaignReviewPage() {
  const { campaignId } = Route.useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [launching, setLaunching] = useState(false);
  const [launchResult, setLaunchResult] = useState<Record<string, unknown> | null>(null);
  const [previewLead, setPreviewLead] = useState<Lead | null>(null);
  const [previewEmail, setPreviewEmail] = useState<{ subject: string; body: string } | null>(null);
  const [generatingPreview, setGeneratingPreview] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [campRes, leadsRes, profileRes] = await Promise.all([
        supabase.from("campaigns").select("*").eq("id", campaignId).single(),
        supabase.from("leads").select("*").eq("campaign_id", campaignId).order("created_at", { ascending: true }),
        supabase.from("profiles").select("*").eq("id", (await supabase.auth.getUser()).data.user?.id ?? "").single(),
      ]);
      if (campRes.data) {
        setCampaign(campRes.data as Campaign);
        setImageUrl(campRes.data.campaign_image_url);
      }
      setLeads((leadsRes.data as Lead[]) ?? []);
      if (profileRes.data) setProfile(profileRes.data as Profile);
      setLoading(false);
    })();
  }, [campaignId]);

  const stats = useMemo(() => {
    const total = leads.length;
    const verified = leads.filter((l) => l.email_status === "verified").length;
    const risky = leads.filter((l) => l.email_status === "risky").length;
    const unknown = leads.filter((l) => l.email_status === "unknown").length;
    const invalid = leads.filter((l) => l.email_status === "invalid").length;
    const suppressed = leads.filter((l) => l.unsubscribed || l.status === "suppressed" || l.status === "unsubscribed" || l.status === "bounced").length;
    const eligible = leads.filter((l) =>
      l.email && l.email_status !== "invalid" && !l.unsubscribed &&
      l.status !== "suppressed" && l.status !== "unsubscribed" && l.status !== "bounced"
    ).length;
    return { total, verified, risky, unknown, invalid, suppressed, eligible };
  }, [leads]);

  const dailyLimit = useMemo(() => {
    if (!profile) return 50;
    const base = PLAN_LIMITS[profile.plan ?? "starter"] ?? 50;
    const daysWarm = Math.max(0, Math.floor((Date.now() - new Date(profile.created_at).getTime()) / 86400000));
    return Math.min(base, 5 + daysWarm * 5);
  }, [profile]);

  const todaySent = useMemo(() => {
    if (!profile) return 0;
    const today = new Date().toISOString().split("T")[0];
    return profile.emails_sent_date === today ? (profile.emails_sent_today ?? 0) : 0;
  }, [profile]);

  const estimatedBatches = Math.ceil(Math.max(0, stats.eligible - (dailyLimit - todaySent)) / dailyLimit) + 1;

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("Image must be under 5MB"); return; }
    setUploadingImage(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const path = `${u.user.id}/${campaignId}/${Date.now()}-${file.name}`;
      const { error: uploadErr } = await supabase.storage.from("campaign-images").upload(path, file);
      if (uploadErr) throw new Error(uploadErr.message);
      const { data: urlData } = supabase.storage.from("campaign-images").getPublicUrl(path);
      const publicUrl = urlData.publicUrl;
      await supabase.from("campaigns").update({ campaign_image_url: publicUrl }).eq("id", campaignId);
      setImageUrl(publicUrl);
      setCampaign((c) => c ? { ...c, campaign_image_url: publicUrl } : c);
      toast.success("Image uploaded");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingImage(false);
    }
  }

  async function removeImage() {
    await supabase.from("campaigns").update({ campaign_image_url: null }).eq("id", campaignId);
    setImageUrl(null);
    setCampaign((c) => c ? { ...c, campaign_image_url: null } : c);
    toast.success("Image removed");
  }

  async function generatePreview(lead: Lead) {
    setPreviewLead(lead);
    setPreviewEmail(null);
    setGeneratingPreview(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-email", {
        body: {
          leadId: lead.id,
          leadName: lead.name ?? "there",
          leadCompany: lead.company ?? "your company",
          leadJobTitle: lead.job_title ?? "professional",
          yourCompany: profile?.name ?? "OutshipAi",
          yourOffer: profile?.offer ?? "our service",
        },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      const body = data.content ?? "";
      const link = profile?.website_url || profile?.booking_link || "";
      const fullBody = `${body}${link ? `\n\nSee how it works & get started: ${link}` : ""}${profile?.signature ? `\n\n${profile.signature}` : ""}`;
      setPreviewEmail({ subject: `Quick question about ${lead.company ?? "your business"}`, body: fullBody });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setGeneratingPreview(false);
    }
  }

  async function launchCampaign() {
    if (!campaign) return;
    setLaunching(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-campaign", {
        body: { campaignId: campaign.id },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      setLaunchResult(data);
      toast.success(data?.queued > 0 ? `Campaign launched! ${data.message}` : "Nothing new to send");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Launch failed");
    } finally {
      setLaunching(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-28 w-full rounded-xl" />
        <div className="grid gap-4 md:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-56 w-full rounded-xl" />
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <Button variant="ghost" onClick={() => navigate({ to: "/campaigns" })}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Campaigns
        </Button>
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-muted-foreground">
          Campaign not found.
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate({ to: "/campaigns" })}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">{campaign.name}</h1>
          <p className="text-sm text-muted-foreground">Campaign Review & Launch</p>
        </div>
        <Badge variant={campaign.status === "active" ? "default" : "secondary"} className={campaign.status === "active" ? "bg-success/15 text-success" : ""}>
          {campaign.status}
        </Badge>
      </div>

      {/* Launch Result */}
      {launchResult && (
        <div className="rounded-xl border border-success/20 bg-success/5 p-6 space-y-2">
          <h3 className="font-semibold text-success flex items-center gap-2"><Rocket className="h-4 w-4" /> Campaign Launched</h3>
          <p className="text-sm text-muted-foreground">{String(launchResult.message ?? "")}</p>
          <div className="flex flex-wrap gap-3 text-sm">
            {typeof launchResult.queued === "number" && <Badge variant="secondary">{launchResult.queued} queued</Badge>}
            {typeof launchResult.remainingToday === "number" && <Badge variant="secondary">{launchResult.remainingToday} slots remaining today</Badge>}
          </div>
          <div className="flex gap-2 mt-2">
            <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/campaigns" })}>Back to Campaigns</Button>
          </div>
        </div>
      )}

      {/* Campaign Summary */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard icon={<Users className="h-4 w-4" />} label="Total Leads" value={stats.total} />
        <SummaryCard icon={<Check className="h-4 w-4 text-emerald-500" />} label="Eligible to Send" value={stats.eligible} accent={stats.eligible > 0} />
        <SummaryCard icon={<ShieldCheck className="h-4 w-4 text-emerald-500" />} label="Verified" value={stats.verified} />
        <SummaryCard icon={<AlertTriangle className="h-4 w-4 text-amber-500" />} label="Risky / Invalid" value={stats.risky + stats.invalid} />
      </div>

      {/* Campaign Settings */}
      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold uppercase text-muted-foreground mb-4">Campaign Settings</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">Sending Mode</span>
            <p className="text-sm font-medium flex items-center gap-1.5">
              {campaign.autopilot ? <><Zap className="h-3.5 w-3.5 text-success" /> Autopilot</> : <><Pause className="h-3.5 w-3.5" /> Manual</>}
            </p>
          </div>
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">A/B Testing</span>
            <p className="text-sm font-medium">{campaign.ab_test ? "Enabled (subject variants)" : "Disabled"}</p>
          </div>
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">Daily Sending Limit</span>
            <p className="text-sm font-medium">{dailyLimit} emails/day ({todaySent} sent today)</p>
          </div>
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">Website / Booking Link</span>
            <p className="text-sm font-medium flex items-center gap-1.5">
              <Globe className="h-3.5 w-3.5 shrink-0" />
              {profile?.website_url || profile?.booking_link || "Not set"}
            </p>
          </div>
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">Follow-ups</span>
            <p className="text-sm font-medium flex items-center gap-1.5">
              {campaign.followups_enabled !== false ? (
                <><Clock className="h-3.5 w-3.5 text-success" /> Enabled (14-step sequence)</>
              ) : (
                <><Pause className="h-3.5 w-3.5 text-muted-foreground" /> Disabled</>
              )}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {["Initial", "+3d", "+5d", "+10d", "+15d", "+25d", "+30d", "+2mo", "+4mo", "+5mo", "+6mo", "+8mo", "+10mo", "+12mo"].map((step, i) => (
                <span key={i} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                  i === 0 ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                }`}>
                  {step}
                </span>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">Estimated Window</span>
            <p className="text-sm font-medium flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 shrink-0" />
              ~{estimatedBatches} day{estimatedBatches !== 1 ? "s" : ""} (business hours only)
            </p>
          </div>
        </div>

        {/* Image */}
        <div className="mt-4 pt-4 border-t border-border">
          <span className="text-xs text-muted-foreground">Campaign Image (optional)</span>
          <div className="mt-2 flex items-center gap-3">
            {imageUrl ? (
              <div className="relative">
                <img src={imageUrl} alt="Campaign" className="h-20 rounded-lg border border-border object-cover" />
                <button onClick={removeImage} className="absolute -top-1.5 -right-1.5 bg-background border border-border rounded-full p-0.5 hover:bg-destructive/10">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <label className="flex items-center gap-2 cursor-pointer rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground hover:bg-muted/50 transition-colors">
                <Upload className="h-4 w-4" />
                {uploadingImage ? "Uploading..." : "Upload image (optional)"}
                <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={uploadingImage} />
              </label>
            )}
          </div>
        </div>
      </div>

      {/* Lead Safety Warnings */}
      {(stats.invalid > 0 || stats.suppressed > 0) && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/20 p-4">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm">
              {stats.invalid > 0 && <p className="text-amber-700 dark:text-amber-400">{stats.invalid} invalid email{stats.invalid !== 1 ? "s" : ""} will be excluded from sending.</p>}
              {stats.suppressed > 0 && <p className="text-amber-700 dark:text-amber-400">{stats.suppressed} suppressed/unsubscribed contact{stats.suppressed !== 1 ? "s" : ""} will be excluded.</p>}
            </div>
          </div>
        </div>
      )}

      {/* Lead List */}
      <div className="rounded-2xl border border-border bg-card">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-sm font-semibold uppercase text-muted-foreground">
            Leads ({stats.eligible} eligible of {stats.total})
          </h2>
          <div className="flex gap-2">
            {stats.verified > 0 && <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800">{stats.verified} verified</Badge>}
            {stats.risky > 0 && <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800">{stats.risky} risky</Badge>}
            {stats.unknown > 0 && <Badge variant="secondary">{stats.unknown} unknown</Badge>}
            {stats.invalid > 0 && <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800">{stats.invalid} invalid</Badge>}
          </div>
        </div>

        <div className="divide-y divide-border">
          {leads.map((lead) => {
            const isInvalid = lead.email_status === "invalid";
            const isRisky = lead.email_status === "risky";
            const isSuppressed = lead.unsubscribed || lead.status === "suppressed" || lead.status === "unsubscribed" || lead.status === "bounced";
            const isEligible = lead.email && !isInvalid && !isSuppressed;
            return (
              <div key={lead.id} className={`flex items-center gap-4 p-4 ${!isEligible ? "opacity-60" : ""}`}>
                {/* Status indicator */}
                <div className="shrink-0">
                  {isEligible ? (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                      <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    </div>
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
                      <X className="h-4 w-4 text-red-600 dark:text-red-400" />
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{lead.company || lead.name || "Unknown"}</span>
                    {lead.email_status && (
                      <span className={`inline-flex items-center gap-1 text-xs font-medium ${
                        lead.email_status === "verified" ? "text-emerald-600 dark:text-emerald-400"
                          : lead.email_status === "risky" ? "text-amber-600 dark:text-amber-400"
                          : lead.email_status === "invalid" ? "text-red-600 dark:text-red-400"
                          : "text-muted-foreground"
                      }`}>
                        {lead.email_status === "verified" ? <ShieldCheck className="h-3 w-3" /> :
                         lead.email_status === "risky" ? <ShieldAlert className="h-3 w-3" /> :
                         lead.email_status === "invalid" ? <ShieldX className="h-3 w-3" /> :
                         <Shield className="h-3 w-3" />}
                        {lead.email_status} {lead.email_confidence ? `(${lead.email_confidence}%)` : ""}
                      </span>
                    )}
                    {isSuppressed && <Badge variant="destructive" className="text-xs">{lead.status}</Badge>}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                    <Mail className="h-3 w-3" />
                    <span className="truncate">{lead.email}</span>
                    {lead.city && <span>· {lead.city}{lead.country ? `, ${lead.country}` : ""}</span>}
                  </div>
                  {lead.email_verification_reason && (
                    <p className="text-xs text-muted-foreground/70 mt-0.5 truncate">{lead.email_verification_reason}</p>
                  )}
                </div>

                {/* Preview button */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => generatePreview(lead)}
                  disabled={generatingPreview && previewLead?.id === lead.id}
                  className="shrink-0"
                >
                  {generatingPreview && previewLead?.id === lead.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <><Eye className="h-3.5 w-3.5 mr-1" /> Preview</>
                  )}
                </Button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Email Preview Modal */}
      {previewLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => { setPreviewLead(null); setPreviewEmail(null); }}>
          <div className="mx-4 w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Email Preview</h3>
              <button onClick={() => { setPreviewLead(null); setPreviewEmail(null); }} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div className="text-xs text-muted-foreground">
                To: {previewLead.email} ({previewLead.name ?? "Unknown"})
              </div>
              {generatingPreview ? (
                <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground justify-center">
                  <Loader2 className="h-4 w-4 animate-spin" /> Generating preview...
                </div>
              ) : previewEmail ? (
                <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
                  <div>
                    <span className="text-xs font-semibold uppercase text-muted-foreground">Subject</span>
                    <p className="text-sm font-medium mt-0.5">{previewEmail.subject}</p>
                  </div>
                  <div className="border-t border-border pt-3">
                    <span className="text-xs font-semibold uppercase text-muted-foreground">Body</span>
                    <p className="text-sm whitespace-pre-wrap mt-0.5 leading-relaxed">{previewEmail.body}</p>
                  </div>
                  {imageUrl && (
                    <div className="border-t border-border pt-3">
                      <span className="text-xs font-semibold uppercase text-muted-foreground">Image</span>
                      <img src={imageUrl} alt="Campaign image" className="mt-1 rounded-lg max-h-32 object-cover" />
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground py-4 text-center">Click a contact's Preview button to generate an email preview.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Launch Button */}
      {!launchResult && (
        <div className="sticky bottom-0 flex items-center justify-between rounded-xl border border-primary/20 bg-card p-4">
          <div className="text-sm">
            <p className="font-medium">{stats.eligible} contact{stats.eligible !== 1 ? "s" : ""} will be queued for sending</p>
            <p className="text-muted-foreground text-xs">
              {stats.invalid > 0 && `${stats.invalid} invalid excluded. `}
              {stats.risky > 0 && `${stats.risky} risky will be sent with caution. `}
              Gmail sends one by one during business hours.
            </p>
          </div>
          <Button
            onClick={launchCampaign}
            disabled={launching || stats.eligible === 0 || campaign.status !== "active"}
            className="bg-primary px-6"
            size="lg"
          >
            {launching ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Launching...</>
            ) : (
              <><Send className="mr-2 h-4 w-4" /> Launch Campaign</>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: number; accent?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${accent ? "border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20" : "border-border bg-card"}`}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon} {label}
      </div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </div>
  );
}
