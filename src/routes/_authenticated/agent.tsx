import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Sparkles, Send, Loader2, ShieldCheck, RefreshCw, Brain, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useLang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/agent")({
  component: AgentPage,
});

type Row = { label: string; value: string };

type Bubble = {
  id: string;
  role: "user" | "assistant";
  text: string;
  rows?: Row[];
  /** A write is waiting for the user to say yes before it runs. */
  pending?: boolean;
  confirm?: boolean;
  usedAi?: boolean;
  source?: string;
  limitHit?: boolean;
};

const STARTERS = [
  "How many emails have I sent?",
  "Show me my campaigns",
  "Who has unsubscribed?",
  "What is my sending reputation?",
];

type Learned = {
  id: number;
  phrase: string;
  intent: string;
  state: string;
  scope: string;
  uses: number;
  correct: number;
};

let seq = 0;
const nid = () => `m${Date.now()}-${seq++}`;

function AgentPage() {
  const { t } = useLang();
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [convId, setConvId] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // What the agent has learned, so a wrong assumption is visible and fixable
  // rather than silently steering every future answer.
  const [showLearned, setShowLearned] = useState(false);
  const [learned, setLearned] = useState<Learned[]>([]);
  const [learnedBusy, setLearnedBusy] = useState(false);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [bubbles]);

  async function loadLearned() {
    setLearnedBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("agent", { body: { action: "learned_list" } });
      if (error) throw new Error(error.message);
      setLearned((data?.learned ?? []) as Learned[]);
    } catch {
      setLearned([]);
    } finally {
      setLearnedBusy(false);
    }
  }

  async function forgetPhrase(id: number) {
    setLearned((l) => l.filter((x) => x.id !== id));
    try {
      await supabase.functions.invoke("agent", { body: { action: "learned_forget", id } });
    } catch {
      await loadLearned();
    }
  }

  async function send(text: string, confirm = false) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setInput("");

    if (!confirm) {
      setBubbles((b) => [...b, { id: nid(), role: "user", text: trimmed }]);
    }

    try {
      const { data, error } = await supabase.functions.invoke("agent", {
        body: { message: trimmed, conversationId: convId, confirm },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      if (data?.conversationId) setConvId(data.conversationId);

      setBubbles((b) => [
        ...b,
        {
          id: nid(),
          role: "assistant",
          text: data.text ?? "",
          rows: data.rows,
          pending: Boolean(data.pending),
          confirm: Boolean(data.pending),
          usedAi: data.usedAi,
          source: data.source,
          limitHit: Boolean(data.limitHit),
        },
      ]);
    } catch (e) {
      setBubbles((b) => [
        ...b,
        { id: nid(), role: "assistant", text: e instanceof Error ? e.message : "Something went wrong." },
      ]);
    } finally {
      setBusy(false);
    }
  }

  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send(input);
    }
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col px-4 pb-4">
      <header className="flex items-center justify-between py-4">
        <div>
          <h1 className="text-xl font-bold">{t("app_agent")}</h1>
          <p className="text-sm text-muted-foreground">{t("app_agent_sub")}</p>
        </div>
        <Button
          variant={showLearned ? "secondary" : "ghost"}
          size="sm"
          onClick={() => {
            const next = !showLearned;
            setShowLearned(next);
            if (next) void loadLearned();
          }}
          title={t("app_agent_learned")}
        >
          <Brain className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => { setBubbles([]); setConvId(null); }}
          title={t("app_agent_new")}
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </header>

      {showLearned && (
        <div className="mb-3 rounded-lg border border-border bg-muted/30 p-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">{t("app_agent_learned_body")}</p>
          {learnedBusy && (
            <p className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> {t("app_agent_working")}
            </p>
          )}
          {!learnedBusy && learned.length === 0 && (
            <p className="py-1 text-xs text-muted-foreground">{t("app_agent_learned_empty")}</p>
          )}
          <ul className="space-y-1.5">
            {learned.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-background px-2.5 py-1.5">
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium">{l.phrase}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {l.intent} · {l.scope} · {l.uses} {t("app_agent_learned_uses")}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void forgetPhrase(l.id)}
                  title={t("app_agent_learned_forget")}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex-1 space-y-3 overflow-y-auto pb-3">
        {bubbles.length === 0 && (
          <div className="space-y-3 py-6">
            <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm">
              <p className="mb-1 flex items-center gap-2 font-medium">
                <ShieldCheck className="h-4 w-4" /> {t("app_agent_safe")}
              </p>
              <p className="text-muted-foreground">{t("app_agent_safe_body")}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {STARTERS.map((s) => (
                <Button key={s} variant="outline" size="sm" onClick={() => void send(s)}>
                  {s}
                </Button>
              ))}
            </div>
          </div>
        )}

        {bubbles.map((b) => (
          <div key={b.id} className={cn("flex", b.role === "user" ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm",
                b.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-muted/40",
              )}
            >
              <p className="whitespace-pre-wrap">{b.text}</p>

              {b.rows && b.rows.length > 0 && (
                <dl className="mt-2 space-y-1 border-t border-border/60 pt-2">
                  {b.rows.map((r, i) => (
                    <div key={i} className="flex justify-between gap-4">
                      <dt className="truncate text-muted-foreground">{r.label}</dt>
                      <dd className="shrink-0 font-medium">{r.value}</dd>
                    </div>
                  ))}
                </dl>
              )}

              {b.confirm && (
                <div className="mt-3 flex gap-2">
                  <Button size="sm" disabled={busy} onClick={() => void send("yes", true)}>
                    {t("app_agent_yes")}
                  </Button>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => void send("no", true)}>
                    {t("app_agent_no")}
                  </Button>
                </div>
              )}

              {b.role === "assistant" && !b.confirm && (
                <p className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                  {b.usedAi ? (
                    <><Sparkles className="h-3 w-3" /> {t("app_agent_ai")}</>
                  ) : (
                    <><ShieldCheck className="h-3 w-3" /> {t("app_agent_direct")}</>
                  )}
                </p>
              )}
            </div>
          </div>
        ))}

        {busy && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-2xl border border-border bg-muted/40 px-4 py-2.5 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> {t("app_agent_working")}
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="flex items-end gap-2 border-t border-border pt-3">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          rows={1}
          placeholder={t("app_agent_placeholder")}
          className="max-h-32 min-h-[42px] flex-1 resize-none rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none focus:border-primary"
        />
        <Button size="icon" className="h-[42px] w-[42px] rounded-full" disabled={busy || !input.trim()} onClick={() => void send(input)}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
