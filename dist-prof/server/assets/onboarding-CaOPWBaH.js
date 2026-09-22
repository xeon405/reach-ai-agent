import { jsxs, jsx } from "react/jsx-runtime";
import { useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { s as supabase } from "./client-Bf7kAZ3f.js";
import { b as buildGmailAuthUrl } from "./gmail-oauth-qlLqUCnj.js";
import { B as Button } from "./button-DjOZMqFS.js";
import { I as Input } from "./input-D_U8fI25.js";
import { L as Label } from "./label-C8WJLhmR.js";
import { T as Textarea } from "./textarea-F69quoCd.js";
import { S as Select, c as SelectTrigger, d as SelectValue, a as SelectContent, b as SelectItem } from "./select-aG-zsZPc.js";
import { B as Badge } from "./badge-YM7oB01y.js";
import { toast } from "sonner";
import { ArrowRight, ArrowLeft, Mail, Check, Rocket } from "lucide-react";
import "@supabase/supabase-js";
import "@radix-ui/react-slot";
import "class-variance-authority";
import "clsx";
import "tailwind-merge";
import "@radix-ui/react-label";
import "@radix-ui/react-select";
const COUNTRIES = ["United States", "United Kingdom", "Canada", "Australia", "India", "Germany", "France", "Spain", "Netherlands", "Singapore", "United Arab Emirates", "South Africa", "Nigeria", "Brazil", "Global"];
const TOTAL_STEPS = 5;
function Onboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [gmailConnected, setGmailConnected] = useState(false);
  const [businessDescription, setBusinessDescription] = useState("");
  const [offer, setOffer] = useState("");
  const [problemSolved, setProblemSolved] = useState("");
  const [targetCustomer, setTargetCustomer] = useState("");
  const [jobTitles, setJobTitles] = useState("");
  const [industries, setIndustries] = useState("");
  const [countries, setCountries] = useState([]);
  const [cities, setCities] = useState("");
  const [companySize, setCompanySize] = useState("1-50");
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [bookingLink, setBookingLink] = useState("");
  const [hasProductImage, setHasProductImage] = useState(false);
  const [communicationStyle, setCommunicationStyle] = useState("");
  const [dontClaim, setDontClaim] = useState("");
  const [signature, setSignature] = useState("");
  useEffect(() => {
    supabase.auth.getUser().then(async ({
      data
    }) => {
      if (!data.user) return;
      const {
        data: p
      } = await supabase.from("profiles").select("*").eq("id", data.user.id).single();
      if (p) {
        setName(p.name ?? "");
        setCompany(p.company ?? "");
        setOffer(p.offer ?? "");
        setWebsiteUrl(p.website_url ?? "");
        setBookingLink(p.booking_link ?? "");
        setSignature(p.signature ?? "");
        setGmailConnected(p.gmail_connected ?? false);
        setBusinessDescription(p.business_description ?? "");
        setProblemSolved(p.problem_solved ?? "");
        setTargetCustomer(p.target_customer ?? "");
        setCountries(p.icp?.countries ?? []);
        setCities((p.cities ?? []).join(", "));
        setCompanySize(p.icp?.companySize ?? "1-50");
        setJobTitles(p.icp?.jobTitle ?? "");
        setIndustries(p.icp?.industry ?? "");
        setCommunicationStyle(p.communication_style ?? "");
        setDontClaim(p.dont_claim ?? "");
        setHasProductImage(p.has_product_image ?? false);
      }
    });
  }, []);
  function toggleCountry(c) {
    setCountries((cs) => cs.includes(c) ? cs.filter((x) => x !== c) : [...cs, c]);
  }
  async function launch() {
    setSaving(true);
    const {
      data: u
    } = await supabase.auth.getUser();
    if (!u.user) {
      setSaving(false);
      return;
    }
    const icp = {
      jobTitle: jobTitles || null,
      industry: industries || null,
      companySize,
      countries
    };
    const citiesArray = cities.split(",").map((c) => c.trim()).filter(Boolean);
    const {
      error
    } = await supabase.from("profiles").update({
      name,
      company: company || null,
      offer: offer || null,
      icp,
      website_url: websiteUrl.trim() || null,
      booking_link: bookingLink.trim() || null,
      signature: signature.trim() || null,
      business_description: businessDescription.trim() || null,
      problem_solved: problemSolved.trim() || null,
      target_customer: targetCustomer.trim() || null,
      cities: citiesArray.length > 0 ? citiesArray : null,
      communication_style: communicationStyle.trim() || null,
      dont_claim: dontClaim.trim() || null,
      has_product_image: hasProductImage,
      onboarded: true
    }).eq("id", u.user.id);
    if (error) {
      toast.error(error.message);
      setSaving(false);
      return;
    }
    await supabase.from("campaigns").insert({
      user_id: u.user.id,
      name: `${industries || "ICP"} Outreach`,
      status: "active",
      target_icp: icp
    });
    toast.success("Your AI agent is configured and ready!");
    navigate({
      to: "/dashboard"
    });
  }
  const canNext = () => {
    if (step === 1) return businessDescription.trim().length > 0 || offer.trim().length > 0;
    if (step === 2) return countries.length > 0;
    return true;
  };
  return /* @__PURE__ */ jsxs("div", { className: "mx-auto max-w-2xl", children: [
    /* @__PURE__ */ jsxs("div", { className: "mb-8 flex items-center justify-between", children: [
      /* @__PURE__ */ jsx("h1", { className: "text-2xl font-bold", children: "Set up your AI agent" }),
      /* @__PURE__ */ jsxs("span", { className: "text-sm text-muted-foreground", children: [
        "Step ",
        step,
        " of ",
        TOTAL_STEPS
      ] })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "mb-8 flex gap-2", children: Array.from({
      length: TOTAL_STEPS
    }, (_, i) => i + 1).map((s) => /* @__PURE__ */ jsx("div", { className: `h-1.5 flex-1 rounded-full ${s <= step ? "bg-gradient-primary" : "bg-muted"}` }, s)) }),
    /* @__PURE__ */ jsxs("div", { className: "rounded-2xl border border-border bg-card p-8 shadow-card", children: [
      step === 1 && /* @__PURE__ */ jsxs("div", { className: "space-y-5", children: [
        /* @__PURE__ */ jsx("h2", { className: "text-xl font-semibold", children: "Tell us about your business" }),
        /* @__PURE__ */ jsx("p", { className: "text-sm text-muted-foreground", children: "This helps the AI understand what you do before writing any outreach." }),
        /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsx(Label, { children: "What is your business? *" }),
          /* @__PURE__ */ jsx(Textarea, { rows: 3, value: businessDescription, onChange: (e) => setBusinessDescription(e.target.value), placeholder: "e.g. We build AI-powered sales automation software for B2B companies." }),
          /* @__PURE__ */ jsx("p", { className: "text-xs text-muted-foreground", children: "One or two sentences describing what your company does." })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsx(Label, { children: "What product or service are you selling? *" }),
          /* @__PURE__ */ jsx(Textarea, { rows: 3, value: offer, onChange: (e) => setOffer(e.target.value), placeholder: "e.g. A monthly SaaS subscription that automates cold email outreach with AI-generated personalized messages." }),
          /* @__PURE__ */ jsx("p", { className: "text-xs text-muted-foreground", children: "Be specific — the AI will use this exact pitch in emails." })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsx(Label, { children: "What problem does it solve?" }),
          /* @__PURE__ */ jsx(Textarea, { rows: 3, value: problemSolved, onChange: (e) => setProblemSolved(e.target.value), placeholder: "e.g. Sales teams waste hours writing cold emails that get ignored. Our tool sends personalized outreach that gets 3x more replies." }),
          /* @__PURE__ */ jsx("p", { className: "text-xs text-muted-foreground", children: "Why should anyone care? What pain do you take away?" })
        ] }),
        /* @__PURE__ */ jsx("div", { className: "flex gap-2", children: /* @__PURE__ */ jsxs(Button, { className: "flex-1 bg-gradient-primary shadow-glow", onClick: () => setStep(2), disabled: !canNext(), children: [
          "Next ",
          /* @__PURE__ */ jsx(ArrowRight, { className: "ml-2 h-4 w-4" })
        ] }) })
      ] }),
      step === 2 && /* @__PURE__ */ jsxs("div", { className: "space-y-5", children: [
        /* @__PURE__ */ jsx("h2", { className: "text-xl font-semibold", children: "Who is your ideal customer?" }),
        /* @__PURE__ */ jsx("p", { className: "text-sm text-muted-foreground", children: "The AI uses this to decide who to email and how to personalize each message." }),
        /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsx(Label, { children: "Describe your ideal customer" }),
          /* @__PURE__ */ jsx(Textarea, { rows: 3, value: targetCustomer, onChange: (e) => setTargetCustomer(e.target.value), placeholder: "e.g. Marketing directors at mid-size SaaS companies who are struggling to generate pipeline through outbound." }),
          /* @__PURE__ */ jsx("p", { className: "text-xs text-muted-foreground", children: "Free-text description — the AI reads this to understand who you're after." })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "grid gap-4 sm:grid-cols-2", children: [
          /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsx(Label, { children: "Job titles" }),
            /* @__PURE__ */ jsx(Input, { value: jobTitles, onChange: (e) => setJobTitles(e.target.value), placeholder: "e.g. Marketing Manager, VP Sales, CEO" }),
            /* @__PURE__ */ jsx("p", { className: "text-xs text-muted-foreground", children: "Comma-separated" })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsx(Label, { children: "Industries" }),
            /* @__PURE__ */ jsx(Input, { value: industries, onChange: (e) => setIndustries(e.target.value), placeholder: "e.g. SaaS, E-commerce, Real Estate" }),
            /* @__PURE__ */ jsx("p", { className: "text-xs text-muted-foreground", children: "Comma-separated" })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsx(Label, { children: "Company size" }),
          /* @__PURE__ */ jsxs(Select, { value: companySize, onValueChange: setCompanySize, children: [
            /* @__PURE__ */ jsx(SelectTrigger, { children: /* @__PURE__ */ jsx(SelectValue, {}) }),
            /* @__PURE__ */ jsxs(SelectContent, { children: [
              /* @__PURE__ */ jsx(SelectItem, { value: "1-10", children: "1-10 employees" }),
              /* @__PURE__ */ jsx(SelectItem, { value: "10-50", children: "10-50 employees" }),
              /* @__PURE__ */ jsx(SelectItem, { value: "50-200", children: "50-200 employees" }),
              /* @__PURE__ */ jsx(SelectItem, { value: "200+", children: "200+ employees" })
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsx(Label, { children: "Target countries *" }),
          /* @__PURE__ */ jsx("div", { className: "flex flex-wrap gap-2", children: COUNTRIES.map((c) => /* @__PURE__ */ jsx("button", { type: "button", onClick: () => toggleCountry(c), className: `rounded-full border px-3 py-1.5 text-sm transition ${countries.includes(c) ? "border-primary bg-primary/15 text-primary" : "border-border hover:bg-accent/30"}`, children: c }, c)) })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsx(Label, { children: "Cities or regions (optional)" }),
          /* @__PURE__ */ jsx(Input, { value: cities, onChange: (e) => setCities(e.target.value), placeholder: "e.g. New York, London, Singapore" }),
          /* @__PURE__ */ jsx("p", { className: "text-xs text-muted-foreground", children: "Comma-separated. Leave blank for nationwide." })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "flex gap-2", children: [
          /* @__PURE__ */ jsxs(Button, { variant: "outline", onClick: () => setStep(1), children: [
            /* @__PURE__ */ jsx(ArrowLeft, { className: "mr-2 h-4 w-4" }),
            " Back"
          ] }),
          /* @__PURE__ */ jsxs(Button, { className: "flex-1 bg-gradient-primary shadow-glow", onClick: () => setStep(3), disabled: !canNext(), children: [
            "Next ",
            /* @__PURE__ */ jsx(ArrowRight, { className: "ml-2 h-4 w-4" })
          ] })
        ] })
      ] }),
      step === 3 && /* @__PURE__ */ jsxs("div", { className: "space-y-5", children: [
        /* @__PURE__ */ jsx("h2", { className: "text-xl font-semibold", children: "Your details & links" }),
        /* @__PURE__ */ jsx("p", { className: "text-sm text-muted-foreground", children: "How the AI represents you and where it sends people." }),
        /* @__PURE__ */ jsxs("div", { className: "grid gap-4 sm:grid-cols-2", children: [
          /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsx(Label, { children: "Your name" }),
            /* @__PURE__ */ jsx(Input, { value: name, onChange: (e) => setName(e.target.value), placeholder: "Alex Rivera" })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsx(Label, { children: "Company name" }),
            /* @__PURE__ */ jsx(Input, { value: company, onChange: (e) => setCompany(e.target.value), placeholder: "Acme Inc." })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsx(Label, { children: "Website or app URL" }),
          /* @__PURE__ */ jsx(Input, { value: websiteUrl, onChange: (e) => setWebsiteUrl(e.target.value), placeholder: "https://yourproduct.com" }),
          /* @__PURE__ */ jsx("p", { className: "text-xs text-muted-foreground", children: "The AI reads this to answer lead questions and direct people to your site." })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsx(Label, { children: "Booking link (optional)" }),
          /* @__PURE__ */ jsx(Input, { value: bookingLink, onChange: (e) => setBookingLink(e.target.value), placeholder: "https://cal.com/you/15min" }),
          /* @__PURE__ */ jsx("p", { className: "text-xs text-muted-foreground", children: "Added to outbound emails so leads can book a call." })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3 rounded-xl border border-border bg-background/40 p-4", children: [
          /* @__PURE__ */ jsx("input", { type: "checkbox", checked: hasProductImage, onChange: (e) => setHasProductImage(e.target.checked), className: "h-4 w-4 rounded border-input accent-primary" }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("div", { className: "text-sm font-medium", children: "I have a product/demo image to include" }),
            /* @__PURE__ */ jsx("div", { className: "text-xs text-muted-foreground", children: "You can upload it later in Settings." })
          ] })
        ] }),
        /* @__PURE__ */ jsxs(Button, { variant: gmailConnected ? "secondary" : "outline", className: "w-full", onClick: () => {
          window.location.href = buildGmailAuthUrl();
        }, children: [
          /* @__PURE__ */ jsx(Mail, { className: "mr-2 h-4 w-4" }),
          gmailConnected ? "Gmail Connected" : "Connect Gmail"
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "flex gap-2", children: [
          /* @__PURE__ */ jsxs(Button, { variant: "outline", onClick: () => setStep(2), children: [
            /* @__PURE__ */ jsx(ArrowLeft, { className: "mr-2 h-4 w-4" }),
            " Back"
          ] }),
          /* @__PURE__ */ jsxs(Button, { className: "flex-1 bg-gradient-primary shadow-glow", onClick: () => setStep(4), children: [
            "Next ",
            /* @__PURE__ */ jsx(ArrowRight, { className: "ml-2 h-4 w-4" })
          ] })
        ] })
      ] }),
      step === 4 && /* @__PURE__ */ jsxs("div", { className: "space-y-5", children: [
        /* @__PURE__ */ jsx("h2", { className: "text-xl font-semibold", children: "How the AI communicates" }),
        /* @__PURE__ */ jsx("p", { className: "text-sm text-muted-foreground", children: "Set the tone and guardrails — what the AI should and should never say." }),
        /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsx(Label, { children: "What should OutreachAI communicate?" }),
          /* @__PURE__ */ jsx(Textarea, { rows: 4, value: communicationStyle, onChange: (e) => setCommunicationStyle(e.target.value), placeholder: "e.g. Be direct and value-focused. Lead with ROI. Sound like a peer, not a salesperson. Always mention our free trial." }),
          /* @__PURE__ */ jsx("p", { className: "text-xs text-muted-foreground", children: "Tone, key messages, things to always include. The AI follows these instructions." })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsx(Label, { children: "What should OutreachAI NEVER claim?" }),
          /* @__PURE__ */ jsx(Textarea, { rows: 4, value: dontClaim, onChange: (e) => setDontClaim(e.target.value), placeholder: "e.g. Never promise specific revenue numbers. Never claim we're endorsed by competitors. Never mention pricing — book a call for that." }),
          /* @__PURE__ */ jsx("p", { className: "text-xs text-muted-foreground", children: "Guardrails — the AI will not say anything you list here." })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsx(Label, { children: "Email signature (optional)" }),
          /* @__PURE__ */ jsx(Textarea, { rows: 3, value: signature, onChange: (e) => setSignature(e.target.value), placeholder: "Alex Rivera\nFounder, Acme Inc.\n+1 555 010 2030" }),
          /* @__PURE__ */ jsx("p", { className: "text-xs text-muted-foreground", children: "Appended to every outbound email." })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "flex gap-2", children: [
          /* @__PURE__ */ jsxs(Button, { variant: "outline", onClick: () => setStep(3), children: [
            /* @__PURE__ */ jsx(ArrowLeft, { className: "mr-2 h-4 w-4" }),
            " Back"
          ] }),
          /* @__PURE__ */ jsxs(Button, { className: "flex-1 bg-gradient-primary shadow-glow", onClick: () => setStep(5), children: [
            "Review & Launch ",
            /* @__PURE__ */ jsx(ArrowRight, { className: "ml-2 h-4 w-4" })
          ] })
        ] })
      ] }),
      step === 5 && /* @__PURE__ */ jsxs("div", { className: "space-y-5", children: [
        /* @__PURE__ */ jsx("h2", { className: "text-xl font-semibold", children: "Review your setup" }),
        /* @__PURE__ */ jsxs("div", { className: "rounded-xl border border-border bg-background/40 p-5 text-sm space-y-0.5", children: [
          /* @__PURE__ */ jsx(Row, { label: "Your business", children: businessDescription || "—" }),
          /* @__PURE__ */ jsx(Row, { label: "Product / service", children: offer || "—" }),
          /* @__PURE__ */ jsx(Row, { label: "Problem solved", children: problemSolved || "—" }),
          /* @__PURE__ */ jsx(Row, { label: "Ideal customer", children: targetCustomer || "—" }),
          /* @__PURE__ */ jsx(Row, { label: "Job titles", children: jobTitles || "—" }),
          /* @__PURE__ */ jsx(Row, { label: "Industries", children: industries || "—" }),
          /* @__PURE__ */ jsx(Row, { label: "Company size", children: companySize }),
          /* @__PURE__ */ jsx(Row, { label: "Countries", children: /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap gap-1", children: [
            countries.map((c) => /* @__PURE__ */ jsx(Badge, { variant: "secondary", children: c }, c)),
            countries.length === 0 && "—"
          ] }) }),
          /* @__PURE__ */ jsx(Row, { label: "Cities", children: cities || "Nationwide" }),
          /* @__PURE__ */ jsxs(Row, { label: "Sender", children: [
            name || "—",
            " ",
            company ? `· ${company}` : ""
          ] }),
          /* @__PURE__ */ jsx(Row, { label: "Website", children: websiteUrl || "—" }),
          /* @__PURE__ */ jsx(Row, { label: "Booking link", children: bookingLink || "—" }),
          /* @__PURE__ */ jsx(Row, { label: "Voice", children: communicationStyle || "Default (professional, direct)" }),
          /* @__PURE__ */ jsx(Row, { label: "Never claim", children: dontClaim || "None set" }),
          /* @__PURE__ */ jsx(Row, { label: "Gmail", children: gmailConnected ? /* @__PURE__ */ jsxs("span", { className: "inline-flex items-center gap-1 text-success", children: [
            /* @__PURE__ */ jsx(Check, { className: "h-3.5 w-3.5" }),
            " Connected"
          ] }) : "Not connected — you can do this later" })
        ] }),
        /* @__PURE__ */ jsx("div", { className: "rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground", children: "The AI will use everything above to write personalized outreach. It will not invent facts about your product — only use what you've told it here and what it reads from your website." }),
        /* @__PURE__ */ jsxs("div", { className: "flex gap-2", children: [
          /* @__PURE__ */ jsxs(Button, { variant: "outline", onClick: () => setStep(4), children: [
            /* @__PURE__ */ jsx(ArrowLeft, { className: "mr-2 h-4 w-4" }),
            " Back"
          ] }),
          /* @__PURE__ */ jsxs(Button, { className: "flex-1 bg-gradient-primary shadow-glow", onClick: launch, disabled: saving, children: [
            /* @__PURE__ */ jsx(Rocket, { className: "mr-2 h-4 w-4" }),
            " Launch My AI Agent"
          ] })
        ] })
      ] })
    ] })
  ] });
}
function Row({
  label,
  children
}) {
  return /* @__PURE__ */ jsxs("div", { className: "flex items-start justify-between gap-4 border-b border-border/60 py-2.5 last:border-0", children: [
    /* @__PURE__ */ jsx("span", { className: "text-muted-foreground shrink-0", children: label }),
    /* @__PURE__ */ jsx("span", { className: "text-right font-medium", children })
  ] });
}
export {
  Onboarding as component
};
//# sourceMappingURL=onboarding-CaOPWBaH.js.map
