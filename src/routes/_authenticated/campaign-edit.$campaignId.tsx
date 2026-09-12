import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Save, Upload, X, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/campaign-edit/$campaignId")({
  component: CampaignEditPage,
});

function CampaignEditPage() {
  const { campaignId } = Route.useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    status: "active",
    ab_test: false,
    autopilot: false,
    followups_enabled: true,
  });
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("campaigns").select("*").eq("id", campaignId).single();
      if (data) {
        setForm({
          name: data.name ?? "",
          status: data.status ?? "active",
          ab_test: data.ab_test ?? false,
          autopilot: data.autopilot ?? false,
          followups_enabled: data.followups_enabled ?? true,
        });
        setImageUrl(data.campaign_image_url ?? null);
      }
      setLoading(false);
    })();
  }, [campaignId]);

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const path = `${u.user.id}/${campaignId}/${Date.now()}-${file.name}`;
      const { error } = await supabase.storage.from("campaign-images").upload(path, file);
      if (error) throw new Error(error.message);
      const { data: urlData } = supabase.storage.from("campaign-images").getPublicUrl(path);
      await supabase.from("campaigns").update({ campaign_image_url: urlData.publicUrl }).eq("id", campaignId);
      setImageUrl(urlData.publicUrl);
      toast.success("Image uploaded");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function removeImage() {
    await supabase.from("campaigns").update({ campaign_image_url: null }).eq("id", campaignId);
    setImageUrl(null);
  }

  async function save() {
    if (!form.name.trim()) { toast.error("Campaign name is required"); return; }
    setSaving(true);
    const { error } = await supabase.from("campaigns").update({
      name: form.name.trim(),
      status: form.status,
      ab_test: form.ab_test,
      autopilot: form.autopilot,
      followups_enabled: form.followups_enabled,
      campaign_image_url: imageUrl,
    }).eq("id", campaignId);
    setSaving(false);
    if (error) toast.error("Could not update campaign");
    else {
      toast.success("Campaign updated");
      navigate({ to: "/campaigns" });
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <Skeleton className="h-8 w-48" />
        </div>
        <div className="space-y-4 rounded-xl border border-border/50 bg-card p-6">
          <div className="space-y-2">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-10 w-full" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-32 w-full" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-10 w-full" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate({ to: "/campaigns" })}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Edit Campaign</h1>
          <p className="text-sm text-muted-foreground">{form.name}</p>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-4 space-y-4">
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium">Campaign Name *</label>
            <Input placeholder="Campaign name" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Status</label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="paused">Paused</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={form.ab_test}
                onChange={(e) => setForm({ ...form, ab_test: e.target.checked })}
                className="h-4 w-4 rounded border-input accent-primary"
              />
              A/B test subjects
            </label>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={form.autopilot}
                onChange={(e) => setForm({ ...form, autopilot: e.target.checked })}
                className="h-4 w-4 rounded border-input accent-primary"
              />
              Autopilot replies
            </label>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={form.followups_enabled}
                onChange={(e) => setForm({ ...form, followups_enabled: e.target.checked })}
                className="h-4 w-4 rounded border-input accent-primary"
              />
              Enable follow-ups (14-step sequence)
            </label>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Campaign Image (optional)</label>
            <div className="flex items-center gap-3">
              {imageUrl ? (
                <div className="relative">
                  <img src={imageUrl} alt="Campaign" className="h-16 rounded-lg border border-border object-cover" />
                  <button onClick={removeImage} className="absolute -top-1.5 -right-1.5 bg-background border border-border rounded-full p-0.5 hover:bg-destructive/10">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <label className="flex items-center gap-2 cursor-pointer rounded-lg border border-dashed border-border px-4 py-2 text-sm text-muted-foreground hover:bg-muted/50 transition-colors">
                  <Upload className="h-4 w-4" />
                  {uploading ? "Uploading..." : "Upload image"}
                  <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={uploading} />
                </label>
              )}
            </div>
          </div>
        </div>

        <div className="flex gap-3 border-t border-border pt-4">
          <Button variant="outline" onClick={() => navigate({ to: "/campaigns" })}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="bg-primary">
            {saving ? (
              <><div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" /> Saving...</>
            ) : (
              <><Save className="mr-2 h-4 w-4" /> Save Changes</>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
