import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Check, Copy, ExternalLink, KeyRound, Plus, Trash2, Webhook } from "lucide-react";

const WEBHOOK_EVENTS = [
  "email.sent",
  "email.replied",
  "email.bounced",
  "email.unsubscribed",
  "email.held_for_review",
  "email.failed",
  "booking.confirmed",
] as const;

type ApiKeyRow = {
  id: string;
  name: string;
  prefix: string;
  last_used_at: string | null;
  created_at: string;
  revoked_at: string | null;
};

type EndpointRow = {
  id: string;
  url: string;
  secret: string;
  events: string[];
  active: boolean;
  last_status: number | null;
  last_attempt_at: string | null;
  failure_count: number;
  created_at: string;
};

function base64url(bytes: Uint8Array): string {
  let text = "";
  for (const b of bytes) text += String.fromCharCode(b);
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomKey(prefix: string): string {
  return prefix + base64url(crypto.getRandomValues(new Uint8Array(32)));
}

function CopyLine({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2">
      <code className="min-w-0 flex-1 break-all text-[11px]">{value}</code>
      <button
        type="button"
        className="flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline"
        onClick={() => {
          navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

export function DeveloperSettings({ userId }: { userId: string }) {
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [newKeyName, setNewKeyName] = useState("");
  const [freshKey, setFreshKey] = useState<string | null>(null);
  const [endpoints, setEndpoints] = useState<EndpointRow[]>([]);
  const [hookUrl, setHookUrl] = useState("");
  const [hookEvents, setHookEvents] = useState<string[]>([...WEBHOOK_EVENTS]);
  const [freshSecret, setFreshSecret] = useState<{ id: string; secret: string } | null>(null);

  const [dailyCap, setDailyCap] = useState("");
  const [quietStart, setQuietStart] = useState("");
  const [quietEnd, setQuietEnd] = useState("");
  const [timezone, setTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  );
  const [neverEmails, setNeverEmails] = useState("");
  const [savingRules, setSavingRules] = useState(false);
  const [rulesSaved, setRulesSaved] = useState(false);

  useEffect(() => {
    (async () => {
      const [{ data: rule }, { data: keyRows }, { data: hookRows }] = await Promise.all([
        supabase.from("user_rules").select("*").eq("user_id", userId).maybeSingle(),
        supabase.from("api_keys").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
        supabase
          .from("webhook_endpoints")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false }),
      ]);
      if (rule) {
        setDailyCap(rule.daily_cap ? String(rule.daily_cap) : "");
        setQuietStart((rule.quiet_start ?? "").slice(0, 5));
        setQuietEnd((rule.quiet_end ?? "").slice(0, 5));
        setTimezone(rule.timezone || "UTC");
        setNeverEmails((rule.never_emails ?? []).join("\n"));
      }
      setKeys((keyRows ?? []) as ApiKeyRow[]);
      setEndpoints((hookRows ?? []) as EndpointRow[]);
    })();
  }, [userId]);

  async function saveRules() {
    const cap = dailyCap.trim() ? Number(dailyCap) : null;
    if (cap !== null && (!Number.isInteger(cap) || cap < 1 || cap > 500)) {
      toast.error("Daily cap must be a whole number between 1 and 500");
      return;
    }
    if (Boolean(quietStart) !== Boolean(quietEnd)) {
      toast.error("Set both quiet-hour times, or leave both empty");
      return;
    }
    setSavingRules(true);
    const list = neverEmails
      .split(/[\n,;]/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const { error } = await supabase.from("user_rules").upsert(
      {
        user_id: userId,
        daily_cap: cap,
        quiet_start: quietStart || null,
        quiet_end: quietEnd || null,
        timezone: timezone.trim() || "UTC",
        never_emails: [...new Set(list)],
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    setSavingRules(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setRulesSaved(true);
    setTimeout(() => setRulesSaved(false), 2000);
    toast.success("Sending rules saved");
  }

  async function createKey() {
    const name = newKeyName.trim();
    if (!name) {
      toast.error("Give the key a name so you can tell it apart later");
      return;
    }
    const raw = randomKey("osk_");
    const { data, error } = await supabase
      .from("api_keys")
      .insert({ user_id: userId, name, prefix: raw.slice(0, 12), key_hash: await sha256Hex(raw) })
      .select("*")
      .single();
    if (error) {
      toast.error(error.message);
      return;
    }
    setKeys((rows) => [data as ApiKeyRow, ...rows]);
    setFreshKey(raw);
    setNewKeyName("");
  }

  async function revokeKey(id: string) {
    const { error } = await supabase
      .from("api_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setKeys((rows) => rows.map((k) => (k.id === id ? { ...k, revoked_at: new Date().toISOString() } : k)));
    toast.success("Key revoked");
  }

  async function addEndpoint() {
    const url = hookUrl.trim();
    if (!/^https:\/\/.+/i.test(url)) {
      toast.error("Webhook URL must start with https://");
      return;
    }
    if (hookEvents.length === 0) {
      toast.error("Pick at least one event");
      return;
    }
    const secret = randomKey("whsec_");
    const { data, error } = await supabase
      .from("webhook_endpoints")
      .insert({ user_id: userId, url, secret, events: hookEvents })
      .select("*")
      .single();
    if (error) {
      toast.error(error.message);
      return;
    }
    setEndpoints((rows) => [data as EndpointRow, ...rows]);
    setFreshSecret({ id: data.id, secret });
    setHookUrl("");
  }

  async function removeEndpoint(id: string) {
    const { error } = await supabase.from("webhook_endpoints").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setEndpoints((rows) => rows.filter((e) => e.id !== id));
  }

  return (
    <>
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-1.5 text-base font-semibold">
            <KeyRound className="h-4 w-4" /> API keys
          </h2>
          <Link to="/developers" className="flex items-center gap-1 text-xs text-primary hover:underline">
            API and MCP docs <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
        <p className="text-xs text-muted-foreground">
          Keys let your own tools read this account's numbers and pause a campaign. A key cannot send
          email or reach another account. Shown once; we store only a hash.
        </p>

        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Label htmlFor="key-name" className="text-xs">Key name</Label>
            <Input
              id="key-name"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              placeholder="e.g. Claude desktop"
              maxLength={80}
            />
          </div>
          <Button size="sm" onClick={createKey}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Create key
          </Button>
        </div>

        {freshKey && (
          <div className="mt-3 rounded-md border border-emerald-500/40 bg-emerald-500/5 p-3">
            <div className="text-xs font-medium">Copy this key now. It is not shown again.</div>
            <div className="mt-1.5"><CopyLine value={freshKey} /></div>
            <button
              type="button"
              className="mt-2 text-[11px] text-muted-foreground underline"
              onClick={() => setFreshKey(null)}
            >
              I have saved it
            </button>
          </div>
        )}

        {keys.length > 0 && (
          <ul className="mt-3 divide-y divide-border">
            {keys.map((key) => (
              <li key={key.id} className="flex flex-wrap items-center gap-2 py-2 text-xs">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 font-medium">
                    {key.name}
                    {key.revoked_at && <Badge variant="secondary">revoked</Badge>}
                  </div>
                  <div className="text-muted-foreground">
                    <code>{key.prefix}…</code> · created {new Date(key.created_at).toLocaleDateString()}
                    {key.last_used_at ? ` · last used ${new Date(key.last_used_at).toLocaleDateString()}` : " · never used"}
                  </div>
                </div>
                {!key.revoked_at && (
                  <Button variant="outline" size="sm" onClick={() => revokeKey(key.id)}>
                    Revoke
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="mb-3 flex items-center gap-1.5 text-base font-semibold">
          <Webhook className="h-4 w-4" /> Webhooks
        </h2>
        <p className="text-xs text-muted-foreground">
          We POST each event as JSON and sign it with{" "}
          <code className="text-[11px]">x-outshipai-signature: t=&lt;unix&gt;,v1=&lt;hmac&gt;</code>. Six
          failed attempts mark that delivery failed; the endpoint stays connected.
        </p>

        <div className="mt-3 space-y-2">
          <div>
            <Label htmlFor="hook-url" className="text-xs">Endpoint URL</Label>
            <Input
              id="hook-url"
              value={hookUrl}
              onChange={(e) => setHookUrl(e.target.value)}
              placeholder="https://example.com/outshipai"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {WEBHOOK_EVENTS.map((event) => {
              const on = hookEvents.includes(event);
              return (
                <button
                  key={event}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setHookEvents((list) => (on ? list.filter((e) => e !== event) : [...list, event]))
                  }
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    on
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {event}
                </button>
              );
            })}
          </div>
          <Button size="sm" onClick={addEndpoint}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Add webhook
          </Button>
        </div>

        {freshSecret && (
          <div className="mt-3 rounded-md border border-emerald-500/40 bg-emerald-500/5 p-3">
            <div className="text-xs font-medium">Signing secret — copy it now.</div>
            <div className="mt-1.5"><CopyLine value={freshSecret.secret} /></div>
          </div>
        )}

        {endpoints.length > 0 && (
          <ul className="mt-3 divide-y divide-border">
            {endpoints.map((endpoint) => (
              <li key={endpoint.id} className="flex flex-wrap items-start gap-2 py-2 text-xs">
                <div className="min-w-0 flex-1">
                  <div className="break-all font-medium">{endpoint.url}</div>
                  <div className="text-muted-foreground">
                    {endpoint.events.join(", ")}
                    {endpoint.last_status ? ` · last HTTP ${endpoint.last_status}` : ""}
                    {endpoint.failure_count > 0 ? ` · ${endpoint.failure_count} recent failures` : ""}
                  </div>
                  <div className="mt-1">
                    <CopyLine value={endpoint.secret} />
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => removeEndpoint(endpoint.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="mb-3 text-base font-semibold">Sending rules</h2>
        <p className="text-xs text-muted-foreground">
          These are enforced by the send worker before every email, first-touch and follow-up. Blank
          means the plan default.
        </p>

        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div>
            <Label htmlFor="daily-cap" className="text-xs">Daily cap</Label>
            <Input
              id="daily-cap"
              type="number"
              min={1}
              max={500}
              value={dailyCap}
              onChange={(e) => setDailyCap(e.target.value)}
              placeholder="Plan default"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">Can only lower your plan cap.</p>
          </div>
          <div>
            <Label htmlFor="quiet-start" className="text-xs">Quiet hours start</Label>
            <Input
              id="quiet-start"
              type="time"
              value={quietStart}
              onChange={(e) => setQuietStart(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="quiet-end" className="text-xs">Quiet hours end</Label>
            <Input
              id="quiet-end"
              type="time"
              value={quietEnd}
              onChange={(e) => setQuietEnd(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="timezone" className="text-xs">Timezone</Label>
            <Input
              id="timezone"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              placeholder="e.g. Asia/Kolkata"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              IANA name. Hours are read in this timezone.
            </p>
          </div>
          <div>
            <Label htmlFor="never" className="text-xs">Never email</Label>
            <Textarea
              id="never"
              value={neverEmails}
              onChange={(e) => setNeverEmails(e.target.value)}
              placeholder={"one per line\nsomeone@example.com\ncompetitor.com"}
              rows={4}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              A domain blocks that domain and its subdomains. An address blocks that address only.
            </p>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-3">
          <Button size="sm" onClick={saveRules} disabled={savingRules}>
            {savingRules ? "Saving…" : "Save rules"}
          </Button>
          {rulesSaved && (
            <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
              <Check className="h-3.5 w-3.5" /> Saved
            </span>
          )}
        </div>
      </div>
    </>
  );
}
