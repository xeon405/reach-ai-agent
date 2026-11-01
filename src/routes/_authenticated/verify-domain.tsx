import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowLeft, Check, Copy, Loader2, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/_authenticated/verify-domain")({
  component: VerifyDomainPage,
});

type Record = {
  domain: string;
  record_type: string;
  record_name: string;
  record_value: string;
};

function VerifyDomainPage() {
  const [loading, setLoading] = useState(true);
  const [required, setRequired] = useState(false);
  const [verified, setVerified] = useState(false);
  const [company, setCompany] = useState("");

  const [domain, setDomain] = useState("");
  const [record, setRecord] = useState<Record | null>(null);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: p } = await supabase
        .from("profiles")
        .select("company, domain_required, domain_verified")
        .eq("id", data.user.id)
        .single();
      if (p) {
        setRequired(Boolean(p.domain_required));
        setVerified(Boolean(p.domain_verified));
        setCompany(p.company ?? "");
      }
      setLoading(false);
    });
  }, []);

  async function start() {
    const value = domain.trim();
    if (!value) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("domain-verify", {
        body: { action: "start", domain: value },
      });
      if (error || data?.error) {
        const code = data?.error ?? "";
        if (code === "freemail_not_allowed") {
          toast.error(
            "That's a personal email provider, not a business domain. Use the domain your business owns, e.g. yourcompany.com.",
          );
        } else if (code === "domain_unavailable") {
          toast.error(
            "That domain is already verified by another account. If it's yours, contact support.",
          );
        } else if (code === "invalid_domain") {
          toast.error("That doesn't look like a domain. Try the form yourcompany.com.");
        } else {
          toast.error("Could not start verification. Try again.");
        }
        return;
      }
      if (data?.verified) {
        setVerified(true);
        toast.success("This domain is already verified.");
        return;
      }
      setRecord({
        domain: data.domain,
        record_type: data.record_type,
        record_name: data.record_name,
        record_value: data.record_value,
      });
    } finally {
      setBusy(false);
    }
  }

  async function check() {
    if (!record) return;
    setChecking(true);
    try {
      const { data, error } = await supabase.functions.invoke("domain-verify", {
        body: { action: "check", domain: record.domain },
      });
      if (error || data?.error) {
        toast.error("Could not check the record. Try again in a minute.");
        return;
      }
      if (data?.verified) {
        setVerified(true);
        toast.success("Domain verified. You can send now.");
        return;
      }
      if (data?.reason === "record_mismatch") {
        toast.error(
          "We found a TXT record at that name, but the value doesn't match. Copy the value exactly.",
        );
      } else {
        toast.error(
          "Record not found yet. DNS can take a few minutes — save it, wait, then try again.",
        );
      }
    } finally {
      setChecking(false);
    }
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text).then(
      () => toast.success("Copied"),
      () => toast.error("Could not copy — select the text and copy manually"),
    );
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  if (verified) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <h1 className="text-2xl font-bold">Domain verified</h1>
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center gap-2 text-success">
            <ShieldCheck className="h-5 w-5" />
            <span className="font-medium">This account is cleared to send.</span>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            You can remove the TXT record from your DNS now — verification is already saved.
          </p>
        </div>
        <Link to="/dashboard">
          <Button variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to dashboard
          </Button>
        </Link>
      </div>
    );
  }

  if (!required) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <h1 className="text-2xl font-bold">No action needed</h1>
        <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
          This account hasn't been asked to verify a domain. Nothing here is blocking you.
          <div className="mt-4">
            <Link to="/dashboard">
              <Button variant="outline">
                <ArrowLeft className="mr-2 h-4 w-4" /> Back to dashboard
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Confirm you own your domain</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Sending is paused on this account until this is done. Nothing has been lost — your leads
          and campaigns stay exactly as they are.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-5 space-y-2">
        <div className="text-sm font-medium">Why you're seeing this</div>
        <p className="text-sm text-muted-foreground">
          Another account already registered the business name and address
          {company ? (
            <>
              {" "}
              <strong className="text-foreground">{company}</strong>
            </>
          ) : null}{" "}
          used here. We allow one free trial per business, and the first account with that name and
          address keeps it. To continue on this second account, confirm you own the business's
          domain. If you're the original business and think this is a mistake, contact support and
          we'll sort it out.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="domain">Your business domain</Label>
          <div className="flex gap-2">
            <Input
              id="domain"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="yourcompany.com"
              disabled={!!record}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !record) start();
              }}
            />
            <Button className="bg-primary" onClick={start} disabled={busy || !!record}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Get record"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Free email addresses (gmail.com, outlook.com, and similar) can't be verified — they
            don't belong to a business.
          </p>
        </div>

        {record && (
          <div className="space-y-3 rounded-lg border border-border bg-background/40 p-4">
            <div className="text-sm font-medium">Add this record at your domain provider</div>
            <p className="text-xs text-muted-foreground">
              Wherever you bought the domain (GoDaddy, Namecheap, Cloudflare, Google Domains…), open
              its DNS settings and add a <strong>TXT</strong> record with these two values.
            </p>
            <Field label="Type" value={record.record_type} onCopy={copy} />
            <Field label="Name / Host" value={record.record_name} onCopy={copy} />
            <Field label="Value" value={record.record_value} onCopy={copy} />
            <Button className="w-full bg-primary" onClick={check} disabled={checking}>
              {checking ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Checking…
                </>
              ) : (
                <>
                  <Check className="mr-2 h-4 w-4" /> Verify now
                </>
              )}
            </Button>
            <p className="text-xs text-muted-foreground">
              DNS usually updates in a few minutes, sometimes up to an hour. You can come back to
              this page any time.
            </p>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground">
        <Badge variant="secondary" className="mb-2">
          Honest note
        </Badge>
        <p>
          We check a TXT record instead of emailing you a code, because OutshipAi sends every email
          through your own Gmail — there's no separate mailer to reach you at. DNS also works if
          your business has no mailbox on that domain.
        </p>
      </div>

      <Link to="/dashboard">
        <Button variant="outline">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to dashboard
        </Button>
      </Link>
    </div>
  );
}

function Field({
  label,
  value,
  onCopy,
}: {
  label: string;
  value: string;
  onCopy: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="flex items-center gap-2">
        <code className="flex-1 truncate rounded-md border bg-background px-3 py-2 text-xs">
          {value}
        </code>
        <Button size="sm" variant="outline" onClick={() => onCopy(value)}>
          <Copy className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
