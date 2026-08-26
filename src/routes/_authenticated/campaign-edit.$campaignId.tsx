import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Save } from "lucide-react";
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
  });

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("campaigns").select("*").eq("id", campaignId).single();
      if (data) {
        setForm({
          name: data.name ?? "",
          status: data.status ?? "active",
          ab_test: data.ab_test ?? false,
          autopilot: data.autopilot ?? false,
        });
      }
      setLoading(false);
    })();
  }, [campaignId]);

  async function save() {
    if (!form.name.trim()) { toast.error("Campaign name is required"); return; }
    setSaving(true);
    const { error } = await supabase.from("campaigns").update({
      name: form.name.trim(),
      status: form.status,
      ab_test: form.ab_test,
      autopilot: form.autopilot,
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
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
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

      <div className="rounded-2xl border border-border bg-card p-6 shadow-card space-y-4">
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
          </div>
        </div>

        <div className="flex gap-3 border-t border-border pt-4">
          <Button variant="outline" onClick={() => navigate({ to: "/campaigns" })}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="bg-gradient-primary">
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
