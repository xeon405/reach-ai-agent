// Transactional email provider layer (HTTP API). Replaces Gmail API for
// sending. No Google OAuth, no scopes, no verification required.
//
// Configure via env:
//   EMAIL_PROVIDER   one of: sendgrid | resend | mailgun   (default: sendgrid)
//   EMAIL_FROM       e.g. "outreach@out-ship.com"  (required to send)
//   EMAIL_FROM_NAME  optional display name
//   SENDGRID_API_KEY | RESEND_API_KEY | MAILGUN_API_KEY + MAILGUN_DOMAIN
//
// All providers are reached over HTTPS (fetch), which is the only outbound
// transport available in Supabase Edge Functions (no raw TCP / SMTP).

export interface OutboundEmail {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  /** Extra RFC 5322 headers (e.g. List-Unsubscribe). */
  headers?: Record<string, string>;
}

export interface SendResult {
  id: string | null;
  provider: string;
}

export function providerName(): string {
  return (Deno.env.get("EMAIL_PROVIDER") ?? "sendgrid").toLowerCase();
}

export function fromAddress(): string {
  const from = Deno.env.get("EMAIL_FROM");
  if (!from) throw new Error("EMAIL_FROM is not configured");
  return from;
}

export function senderFromAddress(): string {
  const from = fromAddress();
  const name = Deno.env.get("EMAIL_FROM_NAME");
  return name ? `${name} <${from}>` : from;
}

export async function sendEmail(msg: OutboundEmail): Promise<SendResult> {
  switch (providerName()) {
    case "sendgrid":
      return sendViaSendgrid(msg);
    case "resend":
      return sendViaResend(msg);
    case "mailgun":
      return sendViaMailgun(msg);
    default:
      throw new Error(`unknown EMAIL_PROVIDER: ${providerName()}`);
  }
}

async function sendViaSendgrid(msg: OutboundEmail): Promise<SendResult> {
  const key = Deno.env.get("SENDGRID_API_KEY");
  if (!key) throw new Error("SENDGRID_API_KEY is not configured");
  const content: { type: string; value: string }[] = [{ type: "text/plain", value: msg.text }];
  if (msg.html) content.push({ type: "text/html", value: msg.html });
  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: msg.to }], ...(msg.headers ? { headers: msg.headers } : {}) }],
      from: { email: fromAddress(), ...(Deno.env.get("EMAIL_FROM_NAME") ? { name: Deno.env.get("EMAIL_FROM_NAME")! } : {}) },
      ...(msg.replyTo ? { reply_to: { email: msg.replyTo } } : {}),
      subject: msg.subject,
      content,
    }),
  });
  if (!res.ok) throw new Error(`sendgrid_send_failed:${res.status}:${(await res.text()).slice(0, 200)}`);
  return { id: res.headers.get("x-message-id") ?? null, provider: "sendgrid" };
}

async function sendViaResend(msg: OutboundEmail): Promise<SendResult> {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) throw new Error("RESEND_API_KEY is not configured");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: senderFromAddress(),
      to: [msg.to],
      subject: msg.subject,
      text: msg.text,
      ...(msg.html ? { html: msg.html } : {}),
      ...(msg.replyTo ? { reply_to: msg.replyTo } : {}),
      ...(msg.headers ? { headers: msg.headers } : {}),
    }),
  });
  if (!res.ok) throw new Error(`resend_send_failed:${res.status}:${(await res.text()).slice(0, 200)}`);
  const json = await res.json().catch(() => ({}));
  return { id: (json as { id?: string }).id ?? null, provider: "resend" };
}

async function sendViaMailgun(msg: OutboundEmail): Promise<SendResult> {
  const key = Deno.env.get("MAILGUN_API_KEY");
  const domain = Deno.env.get("MAILGUN_DOMAIN");
  if (!key || !domain) throw new Error("MAILGUN_API_KEY / MAILGUN_DOMAIN not configured");
  const form = new FormData();
  form.set("from", senderFromAddress());
  form.set("to", msg.to);
  form.set("subject", msg.subject);
  form.set("text", msg.text);
  if (msg.html) form.set("html", msg.html);
  if (msg.replyTo) form.set("h:Reply-To", msg.replyTo);
  for (const [k, v] of Object.entries(msg.headers ?? {})) form.set(`h:${k}`, v);
  const res = await fetch(`https://api.mailgun.net/v3/${domain}/messages`, {
    method: "POST",
    headers: { Authorization: `Basic ${btoa(`api:${key}`)}` },
    body: form,
  });
  if (!res.ok) throw new Error(`mailgun_send_failed:${res.status}:${(await res.text()).slice(0, 200)}`);
  const json = await res.json().catch(() => ({}));
  return { id: (json as { id?: string }).id ?? null, provider: "mailgun" };
}
