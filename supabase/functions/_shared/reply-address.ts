// Per-lead inbound reply address. Outbound mail sets Reply-To to this address;
// the provider's inbound-parse webhook extracts the lead id and routes the
// reply back into the app. No Gmail read scope required.
//
//   EMAIL_INBOUND_DOMAIN  e.g. "reply.out-ship.com" (MX -> provider inbound)

export function inboundDomain(): string | null {
  return Deno.env.get("EMAIL_INBOUND_DOMAIN") ?? null;
}

/** Returns the Reply-To address for a lead, or undefined when inbound isn't set up. */
export function inboundReplyTo(leadId: string): string | undefined {
  const domain = inboundDomain();
  if (!domain) return undefined;
  return `r-${leadId}@${domain}`;
}

/** Extracts the lead id from an inbound recipient address. */
export function parseInboundLeadId(to: string | null | undefined): string | null {
  if (!to) return null;
  const m = String(to).match(/r-([0-9a-fA-F-]{36})@/);
  return m ? m[1] : null;
}
