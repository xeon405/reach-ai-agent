import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Msg = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "How do I start sending?",
  "Why aren't my emails sending?",
  "How do follow-ups work?",
  "Is my Gmail safe?",
  "How do I handle replies?",
  "What are the pricing plans?",
];

const CHAT_KEY = "outreachai_support_chat";
const THREAD_KEY = "outreachai_support_thread";
const SUPPORT_EMAIL = "outshipai@gmail.com";

const WELCOME: Msg = {
  role: "assistant",
  content: `Hey! I'm your OutshipAi guide. I can help with anything — how the app works, finding leads, launching campaigns, follow-ups, Gmail setup, billing, and more.

Just exploring? Ask what OutshipAi does or what the free plan includes.

Need human support? Reach us at ${SUPPORT_EMAIL}`,
};

const GUEST_KEY = "outreachai_guest_id";

function guestId(): string {
  try {
    let id = localStorage.getItem(GUEST_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(GUEST_KEY, id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

function loadMessages(): Msg[] {
  try {
    const raw = localStorage.getItem(CHAT_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch { /* corrupted → reset */ }
  return [WELCOME];
}

function loadThreadId(): string | null {
  try { return localStorage.getItem(THREAD_KEY); } catch { return null; }
}

function storeThreadId(id: string | null) {
  try {
    if (id) localStorage.setItem(THREAD_KEY, id);
    else localStorage.removeItem(THREAD_KEY);
  } catch { /* ignore */ }
}

function persistMessages(msgs: Msg[]) {
  try { localStorage.setItem(CHAT_KEY, JSON.stringify(msgs.slice(-40))); } catch { /* quota — trim oldest */ }
}

export function SupportChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>(loadMessages);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const gidRef = useRef<string | null>(null);

  async function authHeaders(): Promise<Record<string, string>> {
    const { data: s } = await supabase.auth.getSession();
    const token = s.session?.access_token;
    return token
      ? { Authorization: `Bearer ${token}` }
      : { "x-guest-id": (gidRef.current ??= guestId()) };
  }

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  useEffect(() => { persistMessages(messages); }, [messages]);

  // Rehydrate a previously started conversation from the server so chat state
  // survives reloads and works across devices.
  useEffect(() => {
    if (!open) return;
    const threadId = loadThreadId();
    if (!threadId) return;
    (async () => {
      const headers = await authHeaders();
      try {
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/support-chat`,
          {
            method: "POST",
            headers: {
              ...headers,
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ thread_id: threadId, action: "history" }),
          }
        );
        const data = await res.json();
        if (res.ok && data.messages?.length) {
          setMessages(data.messages.map((m: { role: string; content: string }) => ({ role: m.role, content: m.content })));
        }
      } catch { /* keep local copy */ }
    })();
  }, [open]);

  async function send(text?: string) {
    const q = (text ?? input).trim();
    if (!q || loading) return;
    setInput("");
    const next = [...messages, { role: "user" as const, content: q }];
    setMessages(next);
    setLoading(true);
    try {
      const headers = await authHeaders();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/support-chat`,
        {
          method: "POST",
          headers: {
            ...headers,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ thread_id: loadThreadId(), text: q }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      storeThreadId(data.thread_id ?? null);
      setMessages([...next, { role: "assistant", content: data.reply }]);
    } catch (e) {
      setMessages([
        ...next,
        {
          role: "assistant",
          content:
            e instanceof Error ? e.message : "Hmm, something went wrong. Try again?",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function deleteChat() {
    if (loading) return;
    if (!window.confirm("Delete this conversation? This cannot be undone.")) return;
    const threadId = loadThreadId();
    try {
      if (threadId) {
        const headers = await authHeaders();
        await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/support-chat`,
          {
            method: "POST",
            headers: {
              ...headers,
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ thread_id: threadId, action: "delete" }),
          }
        );
      }
    } catch { /* still clear locally even if the request failed */ }
    storeThreadId(null);
    persistMessages([WELCOME]);
    setMessages([WELCOME]);
    setInput("");
  }

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Open AI help chat"
          className="fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom))] right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl shadow-black/40 transition-transform hover:scale-105 active:scale-95"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path
              d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}

      {open && (
        <div className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-4 z-50 flex h-[520px] max-h-[80vh] w-[min(380px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
          <div className="flex items-center justify-between bg-primary px-4 py-3">
            <div>
              <div className="text-sm font-semibold text-primary-foreground">OutshipAi Guide</div>
              <div className="flex items-center gap-1.5 text-xs text-primary-foreground/70">
                <span className="h-1.5 w-1.5 rounded-full bg-green-400" /> Online
              </div>
            </div>
            <div className="flex items-center">
              <button
                onClick={deleteChat}
                disabled={loading}
                className="rounded-full p-1 text-primary-foreground/70 hover:bg-primary-foreground/15 hover:text-primary-foreground disabled:opacity-40"
                aria-label="Delete conversation"
                title="Delete conversation"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14zM10 11v6M14 11v6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
              <button
                onClick={() => setOpen(false)}
                className="rounded-full p-1 text-primary-foreground/70 hover:bg-primary-foreground/15 hover:text-primary-foreground"
                aria-label="Close"
              >
                <svg width="16" height="16" viewBox="0 0 12 12" fill="none">
                  <path d="M1 1L11 11M11 1L1 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm ${
                  m.role === "user"
                    ? "ml-auto rounded-br-md bg-primary text-primary-foreground"
                    : "rounded-bl-md bg-muted"
                }`}
              >
                {m.content}
              </div>
            ))}
            {loading && (
              <div className="w-16 rounded-2xl rounded-bl-md bg-muted px-3.5 py-3">
                <div className="flex gap-1">
                  <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:0ms]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:150ms]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:300ms]" />
                </div>
              </div>
            )}
            {messages.length <= 1 && !loading && (
              <div className="flex flex-wrap gap-2 pt-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="rounded-full border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-border p-3">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
              className="flex gap-2"
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask how anything works…"
                className="flex-1 rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40"
              >
                ➤
              </button>
            </form>
            <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
              Need human support? <span className="font-medium">{SUPPORT_EMAIL}</span>
            </p>
          </div>
        </div>
      )}
    </>
  );
}
