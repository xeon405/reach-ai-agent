import { jsx, jsxs, Fragment } from "react/jsx-runtime";
import { useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { s as supabase } from "./client-Bf7kAZ3f.js";
import { B as Button } from "./button-DjOZMqFS.js";
import { I as Input } from "./input-D_U8fI25.js";
import { S as Select, c as SelectTrigger, d as SelectValue, a as SelectContent, b as SelectItem } from "./select-aG-zsZPc.js";
import { ArrowLeft, X, Upload, Save } from "lucide-react";
import { toast } from "sonner";
import { b as Route } from "./router-DM9FrBM_.js";
import "@supabase/supabase-js";
import "@radix-ui/react-slot";
import "class-variance-authority";
import "clsx";
import "tailwind-merge";
import "@radix-ui/react-select";
import "@tanstack/react-query";
function CampaignEditPage() {
  const {
    campaignId
  } = Route.useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    status: "active",
    ab_test: false,
    autopilot: false,
    followups_enabled: true
  });
  const [imageUrl, setImageUrl] = useState(null);
  const [uploading, setUploading] = useState(false);
  useEffect(() => {
    (async () => {
      const {
        data
      } = await supabase.from("campaigns").select("*").eq("id", campaignId).single();
      if (data) {
        setForm({
          name: data.name ?? "",
          status: data.status ?? "active",
          ab_test: data.ab_test ?? false,
          autopilot: data.autopilot ?? false,
          followups_enabled: data.followups_enabled ?? true
        });
        setImageUrl(data.campaign_image_url ?? null);
      }
      setLoading(false);
    })();
  }, [campaignId]);
  async function handleImageUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const {
        data: u
      } = await supabase.auth.getUser();
      if (!u.user) return;
      const path = `${u.user.id}/${campaignId}/${Date.now()}-${file.name}`;
      const {
        error
      } = await supabase.storage.from("campaign-images").upload(path, file);
      if (error) throw new Error(error.message);
      const {
        data: urlData
      } = supabase.storage.from("campaign-images").getPublicUrl(path);
      await supabase.from("campaigns").update({
        campaign_image_url: urlData.publicUrl
      }).eq("id", campaignId);
      setImageUrl(urlData.publicUrl);
      toast.success("Image uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }
  async function removeImage() {
    await supabase.from("campaigns").update({
      campaign_image_url: null
    }).eq("id", campaignId);
    setImageUrl(null);
  }
  async function save() {
    if (!form.name.trim()) {
      toast.error("Campaign name is required");
      return;
    }
    setSaving(true);
    const {
      error
    } = await supabase.from("campaigns").update({
      name: form.name.trim(),
      status: form.status,
      ab_test: form.ab_test,
      autopilot: form.autopilot,
      followups_enabled: form.followups_enabled,
      campaign_image_url: imageUrl
    }).eq("id", campaignId);
    setSaving(false);
    if (error) toast.error("Could not update campaign");
    else {
      toast.success("Campaign updated");
      navigate({
        to: "/campaigns"
      });
    }
  }
  if (loading) {
    return /* @__PURE__ */ jsx("div", { className: "flex items-center justify-center py-20", children: /* @__PURE__ */ jsx("div", { className: "h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" }) });
  }
  return /* @__PURE__ */ jsxs("div", { className: "mx-auto max-w-2xl space-y-6", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
      /* @__PURE__ */ jsx(Button, { variant: "ghost", size: "icon", onClick: () => navigate({
        to: "/campaigns"
      }), children: /* @__PURE__ */ jsx(ArrowLeft, { className: "h-4 w-4" }) }),
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("h1", { className: "text-2xl font-bold tracking-tight", children: "Edit Campaign" }),
        /* @__PURE__ */ jsx("p", { className: "text-sm text-muted-foreground", children: form.name })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "rounded-2xl border border-border bg-card p-6 shadow-card space-y-4", children: [
      /* @__PURE__ */ jsxs("div", { className: "space-y-4", children: [
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("label", { className: "mb-1.5 block text-sm font-medium", children: "Campaign Name *" }),
          /* @__PURE__ */ jsx(Input, { placeholder: "Campaign name", value: form.name, onChange: (e) => setForm({
            ...form,
            name: e.target.value
          }) })
        ] }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("label", { className: "mb-1.5 block text-sm font-medium", children: "Status" }),
          /* @__PURE__ */ jsxs(Select, { value: form.status, onValueChange: (v) => setForm({
            ...form,
            status: v
          }), children: [
            /* @__PURE__ */ jsx(SelectTrigger, { children: /* @__PURE__ */ jsx(SelectValue, {}) }),
            /* @__PURE__ */ jsxs(SelectContent, { children: [
              /* @__PURE__ */ jsx(SelectItem, { value: "active", children: "Active" }),
              /* @__PURE__ */ jsx(SelectItem, { value: "paused", children: "Paused" })
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap gap-4", children: [
          /* @__PURE__ */ jsxs("label", { className: "flex items-center gap-2 text-sm font-medium", children: [
            /* @__PURE__ */ jsx("input", { type: "checkbox", checked: form.ab_test, onChange: (e) => setForm({
              ...form,
              ab_test: e.target.checked
            }), className: "h-4 w-4 rounded border-input accent-primary" }),
            "A/B test subjects"
          ] }),
          /* @__PURE__ */ jsxs("label", { className: "flex items-center gap-2 text-sm font-medium", children: [
            /* @__PURE__ */ jsx("input", { type: "checkbox", checked: form.autopilot, onChange: (e) => setForm({
              ...form,
              autopilot: e.target.checked
            }), className: "h-4 w-4 rounded border-input accent-primary" }),
            "Autopilot replies"
          ] }),
          /* @__PURE__ */ jsxs("label", { className: "flex items-center gap-2 text-sm font-medium", children: [
            /* @__PURE__ */ jsx("input", { type: "checkbox", checked: form.followups_enabled, onChange: (e) => setForm({
              ...form,
              followups_enabled: e.target.checked
            }), className: "h-4 w-4 rounded border-input accent-primary" }),
            "Enable follow-ups (14-step sequence)"
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("label", { className: "mb-1.5 block text-sm font-medium", children: "Campaign Image (optional)" }),
          /* @__PURE__ */ jsx("div", { className: "flex items-center gap-3", children: imageUrl ? /* @__PURE__ */ jsxs("div", { className: "relative", children: [
            /* @__PURE__ */ jsx("img", { src: imageUrl, alt: "Campaign", className: "h-16 rounded-lg border border-border object-cover" }),
            /* @__PURE__ */ jsx("button", { onClick: removeImage, className: "absolute -top-1.5 -right-1.5 bg-background border border-border rounded-full p-0.5 hover:bg-destructive/10", children: /* @__PURE__ */ jsx(X, { className: "h-3 w-3" }) })
          ] }) : /* @__PURE__ */ jsxs("label", { className: "flex items-center gap-2 cursor-pointer rounded-lg border border-dashed border-border px-4 py-2 text-sm text-muted-foreground hover:bg-muted/50 transition-colors", children: [
            /* @__PURE__ */ jsx(Upload, { className: "h-4 w-4" }),
            uploading ? "Uploading..." : "Upload image",
            /* @__PURE__ */ jsx("input", { type: "file", accept: "image/*", className: "hidden", onChange: handleImageUpload, disabled: uploading })
          ] }) })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex gap-3 border-t border-border pt-4", children: [
        /* @__PURE__ */ jsx(Button, { variant: "outline", onClick: () => navigate({
          to: "/campaigns"
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
  CampaignEditPage as component
};
//# sourceMappingURL=campaign-edit._campaignId-B6Fpx8xy.js.map
