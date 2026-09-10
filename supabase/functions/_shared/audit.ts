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
    // Attribution (Stage 3 cols, nullable): who (decision_id), which config/prompt
    // version (model_version), which advice row (strategy_ref). Populated by the
    // wiring stages (5/6); null today means "no model output drove this row."
    decision_id?: string | null;
    model_version?: string | null;
    strategy_ref?: string | null;
  }
): Promise<void> {
  try {
    await admin.from("audit_events").insert({
      user_id: opts.user_id ?? null,
      lead_id: opts.lead_id ?? null,
      campaign_id: opts.campaign_id ?? null,
      event: opts.event,
      payload: opts.payload ?? {},
      decision_id: opts.decision_id ?? null,
      model_version: opts.model_version ?? null,
      strategy_ref: opts.strategy_ref ?? null,
    });
  } catch (_e) {
    // Auditing must never break the action it records.
  }
}
