import { jsxs, jsx, Fragment } from "react/jsx-runtime";
import { useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { s as supabase } from "./client-Bf7kAZ3f.js";
import { B as Button } from "./button-DjOZMqFS.js";
import { I as Input } from "./input-D_U8fI25.js";
import { B as Badge } from "./badge-YM7oB01y.js";
import { D as Dialog, e as DialogTrigger, a as DialogContent, c as DialogHeader, d as DialogTitle, b as DialogFooter } from "./dialog-Bq_UdvUi.js";
import { Sparkles, Loader2, Plus, Zap, Clock, Eye, Send, Pencil, Pause, Play, Trash2 } from "lucide-react";
import { toast } from "sonner";
import "@supabase/supabase-js";
import "@radix-ui/react-slot";
import "class-variance-authority";
import "clsx";
import "tailwind-merge";
import "@radix-ui/react-dialog";
const TEMPLATES = [
  {
    niche: "Real Estate",
    name: "Listing exposure audit",
    subject: "{{first_name}}, quick idea for {{company}}'s listings",
    body: "Hi {{first_name}},\n\nI noticed {{company}} has several active listings — are they getting the online attention they deserve?\n\nI run AI-powered email outreach that puts listings in front of qualified buyers automatically. For a firm your size, that usually means 5-10 extra viewings a month without extra ad spend.\n\nWorth a quick 10-minute call this week? Here's my calendar: {{booking_link}}\n\nBest regards,\n{{sender_name}}"
  },
  {
    niche: "Real Estate",
    name: "Expired listing revival",
    subject: "Idea for the unsold listings at {{company}}",
    body: "Hi {{first_name}},\n\nUnsold listings usually aren't a pricing problem — they're an exposure problem.\n\nI help agencies like {{company}} reach hundreds of potential buyers directly in their inbox using automated personalized outreach. No ad budget needed.\n\nOpen to seeing how it works on one listing? I'll show you free.\n\nBest regards,\n{{sender_name}}"
  },
  {
    niche: "Marketing Agencies",
    name: "White-label partnership",
    subject: "Extra revenue stream for {{company}}?",
    body: "Hi {{first_name}},\n\nQuick question — when clients ask {{company}} for email outreach, do you run it in-house or turn it away?\n\nI provide white-label AI outreach: you sell it, we run it, your brand on everything. Agencies typically add $2-4k MRR with zero extra workload.\n\nCan I show you how it works? {{booking_link}}\n\nBest regards,\n{{sender_name}}"
  },
  {
    niche: "Marketing Agencies",
    name: "Capacity overflow",
    subject: "When {{company}} is at capacity…",
    body: "Hi {{first_name}},\n\nEvery agency hits the wall: more clients than hours. That's usually when good retainers get turned away.\n\nMy AI outreach system fills your pipeline automatically — so the next slow month never happens. It runs from your own domain, writes like your best copywriter, and books calls straight into your calendar.\n\nWant to see a sample pipeline built for an agency like {{company}}? {{booking_link}}\n\nBest regards,\n{{sender_name}}"
  },
  {
    niche: "Dental Clinics",
    name: "Patient reactivation",
    subject: "{{first_name}} — your inactive patients list",
    body: "Hi {{first_name}},\n\nMost dental clinics sit on hundreds of patients who haven't booked in 6+ months. They don't need ads — they need a nudge.\n\nI set up AI systems that email those patients personally and bring them back for cleanings and checkups. Clinics typically recover 15-30 patients in the first month.\n\nWould it help if I showed you exactly how? {{booking_link}}\n\nBest regards,\n{{sender_name}}"
  },
  {
    niche: "Dental Clinics",
    name: "High-value treatment bookings",
    subject: "Filling {{company}}'s calendar with implant consults",
    body: "Hi {{first_name}},\n\nImplant and ortho consults are the highest-value appointments in any clinic — but they rarely come from walk-ins.\n\nI run targeted email outreach that educates local patients and books consults directly into your calendar. No ads, no cold calls — just informed patients asking for you by name.\n\nInterested in a free analysis of your local opportunity? {{booking_link}}\n\nBest regards,\n{{sender_name}}"
  },
  {
    niche: "Recruiting / Staffing",
    name: "Candidate sourcing help",
    subject: "Hard-to-fill roles at {{company}}?",
    body: "Hi {{first_name}},\n\nThe best candidates aren't on job boards anymore — they're buried in inboxes nobody reaches.\n\nI build AI outreach pipelines that contact passive candidates personally at scale. Recruiting teams use it to fill senior roles 2-3x faster without LinkedIn costs.\n\nIf {{company}} has a role that's been open too long, I'll show you what's possible. {{booking_link}}\n\nBest regards,\n{{sender_name}}"
  },
  {
    niche: "Recruiting / Staffing",
    name: "BD pipeline for agencies",
    subject: "Who finds YOUR next client, {{first_name}}?",
    body: "Hi {{first_name}},\n\nRecruiters are great at filling other companies' roles — but who fills your own client pipeline?\n\nI automate prospecting for staffing firms: AI finds companies hiring in your niches, emails them personally, and books intro calls while you focus on placements.\n\nWorth 10 minutes? {{booking_link}}\n\nBest regards,\n{{sender_name}}"
  },
  {
    niche: "SaaS / Startups",
    name: "Founder-led sales",
    subject: "{{first_name}}, outbound without hiring an SDR",
    body: "Hi {{first_name}},\n\nMost founders wait too long to hire sales — then pay $80k+ for someone who spends half their day writing emails.\n\nOutreachAI does that part automatically: finds your ideal customers, writes personal emails in your voice, follows up until they answer. Founders book 10-20 demos/month without touching a spreadsheet.\n\nWant me to show you a sample list of your ideal customers? {{booking_link}}\n\nBest regards,\n{{sender_name}}"
  },
  {
    niche: "SaaS / Startups",
    name: "Demo pipeline boost",
    subject: "More demos from your ICP, {{first_name}}",
    body: "Hi {{first_name}},\n\nQuick question: if {{product_area}} demos doubled next month, would capacity be a problem? (Good problem — but a problem.)\n\nI run AI outbound that targets your exact ICP with personal emails from your team's real inboxes. SaaS teams typically see 8-15% reply rates because it doesn't read like spam.\n\nCan I send you 3 sample emails written for {{company}}? {{booking_link}}\n\nBest regards,\n{{sender_name}}"
  },
  {
    niche: "Coaches / Consultants",
    name: "Discovery call machine",
    subject: "{{first_name}}, clients finding YOU vs chasing them",
    body: "Hi {{first_name}},\n\nThe best coaches spend their mornings coaching — not cold DMing strangers.\n\nI set up AI systems that find people actively looking for {{coaching_topic}} help and start conversations with them automatically. Coaches using this book 5-10 discovery calls a week on autopilot.\n\nWant to see what that would look like for {{company}}? {{booking_link}}\n\nBest regards,\n{{sender_name}}"
  },
  {
    niche: "E-commerce",
    name: "Wholesale/B2B channel",
    subject: "A B2B channel {{company}} isn't using yet",
    body: "Hi {{first_name}},\n\nMost DTC brands live and die by ad costs. But there's a quieter channel: direct outreach to boutiques, retailers, and corporate buyers who stock products like yours.\n\nI automate that outreach — personalized emails to thousands of potential stockists. Brands typically land their first 3-5 wholesale accounts in month one.\n\nCurious what {{product_type}} buyers exist in your region? {{booking_link}}\n\nBest regards,\n{{sender_name}}"
  },
  {
    niche: "Gyms / Fitness",
    name: "Membership revival",
    subject: "{{first_name}} — the members who stopped coming",
    body: "Hi {{first_name}},\n\nEvery gym has a silent leak: members who quietly stopped showing up and eventually cancelled.\n\nI build AI win-back campaigns that reach those people personally — with the right message at the right moment. Gyms typically reactivate 10-20% of lapsed members within weeks.\n\nWant to see the exact emails that do it? {{booking_link}}\n\nBest regards,\n{{sender_name}}"
  },
  {
    niche: "Law Firms",
    name: "Corporate client development",
    subject: "Business development without billable-hour guilt, {{first_name}}",
    body: "Hi {{first_name}},\n\nPartners lose dozens of billable hours a year to manual business development — with mixed results.\n\nI run AI outreach for law firms: it identifies companies needing {{practice_area}}, starts conversations, and only involves partners when there's genuine interest.\n\nWould a quiet pilot for {{company}} be worth exploring? {{booking_link}}\n\nBest regards,\n{{sender_name}}"
  },
  {
    niche: "Accounting / Finance",
    name: "Advisory upgrade",
    subject: "Turning compliance clients into advisory clients",
    body: "Hi {{first_name}},\n\nCompliance work pays the bills; advisory work builds the firm. The gap? Most accountants never systematically pitch advisory to existing clients.\n\nI automate that conversation — identifying which clients of {{company}} have advisory-relevant events (growth, funding, restructuring) and starting those discussions.\n\nWorth exploring before tax season? {{booking_link}}\n\nBest regards,\n{{sender_name}}"
  },
  {
    niche: "Home Services",
    name: "Commercial contracts",
    subject: "Recurring revenue idea for {{company}}",
    body: "Hi {{first_name}},\n\nResidential jobs keep the crew busy; commercial contracts make the business valuable.\n\nI reach out to property managers and facility directors in your area on your behalf — personalized emails that land maintenance contracts, not one-off jobs.\n\nWant to see a list of who needs {{service_type}} near you? {{booking_link}}\n\nBest regards,\n{{sender_name}}"
  },
  {
    niche: "Photography / Creative",
    name: "Corporate bookings",
    subject: "Corporate clients for {{company}}?",
    body: "Hi {{first_name}},\n\nWeddings and portrait sessions are feast-or-famine. Corporate work — headshots, events, brand content — is the steady retainer most studios want but rarely chase.\n\nI put {{company}} in front of marketing managers and HR directors monthly, so bookings come to you between shoots.\n\nShall I show you the local demand map? {{booking_link}}\n\nBest regards,\n{{sender_name}}"
  },
  {
    niche: "IT / MSPs",
    name: "IT audit offer",
    subject: "Free IT risk snapshot for {{company}}",
    body: "Hi {{first_name}},\n\nMost growing companies discover their IT gaps during a crisis — ransomware, an outage, a departed admin.\n\nI help MSPs reach those companies BEFORE the crisis with a free risk-snapshot offer delivered via personalized email. MSPs convert 5-10% of replies into paying clients.\n\nWant me to run this playbook for {{company}}? {{booking_link}}\n\nBest regards,\n{{sender_name}}"
  },
  {
    niche: "Insurance",
    name: "Policy review campaign",
    subject: "{{first_name}}, businesses overpaying without knowing",
    body: "Hi {{first_name}},\n\nCompanies change size, staff, and risk profile every year — but policies rarely keep up. That gap means lost premiums for brokers and gaps for clients.\n\nI run annual policy-review outreach for insurance professionals: automated, personal, compliant. Brokers typically write 20-40% more renewals.\n\nWould a pilot for your book of business help? {{booking_link}}\n\nBest regards,\n{{sender_name}}"
  },
  {
    niche: "Restaurants / Hospitality",
    name: "Catering & events B2B",
    subject: "Corporate catering leads for {{company}}",
    body: "Hi {{first_name}},\n\nWeekend rush is unpredictable; corporate catering contracts arrive every single month — office parties, client lunches, conferences.\n\nI connect {{company}} with office managers planning those events through personal email outreach. Restaurants typically add $2-6k/month in predictable catering revenue.\n\nWant a sample of upcoming opportunities near you? {{booking_link}}\n\nBest regards,\n{{sender_name}}"
  }
];
function CampaignsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState({});
  const [abStats, setAbStats] = useState(null);
  const [open, setOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [name, setName] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generatedEmail, setGeneratedEmail] = useState("");
  const [spam, setSpam] = useState(null);
  const [checkingSpam, setCheckingSpam] = useState(false);
  const [sending, setSending] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState("");
  const [aiForm, setAiForm] = useState({
    leadName: "",
    leadCompany: "",
    leadJobTitle: "",
    yourCompany: "OutreachAI",
    yourOffer: "AI-powered cold email automation that finds leads and books meetings automatically"
  });
  useEffect(() => {
    void load();
  }, []);
  async function load() {
    const {
      data
    } = await supabase.from("campaigns").select("*").order("created_at", {
      ascending: false
    });
    setItems(data ?? []);
    if (data && data.length) {
      const s = {};
      const ab = {};
      for (const c of data) {
        const [l, e, r] = await Promise.all([supabase.from("leads").select("id", {
          count: "exact",
          head: true
        }).eq("campaign_id", c.id), supabase.from("emails_sent").select("id", {
          count: "exact",
          head: true
        }).eq("campaign_id", c.id), supabase.from("emails_sent").select("id", {
          count: "exact",
          head: true
        }).eq("campaign_id", c.id).eq("replied", true)]);
        s[c.id] = {
          leads: l.count ?? 0,
          emails: e.count ?? 0,
          replies: r.count ?? 0
        };
        const [va, vb] = await Promise.all([supabase.from("emails_sent").select("opened").eq("campaign_id", c.id).eq("variant", "A"), supabase.from("emails_sent").select("opened").eq("campaign_id", c.id).eq("variant", "B")]);
        if (c.ab_test) {
          const rowsA = va.data ?? [];
          const rowsB = vb.data ?? [];
          ab[c.id] = {
            a: rowsA.length,
            aOpen: rowsA.filter((x) => x.opened).length,
            b: rowsB.length,
            bOpen: rowsB.filter((x) => x.opened).length
          };
        }
      }
      setStats(s);
      setAbStats(ab);
    }
  }
  async function setFlag(c, key, value) {
    const patch = key === "ab_test" ? {
      ab_test: value
    } : {
      autopilot: value
    };
    const {
      error
    } = await supabase.from("campaigns").update(patch).eq("id", c.id);
    if (error) toast.error(error.message);
    else toast.success(value ? "Enabled" : "Disabled");
    load();
  }
  async function setDelivery(c, delivery) {
    const {
      error
    } = await supabase.from("campaigns").update({
      delivery
    }).eq("id", c.id);
    if (error) toast.error(error.message);
    else toast.success(delivery === "instant" ? "⚡ Sending instantly on launch" : "⏰ Sending at each lead's local morning");
    load();
  }
  async function create() {
    if (!name.trim()) return;
    const {
      data: u
    } = await supabase.auth.getUser();
    if (!u.user) return;
    const {
      error
    } = await supabase.from("campaigns").insert({
      user_id: u.user.id,
      name,
      status: "active"
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Campaign created");
      setName("");
      setOpen(false);
      load();
    }
  }
  async function saveRename(c) {
    const trimmed = editingName.trim();
    if (!trimmed || trimmed === c.name) {
      setEditingId(null);
      return;
    }
    const {
      error
    } = await supabase.from("campaigns").update({
      name: trimmed
    }).eq("id", c.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Campaign renamed");
      load();
    }
    setEditingId(null);
  }
  async function toggle(c) {
    const status = c.status === "active" ? "paused" : "active";
    await supabase.from("campaigns").update({
      status
    }).eq("id", c.id);
    load();
  }
  async function remove(id) {
    await supabase.from("campaigns").delete().eq("id", id);
    toast.success("Deleted");
    load();
  }
  async function launchCampaign(campaignId) {
    setSending(campaignId);
    toast.info("Queueing campaign...");
    try {
      const {
        data,
        error
      } = await supabase.functions.invoke("send-campaign", {
        body: {
          campaignId
        }
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      if (data?.queued > 0) {
        toast.success(`📥 ${data.message}`);
        setTimeout(() => load(), 15e3);
        setTimeout(() => load(), 45e3);
      } else {
        toast.info(data?.message ?? "Nothing new to send.");
      }
      load();
    } catch (e) {
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
      const {
        data,
        error
      } = await supabase.functions.invoke("generate-email", {
        body: aiForm
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
  return /* @__PURE__ */ jsxs("div", { className: "space-y-6", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-center justify-between gap-3", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("h1", { className: "text-3xl font-bold tracking-tight", children: "Campaigns" }),
        /* @__PURE__ */ jsx("p", { className: "text-sm text-muted-foreground", children: "Manage your outbound campaigns." })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex gap-2", children: [
        /* @__PURE__ */ jsxs(Dialog, { open: aiOpen, onOpenChange: setAiOpen, children: [
          /* @__PURE__ */ jsx(DialogTrigger, { asChild: true, children: /* @__PURE__ */ jsxs(Button, { variant: "outline", className: "border-primary text-primary", children: [
            /* @__PURE__ */ jsx(Sparkles, { className: "mr-2 h-4 w-4" }),
            " Generate AI Email"
          ] }) }),
          /* @__PURE__ */ jsxs(DialogContent, { className: "max-w-2xl", children: [
            /* @__PURE__ */ jsx(DialogHeader, { children: /* @__PURE__ */ jsx(DialogTitle, { children: "✨ AI Email Generator" }) }),
            /* @__PURE__ */ jsxs("div", { className: "space-y-4", children: [
              /* @__PURE__ */ jsxs("div", { children: [
                /* @__PURE__ */ jsx("label", { className: "text-sm font-medium", children: "📚 Start from a proven template" }),
                /* @__PURE__ */ jsxs("select", { className: "mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm", value: "", onChange: (e) => {
                  const t = TEMPLATES[Number(e.target.value)];
                  if (!t) return;
                  setAiForm({
                    ...aiForm,
                    yourOffer: t.body.slice(0, 300)
                  });
                  setGeneratedEmail(t.body.replace(/{{booking_link}}/g, "https://cal.com/you/15min"));
                  toast.success(`Template loaded: ${t.name}`);
                }, children: [
                  /* @__PURE__ */ jsx("option", { value: "", children: "Choose a niche template…" }),
                  Array.from(new Set(TEMPLATES.map((t) => t.niche))).map((niche) => /* @__PURE__ */ jsx("optgroup", { label: niche, children: TEMPLATES.map((t, i) => t.niche === niche ? /* @__PURE__ */ jsx("option", { value: i, children: t.name }, t.name) : null) }, niche))
                ] })
              ] }),
              /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 gap-3 sm:grid-cols-2", children: [
                /* @__PURE__ */ jsxs("div", { children: [
                  /* @__PURE__ */ jsx("label", { className: "text-sm font-medium", children: "Lead Name" }),
                  /* @__PURE__ */ jsx(Input, { placeholder: "John Smith", value: aiForm.leadName, onChange: (e) => setAiForm({
                    ...aiForm,
                    leadName: e.target.value
                  }) })
                ] }),
                /* @__PURE__ */ jsxs("div", { children: [
                  /* @__PURE__ */ jsx("label", { className: "text-sm font-medium", children: "Lead Company" }),
                  /* @__PURE__ */ jsx(Input, { placeholder: "Acme Corp", value: aiForm.leadCompany, onChange: (e) => setAiForm({
                    ...aiForm,
                    leadCompany: e.target.value
                  }) })
                ] }),
                /* @__PURE__ */ jsxs("div", { children: [
                  /* @__PURE__ */ jsx("label", { className: "text-sm font-medium", children: "Job Title" }),
                  /* @__PURE__ */ jsx(Input, { placeholder: "Marketing Manager", value: aiForm.leadJobTitle, onChange: (e) => setAiForm({
                    ...aiForm,
                    leadJobTitle: e.target.value
                  }) })
                ] }),
                /* @__PURE__ */ jsxs("div", { children: [
                  /* @__PURE__ */ jsx("label", { className: "text-sm font-medium", children: "Your Company" }),
                  /* @__PURE__ */ jsx(Input, { placeholder: "OutreachAI", value: aiForm.yourCompany, onChange: (e) => setAiForm({
                    ...aiForm,
                    yourCompany: e.target.value
                  }) })
                ] })
              ] }),
              /* @__PURE__ */ jsxs("div", { children: [
                /* @__PURE__ */ jsx("label", { className: "text-sm font-medium", children: "What you offer" }),
                /* @__PURE__ */ jsx(Input, { placeholder: "AI-powered cold email automation...", value: aiForm.yourOffer, onChange: (e) => setAiForm({
                  ...aiForm,
                  yourOffer: e.target.value
                }) })
              ] }),
              /* @__PURE__ */ jsx(Button, { onClick: handleGenerateEmail, disabled: generating, className: "w-full bg-gradient-primary", children: generating ? /* @__PURE__ */ jsxs(Fragment, { children: [
                /* @__PURE__ */ jsx(Loader2, { className: "mr-2 h-4 w-4 animate-spin" }),
                " Generating..."
              ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
                /* @__PURE__ */ jsx(Sparkles, { className: "mr-2 h-4 w-4" }),
                " Generate Email"
              ] }) }),
              generatedEmail && /* @__PURE__ */ jsxs("div", { className: "rounded-xl border border-primary/30 bg-primary/5 p-4", children: [
                /* @__PURE__ */ jsx("div", { className: "mb-2 text-xs font-semibold uppercase text-primary", children: "Generated Email" }),
                /* @__PURE__ */ jsx("p", { className: "whitespace-pre-wrap text-sm leading-relaxed", children: generatedEmail }),
                spam && /* @__PURE__ */ jsxs("div", { className: `mt-3 rounded-lg border p-3 text-xs ${spam.score >= 70 ? "border-success/30 bg-success/10" : spam.score >= 50 ? "border-warning/40 bg-warning/10" : "border-destructive/40 bg-destructive/10"}`, children: [
                  /* @__PURE__ */ jsxs("div", { className: "font-bold", children: [
                    "🛡️ Deliverability score: ",
                    spam.score,
                    "/100 — ",
                    spam.grade
                  ] }),
                  spam.issues?.length > 0 && /* @__PURE__ */ jsx("ul", { className: "mt-2 list-disc space-y-1 pl-4", children: spam.issues.map((i, k) => /* @__PURE__ */ jsx("li", { children: i.message }, k)) }),
                  spam.good?.length > 0 && /* @__PURE__ */ jsxs("div", { className: "mt-2 opacity-80", children: [
                    "✓ ",
                    spam.good.join(" · ")
                  ] })
                ] }),
                /* @__PURE__ */ jsxs("div", { className: "mt-3 flex gap-2", children: [
                  /* @__PURE__ */ jsx(Button, { className: "flex-1", variant: "outline", disabled: checkingSpam, onClick: async () => {
                    setCheckingSpam(true);
                    try {
                      const {
                        data
                      } = await supabase.functions.invoke("spam-check", {
                        body: {
                          subject: "",
                          body: generatedEmail
                        }
                      });
                      if (!data || data.error) throw new Error();
                      setSpam(data);
                    } catch {
                      toast.error("Spam check failed");
                    }
                    setCheckingSpam(false);
                  }, children: checkingSpam ? "Checking…" : "🛡️ Check spam score" }),
                  /* @__PURE__ */ jsx(Button, { className: "flex-1", variant: "outline", onClick: () => {
                    navigator.clipboard.writeText(generatedEmail);
                    toast.success("Copied!");
                  }, children: "Copy Email" })
                ] })
              ] })
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxs(Dialog, { open, onOpenChange: setOpen, children: [
          /* @__PURE__ */ jsx(DialogTrigger, { asChild: true, children: /* @__PURE__ */ jsxs(Button, { className: "bg-gradient-primary shadow-glow", children: [
            /* @__PURE__ */ jsx(Plus, { className: "mr-2 h-4 w-4" }),
            " New Campaign"
          ] }) }),
          /* @__PURE__ */ jsxs(DialogContent, { children: [
            /* @__PURE__ */ jsx(DialogHeader, { children: /* @__PURE__ */ jsx(DialogTitle, { children: "Create campaign" }) }),
            /* @__PURE__ */ jsx(Input, { placeholder: "Campaign name", value: name, onChange: (e) => setName(e.target.value) }),
            /* @__PURE__ */ jsx(DialogFooter, { children: /* @__PURE__ */ jsx(Button, { onClick: create, className: "bg-gradient-primary", children: "Create" }) })
          ] })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "grid gap-4", children: [
      items.length === 0 && /* @__PURE__ */ jsx("div", { className: "rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground", children: 'No campaigns yet. Click "New Campaign" to get started.' }),
      items.map((c) => {
        const s = stats[c.id] ?? {
          leads: 0,
          emails: 0,
          replies: 0
        };
        const ab = abStats?.[c.id];
        const replyRate = s.emails ? Math.round(s.replies / s.emails * 100) : 0;
        return /* @__PURE__ */ jsx("div", { className: "rounded-2xl border border-border bg-card p-6 shadow-card", children: /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-start justify-between gap-4", children: [
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
              editingId === c.id ? /* @__PURE__ */ jsx("input", { autoFocus: true, value: editingName, onChange: (e) => setEditingName(e.target.value), onBlur: () => saveRename(c), onKeyDown: (e) => {
                if (e.key === "Enter") saveRename(c);
                if (e.key === "Escape") setEditingId(null);
              }, className: "rounded-md border border-input bg-background px-2 py-1 text-lg font-semibold outline-none focus:ring-2 focus:ring-ring" }) : /* @__PURE__ */ jsx("h3", { className: "cursor-pointer rounded-md px-2 py-1 text-lg font-semibold transition-colors hover:bg-muted/50", onClick: () => {
                setEditingId(c.id);
                setEditingName(c.name);
              }, title: "Click to rename", children: c.name }),
              /* @__PURE__ */ jsx(Badge, { variant: "secondary", className: c.status === "active" ? "bg-success/15 text-success" : "", children: c.status })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "mt-3 grid grid-cols-3 gap-3 text-sm sm:gap-6", children: [
              /* @__PURE__ */ jsx(Stat, { label: "Leads targeted", value: s.leads }),
              /* @__PURE__ */ jsx(Stat, { label: "Emails sent", value: s.emails }),
              /* @__PURE__ */ jsx(Stat, { label: "Reply rate", value: `${replyRate}%` })
            ] }),
            ab && (ab.a > 0 || ab.b > 0) ? /* @__PURE__ */ jsxs("div", { className: "mt-2 text-xs text-muted-foreground", children: [
              "A/B: A opened ",
              ab.aOpen,
              "/",
              ab.a,
              " · B opened ",
              ab.bOpen,
              "/",
              ab.b,
              ab.a >= 10 && ab.b >= 10 ? ` — winner: ${ab.aOpen / ab.a >= ab.bOpen / ab.b ? "A" : "B"}` : " — need 10+ sends each for a winner"
            ] }) : null,
            /* @__PURE__ */ jsxs("div", { className: "mt-3 flex flex-wrap gap-2", children: [
              /* @__PURE__ */ jsxs("button", { type: "button", onClick: () => setFlag(c, "ab_test", !c.ab_test), className: `rounded-full border px-3 py-1 text-xs transition-colors ${c.ab_test ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`, children: [
                "🧪 A/B subjects ",
                c.ab_test ? "ON" : "OFF"
              ] }),
              /* @__PURE__ */ jsxs("button", { type: "button", onClick: () => setFlag(c, "autopilot", !c.autopilot), className: `rounded-full border px-3 py-1 text-xs transition-colors ${c.autopilot ? "border-success bg-success/10 text-success" : "border-border text-muted-foreground hover:text-foreground"}`, children: [
                "🤖 Autopilot replies ",
                c.autopilot ? "ON" : "OFF"
              ] }),
              /* @__PURE__ */ jsx("button", { type: "button", onClick: () => setDelivery(c, c.delivery === "instant" ? "smart" : "instant"), className: `rounded-full border px-3 py-1 text-xs transition-colors ${c.delivery === "instant" ? "border-warning bg-warning/10 text-warning" : "border-border text-muted-foreground hover:text-foreground"}`, title: c.delivery === "instant" ? "Sends instantly on launch — may land in off-hours" : "Holds the send until each lead's local morning (8–11am)", children: c.delivery === "instant" ? /* @__PURE__ */ jsxs(Fragment, { children: [
                /* @__PURE__ */ jsx(Zap, { className: "mr-1 inline h-3 w-3" }),
                " Instant send"
              ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
                /* @__PURE__ */ jsx(Clock, { className: "mr-1 inline h-3 w-3" }),
                " Local morning"
              ] }) })
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap gap-2", children: [
            /* @__PURE__ */ jsxs(Button, { size: "sm", variant: "outline", onClick: () => navigate({
              to: "/campaign-review/$campaignId",
              params: {
                campaignId: c.id
              }
            }), children: [
              /* @__PURE__ */ jsx(Eye, { className: "mr-2 h-4 w-4" }),
              " Review"
            ] }),
            /* @__PURE__ */ jsx(Button, { size: "sm", className: "bg-gradient-primary", disabled: sending === c.id || c.status !== "active", onClick: () => launchCampaign(c.id), children: sending === c.id ? /* @__PURE__ */ jsxs(Fragment, { children: [
              /* @__PURE__ */ jsx(Loader2, { className: "mr-2 h-4 w-4 animate-spin" }),
              " Sending..."
            ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
              /* @__PURE__ */ jsx(Send, { className: "mr-2 h-4 w-4" }),
              " Launch"
            ] }) }),
            /* @__PURE__ */ jsx(Button, { size: "icon", variant: "outline", onClick: () => navigate({
              to: "/campaign-edit/$campaignId",
              params: {
                campaignId: c.id
              }
            }), "aria-label": "Edit campaign", children: /* @__PURE__ */ jsx(Pencil, { className: "h-4 w-4" }) }),
            /* @__PURE__ */ jsx(Button, { size: "icon", variant: "outline", onClick: () => toggle(c), children: c.status === "active" ? /* @__PURE__ */ jsx(Pause, { className: "h-4 w-4" }) : /* @__PURE__ */ jsx(Play, { className: "h-4 w-4" }) }),
            /* @__PURE__ */ jsx(Button, { size: "icon", variant: "outline", onClick: () => remove(c.id), className: "text-destructive", children: /* @__PURE__ */ jsx(Trash2, { className: "h-4 w-4" }) })
          ] })
        ] }) }, c.id);
      })
    ] })
  ] });
}
function Stat({
  label,
  value
}) {
  return /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsx("div", { className: "text-xs uppercase tracking-wide text-muted-foreground", children: label }),
    /* @__PURE__ */ jsx("div", { className: "mt-0.5 text-xl font-semibold", children: value })
  ] });
}
export {
  CampaignsPage as component
};
//# sourceMappingURL=campaigns-CkGKEp9S.js.map
