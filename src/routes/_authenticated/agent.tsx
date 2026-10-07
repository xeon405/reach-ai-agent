import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Sparkles,
  Send,
  Loader2,
  ShieldCheck,
  RefreshCw,
  Brain,
  Trash2,
  History,
  LayoutGrid,
  PenLine,
  X,
} from "lucide-react";
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

/**
 * The menu. A click is an unambiguous intent, so the backend answers these
 * with `viaMenu` and never calls the model - same reply, zero AI calls and
 * zero quota. `message` is the phrase the pure keyword router already
 * recognises; it is deliberately written in plain words the user would
 * actually say. Labels are kept to 2-3 plain words so nobody has to read
 * marketing jargon to find what they need.
 */
const MENU: { label: string; message: string; group: "top" | "work" | "safety" }[] = [
  { label: "See my results", message: "show my results", group: "top" },
  { label: "Find new contacts", message: "find new contacts", group: "top" },
  { label: "Who should I email?", message: "who should i email", group: "top" },
  { label: "Start a campaign", message: "start a campaign", group: "work" },
  { label: "Pause a campaign", message: "pause a campaign", group: "work" },
  { label: "Who's unsubscribed?", message: "who has unsubscribed", group: "safety" },
];

/** localStorage keys. Teach-once is per-browser on purpose: showing the same
 * "you can just type!" pop-up on every visit is a nag, not help. */
const SS_TYPING = "agent_typing_typing_this_session";
const LS_TAUGHT = "agent_menu_taught";
const SS_SESSION = "agent_session";
const LS_MENUCOUNTS = "agent_menu_counts";

/** Typing permission lasts for ONE visit. Closing the tab goes back to the
 * menu next time, which is the whole point of a menu-first design. */
function readSession(): boolean {
  try {
    return sessionStorage.getItem(SS_TYPING) === "1";
  } catch {
    return false;
  }
}
function writeSession(): void {
  try {
    sessionStorage.setItem(SS_TYPING, "1");
  } catch {
    /* private mode: keep the menu */
  }
}
function readFlag(k: string): boolean {
  try {
    return localStorage.getItem(k) === "1";
  } catch {
    return false;
  }
}
function writeFlag(k: string): void {
  try {
    localStorage.setItem(k, "1");
  } catch {
    /* private mode: fall back to showing the menu every time */
  }
}
/** One id per browser session so a fresh visit reopens on the menu. */
function sessionId(): string {
  try {
    let s = sessionStorage.getItem(SS_SESSION);
    if (!s) {
      s = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      sessionStorage.setItem(SS_SESSION, s);
    }
    return s;
  } catch {
    return "no-session";
  }
}
/** How often each button has been used, for the smart ordering. */
function bumpMenuUse(label: string): void {
  try {
    const raw = localStorage.getItem(LS_MENUCOUNTS);
    const counts: Record<string, number> = raw ? JSON.parse(raw) : {};
    counts[label] = (counts[label] ?? 0) + 1;
    localStorage.setItem(LS_MENUCOUNTS, JSON.stringify(counts));
  } catch {
    /* preference is a nicety, never a failure */
  }
}
function menuOrder(): typeof MENU {
  try {
    const raw = localStorage.getItem(LS_MENUCOUNTS);
    if (!raw) return MENU;
    const counts: Record<string, number> = JSON.parse(raw);
    // Sort by use, but keep the two most-used pinned so the layout does not
    // jump around on every click - people build muscle memory on the top row.
    return [...MENU].sort((a, b) => (counts[b.label] ?? 0) - (counts[a.label] ?? 0));
  } catch {
    return MENU;
  }
}

type Learned = {
  id: number;
  phrase: string;
  intent: string;
  state: string;
  scope: string;
  uses: number;
  correct: number;
};

type Conversation = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

type StoredMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  usedAi: boolean;
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
  const [learnedError, setLearnedError] = useState(false);

  // Past chats. They were always saved server-side; the UI simply never read
  // them back, which made a refresh look like data loss.
  // Menu-first. The text box is hidden until the person asks for it, because
  // a visible box is a magnet: people type "show my numbers" into it and pay
  // for an AI call that a menu click answers for free.
  const [typing, setTyping] = useState(false);
  const [menuOpen, setMenuOpen] = useState(true);
  const [showTeach, setShowTeach] = useState(false);
  const [order, setOrder] = useState<typeof MENU>(MENU);
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [convsOpen, setConvsOpen] = useState(false);
  const [convsBusy, setConvsBusy] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  /** Turn the text box on for this visit only. */
  function enableTyping(): void {
    writeSession();
    setTyping(true);
    setMenuOpen(false);
  }

  // Menu-first on every new visit: a fresh session always opens on the menu,
  // even for someone who typed last time. The box comes back with one click
  // rather than appearing by itself.
  useEffect(() => {
    setTyping(readSession());
    setOrder(menuOrder());
    setMenuOpen(true);
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [bubbles]);

  async function loadConversations(): Promise<Conversation[]> {
    setConvsBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("agent", {
        body: { action: "conversations" },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      const list = (data?.conversations ?? []) as Conversation[];
      setConvs(list);
      return list;
    } catch {
      return [];
    } finally {
      setConvsBusy(false);
    }
  }

  /** Re-open a saved thread and show it exactly as it was. */
  async function openConversation(id: string) {
    setConvsOpen(false);
    const { data, error } = await supabase.functions.invoke("agent", {
      body: { action: "history", conversationId: id },
    });
    if (error || data?.error) return;
    const msgs = (data?.messages ?? []) as StoredMessage[];
    setConvId(id);
    setBubbles(
      msgs.map((m) => ({
        id: m.id,
        role: m.role,
        text: m.content,
        usedAi: m.usedAi,
      })),
    );
  }

  async function deleteConversation(id: string) {
    const previous = convs;
    // Remove it from the list straight away; restore if the server refuses.
    setConvs((c) => c.filter((x) => x.id !== id));
    setDeleting(id);
    try {
      const { data, error } = await supabase.functions.invoke("agent", {
        body: { action: "conversation_delete", conversationId: id },
      });
      if (error || data?.error) throw new Error(data?.error ?? error?.message);
      if (id === convId) {
        setBubbles([]);
        setConvId(null);
      }
    } catch {
      setConvs(previous);
    } finally {
      setDeleting(null);
    }
  }

  // On open: resume the most recent chat so the page is never mysteriously
  // empty. No conversation is ever removed automatically.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const list = await loadConversations();
      if (cancelled || convId) return;
      const newest = list[0];
      if (newest) await openConversation(newest.id);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadLearned() {
    setLearnedBusy(true);
    setLearnedError(false);
    try {
      const { data, error } = await supabase.functions.invoke("agent", {
        body: { action: "learned_list" },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      setLearned((data?.learned ?? []) as Learned[]);
    } catch {
      // Do NOT fall back to an empty list. An empty list claims "the agent has
      // learned nothing", which is a different and false statement when the
      // request itself failed.
      setLearnedError(true);
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

  async function send(text: string, confirm = false, viaMenu = false) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setInput("");

    if (!confirm) {
      setBubbles((b) => [...b, { id: nid(), role: "user", text: trimmed }]);
    }

    try {
      const { data, error } = await supabase.functions.invoke("agent", {
        body: { message: trimmed, conversationId: convId, confirm, viaMenu },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      if (data?.conversationId) setConvId(data.conversationId);
      // Keep the chat list fresh so a new thread shows up straight away.
      if (!confirm) void loadConversations();

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
        {
          id: nid(),
          role: "assistant",
          text: e instanceof Error ? e.message : "Something went wrong.",
        },
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
    <div className="flex h-full w-full flex-col">
      <header className="mx-auto flex w-full max-w-4xl items-center justify-between px-4 py-4">
        <div>
          <h1 className="text-xl font-bold">{t("app_agent")}</h1>
          <p className="text-sm text-muted-foreground">{t("app_agent_sub")}</p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant={convsOpen ? "secondary" : "ghost"}
            size="sm"
            onClick={() => {
              const next = !convsOpen;
              setConvsOpen(next);
              if (next) void loadConversations();
            }}
            title={t("app_agent_chats")}
          >
            <History className="h-4 w-4" />
          </Button>
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
            onClick={() => {
              setBubbles([]);
              setConvId(null);
              setConvsOpen(false);
            }}
            title={t("app_agent_new")}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {convsOpen && (
        <div className="mx-auto w-full max-w-4xl px-4">
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              {t("app_agent_chats_body")}
            </p>
            {convsBusy && (
              <p className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> {t("app_agent_working")}
              </p>
            )}
            {!convsBusy && convs.length === 0 && (
              <p className="py-1 text-xs text-muted-foreground">{t("app_agent_chats_empty")}</p>
            )}
            <ul className="max-h-72 space-y-1 overflow-y-auto">
              {convs.map((c) => (
                <li
                  key={c.id}
                  className={cn(
                    "flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5",
                    c.id === convId
                      ? "border border-primary/40 bg-background"
                      : "border border-border/60 bg-background",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => void openConversation(c.id)}
                    className="min-w-0 flex-1 text-start"
                  >
                    <p className="truncate text-xs font-medium">{c.title}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {new Date(c.updated_at).toLocaleString()}
                    </p>
                  </button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={deleting === c.id}
                    onClick={() => void deleteConversation(c.id)}
                    title={t("app_agent_chat_delete")}
                  >
                    {deleting === c.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {showLearned && (
        <div className="mx-auto w-full max-w-4xl px-4">
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              {t("app_agent_learned_body")}
            </p>
            {learnedBusy && (
              <p className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> {t("app_agent_working")}
              </p>
            )}
            {!learnedBusy && learnedError && (
              <p className="py-1 text-xs text-muted-foreground">{t("app_agent_learned_error")}</p>
            )}
            {!learnedBusy && !learnedError && learned.length === 0 && (
              <p className="py-1 text-xs text-muted-foreground">{t("app_agent_learned_empty")}</p>
            )}
            <ul className="space-y-1.5">
              {learned.map((l) => (
                <li
                  key={l.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-background px-2.5 py-1.5"
                >
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
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-4xl space-y-3 px-4 pb-3">
          {menuOpen && (
            <div className="space-y-3 py-6">
              <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm">
                <p className="mb-1 flex items-center gap-2 font-medium">
                  <ShieldCheck className="h-4 w-4" /> {t("app_agent_safe")}
                </p>
                <p className="text-muted-foreground">{t("app_agent_safe_body")}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {order.map((m) => (
                  <Button
                    key={m.label}
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      bumpMenuUse(m.label);
                      setMenuOpen(false);
                      // viaMenu tells the backend this is a click, not a typed
                      // question, so it answers from the keyword router and never
                      // spends an AI call.
                      void send(m.message, false, true);
                    }}
                  >
                    {m.label}
                  </Button>
                ))}
              </div>
              <button
                type="button"
                className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
                onClick={() => {
                  if (readFlag(LS_TAUGHT)) enableTyping();
                  else setShowTeach(true);
                }}
              >
                I&apos;ll type my own question
              </button>
            </div>
          )}

          {bubbles.map((b) => (
            <div
              key={b.id}
              className={cn("flex", b.role === "user" ? "justify-end" : "justify-start")}
            >
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
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void send("no", true)}
                    >
                      {t("app_agent_no")}
                    </Button>
                  </div>
                )}

                {b.role === "assistant" && !b.confirm && (
                  <p className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                    {b.usedAi ? (
                      <>
                        <Sparkles className="h-3 w-3" /> {t("app_agent_ai")}
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="h-3 w-3" /> {t("app_agent_direct")}
                      </>
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
      </div>

      <div className="mx-auto flex w-full max-w-4xl items-end gap-2 border-t border-border px-4 pt-3">
        {typing ? (
          <>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKey}
              rows={1}
              placeholder={t("app_agent_placeholder")}
              className="max-h-32 min-h-[42px] flex-1 resize-none rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none focus:border-primary"
            />
            <Button
              size="icon"
              className="h-[42px] w-[42px] rounded-full"
              disabled={busy || !input.trim()}
              onClick={() => void send(input)}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-[42px] w-[42px] rounded-full"
              title="Show menu"
              onClick={() => setMenuOpen(true)}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </>
        ) : (
          <div className="flex w-full items-center justify-between gap-3 py-1.5">
            <p className="text-sm text-muted-foreground">
              Pick an option above, or write your own question.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (readFlag(LS_TAUGHT)) enableTyping();
                else setShowTeach(true);
              }}
            >
              <PenLine className="mr-1.5 h-3.5 w-3.5" /> Type a question
            </Button>
          </div>
        )}
      </div>

      {showTeach && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-background p-5 shadow-lg">
            <div className="mb-1 flex items-center justify-between gap-3">
              <p className="text-sm font-medium">There is more than the menu</p>
              <button
                type="button"
                aria-label="Close"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => setShowTeach(false)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mb-4 text-sm text-muted-foreground">
              You can just tell me what you need, like{" "}
              <span className="rounded bg-muted px-1 py-0.5">find dentists in London</span> or{" "}
              <span className="rounded bg-muted px-1 py-0.5">pause my Spring campaign</span>.
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowTeach(false)}>
                No, keep the menu
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  writeFlag(LS_TAUGHT);
                  enableTyping();
                  setShowTeach(false);
                }}
              >
                <PenLine className="mr-1.5 h-3.5 w-3.5" /> Yes, let me type
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
