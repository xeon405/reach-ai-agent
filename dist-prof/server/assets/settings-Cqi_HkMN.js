import { jsx, jsxs, Fragment } from "react/jsx-runtime";
import { useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { useState, useEffect } from "react";
import { s as supabase } from "./client-Bf7kAZ3f.js";
import { b as buildGmailAuthUrl } from "./gmail-oauth-qlLqUCnj.js";
import { c as cn, B as Button } from "./button-DjOZMqFS.js";
import { I as Input } from "./input-D_U8fI25.js";
import { L as Label } from "./label-C8WJLhmR.js";
import * as SwitchPrimitives from "@radix-ui/react-switch";
import { T as Textarea } from "./textarea-F69quoCd.js";
import { S as Select, c as SelectTrigger, d as SelectValue, a as SelectContent, b as SelectItem } from "./select-aG-zsZPc.js";
import { B as Badge } from "./badge-YM7oB01y.js";
import { toast } from "sonner";
import { u as usePushNotifications } from "./use-push-notifications-BOpvgHd1.js";
import { Check, AlertTriangle } from "lucide-react";
import "@supabase/supabase-js";
import "@radix-ui/react-slot";
import "class-variance-authority";
import "clsx";
import "tailwind-merge";
import "@radix-ui/react-label";
import "@radix-ui/react-select";
const Switch = React.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(
  SwitchPrimitives.Root,
  {
    className: cn(
      "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input",
      className
    ),
    ...props,
    ref,
    children: /* @__PURE__ */ jsx(
      SwitchPrimitives.Thumb,
      {
        className: cn(
          "pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0"
        )
      }
    )
  }
));
Switch.displayName = SwitchPrimitives.Root.displayName;
function SettingsPage() {
  const navigate = useNavigate();
  const push = usePushNotifications();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [gmail, setGmail] = useState(false);
  const [gmailEmail, setGmailEmail] = useState("");
  const [notify, setNotify] = useState(true);
  const [booking, setBooking] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [signature, setSignature] = useState("");
  const [autopilot, setAutopilot] = useState(false);
  const [apCountry, setApCountry] = useState("");
  const [apNiche, setApNiche] = useState("");
  const [saving, setSaving] = useState(false);
  const [referral, setReferral] = useState(null);
  const [invited, setInvited] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [company, setCompany] = useState("");
  const [businessDescription, setBusinessDescription] = useState("");
  const [offer, setOffer] = useState("");
  const [problemSolved, setProblemSolved] = useState("");
  const [targetCustomer, setTargetCustomer] = useState("");
  const [jobTitles, setJobTitles] = useState("");
  const [industries, setIndustries] = useState("");
  const [companySize, setCompanySize] = useState("1-50");
  const [countries, setCountries] = useState([]);
  const [cities, setCities] = useState("");
  const [communicationStyle, setCommunicationStyle] = useState("");
  const [dontClaim, setDontClaim] = useState("");
  const [phone, setPhone] = useState("");
  const [networkMode, setNetworkMode] = useState(false);
  const [rewardPlan, setRewardPlan] = useState(null);
  const [rewardUntil, setRewardUntil] = useState(null);
  async function exportData() {
    setExporting(true);
    try {
      const {
        data: u
      } = await supabase.auth.getUser();
      if (!u.user) return;
      const uid = u.user.id;
      const [profile, campaigns, leads, emails, referrals] = await Promise.all([supabase.from("profiles").select("*").eq("id", uid), supabase.from("campaigns").select("*").eq("user_id", uid), supabase.from("leads").select("*").eq("user_id", uid), supabase.from("emails_sent").select("*").eq("user_id", uid), supabase.from("referrals").select("*").eq("referrer_id", uid)]);
      const bundle = {
        exported_at: (/* @__PURE__ */ new Date()).toISOString(),
        note: "Full export of your OutreachAI data. Gmail access tokens are intentionally excluded — disconnect in Settings or via Google Account to revoke them.",
        profile: profile.data ?? [],
        campaigns: campaigns.data ?? [],
        leads: leads.data ?? [],
        emails_sent: emails.data ?? [],
        referrals: referrals.data ?? []
      };
      const blob = new Blob([JSON.stringify(bundle, null, 2)], {
        type: "application/json"
      });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `outreachai-data-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success("Your data has been downloaded");
    } catch {
      toast.error("Export failed — please try again");
    } finally {
      setExporting(false);
    }
  }
  useEffect(() => {
    supabase.auth.getUser().then(async ({
      data
    }) => {
      if (!data.user) return;
      setEmail(data.user.email ?? "");
      const {
        data: p
      } = await supabase.from("profiles").select("*").eq("id", data.user.id).single();
      if (p) {
        setName(p.name ?? "");
        setGmail(p.gmail_connected ?? false);
        setGmailEmail(p.gmail_email ?? "");
        setNotify(p.notify_replies ?? true);
        setBooking(p.booking_link ?? "");
        setWebsiteUrl(p.website_url ?? "");
        setSignature(p.signature ?? "");
        setAutopilot(p.autopilot ?? false);
        setApCountry(p.autopilot_country ?? "");
        setApNiche(p.autopilot_niche ?? "");
        setCompany(p.company ?? "");
        setBusinessDescription(p.business_description ?? "");
        setOffer(p.offer ?? "");
        setProblemSolved(p.problem_solved ?? "");
        setTargetCustomer(p.target_customer ?? "");
        setCountries(p.icp?.countries ?? []);
        setCities((p.cities ?? []).join(", "));
        setCompanySize(p.icp?.companySize ?? "1-50");
        setJobTitles(p.icp?.jobTitle ?? "");
        setIndustries(p.icp?.industry ?? "");
        setCommunicationStyle(p.communication_style ?? "");
        setDontClaim(p.dont_claim ?? "");
        setPhone(p.phone ?? "");
        setNetworkMode(p.network_mode ?? false);
        setRewardPlan(p.referral_reward_plan ?? null);
        setRewardUntil(p.referral_reward_until ?? null);
        if (p.referral_code) {
          setReferral(p.referral_code);
          const {
            count
          } = await supabase.rpc("referral_count").single();
          setInvited(Number(count) || 0);
        }
      }
    });
  }, []);
  function connectGmail() {
    window.location.href = buildGmailAuthUrl();
  }
  async function disconnectGmail() {
    const {
      data: u
    } = await supabase.auth.getUser();
    if (!u.user) return;
    const {
      error
    } = await supabase.functions.invoke("gmail-oauth", {
      body: {
        action: "disconnect"
      }
    });
    if (error) {
      toast.error("Could not disconnect Gmail. Try again.");
      return;
    }
    setGmail(false);
    setGmailEmail("");
    toast.success("Gmail disconnected");
  }
  async function save() {
    setSaving(true);
    const {
      data: u
    } = await supabase.auth.getUser();
    if (!u.user) return;
    const {
      error
    } = await supabase.from("profiles").update({
      name,
      company: company || null,
      notify_replies: notify,
      booking_link: booking.trim() || null,
      website_url: websiteUrl.trim() || null,
      signature: signature.trim() || null,
      autopilot: autopilot && apCountry.trim().length > 0 && apNiche.trim().length > 0,
      autopilot_country: apCountry.trim() || null,
      autopilot_niche: apNiche.trim() || null,
      offer: offer.trim() || null,
      business_description: businessDescription.trim() || null,
      problem_solved: problemSolved.trim() || null,
      target_customer: targetCustomer.trim() || null,
      icp: {
        jobTitle: jobTitles || null,
        industry: industries || null,
        companySize,
        countries
      },
      cities: cities.split(",").map((c) => c.trim()).filter(Boolean) || null,
      communication_style: communicationStyle.trim() || null,
      dont_claim: dontClaim.trim() || null,
      phone: phone.trim() || null,
      network_mode: networkMode
    }).eq("id", u.user.id);
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Settings saved");
  }
  async function deleteAccount() {
    if (!confirm("Permanently delete your account and ALL your data? This cannot be undone.")) return;
    try {
      const {
        error
      } = await supabase.functions.invoke("delete-account", {
        body: {}
      });
      if (error) throw error;
      await supabase.auth.signOut();
      toast.success("Account and all data permanently deleted.");
      navigate({
        to: "/"
      });
    } catch {
      toast.error("Could not delete account. Please contact support.");
    }
  }
  return /* @__PURE__ */ jsxs("div", { className: "w-full space-y-8", children: [
    /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsx("h1", { className: "text-3xl font-bold tracking-tight", children: "Settings" }),
      /* @__PURE__ */ jsx("p", { className: "text-sm text-muted-foreground", children: "Manage your profile and integrations." })
    ] }),
    /* @__PURE__ */ jsxs(Section, { title: "Profile", children: [
      /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
        /* @__PURE__ */ jsx(Label, { children: "Name" }),
        /* @__PURE__ */ jsx(Input, { value: name, onChange: (e) => setName(e.target.value) })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
        /* @__PURE__ */ jsx(Label, { children: "Company" }),
        /* @__PURE__ */ jsx(Input, { value: company, onChange: (e) => setCompany(e.target.value), placeholder: "Acme Inc." })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
        /* @__PURE__ */ jsx(Label, { children: "Email" }),
        /* @__PURE__ */ jsx(Input, { value: email, disabled: true })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
        /* @__PURE__ */ jsxs(Label, { children: [
          "Phone ",
          /* @__PURE__ */ jsx("span", { className: "text-muted-foreground", children: "(shown to clients when the AI hands off a conversation to you)" })
        ] }),
        /* @__PURE__ */ jsx(Input, { value: phone, onChange: (e) => setPhone(e.target.value), placeholder: "+1 555 000 1234" })
      ] })
    ] }),
    /* @__PURE__ */ jsxs(Section, { title: "Business Intelligence", children: [
      /* @__PURE__ */ jsx("p", { className: "text-xs text-muted-foreground -mt-2 mb-2", children: "The AI uses everything below to write personalized outreach. It will not invent facts — only use what you tell it here." }),
      /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
        /* @__PURE__ */ jsx(Label, { children: "What is your business?" }),
        /* @__PURE__ */ jsx(Textarea, { rows: 2, value: businessDescription, onChange: (e) => setBusinessDescription(e.target.value), placeholder: "e.g. We build AI-powered sales automation software for B2B companies." })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
        /* @__PURE__ */ jsx(Label, { children: "What product or service are you selling?" }),
        /* @__PURE__ */ jsx(Textarea, { rows: 2, value: offer, onChange: (e) => setOffer(e.target.value), placeholder: "e.g. A monthly SaaS subscription that automates cold email outreach." })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
        /* @__PURE__ */ jsx(Label, { children: "What problem does it solve?" }),
        /* @__PURE__ */ jsx(Textarea, { rows: 2, value: problemSolved, onChange: (e) => setProblemSolved(e.target.value), placeholder: "e.g. Sales teams waste hours writing cold emails that get ignored." })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
        /* @__PURE__ */ jsx(Label, { children: "Who is your ideal customer?" }),
        /* @__PURE__ */ jsx(Textarea, { rows: 2, value: targetCustomer, onChange: (e) => setTargetCustomer(e.target.value), placeholder: "e.g. Marketing directors at mid-size SaaS companies." })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "grid gap-3 sm:grid-cols-2", children: [
        /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsx(Label, { children: "Job titles" }),
          /* @__PURE__ */ jsx(Input, { value: jobTitles, onChange: (e) => setJobTitles(e.target.value), placeholder: "e.g. Marketing Manager, CEO" })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsx(Label, { children: "Industries" }),
          /* @__PURE__ */ jsx(Input, { value: industries, onChange: (e) => setIndustries(e.target.value), placeholder: "e.g. SaaS, E-commerce" })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsx(Label, { children: "Company size" }),
          /* @__PURE__ */ jsxs(Select, { value: companySize, onValueChange: setCompanySize, children: [
            /* @__PURE__ */ jsx(SelectTrigger, { children: /* @__PURE__ */ jsx(SelectValue, {}) }),
            /* @__PURE__ */ jsxs(SelectContent, { children: [
              /* @__PURE__ */ jsx(SelectItem, { value: "1-10", children: "1-10" }),
              /* @__PURE__ */ jsx(SelectItem, { value: "10-50", children: "10-50" }),
              /* @__PURE__ */ jsx(SelectItem, { value: "50-200", children: "50-200" }),
              /* @__PURE__ */ jsx(SelectItem, { value: "200+", children: "200+" })
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsx(Label, { children: "Cities (optional)" }),
          /* @__PURE__ */ jsx(Input, { value: cities, onChange: (e) => setCities(e.target.value), placeholder: "New York, London" })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
        /* @__PURE__ */ jsx(Label, { children: "What should OutreachAI communicate?" }),
        /* @__PURE__ */ jsx(Textarea, { rows: 2, value: communicationStyle, onChange: (e) => setCommunicationStyle(e.target.value), placeholder: "e.g. Be direct, lead with ROI, sound like a peer." })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
        /* @__PURE__ */ jsx(Label, { children: "What should OutreachAI NEVER claim?" }),
        /* @__PURE__ */ jsx(Textarea, { rows: 2, value: dontClaim, onChange: (e) => setDontClaim(e.target.value), placeholder: "e.g. Never promise specific revenue numbers." })
      ] })
    ] }),
    /* @__PURE__ */ jsx(Section, { title: "Connected accounts", children: /* @__PURE__ */ jsxs("div", { className: "flex flex-col gap-3 rounded-xl border border-border bg-background/40 p-4 sm:flex-row sm:items-center sm:justify-between", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("div", { className: "font-medium", children: "Gmail" }),
        /* @__PURE__ */ jsx("div", { className: "text-xs text-muted-foreground", children: gmail && gmailEmail ? `Connected as ${gmailEmail}` : "Send cold emails from your inbox." })
      ] }),
      gmail ? /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxs(Badge, { className: "bg-success/15 text-success", variant: "secondary", children: [
          /* @__PURE__ */ jsx(Check, { className: "mr-1 h-3 w-3" }),
          " Connected"
        ] }),
        /* @__PURE__ */ jsx(Button, { size: "sm", variant: "ghost", className: "text-destructive text-xs", onClick: disconnectGmail, children: "Disconnect" })
      ] }) : /* @__PURE__ */ jsx(Button, { size: "sm", variant: "outline", onClick: connectGmail, children: "Connect Gmail" })
    ] }) }),
    /* @__PURE__ */ jsxs(Section, { title: "Notifications", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex flex-col gap-3 rounded-xl border border-border bg-background/40 p-4 sm:flex-row sm:items-center sm:justify-between", children: [
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("div", { className: "font-medium", children: "Email alerts for replies" }),
          /* @__PURE__ */ jsx("div", { className: "text-xs text-muted-foreground", children: "Get notified the moment a lead responds." })
        ] }),
        /* @__PURE__ */ jsx(Switch, { checked: notify, onCheckedChange: setNotify })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "space-y-1.5 rounded-xl border border-border bg-background/40 p-4", children: [
        /* @__PURE__ */ jsx(Label, { htmlFor: "booking", children: "Booking link (optional)" }),
        /* @__PURE__ */ jsx(Input, { id: "booking", placeholder: "https://cal.com/you/15min", value: booking, onChange: (e) => setBooking(e.target.value) }),
        /* @__PURE__ */ jsx("p", { className: "text-xs text-muted-foreground", children: "Have a website or app? Add it below — the AI will read it, answer lead questions itself, and send them to your site." }),
        /* @__PURE__ */ jsx(Label, { htmlFor: "websiteUrl", children: "Your website or app (optional)" }),
        /* @__PURE__ */ jsx(Input, { id: "websiteUrl", placeholder: "https://yourproduct.com", value: websiteUrl, onChange: (e) => setWebsiteUrl(e.target.value) }),
        /* @__PURE__ */ jsx("p", { className: "text-xs text-muted-foreground", children: "Added to every email — interested leads can book a meeting with one click." }),
        /* @__PURE__ */ jsx(Label, { htmlFor: "signature", className: "pt-2", children: "Email signature (optional)" }),
        /* @__PURE__ */ jsx("textarea", { id: "signature", rows: 3, placeholder: "Alex Rivera\nFounder, Rivera Consulting\n+1 555 010 2030", value: signature, onChange: (e) => setSignature(e.target.value), className: "w-full rounded-md border border-input bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring" }),
        /* @__PURE__ */ jsx("p", { className: "text-xs text-muted-foreground", children: "Appended at the end of every email your agent sends — looks professional and builds recognition." })
      ] })
    ] }),
    /* @__PURE__ */ jsx(Section, { title: "Warm network", children: /* @__PURE__ */ jsxs("div", { className: "flex flex-col gap-3 rounded-xl border border-border bg-background/40 p-4 sm:flex-row sm:items-center sm:justify-between", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("div", { className: "font-medium", children: "Discoverable by other businesses" }),
        /* @__PURE__ */ jsx("div", { className: "text-xs text-muted-foreground", children: "Let other OutreachAI users find your business in their AI lead search and request a warm intro. Your email and phone are never shown — you approve every intro first." })
      ] }),
      /* @__PURE__ */ jsx(Switch, { checked: networkMode, onCheckedChange: setNetworkMode })
    ] }) }),
    /* @__PURE__ */ jsx("div", { className: "flex gap-2", children: /* @__PURE__ */ jsx(Button, { onClick: save, disabled: saving, className: "bg-gradient-primary shadow-glow", children: "Save changes" }) }),
    /* @__PURE__ */ jsx(Section, { title: "Autopilot 🤖", children: /* @__PURE__ */ jsxs("div", { className: "space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-4", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between", children: [
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("div", { className: "font-medium", children: "Fully autonomous outreach" }),
          /* @__PURE__ */ jsx("div", { className: "text-xs text-muted-foreground", children: "The agent finds fresh leads daily, tops up your campaign, and sends within safe limits. You just read replies." })
        ] }),
        /* @__PURE__ */ jsx(Switch, { checked: autopilot, onCheckedChange: setAutopilot })
      ] }),
      autopilot && /* @__PURE__ */ jsxs("div", { className: "grid gap-3 sm:grid-cols-2", children: [
        /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsx(Label, { htmlFor: "ap-country", children: "Target country" }),
          /* @__PURE__ */ jsx(Input, { id: "ap-country", placeholder: "united states", value: apCountry, onChange: (e) => setApCountry(e.target.value) })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsx(Label, { htmlFor: "ap-niche", children: "Target niche" }),
          /* @__PURE__ */ jsx(Input, { id: "ap-niche", placeholder: "marketing agency", value: apNiche, onChange: (e) => setApNiche(e.target.value) })
        ] }),
        /* @__PURE__ */ jsx("p", { className: "text-xs text-muted-foreground sm:col-span-2", children: "Saved when you press Save changes. Runs daily while Gmail stays connected." })
      ] })
    ] }) }),
    /* @__PURE__ */ jsx(Section, { title: "Invite & earn", children: /* @__PURE__ */ jsxs("div", { className: "rounded-xl border border-primary/30 bg-primary/5 p-4", children: [
      /* @__PURE__ */ jsx("div", { className: "font-medium", children: "Your invite link" }),
      /* @__PURE__ */ jsx("div", { className: "mt-1 text-xs text-muted-foreground", children: "Every friend who joins through your link earns you 7 days of free starter access — stack them. Your friends still start free, no catch." }),
      rewardPlan && rewardUntil && new Date(rewardUntil).getTime() > Date.now() && /* @__PURE__ */ jsxs("div", { className: "mt-2 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400", children: [
        "🎁 +7 free days earned — ",
        /* @__PURE__ */ jsx("span", { className: "uppercase", children: rewardPlan }),
        " access until",
        " ",
        new Date(rewardUntil).toLocaleDateString()
      ] }),
      referral && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsxs("div", { className: "mt-3 flex items-center gap-2", children: [
          /* @__PURE__ */ jsx("code", { className: "flex-1 truncate rounded-md border bg-background px-3 py-2 text-xs", children: typeof window !== "undefined" ? `${window.location.origin}/auth?ref=${referral}` : "" }),
          /* @__PURE__ */ jsx(Button, { size: "sm", variant: "outline", onClick: () => {
            navigator.clipboard.writeText(`${window.location.origin}/auth?ref=${referral}`);
            toast.success("Invite link copied!");
          }, children: "Copy" })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "mt-2 text-xs font-medium text-primary", children: [
          invited,
          " ",
          invited === 1 ? "person" : "people",
          " joined with your link"
        ] })
      ] })
    ] }) }),
    /* @__PURE__ */ jsxs(Section, { title: "Notifications", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex min-w-0 flex-col gap-1", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 font-medium", children: [
            "Push notifications on this device",
            push.active && /* @__PURE__ */ jsx(Badge, { className: "bg-green-600", children: "On" })
          ] }),
          /* @__PURE__ */ jsx("div", { className: "text-xs text-muted-foreground", children: "Get notified when a lead replies, books a call, or sends an intro request — even when the app is closed." })
        ] }),
        /* @__PURE__ */ jsx(Switch, { checked: !!push.active, disabled: push.busy || push.active === null, onCheckedChange: async (on) => {
          if (on) {
            const res = await push.enable();
            if (res.ok) toast.success("Notifications enabled on this device.");
            else {
              toast.error(res.reason ?? "Couldn't enable notifications.");
              push.refresh();
            }
          } else {
            await push.disable();
            toast.success("Notifications disabled on this device.");
          }
        }, className: "shrink-0 self-start sm:self-auto" })
      ] }),
      /* @__PURE__ */ jsx("p", { className: "mt-2 px-1 text-xs text-muted-foreground", children: "Works on desktop browsers, Android, and the installed app (iOS needs the app icon on your home screen)." })
    ] }),
    /* @__PURE__ */ jsx(Section, { title: "Your data", children: /* @__PURE__ */ jsxs("div", { className: "flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("div", { className: "font-medium", children: "Download my data" }),
        /* @__PURE__ */ jsx("div", { className: "text-xs text-muted-foreground", children: "Export your profile, campaigns, leads, and email history as a JSON file." })
      ] }),
      /* @__PURE__ */ jsx(Button, { variant: "outline", size: "sm", onClick: exportData, disabled: exporting, className: "shrink-0 self-start sm:self-auto", children: exporting ? "Exporting…" : "Export" })
    ] }) }),
    /* @__PURE__ */ jsx(Section, { title: "Danger zone", children: /* @__PURE__ */ jsxs("div", { className: "flex flex-col gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 sm:flex-row sm:items-center sm:justify-between", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-start gap-3", children: [
        /* @__PURE__ */ jsx(AlertTriangle, { className: "mt-0.5 h-4 w-4 text-destructive" }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("div", { className: "font-medium", children: "Delete account" }),
          /* @__PURE__ */ jsx("div", { className: "text-xs text-muted-foreground", children: "Permanent. We cannot recover your data." })
        ] })
      ] }),
      /* @__PURE__ */ jsx(Button, { variant: "destructive", size: "sm", onClick: deleteAccount, children: "Delete" })
    ] }) })
  ] });
}
function Section({
  title,
  children
}) {
  return /* @__PURE__ */ jsxs("div", { className: "rounded-2xl border border-border bg-card p-6 shadow-card", children: [
    /* @__PURE__ */ jsx("h2", { className: "mb-4 text-lg font-semibold", children: title }),
    /* @__PURE__ */ jsx("div", { className: "space-y-4", children })
  ] });
}
export {
  SettingsPage as component
};
//# sourceMappingURL=settings-Cqi_HkMN.js.map
