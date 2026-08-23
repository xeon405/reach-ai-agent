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
  const [saving, setSaving] = useState(false);
  const [referral, setReferral] = useState<string | null>(null);
  const [invited, setInvited] = useState(0);

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
        <div className="flex items-center justify-between rounded-xl border border-border bg-background/40 p-4">
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
        <div className="flex items-center justify-between rounded-xl border border-border bg-background/40 p-4">
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
            Added to every email — interested leads can book a meeting with one click.
          </p>
        </div>
      </Section>

      <div className="flex gap-2">
        <Button onClick={save} disabled={saving} className="bg-gradient-primary shadow-glow">
          Save changes
        </Button>
      </div>

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

      <Section title="Danger zone">
        <div className="flex items-center justify-between rounded-xl border border-destructive/30 bg-destructive/5 p-4">
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
