import { ExternalLink, ShieldCheck, ShieldX, Info } from "lucide-react";

export type ProofFact = {
  id: string;
  kind: string;
  value: string;
  quote: string;
  sourceUrl: string;
  checkedAt: string;
  source: string;
};

export type ProofClaim = { sentence: string; fact_ids: string[] };
export type ProofBlocked = { sentence: string; reason: string };

const SOURCE_LABEL: Record<string, string> = {
  listing: "Business listing",
  page: "Their website",
  you: "You entered this",
  ours: "From OutshipAi",
};

function readableDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "date unknown";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/** The review-time proof panel: each sentence, the facts behind it, where the
 *  facts came from, and when they were checked. Sentences removed by the fact
 *  checker are listed too, so a silent or blank result is impossible. */
export function WhyThisEmail({
  facts,
  claims,
  blocked,
  template = false,
}: {
  facts: ProofFact[];
  claims: ProofClaim[];
  blocked: ProofBlocked[];
  /** True when the email being shown is the fixed template (no generated
   *  sentence survived). The panel must not claim "no email was written"
   *  beside a real email. */
  template?: boolean;
}) {
  const byId = new Map((facts ?? []).map((f) => [f.id, f]));
  const used = new Set((claims ?? []).flatMap((c) => c.fact_ids ?? []));
  const shown = (facts ?? []).filter((f) => used.has(f.id));

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2">
        <ShieldCheck className="h-4 w-4 mt-0.5 text-emerald-600 shrink-0" />
        <div>
          <p className="text-sm font-medium">Why this email</p>
          <p className="text-xs text-muted-foreground">
            Every sentence points at a fact we checked. Anything without a fact is removed before sending.
          </p>
        </div>
      </div>

      {(claims ?? []).length === 0 ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
          <Info className="h-4 w-4 mt-0.5 text-amber-600 shrink-0" />
          <p className="text-xs text-muted-foreground">
            {template
              ? "This email is the fixed template. It states only the contact's name, your company and your offer. No generated sentence passed the fact check."
              : "No sentence passed the fact check, so no email was written. Add a website or a full address to this business, then generate again."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {(claims ?? []).map((c, i) => {
            const cited = (c.fact_ids ?? []).map((id) => byId.get(id)).filter(Boolean) as ProofFact[];
            return (
              <div key={`${c.sentence}-${i}`} className="rounded-lg border border-border bg-muted/20 p-3">
                <p className="text-xs leading-relaxed">{c.sentence}</p>
                <ul className="mt-2 space-y-1.5">
                  {cited.map((f) => (
                    <li key={`${c.sentence}-${f.id}`} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
                      <span className="rounded bg-muted px-1.5 py-0.5 font-medium uppercase tracking-wide text-muted-foreground">
                        {f.kind.replace(/_/g, " ")}
                      </span>
                      <span className="font-medium">{f.value}</span>
                      <span className="text-muted-foreground">
                        {SOURCE_LABEL[f.source] ?? f.source} · checked {readableDate(f.checkedAt)}
                      </span>
                      {f.sourceUrl ? (
                        <a
                          href={f.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-0.5 text-primary hover:underline"
                        >
                          source <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      {(blocked ?? []).length > 0 && (
        <div className="rounded-lg border border-border p-3">
          <div className="flex items-center gap-1.5">
            <ShieldX className="h-3.5 w-3.5 text-red-500" />
            <p className="text-xs font-medium">Removed before sending ({(blocked ?? []).length})</p>
          </div>
          <ul className="mt-2 space-y-1.5">
            {(blocked ?? []).map((b, i) => (
              <li key={`${b.reason}-${i}`} className="text-[11px] text-muted-foreground">
                {b.sentence ? <span className="text-foreground">{b.sentence} </span> : null}
                <span>— {b.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {shown.length > 0 && !(claims ?? []).length ? (
        <p className="text-[11px] text-muted-foreground">
          {shown.length} checked fact{shown.length === 1 ? "" : "s"} available.
        </p>
      ) : null}
    </div>
  );
}
