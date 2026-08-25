import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { buildGmailAuthUrl } from "@/lib/gmail-oauth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { AlertTriangle, Check } from "lucide-react";
export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const navigate = useNavigate();
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
  const [referral, setReferral] = useState<string | null>(null);
  const [invited, setInvited] = useState(0);
  const [exporting, setExporting] = useState(false);

  async function exportData() {
    setExporting(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const uid = u.user.id;
      const [profile, campaigns, leads, emails, referrals] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", uid),
        supabase.from("campaigns").select("*").eq("user_id", uid),
        supabase.from("leads").select("*").eq("user_id", uid),
        supabase.from("emails_sent").select("*").eq("user_id", uid),
        supabase.from("referrals").select("*").eq("referrer_id", uid),
      ]);
      const bundle = {
        exported_at: new Date().toISOString(),
        note: "Full export of your OutreachAI data. Gmail access tokens are intentionally excluded — disconnect in Settings or via Google Account to revoke them.",
        profile: profile.data ?? [],
        campaigns: campaigns.data ?? [],
        leads: leads.data ?? [],
        emails_sent: emails.data ?? [],
        referrals: referrals.data ?? [],
      };
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `outreachai-data-${new Date().toISOString().slice(0, 10)}.json`;
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
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      setEmail(data.user.email ?? "");
      const { data: p } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", data.user.id)
        .single();
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
        if (p.referral_code) {
          setReferral(p.referral_code);
          const { count } = await supabase.rpc("referral_count").single();
          setInvited(Number(count) || 0);
        }
      }
    });
  }, []);

  function connectGmail() {
    window.location.href = buildGmailAuthUrl();
  }

  async function disconnectGmail() {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { error } = await supabase.functions.invoke("gmail-oauth", {
      body: { action: "disconnect" },
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
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { error } = await supabase
      .from("profiles")
      .update({
        name,
        notify_replies: notify,
        booking_link: booking.trim() || null,
        website_url: websiteUrl.trim() || null,
        signature: signature.trim() || null,
        autopilot: autopilot && apCountry.trim().length > 0 && apNiche.trim().length > 0,
        autopilot_country: apCountry.trim() || null,
        autopilot_niche: apNiche.trim() || null,
      })
      .eq("id", u.user.id);
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Settings saved");
  }

  async function deleteAccount() {
    if (!confirm("Permanently delete your account and ALL your data? This cannot be undone."))
      return;
    try {
      const { error } = await supabase.functions.invoke("delete-account", { body: {} });
      if (error) throw error;
      await supabase.auth.signOut();
      toast.success("Account and all data permanently deleted.");
      navigate({ to: "/" });
    } catch {
      toast.error("Could not delete account. Please contact support.");
    }
  }

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your profile and integrations.</p>
      </div>

      <Section title="Profile">
        <div className="space-y-1.5">
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Email</Label>
          <Input value={email} disabled />
        </div>
      </Section>

      <Section title="Connected accounts">
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-background/40 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="font-medium">Gmail</div>
            <div className="text-xs text-muted-foreground">
              {gmail && gmailEmail
                ? `Connected as ${gmailEmail}`
                : "Send cold emails from your inbox."}
            </div>
          </div>
          {gmail ? (
            <div className="flex items-center gap-2">
              <Badge className="bg-success/15 text-success" variant="secondary">
                <Check className="mr-1 h-3 w-3" /> Connected
              </Badge>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive text-xs"
                onClick={disconnectGmail}
              >
                Disconnect
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="outline" onClick={connectGmail}>
              Connect Gmail
            </Button>
          )}
        </div>
      </Section>

      <Section title="Notifications">
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-background/40 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="font-medium">Email alerts for replies</div>
            <div className="text-xs text-muted-foreground">
              Get notified the moment a lead responds.
            </div>
          </div>
          <Switch checked={notify} onCheckedChange={setNotify} />
        </div>
        <div className="space-y-1.5 rounded-xl border border-border bg-background/40 p-4">
          <Label htmlFor="booking">Booking link (optional)</Label>
          <Input
            id="booking"
            placeholder="https://cal.com/you/15min"
            value={booking}
            onChange={(e) => setBooking(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Have a website or app? Add it below — the AI will read it, answer lead questions itself, and send them to your site.
          </p>
          <Label htmlFor="websiteUrl">Your website or app (optional)</Label>
          <Input
            id="websiteUrl"
            placeholder="https://yourproduct.com"
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Added to every email — interested leads can book a meeting with one click.
          </p>
          <Label htmlFor="signature" className="pt-2">Email signature (optional)</Label>
          <textarea
            id="signature"
            rows={3}
            placeholder={"Alex Rivera\nFounder, Rivera Consulting\n+1 555 010 2030"}
            value={signature}
            onChange={(e) => setSignature(e.target.value)}
            className="w-full rounded-md border border-input bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <p className="text-xs text-muted-foreground">
            Appended at the end of every email your agent sends — looks professional and builds recognition.
          </p>
        </div>
      </Section>

      <div className="flex gap-2">
        <Button onClick={save} disabled={saving} className="bg-gradient-primary shadow-glow">
          Save changes
        </Button>
      </div>

      <Section title="Autopilot 🤖">
        <div className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Fully autonomous outreach</div>
              <div className="text-xs text-muted-foreground">
                The agent finds fresh leads daily, tops up your campaign, and sends within safe limits. You just read replies.
              </div>
            </div>
            <Switch checked={autopilot} onCheckedChange={setAutopilot} />
          </div>
          {autopilot && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ap-country">Target country</Label>
                <Input
                  id="ap-country"
                  placeholder="united states"
                  value={apCountry}
                  onChange={(e) => setApCountry(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ap-niche">Target niche</Label>
                <Input
                  id="ap-niche"
                  placeholder="marketing agency"
                  value={apNiche}
                  onChange={(e) => setApNiche(e.target.value)}
                />
              </div>
              <p className="text-xs text-muted-foreground sm:col-span-2">
                Saved when you press Save changes. Runs daily while Gmail stays connected.
              </p>
            </div>
          )}
        </div>
      </Section>

      <Section title="Invite & earn">
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
          <div className="font-medium">Your invite link</div>
          <div className="mt-1 text-xs text-muted-foreground">
            Every friend who signs up through it is tracked here. Free marketing for you.
          </div>
          {referral && (
            <>
              <div className="mt-3 flex items-center gap-2">
                <code className="flex-1 truncate rounded-md border bg-background px-3 py-2 text-xs">
                  {typeof window !== "undefined" ? `${window.location.origin}/auth?ref=${referral}` : ""}
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/auth?ref=${referral}`);
                    toast.success("Invite link copied!");
                  }}
                >
                  Copy
                </Button>
              </div>
              <div className="mt-2 text-xs font-medium text-primary">
                {invited} {invited === 1 ? "person" : "people"} joined with your link
              </div>
            </>
          )}
        </div>
      </Section>

      <Section title="Your data">
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="font-medium">Download my data</div>
            <div className="text-xs text-muted-foreground">
              Export your profile, campaigns, leads, and email history as a JSON file.
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={exportData} disabled={exporting} className="shrink-0 self-start sm:self-auto">
            {exporting ? "Exporting…" : "Export"}
          </Button>
        </div>
      </Section>

      <Section title="Danger zone">
        <div className="flex flex-col gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
            <div>
              <div className="font-medium">Delete account</div>
              <div className="text-xs text-muted-foreground">
                Permanent. We cannot recover your data.
              </div>
            </div>
          </div>
          <Button variant="destructive" size="sm" onClick={deleteAccount}>
            Delete
          </Button>
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-card">
      <h2 className="mb-4 text-lg font-semibold">{title}</h2>
      <div className="space-y-4">{children}</div>
    </div>
  );
}
