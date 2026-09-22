import { jsx, jsxs, Fragment } from "react/jsx-runtime";
import { useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { s as supabase } from "./client-Bf7kAZ3f.js";
import { B as Button } from "./button-DjOZMqFS.js";
import { B as Badge } from "./badge-YM7oB01y.js";
import { Loader2, ArrowLeft, Rocket, Users, Check, ShieldCheck, AlertTriangle, Zap, Pause, Globe, Clock, X, Upload, ShieldAlert, ShieldX, Shield, Mail, Eye, Send } from "lucide-react";
import { toast } from "sonner";
import { a as Route } from "./router-DM9FrBM_.js";
import "@supabase/supabase-js";
import "@radix-ui/react-slot";
import "class-variance-authority";
import "clsx";
import "tailwind-merge";
import "@tanstack/react-query";
const PLAN_LIMITS = {
  free: 10,
  starter: 50,
  growth: 200,
  agency: 500
};
function CampaignReviewPage() {
  const {
    campaignId
  } = Route.useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [campaign, setCampaign] = useState(null);
  const [leads, setLeads] = useState([]);
  const [profile, setProfile] = useState(null);
  const [launching, setLaunching] = useState(false);
  const [launchResult, setLaunchResult] = useState(null);
  const [previewLead, setPreviewLead] = useState(null);
  const [previewEmail, setPreviewEmail] = useState(null);
  const [generatingPreview, setGeneratingPreview] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageUrl, setImageUrl] = useState(null);
  useEffect(() => {
    (async () => {
      const [campRes, leadsRes, profileRes] = await Promise.all([supabase.from("campaigns").select("*").eq("id", campaignId).single(), supabase.from("leads").select("*").eq("campaign_id", campaignId).order("created_at", {
        ascending: true
      }), supabase.from("profiles").select("*").eq("id", (await supabase.auth.getUser()).data.user?.id ?? "").single()]);
      if (campRes.data) {
        setCampaign(campRes.data);
        setImageUrl(campRes.data.campaign_image_url);
      }
      setLeads(leadsRes.data ?? []);
      if (profileRes.data) setProfile(profileRes.data);
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
    const eligible = leads.filter((l) => l.email && l.email_status !== "invalid" && !l.unsubscribed && l.status !== "suppressed" && l.status !== "unsubscribed" && l.status !== "bounced").length;
    return {
      total,
      verified,
      risky,
      unknown,
      invalid,
      suppressed,
      eligible
    };
  }, [leads]);
  const dailyLimit = useMemo(() => {
    if (!profile) return 50;
    const base = PLAN_LIMITS[profile.plan ?? "starter"] ?? 50;
    const daysWarm = Math.max(0, Math.floor((Date.now() - new Date(profile.created_at).getTime()) / 864e5));
    return Math.min(base, 5 + daysWarm * 5);
  }, [profile]);
  const todaySent = useMemo(() => {
    if (!profile) return 0;
    const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
    return profile.emails_sent_date === today ? profile.emails_sent_today ?? 0 : 0;
  }, [profile]);
  const estimatedBatches = Math.ceil(Math.max(0, stats.eligible - (dailyLimit - todaySent)) / dailyLimit) + 1;
  async function handleImageUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5MB");
      return;
    }
    setUploadingImage(true);
    try {
      const {
        data: u
      } = await supabase.auth.getUser();
      if (!u.user) return;
      const path = `${u.user.id}/${campaignId}/${Date.now()}-${file.name}`;
      const {
        error: uploadErr
      } = await supabase.storage.from("campaign-images").upload(path, file);
      if (uploadErr) throw new Error(uploadErr.message);
      const {
        data: urlData
      } = supabase.storage.from("campaign-images").getPublicUrl(path);
      const publicUrl = urlData.publicUrl;
      await supabase.from("campaigns").update({
        campaign_image_url: publicUrl
      }).eq("id", campaignId);
      setImageUrl(publicUrl);
      setCampaign((c) => c ? {
        ...c,
        campaign_image_url: publicUrl
      } : c);
      toast.success("Image uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingImage(false);
    }
  }
  async function removeImage() {
    await supabase.from("campaigns").update({
      campaign_image_url: null
    }).eq("id", campaignId);
    setImageUrl(null);
    setCampaign((c) => c ? {
      ...c,
      campaign_image_url: null
    } : c);
    toast.success("Image removed");
  }
  async function generatePreview(lead) {
    setPreviewLead(lead);
    setPreviewEmail(null);
    setGeneratingPreview(true);
    try {
      const {
        data,
        error
      } = await supabase.functions.invoke("generate-email", {
        body: {
          leadName: lead.name ?? "there",
          leadCompany: lead.company ?? "your company",
          leadJobTitle: lead.job_title ?? "professional",
          yourCompany: profile?.name ?? "OutreachAI",
          yourOffer: profile?.offer ?? "our service"
        }
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      const body = data.content ?? "";
      const link = profile?.website_url || profile?.booking_link || "";
      const fullBody = `${body}${link ? `

See how it works & get started: ${link}` : ""}${profile?.signature ? `

${profile.signature}` : ""}`;
      setPreviewEmail({
        subject: `Quick question about ${lead.company ?? "your business"}`,
        body: fullBody
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setGeneratingPreview(false);
    }
  }
  async function launchCampaign() {
    if (!campaign) return;
    setLaunching(true);
    try {
      const {
        data,
        error
      } = await supabase.functions.invoke("send-campaign", {
        body: {
          campaignId: campaign.id
        }
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      setLaunchResult(data);
      toast.success(data?.queued > 0 ? `Campaign launched! ${data.message}` : "Nothing new to send");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Launch failed");
    } finally {
      setLaunching(false);
    }
  }
  if (loading) {
    return /* @__PURE__ */ jsx("div", { className: "flex items-center justify-center py-20", children: /* @__PURE__ */ jsx(Loader2, { className: "h-6 w-6 animate-spin text-primary" }) });
  }
  if (!campaign) {
    return /* @__PURE__ */ jsxs("div", { className: "mx-auto max-w-4xl space-y-6", children: [
      /* @__PURE__ */ jsxs(Button, { variant: "ghost", onClick: () => navigate({
        to: "/campaigns"
      }), children: [
        /* @__PURE__ */ jsx(ArrowLeft, { className: "mr-2 h-4 w-4" }),
        " Back to Campaigns"
      ] }),
      /* @__PURE__ */ jsx("div", { className: "rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground", children: "Campaign not found." })
    ] });
  }
  return /* @__PURE__ */ jsxs("div", { className: "mx-auto max-w-5xl space-y-6", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
      /* @__PURE__ */ jsx(Button, { variant: "ghost", size: "icon", onClick: () => navigate({
        to: "/campaigns"
      }), children: /* @__PURE__ */ jsx(ArrowLeft, { className: "h-4 w-4" }) }),
      /* @__PURE__ */ jsxs("div", { className: "flex-1", children: [
        /* @__PURE__ */ jsx("h1", { className: "text-2xl font-bold tracking-tight", children: campaign.name }),
        /* @__PURE__ */ jsx("p", { className: "text-sm text-muted-foreground", children: "Campaign Review & Launch" })
      ] }),
      /* @__PURE__ */ jsx(Badge, { variant: campaign.status === "active" ? "default" : "secondary", className: campaign.status === "active" ? "bg-success/15 text-success" : "", children: campaign.status })
    ] }),
    launchResult && /* @__PURE__ */ jsxs("div", { className: "rounded-xl border border-success/20 bg-success/5 p-6 space-y-2", children: [
      /* @__PURE__ */ jsxs("h3", { className: "font-semibold text-success flex items-center gap-2", children: [
        /* @__PURE__ */ jsx(Rocket, { className: "h-4 w-4" }),
        " Campaign Launched"
      ] }),
      /* @__PURE__ */ jsx("p", { className: "text-sm text-muted-foreground", children: String(launchResult.message ?? "") }),
      /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap gap-3 text-sm", children: [
        typeof launchResult.queued === "number" && /* @__PURE__ */ jsxs(Badge, { variant: "secondary", children: [
          launchResult.queued,
          " queued"
        ] }),
        typeof launchResult.remainingToday === "number" && /* @__PURE__ */ jsxs(Badge, { variant: "secondary", children: [
          launchResult.remainingToday,
          " slots remaining today"
        ] })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "flex gap-2 mt-2", children: /* @__PURE__ */ jsx(Button, { variant: "ghost", size: "sm", onClick: () => navigate({
        to: "/campaigns"
      }), children: "Back to Campaigns" }) })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "grid gap-4 sm:grid-cols-2 lg:grid-cols-4", children: [
      /* @__PURE__ */ jsx(SummaryCard, { icon: /* @__PURE__ */ jsx(Users, { className: "h-4 w-4" }), label: "Total Leads", value: stats.total }),
      /* @__PURE__ */ jsx(SummaryCard, { icon: /* @__PURE__ */ jsx(Check, { className: "h-4 w-4 text-emerald-500" }), label: "Eligible to Send", value: stats.eligible, accent: stats.eligible > 0 }),
      /* @__PURE__ */ jsx(SummaryCard, { icon: /* @__PURE__ */ jsx(ShieldCheck, { className: "h-4 w-4 text-emerald-500" }), label: "Verified", value: stats.verified }),
      /* @__PURE__ */ jsx(SummaryCard, { icon: /* @__PURE__ */ jsx(AlertTriangle, { className: "h-4 w-4 text-amber-500" }), label: "Risky / Invalid", value: stats.risky + stats.invalid })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "rounded-2xl border border-border bg-card p-6 shadow-card", children: [
      /* @__PURE__ */ jsx("h2", { className: "text-sm font-semibold uppercase text-muted-foreground mb-4", children: "Campaign Settings" }),
      /* @__PURE__ */ jsxs("div", { className: "grid gap-4 sm:grid-cols-2 lg:grid-cols-3", children: [
        /* @__PURE__ */ jsxs("div", { className: "space-y-1", children: [
          /* @__PURE__ */ jsx("span", { className: "text-xs text-muted-foreground", children: "Sending Mode" }),
          /* @__PURE__ */ jsx("p", { className: "text-sm font-medium flex items-center gap-1.5", children: campaign.autopilot ? /* @__PURE__ */ jsxs(Fragment, { children: [
            /* @__PURE__ */ jsx(Zap, { className: "h-3.5 w-3.5 text-success" }),
            " Autopilot"
          ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
            /* @__PURE__ */ jsx(Pause, { className: "h-3.5 w-3.5" }),
            " Manual"
          ] }) })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "space-y-1", children: [
          /* @__PURE__ */ jsx("span", { className: "text-xs text-muted-foreground", children: "A/B Testing" }),
          /* @__PURE__ */ jsx("p", { className: "text-sm font-medium", children: campaign.ab_test ? "Enabled (subject variants)" : "Disabled" })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "space-y-1", children: [
          /* @__PURE__ */ jsx("span", { className: "text-xs text-muted-foreground", children: "Daily Sending Limit" }),
          /* @__PURE__ */ jsxs("p", { className: "text-sm font-medium", children: [
            dailyLimit,
            " emails/day (",
            todaySent,
            " sent today)"
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "space-y-1", children: [
          /* @__PURE__ */ jsx("span", { className: "text-xs text-muted-foreground", children: "Website / Booking Link" }),
          /* @__PURE__ */ jsxs("p", { className: "text-sm font-medium flex items-center gap-1.5", children: [
            /* @__PURE__ */ jsx(Globe, { className: "h-3.5 w-3.5 shrink-0" }),
            profile?.website_url || profile?.booking_link || "Not set"
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "space-y-1", children: [
          /* @__PURE__ */ jsx("span", { className: "text-xs text-muted-foreground", children: "Follow-ups" }),
          /* @__PURE__ */ jsx("p", { className: "text-sm font-medium flex items-center gap-1.5", children: campaign.followups_enabled !== false ? /* @__PURE__ */ jsxs(Fragment, { children: [
            /* @__PURE__ */ jsx(Clock, { className: "h-3.5 w-3.5 text-success" }),
            " Enabled (14-step sequence)"
          ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
            /* @__PURE__ */ jsx(Pause, { className: "h-3.5 w-3.5 text-muted-foreground" }),
            " Disabled"
          ] }) }),
          /* @__PURE__ */ jsx("div", { className: "mt-2 flex flex-wrap gap-1.5", children: ["Initial", "+3d", "+5d", "+10d", "+15d", "+25d", "+30d", "+2mo", "+4mo", "+5mo", "+6mo", "+8mo", "+10mo", "+12mo"].map((step, i) => /* @__PURE__ */ jsx("span", { className: `inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${i === 0 ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`, children: step }, i)) })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "space-y-1", children: [
          /* @__PURE__ */ jsx("span", { className: "text-xs text-muted-foreground", children: "Estimated Window" }),
          /* @__PURE__ */ jsxs("p", { className: "text-sm font-medium flex items-center gap-1.5", children: [
            /* @__PURE__ */ jsx(Clock, { className: "h-3.5 w-3.5 shrink-0" }),
            "~",
            estimatedBatches,
            " day",
            estimatedBatches !== 1 ? "s" : "",
            " (business hours only)"
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "mt-4 pt-4 border-t border-border", children: [
        /* @__PURE__ */ jsx("span", { className: "text-xs text-muted-foreground", children: "Campaign Image (optional)" }),
        /* @__PURE__ */ jsx("div", { className: "mt-2 flex items-center gap-3", children: imageUrl ? /* @__PURE__ */ jsxs("div", { className: "relative", children: [
          /* @__PURE__ */ jsx("img", { src: imageUrl, alt: "Campaign", className: "h-20 rounded-lg border border-border object-cover" }),
          /* @__PURE__ */ jsx("button", { onClick: removeImage, className: "absolute -top-1.5 -right-1.5 bg-background border border-border rounded-full p-0.5 hover:bg-destructive/10", children: /* @__PURE__ */ jsx(X, { className: "h-3 w-3" }) })
        ] }) : /* @__PURE__ */ jsxs("label", { className: "flex items-center gap-2 cursor-pointer rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground hover:bg-muted/50 transition-colors", children: [
          /* @__PURE__ */ jsx(Upload, { className: "h-4 w-4" }),
          uploadingImage ? "Uploading..." : "Upload image (optional)",
          /* @__PURE__ */ jsx("input", { type: "file", accept: "image/*", className: "hidden", onChange: handleImageUpload, disabled: uploadingImage })
        ] }) })
      ] })
    ] }),
    (stats.invalid > 0 || stats.suppressed > 0) && /* @__PURE__ */ jsx("div", { className: "rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/20 p-4", children: /* @__PURE__ */ jsxs("div", { className: "flex items-start gap-2", children: [
      /* @__PURE__ */ jsx(AlertTriangle, { className: "h-4 w-4 text-amber-600 shrink-0 mt-0.5" }),
      /* @__PURE__ */ jsxs("div", { className: "text-sm", children: [
        stats.invalid > 0 && /* @__PURE__ */ jsxs("p", { className: "text-amber-700 dark:text-amber-400", children: [
          stats.invalid,
          " invalid email",
          stats.invalid !== 1 ? "s" : "",
          " will be excluded from sending."
        ] }),
        stats.suppressed > 0 && /* @__PURE__ */ jsxs("p", { className: "text-amber-700 dark:text-amber-400", children: [
          stats.suppressed,
          " suppressed/unsubscribed lead",
          stats.suppressed !== 1 ? "s" : "",
          " will be excluded."
        ] })
      ] })
    ] }) }),
    /* @__PURE__ */ jsxs("div", { className: "rounded-2xl border border-border bg-card shadow-card", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between p-4 border-b border-border", children: [
        /* @__PURE__ */ jsxs("h2", { className: "text-sm font-semibold uppercase text-muted-foreground", children: [
          "Leads (",
          stats.eligible,
          " eligible of ",
          stats.total,
          ")"
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "flex gap-2", children: [
          stats.verified > 0 && /* @__PURE__ */ jsxs(Badge, { className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800", children: [
            stats.verified,
            " verified"
          ] }),
          stats.risky > 0 && /* @__PURE__ */ jsxs(Badge, { className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800", children: [
            stats.risky,
            " risky"
          ] }),
          stats.unknown > 0 && /* @__PURE__ */ jsxs(Badge, { variant: "secondary", children: [
            stats.unknown,
            " unknown"
          ] }),
          stats.invalid > 0 && /* @__PURE__ */ jsxs(Badge, { className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800", children: [
            stats.invalid,
            " invalid"
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "divide-y divide-border", children: leads.map((lead) => {
        const isInvalid = lead.email_status === "invalid";
        lead.email_status === "risky";
        const isSuppressed = lead.unsubscribed || lead.status === "suppressed" || lead.status === "unsubscribed" || lead.status === "bounced";
        const isEligible = lead.email && !isInvalid && !isSuppressed;
        return /* @__PURE__ */ jsxs("div", { className: `flex items-center gap-4 p-4 ${!isEligible ? "opacity-60" : ""}`, children: [
          /* @__PURE__ */ jsx("div", { className: "shrink-0", children: isEligible ? /* @__PURE__ */ jsx("div", { className: "flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30", children: /* @__PURE__ */ jsx(Check, { className: "h-4 w-4 text-emerald-600 dark:text-emerald-400" }) }) : /* @__PURE__ */ jsx("div", { className: "flex h-8 w-8 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30", children: /* @__PURE__ */ jsx(X, { className: "h-4 w-4 text-red-600 dark:text-red-400" }) }) }),
          /* @__PURE__ */ jsxs("div", { className: "flex-1 min-w-0", children: [
            /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
              /* @__PURE__ */ jsx("span", { className: "font-medium text-sm truncate", children: lead.company || lead.name || "Unknown" }),
              lead.email_status && /* @__PURE__ */ jsxs("span", { className: `inline-flex items-center gap-1 text-xs font-medium ${lead.email_status === "verified" ? "text-emerald-600 dark:text-emerald-400" : lead.email_status === "risky" ? "text-amber-600 dark:text-amber-400" : lead.email_status === "invalid" ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`, children: [
                lead.email_status === "verified" ? /* @__PURE__ */ jsx(ShieldCheck, { className: "h-3 w-3" }) : lead.email_status === "risky" ? /* @__PURE__ */ jsx(ShieldAlert, { className: "h-3 w-3" }) : lead.email_status === "invalid" ? /* @__PURE__ */ jsx(ShieldX, { className: "h-3 w-3" }) : /* @__PURE__ */ jsx(Shield, { className: "h-3 w-3" }),
                lead.email_status,
                " ",
                lead.email_confidence ? `(${lead.email_confidence}%)` : ""
              ] }),
              isSuppressed && /* @__PURE__ */ jsx(Badge, { variant: "destructive", className: "text-xs", children: lead.status })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 text-xs text-muted-foreground mt-0.5", children: [
              /* @__PURE__ */ jsx(Mail, { className: "h-3 w-3" }),
              /* @__PURE__ */ jsx("span", { className: "truncate", children: lead.email }),
              lead.city && /* @__PURE__ */ jsxs("span", { children: [
                "· ",
                lead.city,
                lead.country ? `, ${lead.country}` : ""
              ] })
            ] }),
            lead.email_verification_reason && /* @__PURE__ */ jsx("p", { className: "text-xs text-muted-foreground/70 mt-0.5 truncate", children: lead.email_verification_reason })
          ] }),
          /* @__PURE__ */ jsx(Button, { variant: "ghost", size: "sm", onClick: () => generatePreview(lead), disabled: generatingPreview && previewLead?.id === lead.id, className: "shrink-0", children: generatingPreview && previewLead?.id === lead.id ? /* @__PURE__ */ jsx(Loader2, { className: "h-3.5 w-3.5 animate-spin" }) : /* @__PURE__ */ jsxs(Fragment, { children: [
            /* @__PURE__ */ jsx(Eye, { className: "h-3.5 w-3.5 mr-1" }),
            " Preview"
          ] }) })
        ] }, lead.id);
      }) })
    ] }),
    previewLead && /* @__PURE__ */ jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-black/50", onClick: () => {
      setPreviewLead(null);
      setPreviewEmail(null);
    }, children: /* @__PURE__ */ jsxs("div", { className: "mx-4 w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-xl", onClick: (e) => e.stopPropagation(), children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between mb-4", children: [
        /* @__PURE__ */ jsx("h3", { className: "font-semibold", children: "Email Preview" }),
        /* @__PURE__ */ jsx("button", { onClick: () => {
          setPreviewLead(null);
          setPreviewEmail(null);
        }, className: "text-muted-foreground hover:text-foreground", children: /* @__PURE__ */ jsx(X, { className: "h-4 w-4" }) })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "space-y-3", children: [
        /* @__PURE__ */ jsxs("div", { className: "text-xs text-muted-foreground", children: [
          "To: ",
          previewLead.email,
          " (",
          previewLead.name ?? "Unknown",
          ")"
        ] }),
        generatingPreview ? /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 py-8 text-sm text-muted-foreground justify-center", children: [
          /* @__PURE__ */ jsx(Loader2, { className: "h-4 w-4 animate-spin" }),
          " Generating preview..."
        ] }) : previewEmail ? /* @__PURE__ */ jsxs("div", { className: "rounded-xl border border-border bg-muted/30 p-4 space-y-3", children: [
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("span", { className: "text-xs font-semibold uppercase text-muted-foreground", children: "Subject" }),
            /* @__PURE__ */ jsx("p", { className: "text-sm font-medium mt-0.5", children: previewEmail.subject })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "border-t border-border pt-3", children: [
            /* @__PURE__ */ jsx("span", { className: "text-xs font-semibold uppercase text-muted-foreground", children: "Body" }),
            /* @__PURE__ */ jsx("p", { className: "text-sm whitespace-pre-wrap mt-0.5 leading-relaxed", children: previewEmail.body })
          ] }),
          imageUrl && /* @__PURE__ */ jsxs("div", { className: "border-t border-border pt-3", children: [
            /* @__PURE__ */ jsx("span", { className: "text-xs font-semibold uppercase text-muted-foreground", children: "Image" }),
            /* @__PURE__ */ jsx("img", { src: imageUrl, alt: "Campaign image", className: "mt-1 rounded-lg max-h-32 object-cover" })
          ] })
        ] }) : /* @__PURE__ */ jsx("div", { className: "text-sm text-muted-foreground py-4 text-center", children: "Click a lead's Preview button to generate an email preview." })
      ] })
    ] }) }),
    !launchResult && /* @__PURE__ */ jsxs("div", { className: "sticky bottom-0 flex items-center justify-between rounded-xl border border-primary/20 bg-card p-4 shadow-glow", children: [
      /* @__PURE__ */ jsxs("div", { className: "text-sm", children: [
        /* @__PURE__ */ jsxs("p", { className: "font-medium", children: [
          stats.eligible,
          " lead",
          stats.eligible !== 1 ? "s" : "",
          " will be queued for sending"
        ] }),
        /* @__PURE__ */ jsxs("p", { className: "text-muted-foreground text-xs", children: [
          stats.invalid > 0 && `${stats.invalid} invalid excluded. `,
          stats.risky > 0 && `${stats.risky} risky will be sent with caution. `,
          "Gmail sends one by one during business hours."
        ] })
      ] }),
      /* @__PURE__ */ jsx(Button, { onClick: launchCampaign, disabled: launching || stats.eligible === 0 || campaign.status !== "active", className: "bg-gradient-primary px-6", size: "lg", children: launching ? /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx(Loader2, { className: "mr-2 h-4 w-4 animate-spin" }),
        " Launching..."
      ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx(Send, { className: "mr-2 h-4 w-4" }),
        " Launch Campaign"
      ] }) })
    ] })
  ] });
}
function SummaryCard({
  icon,
  label,
  value,
  accent
}) {
  return /* @__PURE__ */ jsxs("div", { className: `rounded-xl border p-4 ${accent ? "border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20" : "border-border bg-card"}`, children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 text-xs text-muted-foreground", children: [
      icon,
      " ",
      label
    ] }),
    /* @__PURE__ */ jsx("div", { className: "mt-1 text-2xl font-bold", children: value })
  ] });
}
export {
  CampaignReviewPage as component
};
//# sourceMappingURL=campaign-review._campaignId-Cb2VgSD0.js.map
