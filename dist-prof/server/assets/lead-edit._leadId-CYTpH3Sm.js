import { jsx, jsxs, Fragment } from "react/jsx-runtime";
import { useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { s as supabase } from "./client-Bf7kAZ3f.js";
import { B as Button } from "./button-DjOZMqFS.js";
import { I as Input } from "./input-D_U8fI25.js";
import { S as Select, c as SelectTrigger, d as SelectValue, a as SelectContent, b as SelectItem } from "./select-aG-zsZPc.js";
import { ArrowLeft, Save } from "lucide-react";
import { toast } from "sonner";
import { R as Route } from "./router-DM9FrBM_.js";
import "@supabase/supabase-js";
import "@radix-ui/react-slot";
import "class-variance-authority";
import "clsx";
import "tailwind-merge";
import "@radix-ui/react-select";
import "@tanstack/react-query";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
function LeadEditPage() {
  const {
    leadId
  } = Route.useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [campaigns, setCampaigns] = useState([]);
  const [form, setForm] = useState({
    name: "",
    email: "",
    company: "",
    job_title: "",
    country: "",
    campaign_id: "",
    status: "new"
  });
  useEffect(() => {
    (async () => {
      const [{
        data: lead
      }, {
        data: camps
      }] = await Promise.all([supabase.from("leads").select("*").eq("id", leadId).single(), supabase.from("campaigns").select("id, name")]);
      setCampaigns(camps ?? []);
      if (lead) {
        setForm({
          name: lead.name ?? "",
          email: lead.email ?? "",
          company: lead.company ?? "",
          job_title: lead.job_title ?? "",
          country: lead.country ?? "",
          campaign_id: lead.campaign_id ?? "",
          status: lead.status ?? "new"
        });
      }
      setLoading(false);
    })();
  }, [leadId]);
  async function save() {
    if (!form.email || !EMAIL_RE.test(form.email)) {
      toast.error("Valid email is required");
      return;
    }
    setSaving(true);
    const {
      error
    } = await supabase.from("leads").update({
      name: form.name || null,
      email: form.email,
      company: form.company || null,
      job_title: form.job_title || null,
      country: form.country || null,
      campaign_id: form.campaign_id || null,
      status: form.status
    }).eq("id", leadId);
    setSaving(false);
    if (error) toast.error("Could not update lead");
    else {
      toast.success("Lead updated");
      navigate({
        to: "/leads"
      });
    }
  }
  if (loading) {
    return /* @__PURE__ */ jsx("div", { className: "flex items-center justify-center py-20", children: /* @__PURE__ */ jsx("div", { className: "h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" }) });
  }
  return /* @__PURE__ */ jsxs("div", { className: "mx-auto max-w-2xl space-y-6", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
      /* @__PURE__ */ jsx(Button, { variant: "ghost", size: "icon", onClick: () => navigate({
        to: "/leads"
      }), children: /* @__PURE__ */ jsx(ArrowLeft, { className: "h-4 w-4" }) }),
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("h1", { className: "text-2xl font-bold tracking-tight", children: "Edit Lead" }),
        /* @__PURE__ */ jsx("p", { className: "text-sm text-muted-foreground", children: form.email })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "rounded-2xl border border-border bg-card p-6 shadow-card space-y-4", children: [
      /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 gap-4 sm:grid-cols-2", children: [
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("label", { className: "mb-1.5 block text-sm font-medium", children: "Name" }),
          /* @__PURE__ */ jsx(Input, { placeholder: "Full name", value: form.name, onChange: (e) => setForm({
            ...form,
            name: e.target.value
          }) })
        ] }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("label", { className: "mb-1.5 block text-sm font-medium", children: "Email *" }),
          /* @__PURE__ */ jsx(Input, { placeholder: "email@example.com", value: form.email, onChange: (e) => setForm({
            ...form,
            email: e.target.value
          }) })
        ] }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("label", { className: "mb-1.5 block text-sm font-medium", children: "Company" }),
          /* @__PURE__ */ jsx(Input, { placeholder: "Company name", value: form.company, onChange: (e) => setForm({
            ...form,
            company: e.target.value
          }) })
        ] }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("label", { className: "mb-1.5 block text-sm font-medium", children: "Job Title" }),
          /* @__PURE__ */ jsx(Input, { placeholder: "Marketing Manager", value: form.job_title, onChange: (e) => setForm({
            ...form,
            job_title: e.target.value
          }) })
        ] }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("label", { className: "mb-1.5 block text-sm font-medium", children: "Country" }),
          /* @__PURE__ */ jsxs("select", { value: form.country, onChange: (e) => setForm({
            ...form,
            country: e.target.value
          }), className: "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring", children: [
            /* @__PURE__ */ jsx("option", { value: "", children: "Country" }),
            /* @__PURE__ */ jsx("option", { value: "United States", children: "United States" }),
            /* @__PURE__ */ jsx("option", { value: "United Kingdom", children: "United Kingdom" }),
            /* @__PURE__ */ jsx("option", { value: "Canada", children: "Canada" }),
            /* @__PURE__ */ jsx("option", { value: "Australia", children: "Australia" }),
            /* @__PURE__ */ jsx("option", { value: "India", children: "India" }),
            /* @__PURE__ */ jsx("option", { value: "Germany", children: "Germany" }),
            /* @__PURE__ */ jsx("option", { value: "France", children: "France" }),
            /* @__PURE__ */ jsx("option", { value: "Spain", children: "Spain" }),
            /* @__PURE__ */ jsx("option", { value: "Italy", children: "Italy" }),
            /* @__PURE__ */ jsx("option", { value: "Netherlands", children: "Netherlands" }),
            /* @__PURE__ */ jsx("option", { value: "Saudi Arabia", children: "Saudi Arabia" }),
            /* @__PURE__ */ jsx("option", { value: "UAE", children: "UAE" }),
            /* @__PURE__ */ jsx("option", { value: "Egypt", children: "Egypt" }),
            /* @__PURE__ */ jsx("option", { value: "Pakistan", children: "Pakistan" }),
            /* @__PURE__ */ jsx("option", { value: "Singapore", children: "Singapore" }),
            /* @__PURE__ */ jsx("option", { value: "Brazil", children: "Brazil" }),
            /* @__PURE__ */ jsx("option", { value: "Turkey", children: "Turkey" })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("label", { className: "mb-1.5 block text-sm font-medium", children: "Status" }),
          /* @__PURE__ */ jsxs(Select, { value: form.status, onValueChange: (v) => setForm({
            ...form,
            status: v
          }), children: [
            /* @__PURE__ */ jsx(SelectTrigger, { children: /* @__PURE__ */ jsx(SelectValue, {}) }),
            /* @__PURE__ */ jsxs(SelectContent, { children: [
              /* @__PURE__ */ jsx(SelectItem, { value: "new", children: "New" }),
              /* @__PURE__ */ jsx(SelectItem, { value: "emailed", children: "Contacted" }),
              /* @__PURE__ */ jsx(SelectItem, { value: "replied", children: "Replied" }),
              /* @__PURE__ */ jsx(SelectItem, { value: "booked", children: "Booked" }),
              /* @__PURE__ */ jsx(SelectItem, { value: "won", children: "Won" }),
              /* @__PURE__ */ jsx(SelectItem, { value: "bounced", children: "Bounced" }),
              /* @__PURE__ */ jsx(SelectItem, { value: "unsubscribed", children: "Unsubscribed" }),
              /* @__PURE__ */ jsx(SelectItem, { value: "invalid", children: "Invalid" })
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "sm:col-span-2", children: [
          /* @__PURE__ */ jsx("label", { className: "mb-1.5 block text-sm font-medium", children: "Campaign" }),
          /* @__PURE__ */ jsxs(Select, { value: form.campaign_id || "none", onValueChange: (v) => setForm({
            ...form,
            campaign_id: v === "none" ? "" : v
          }), children: [
            /* @__PURE__ */ jsx(SelectTrigger, { children: /* @__PURE__ */ jsx(SelectValue, { placeholder: "Assign to campaign" }) }),
            /* @__PURE__ */ jsxs(SelectContent, { className: "max-w-[400px]", children: [
              /* @__PURE__ */ jsx(SelectItem, { value: "none", children: "No campaign" }),
              campaigns.map((c) => /* @__PURE__ */ jsx(SelectItem, { value: c.id, children: /* @__PURE__ */ jsx("span", { className: "block truncate", children: c.name }) }, c.id))
            ] })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex gap-3 border-t border-border pt-4", children: [
        /* @__PURE__ */ jsx(Button, { variant: "outline", onClick: () => navigate({
          to: "/leads"
        }), children: "Cancel" }),
        /* @__PURE__ */ jsx(Button, { onClick: save, disabled: saving, className: "bg-gradient-primary", children: saving ? /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx("div", { className: "mr-2 h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" }),
          " Saving..."
        ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx(Save, { className: "mr-2 h-4 w-4" }),
          " Save Changes"
        ] }) })
      ] })
    ] })
  ] });
}
export {
  LeadEditPage as component
};
//# sourceMappingURL=lead-edit._leadId-CYTpH3Sm.js.map
