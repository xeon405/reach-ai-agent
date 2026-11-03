import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ShieldCheck,
  ShieldAlert,
  Loader2,
  Users,
  Globe,
  Mail,
  MapPinOff,
  MonitorSmartphone,
  CircleSlash,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminPage,
});

/**
 * Shape of the document returned by public.admin_console()
 * (supabase/migrations/20261103000001_admin_console.sql). The RPC is typed as
 * `Json`, so this is the one place that pins the contract. If a column is added
 * in SQL, add it here too — the compiler is how the page notices.
 */
type Totals = {
  accounts: number;
  signups_7d: number;
  flagged: number;
  verified_domains: number;
  emails_sent: number;
  address_missing: number;
};

type Account = {
  id: string;
  created_at: string;
  email: string | null;
  name: string | null;
  company: string | null;
  business_address: string | null;
  plan: string;
  domain_required: boolean;
  domain_verified: boolean;
  gmail_connected: boolean;
  emails_total: number;
  emails_today: number;
  address_ok: boolean;
  signal_count: number;
  devices: string[] | null;
  ips: string[] | null;
};

type Who = {
  id: string;
  email: string | null;
  company: string | null;
  created_at: string;
  plan: string;
  domain_required: boolean;
};

type Cluster = {
  kind: "device" | "ip";
  value: string;
  accounts: number;
  who: Who[];
};

type DomainRow = {
  domain: string;
  verified_at: string | null;
  created_at: string;
  email: string | null;
  company: string | null;
  user_id: string;
};

type Signal = {
  created_at: string;
  device_id: string | null;
  ip_hash: string | null;
  user_agent: string | null;
  email: string | null;
  company: string | null;
  user_id: string | null;
};

type ActionRow = {
  created_at: string;
  action: string;
  note: string | null;
  actor_id: string | null;
  target_id: string | null;
  target_email: string | null;
};

type Snapshot = {
  generated_at: string;
  totals: Totals;
  accounts: Account[];
  clusters: Cluster[];
  domains: DomainRow[];
  signals: Signal[];
  actions: ActionRow[];
};

const EMPTY: Snapshot = {
  generated_at: "",
  totals: {
    accounts: 0,
    signups_7d: 0,
    flagged: 0,
    verified_domains: 0,
    emails_sent: 0,
    address_missing: 0,
  },
  accounts: [],
  clusters: [],
  domains: [],
  signals: [],
  actions: [],
};

function when(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function shortId(v: string | null) {
  if (!v) return "—";
  return v.length > 14 ? `${v.slice(0, 10)}…${v.slice(-4)}` : v;
}

function AdminPage() {
  const [data, setData] = useState<Snapshot>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // One dialog for both directions, so "allow" and "flag" cannot drift apart.
  const [dialog, setDialog] = useState<{
    id: string;
    email: string | null;
    mode: "clear" | "flag";
  } | null>(null);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(null);
    const { data: res, error } = await supabase.rpc("admin_console");
    if (error) {
      // 42501 = the function refused: caller is not in public.admins.
      if (error.code === "42501" || /not_admin/.test(error.message)) {
        setDenied(true);
      } else {
        setFailed(error.message);
      }
      setLoading(false);
      return;
    }
    setDenied(false);
    setData({ ...EMPTY, ...(res as unknown as Snapshot) });
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function decide() {
    if (!dialog) return;
    setBusy(dialog.id);
    const { error } =
      dialog.mode === "clear"
        ? await supabase.rpc("admin_clear_flag", {
            p_user: dialog.id,
            p_note: note.trim() || undefined,
          })
        : await supabase.rpc("admin_flag", {
            p_user: dialog.id,
            p_note: note.trim() || undefined,
          });
    setBusy(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(
      dialog.mode === "clear"
        ? `Allowed ${dialog.email ?? "account"} to send again`
        : `Flagged ${dialog.email ?? "account"} — must prove its domain`,
    );
    setDialog(null);
    setNote("");
    load();
  }

  if (loading && !data.generated_at) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  if (denied) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <CircleSlash className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
        <h1 className="text-lg font-semibold">Not available</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This page is for the operator only. Your account does not have access.
        </p>
      </div>
    );
  }

  if (failed) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <ShieldAlert className="mx-auto mb-3 h-8 w-8 text-destructive" />
        <h1 className="text-lg font-semibold">Could not load</h1>
        <p className="mt-2 text-sm text-muted-foreground">{failed}</p>
        <Button className="mt-4" variant="outline" onClick={load}>
          Try again
        </Button>
      </div>
    );
  }

  const flagged = data.accounts.filter((a) => a.domain_required);
  const stats = [
    { icon: Users, label: "Accounts", value: data.totals.accounts },
    { icon: Users, label: "Signups (7d)", value: data.totals.signups_7d },
    { icon: ShieldAlert, label: "Flagged", value: data.totals.flagged },
    { icon: Globe, label: "Verified domains", value: data.totals.verified_domains },
    { icon: Mail, label: "Emails sent", value: data.totals.emails_sent },
    { icon: MapPinOff, label: "Missing address", value: data.totals.address_missing },
  ];

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
        </div>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Nothing on this page blocks anyone. It shows what the duplicate check saw, so you can step
          in when it is wrong. A flag means one thing only: that account must prove it owns the
          business domain before it can send.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <s.icon className="mb-2 h-4 w-4 text-muted-foreground" />
              <div className="text-2xl font-semibold tabular-nums">{s.value}</div>
              <div className="text-xs text-muted-foreground">{s.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ---------- the actual signal ---------- */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <MonitorSmartphone className="h-4 w-4" />
            Shared device or IP
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Several accounts seen from one device or one IP. This is the closest thing to evidence
            of one person making many accounts, because nothing is ever blocked.
          </p>
        </CardHeader>
        <CardContent>
          {data.clusters.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No device or IP is shared between accounts yet. Anyone with many accounts is using a
              different device or network each time — the 50-email cap is what limits them.
            </p>
          ) : (
            <div className="space-y-3">
              {data.clusters.map((c) => (
                <div key={`${c.kind}-${c.value}`} className="rounded-lg border border-border p-3">
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                    <Badge variant={c.kind === "device" ? "default" : "secondary"}>
                      {c.kind === "device" ? "Same device" : "Same IP"}
                    </Badge>
                    <span className="font-mono text-muted-foreground">{shortId(c.value)}</span>
                    <span className="text-muted-foreground">· {c.accounts} accounts</span>
                  </div>
                  <div className="space-y-1">
                    {c.who.map((w) => (
                      <div key={w.id} className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="truncate">{w.email ?? w.id.slice(0, 8)}</span>
                        <span className="text-muted-foreground">{w.company ?? "—"}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {w.plan}
                        </Badge>
                        {w.domain_required && (
                          <Badge variant="destructive" className="text-[10px]">
                            flagged
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground">{when(w.created_at)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ---------- flagged ---------- */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldAlert className="h-4 w-4" />
            Flagged accounts
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Matched a business name and address that already belongs to an earlier account, and has
            not proved its domain. Allow it if you can see it is the same real business.
          </p>
        </CardHeader>
        <CardContent>
          {flagged.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing is flagged right now.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead>Business</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Since</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {flagged.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="max-w-[180px] truncate">
                      {a.email ?? a.id.slice(0, 8)}
                    </TableCell>
                    <TableCell className="max-w-[160px] truncate">{a.company ?? "—"}</TableCell>
                    <TableCell className="max-w-[220px] truncate text-muted-foreground">
                      {a.business_address ?? "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {when(a.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy === a.id}
                        onClick={() => {
                          setNote("");
                          setDialog({ id: a.id, email: a.email, mode: "clear" });
                        }}
                      >
                        Allow
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ---------- all accounts ---------- */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">All accounts</CardTitle>
          <p className="text-xs text-muted-foreground">Newest first, up to 200.</p>
        </CardHeader>
        <CardContent className="max-h-[520px] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Joined</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Business</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead className="text-right">Emails</TableHead>
                <TableHead>Gmail</TableHead>
                <TableHead>Address</TableHead>
                <TableHead>Signals</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.accounts.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {when(a.created_at)}
                  </TableCell>
                  <TableCell className="max-w-[190px] truncate">{a.email ?? "—"}</TableCell>
                  <TableCell className="max-w-[150px] truncate">{a.company ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={a.plan === "free" ? "secondary" : "default"}>{a.plan}</Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {a.emails_total}
                    <span className="text-muted-foreground"> / {a.emails_today}d</span>
                  </TableCell>
                  <TableCell>
                    {a.gmail_connected ? (
                      <span className="text-xs text-success">connected</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {a.address_ok ? (
                      <span className="text-xs text-success">ok</span>
                    ) : (
                      <Badge variant="outline" className="text-[10px]">
                        not a street
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{a.signal_count}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant={a.domain_required ? "outline" : "ghost"}
                      disabled={busy === a.id}
                      onClick={() => {
                        setNote("");
                        setDialog({
                          id: a.id,
                          email: a.email,
                          mode: a.domain_required ? "clear" : "flag",
                        });
                      }}
                    >
                      {a.domain_required ? "Allow" : "Flag"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ---------- domains ---------- */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Globe className="h-4 w-4" />
            Domains
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            A verified domain is the only thing that clears a flag. One domain, one account.
          </p>
        </CardHeader>
        <CardContent>
          {data.domains.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No domain has been verified yet. Nobody has needed to prove one.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Domain</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Verified</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.domains.map((d) => (
                  <TableRow key={`${d.user_id}-${d.domain}`}>
                    <TableCell className="font-mono text-xs">{d.domain}</TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {d.email ?? d.user_id.slice(0, 8)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {when(d.created_at)}
                    </TableCell>
                    <TableCell className="text-xs">
                      {d.verified_at ? (
                        <span className="text-success">{when(d.verified_at)}</span>
                      ) : (
                        <span className="text-muted-foreground">not yet</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ---------- raw signals ---------- */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Recent signup signals</CardTitle>
          <p className="text-xs text-muted-foreground">
            Recorded when someone signs in. Hashed — no raw IP is stored. Observation only.
          </p>
        </CardHeader>
        <CardContent className="max-h-[360px] overflow-auto">
          {data.signals.length === 0 ? (
            <p className="text-sm text-muted-foreground">No signals recorded yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Device</TableHead>
                  <TableHead>IP hash</TableHead>
                  <TableHead>Agent</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.signals.map((s, i) => (
                  <TableRow key={`${s.created_at}-${i}`}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {when(s.created_at)}
                    </TableCell>
                    <TableCell className="max-w-[180px] truncate">{s.email ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{shortId(s.device_id)}</TableCell>
                    <TableCell className="font-mono text-xs">{shortId(s.ip_hash)}</TableCell>
                    <TableCell className="max-w-[260px] truncate text-xs text-muted-foreground">
                      {s.user_agent ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ---------- history ---------- */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Your decisions</CardTitle>
          <p className="text-xs text-muted-foreground">
            Every allow or flag, so the reason is answerable later.
          </p>
        </CardHeader>
        <CardContent>
          {data.actions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No manual decisions yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>What</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.actions.map((a, i) => (
                  <TableRow key={`${a.created_at}-${i}`}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {when(a.created_at)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={a.action === "flag" ? "destructive" : "secondary"}>
                        {a.action === "flag" ? "Flagged" : "Allowed"}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {a.target_email ?? a.target_id?.slice(0, 8) ?? "—"}
                    </TableCell>
                    <TableCell className="max-w-[280px] truncate text-xs text-muted-foreground">
                      {a.note ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(dialog)}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialog?.mode === "clear" ? "Allow this account?" : "Flag this account?"}
            </DialogTitle>
            <DialogDescription>
              {dialog?.mode === "clear"
                ? "Sending resumes immediately. Only do this when you can see it is the same real business as the earlier account."
                : "This account will have to prove it owns the business domain before it can send again."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="admin-note">Why (optional)</Label>
            <Input
              id="admin-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                dialog?.mode === "clear"
                  ? "Same business, second inbox"
                  : "Same device as 3 other accounts"
              }
            />
            <p className="text-xs text-muted-foreground">
              Kept in the history below. Future you will want it.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button
              variant={dialog?.mode === "flag" ? "destructive" : "default"}
              onClick={decide}
              disabled={busy !== null}
            >
              {busy !== null && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {dialog?.mode === "clear" ? "Allow" : "Flag"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
