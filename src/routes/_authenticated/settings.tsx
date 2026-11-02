import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { buildGmailAuthUrl } from "@/lib/gmail-oauth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { AlertTriangle, Check } from "lucide-react";
import { ADDRESS_EXAMPLE, addressProblem } from "@/lib/address";
export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function CopyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-1.5 flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2">
      <span className="shrink-0 text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <code className="min-w-0 flex-1 truncate text-[11px]">{value}</code>
      <button
        type="button"
        className="shrink-0 text-xs font-medium text-primary underline-offset-2 hover:underline"
        onClick={() => {
          navigator.clipboard.writeText(value);
          toast.success(`${label} copied`);
        }}
      >
        Copy
      </button>
    </div>
  );
}

/**
 * Turn the cities textarea into a clean string[].
 *
 * It was split on "," alone, so a list typed across lines kept its line
 * structure as literal newlines inside single entries, and re-saving repeatedly
 * grew one row into many. Split on newlines and commas, dedupe
 * case-insensitively, and keep any "Country:" prefix on its own entry rather
 * than gluing it onto the neighbouring city.
 */
function parseCityList(raw: string): string[] | null {
  const countryPrefix = /(?:^|\s)(?:[A-Z]{2,3}|[A-Z][a-z]{2,11}):\s*/g;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(countryPrefix)) {
    for (const piece of part.split(/[,;\n]/)) {
      const value = piece.replace(/\s+/g, " ").trim();
      if (!value) continue;
      const key = value.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(value);
    }
  }
  return out.length ? out : null;
}

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
  const [referral, setReferral] = useState<string | null>(null);
  const [invited, setInvited] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [company, setCompany] = useState("");
  const [businessAddress, setBusinessAddress] = useState("");
  const [businessDescription, setBusinessDescription] = useState("");
  const [offer, setOffer] = useState("");
  const [problemSolved, setProblemSolved] = useState("");
  const [targetCustomer, setTargetCustomer] = useState("");
  const [jobTitles, setJobTitles] = useState("");
  const [industries, setIndustries] = useState("");
  const [companySize, setCompanySize] = useState("1-50");
  const [countries, setCountries] = useState<string[]>([]);
  const [cities, setCities] = useState("");
  const [communicationStyle, setCommunicationStyle] = useState("");
  const [dontClaim, setDontClaim] = useState("");
  const [phone, setPhone] = useState("");
  const [networkMode, setNetworkMode] = useState(false);
  const [rewardPlan, setRewardPlan] = useState<string | null>(null);
  const [rewardUntil, setRewardUntil] = useState<string | null>(null);
  const [calendly, setCalendly] = useState<{ url: string; secret: string } | null>(null);

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
        note: "Full export of your OutshipAi data. Gmail access tokens are intentionally excluded — disconnect in Settings or via Google Account to revoke them.",
        profile: profile.data ?? [],
        campaigns: campaigns.data ?? [],
        leads: leads.data ?? [],
        emails_sent: emails.data ?? [],
        referrals: referrals.data ?? [],
      };
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `outshipai-data-${new Date().toISOString().slice(0, 10)}.json`;
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
        setCompany(p.company ?? "");
        setBusinessAddress(p.business_address ?? "");
        setBusinessDescription(p.business_description ?? "");
        setOffer(p.offer ?? "");
        setProblemSolved(p.problem_solved ?? "");
        setTargetCustomer(p.target_customer ?? "");
        setCountries((p.icp as Record<string, string[]> | null)?.countries ?? []);
        setCities((p.cities ?? []).join(", "));
        setCompanySize((p.icp as Record<string, string> | null)?.companySize ?? "1-50");
        setJobTitles((p.icp as Record<string, string> | null)?.jobTitle ?? "");
        setIndustries((p.icp as Record<string, string> | null)?.industry ?? "");
        setCommunicationStyle(p.communication_style ?? "");
        setDontClaim(p.dont_claim ?? "");
        setPhone(p.phone ?? "");
        setNetworkMode(p.network_mode ?? false);
        setRewardPlan(p.referral_reward_plan ?? null);
        setRewardUntil(p.referral_reward_until ?? null);
        if (p.referral_code) {
          setReferral(p.referral_code);
          const { count } = await supabase.rpc("referral_count").single();
          setInvited(Number(count) || 0);
        }
      }
    });
  }, []);

  useEffect(() => {
    supabase.functions
      .invoke("get-calendly-config")
      .then(({ data }) => {
        if (data?.webhook_url && data?.webhook_secret) {
          setCalendly({ url: data.webhook_url, secret: data.webhook_secret });
        }
      })
      .catch(() => {});
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
    // A country name is not an address, and the database will refuse to send,
    // so say so here instead of letting them save and wonder why nothing goes.
    if (businessAddress.trim()) {
      const problem = addressProblem(businessAddress);
      if (problem) {
        toast.error(problem);
        return;
      }
    }
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { error } = await supabase
      .from("profiles")
      .update({
        name,
        company: company || null,
        business_address: businessAddress.trim() || null,
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
        icp: { jobTitle: jobTitles || null, industry: industries || null, companySize, countries },
        cities: parseCityList(cities),
        communication_style: communicationStyle.trim() || null,
        dont_claim: dontClaim.trim() || null,
        phone: phone.trim() || null,
        network_mode: networkMode,
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
    <div className="w-full space-y-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Settings</h1>
        <p className="text-xs text-muted-foreground">Manage your profile and integrations.</p>
      </div>

      <Section title="Profile">
        <div className="space-y-1.5">
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Company</Label>
          <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Acme Inc." />
        </div>
        <div className="space-y-1.5">
          <Label>Business address</Label>
          <Input value={businessAddress} onChange={(e) => setBusinessAddress(e.target.value)}
            placeholder={ADDRESS_EXAMPLE} />
          <p className="text-xs text-muted-foreground">
            Required before sending, and it must be a street address — a country or city on its own
            is not enough. Your business name and address appear on the emails you send, and we use
            the pair to keep one free trial per business. It is never published or shown to the
            people you email.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label>Email</Label>
          <Input value={email} disabled />
        </div>
        <div className="space-y-1.5">
          <Label>Phone <span className="text-muted-foreground">(shown to clients when the AI hands off a conversation to you)</span></Label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 555 000 1234" />
        </div>
      </Section>

      <Section title="Business Intelligence">
        <p className="text-xs text-muted-foreground -mt-2 mb-2">The AI uses everything below to write personalized outreach. It will not invent facts — only use what you tell it here.</p>
        <div className="space-y-1.5">
          <Label>What is your business?</Label>
          <Textarea rows={2} value={businessDescription} onChange={(e) => setBusinessDescription(e.target.value)}
            placeholder="e.g. We build AI-powered sales automation software for B2B companies." />
        </div>
        <div className="space-y-1.5">
          <Label>What product or service are you selling?</Label>
          <Textarea rows={2} value={offer} onChange={(e) => setOffer(e.target.value)}
            placeholder="e.g. A monthly SaaS subscription that automates cold email outreach." />
        </div>
        <div className="space-y-1.5">
          <Label>What problem does it solve?</Label>
          <Textarea rows={2} value={problemSolved} onChange={(e) => setProblemSolved(e.target.value)}
            placeholder="e.g. Sales teams waste hours writing cold emails that get ignored." />
        </div>
        <div className="space-y-1.5">
          <Label>Who is your ideal customer?</Label>
          <Textarea rows={2} value={targetCustomer} onChange={(e) => setTargetCustomer(e.target.value)}
            placeholder="e.g. Marketing directors at mid-size SaaS companies." />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Job titles</Label>
            <Input value={jobTitles} onChange={(e) => setJobTitles(e.target.value)} placeholder="e.g. Marketing Manager, CEO" />
          </div>
          <div className="space-y-1.5">
            <Label>Industries</Label>
            <Input value={industries} onChange={(e) => setIndustries(e.target.value)} placeholder="e.g. SaaS, E-commerce" />
          </div>
          <div className="space-y-1.5">
            <Label>Company size</Label>
            <Select value={companySize} onValueChange={setCompanySize}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1-10">1-10</SelectItem>
                <SelectItem value="10-50">10-50</SelectItem>
                <SelectItem value="50-200">50-200</SelectItem>
                <SelectItem value="200+">200+</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Cities (optional)</Label>
            <Input value={cities} onChange={(e) => setCities(e.target.value)} placeholder="New York, London" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>What should OutshipAi communicate?</Label>
          <Textarea rows={2} value={communicationStyle} onChange={(e) => setCommunicationStyle(e.target.value)}
            placeholder="e.g. Be direct, focus on results, sound like a peer." />
        </div>
        <div className="space-y-1.5">
          <Label>What should OutshipAi NEVER claim?</Label>
          <Textarea rows={2} value={dontClaim} onChange={(e) => setDontClaim(e.target.value)}
            placeholder="e.g. Never promise specific revenue numbers." />
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
        {!gmail && (
          <p className="text-xs leading-relaxed text-muted-foreground">
            Google will show an "unverified app" warning — that is normal for a new app and
            does not affect your security. Click{" "}
            <span className="font-medium text-foreground">Advanced</span>, then{" "}
            <span className="font-medium text-foreground">Go to OutshipAi (unsafe)</span> to
            continue. We only ask for permission to send emails as you and to read replies to
            those emails.
          </p>
        )}
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
        <div className="rounded-xl border border-border bg-background/40 p-4">
          <div className="font-medium">Calendly bookings</div>
          <p className="mt-1 text-xs text-muted-foreground">
            When a lead books a meeting on your Calendly page, it's recorded on your dashboard, follow-ups stop, and you get a high-priority alert. This only tracks Calendly accounts wired to the webhook below — other booking links stay untracked.
          </p>
          {calendly ? (
            <ol className="mt-3 space-y-1 text-xs text-muted-foreground">
              <li>1. Calendly → Settings → Webhooks → Webhook subscriptions → Add subscription</li>
              <li>2. Signing key: <strong>HMAC (option 1)</strong>, then paste these two values:</li>
              <CopyField label="Webhook URL" value={calendly.url} />
              <CopyField label="Signing key" value={calendly.secret} />
              <li>3. Subscribe to events: <code>invitee.created</code> and <code>invitee.canceled</code></li>
              <li>
                4. Point the <strong>Booking link</strong> above at this same Calendly account — that's how meetings are attributed to you.
              </li>
            </ol>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">
              Calendly tracking isn't configured on this app yet — bookings stay untracked for now.
            </p>
          )}
        </div>
      </Section>

      <Section title="Warm network">
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-background/40 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="font-medium">Discoverable by other businesses</div>
            <div className="text-xs text-muted-foreground">
              Let other OutshipAi users find your business in their AI lead search and request a warm intro. Your email and phone are never shown — you approve every intro first.
            </div>
          </div>
          <Switch checked={networkMode} onCheckedChange={setNetworkMode} />
        </div>
      </Section>

      <div className="flex gap-2">
        <Button onClick={save} disabled={saving} className="bg-primary">
          Save changes
        </Button>
      </div>

      <Section title="Autopilot">
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
            Every friend who joins through your link earns you 7 days of free starter access — stack them. Your friends still start free, no catch.
          </div>
          {rewardPlan && rewardUntil && new Date(rewardUntil).getTime() > Date.now() && (
            <div className="mt-2 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400">
              +7 free days earned — <span className="uppercase">{rewardPlan}</span> access until{" "}
              {new Date(rewardUntil).toLocaleDateString()}
            </div>
          )}
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

      <Section title="Notifications">
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex items-center gap-2 font-medium">
              Push notifications on this device
              {push.active && <Badge className="bg-green-600">On</Badge>}
            </div>
            <div className="text-xs text-muted-foreground">
              Get notified when a lead replies, books a call, or sends an intro request — even when the app is closed.
            </div>
          </div>
          <Switch
            checked={!!push.active}
            disabled={push.busy || push.active === null}
            onCheckedChange={async (on) => {
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
            }}
            className="shrink-0 self-start sm:self-auto"
          />
        </div>
        <p className="mt-2 px-1 text-xs text-muted-foreground">
          Works on desktop browsers, Android, and the installed app (iOS needs the app icon on your home screen).
        </p>
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
    <div className="rounded-lg border border-border bg-card p-4">
      <h2 className="mb-3 text-base font-semibold">{title}</h2>
      <div className="space-y-3">{children}</div>
    </div>
  );
}
