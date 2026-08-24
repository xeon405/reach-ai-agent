// Audit trail: every automated action must be traceable.
type AuditClient = { from(t: string): any };

export async function insertAudit(
  admin: AuditClient,
  opts: {
    user_id?: string | null;
    lead_id?: string | null;
    campaign_id?: string | null;
    event: string;
    payload?: Record<string, unknown>;
  }
): Promise<void> {
  try {
    await admin.from("audit_events").insert({
      user_id: opts.user_id ?? null,
      lead_id: opts.lead_id ?? null,
      campaign_id: opts.campaign_id ?? null,
      event: opts.event,
      payload: opts.payload ?? {},
    });
  } catch (_e) {
    // Auditing must never break the action it records.
  }
}
