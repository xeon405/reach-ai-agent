import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";
import { EnOnlyNotice } from "@/components/EnOnlyNotice";

export const Route = createFileRoute("/developers")({
  head: () => ({
    meta: [
      { title: "API, Webhooks and MCP — OutshipAi for Developers" },
      {
        name: "description",
        content:
          "Read your outreach numbers, watch every send, pause campaigns, and run OutshipAi from Claude or ChatGPT. Keys are scoped to one account and cannot send email.",
      },
    ],
  }),
  component: DevelopersPage,
});

const BASE = "https://zvohdvopmvzsujktrdmu.supabase.co/functions/v1";

const ENDPOINTS = [
  ["GET", "/v1/me", "Account, plan and lifetime sends"],
  ["GET", "/v1/campaigns", "Campaigns with sent / replied / interested"],
  ["GET", "/v1/stats?days=30", "Totals for a window"],
  ["GET", "/v1/replies?bucket=interested", "Replies: interested, not_now or stop"],
  ["GET", "/v1/activity", "Why each email was sent, held or blocked"],
  ["GET", "/v1/leads?campaign_id=", "Recent leads"],
  ["POST", "/v1/campaigns/{id}/pause", "Pause a campaign"],
  ["POST", "/v1/campaigns/{id}/resume", "Resume a campaign"],
] as const;

const WEBHOOK_EVENTS = [
  "email.sent",
  "email.replied",
  "email.bounced",
  "email.unsubscribed",
  "email.held_for_review",
  "email.failed",
  "booking.confirmed",
] as const;

function Code({ children }: { children: string }) {
  return (
    <pre className="mt-2 overflow-x-auto rounded-lg border border-border bg-muted/40 p-3 text-[11px] leading-relaxed">
      <code>{children}</code>
    </pre>
  );
}

function DevelopersPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-5 py-12">
        <EnOnlyNotice />
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">API, webhooks and MCP</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Every number here is the same number the dashboard shows. A key belongs to one account and
          can read that account plus pause or resume its campaigns. It cannot send email, change
          billing, or reach another account.
        </p>

        <section className="mt-8">
          <h2 className="text-base font-semibold">1. Create a key</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Settings → API keys → Create key. The key is shown once; we store only a SHA-256 hash.
            Send it as a bearer token:
          </p>
          <Code>{`curl ${BASE}/public-api/v1/stats?days=30 \\
  -H "Authorization: Bearer osk_your_key"`}</Code>
        </section>

        <section className="mt-8">
          <h2 className="text-base font-semibold">2. Endpoints</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Base: <code className="text-[11px]">{BASE}/public-api</code>. Limits are 120 requests per
            minute per key.
          </p>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3 font-medium">Method</th>
                  <th className="py-2 pr-3 font-medium">Path</th>
                  <th className="py-2 font-medium">Returns</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {ENDPOINTS.map(([method, path, returns]) => (
                  <tr key={path}>
                    <td className="py-2 pr-3 font-mono text-muted-foreground">{method}</td>
                    <td className="py-2 pr-3 font-mono">{path}</td>
                    <td className="py-2 text-muted-foreground">{returns}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-base font-semibold">3. Webhooks</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Settings → Webhooks. We POST JSON for seven events: {WEBHOOK_EVENTS.join(", ")}. Every
            request is signed:
          </p>
          <Code>{`x-outshipai-event: email.sent
x-outshipai-signature: t=1762766400,v1=<hex hmac_sha256>`}</Code>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign the exact body as <code className="text-[11px]">`${"{t}"}.${"{body}"}`</code> with the
            endpoint secret, then compare in constant time. Six failed attempts mark that delivery
            failed; the endpoint stays connected and the failure count is visible in Settings.
          </p>
          <Code>{`import { createHmac, timingSafeEqual } from "node:crypto";

const [tPart, vPart] = header.split(",");
const t = tPart.slice(2);
const expected = createHmac("sha256", secret).update(\`\${t}.\${rawBody}\`).digest("hex");
const ok = timingSafeEqual(Buffer.from(expected), Buffer.from(vPart.slice(3)));`}</Code>
        </section>

        <section className="mt-8">
          <h2 className="text-base font-semibold">4. MCP (Claude, ChatGPT)</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The same key works as an MCP server. Tools: list campaigns, stats, replies, email log,
            leads, pause and resume. Read-only except pause/resume.
          </p>
          <Code>{`{
  "mcpServers": {
    "outshipai": {
      "type": "http",
      "url": "${BASE}/mcp",
      "headers": { "Authorization": "Bearer osk_your_key" }
    }
  }
}`}</Code>
          <p className="mt-2 text-sm text-muted-foreground">
            In Claude, add a custom connector with the same URL and header. In ChatGPT developer
            mode, add it as an MCP server. Nothing is sent by a tool call.
          </p>
        </section>

        <section className="mt-8">
          <h2 className="text-base font-semibold">5. Email log</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Every send, hold and block writes an audit row before it acts. Read the same trail at{" "}
            <a className="text-primary hover:underline" href="/activity">Email log</a> or through{" "}
            <code className="text-[11px]">/v1/activity</code>. Reasons are codes such as{" "}
            <code className="text-[11px]">daily_limit</code>,{" "}
            <code className="text-[11px]">quiet_hours</code> and{" "}
            <code className="text-[11px]">never_email</code>, so nothing is hidden behind prose.
          </p>
        </section>

        <p className="mt-10 text-xs text-muted-foreground">
          Questions: support@out-ship.com. If a key leaks, revoke it in Settings; revoked keys stop
          working immediately.
        </p>
      </main>
    </div>
  );
}
