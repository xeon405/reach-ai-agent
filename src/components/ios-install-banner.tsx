import { useEffect, useState } from "react";

const DISMISS_KEY = "ios-install-dismissed-at";

function detectIos(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const isIosDevice =
    /iphone|ipad|ipod/i.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return isIosDevice;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return true;
  const standaloneMode =
    window.matchMedia?.("(display-mode: standalone)").matches ?? false;
  const iosStandalone =
    (window.navigator as Navigator & { standalone?: boolean }).standalone ===
    true;
  return standaloneMode || iosStandalone;
}

export function IosInstallBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!detectIos() || isStandalone()) return;
    try {
      const dismissed = localStorage.getItem(DISMISS_KEY);
      if (dismissed && Date.now() - Number(dismissed) < 14 * 24 * 60 * 60 * 1000)
        return;
    } catch {
      /* storage unavailable */
    }
    const timer = setTimeout(() => setVisible(true), 3000);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="relative mx-auto max-w-md overflow-hidden rounded-2xl border border-white/15 bg-gradient-to-br from-zinc-900 via-zinc-900 p-4 shadow-2xl shadow-black/50 backdrop-blur-xl">
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-white/70 transition-colors hover:bg-white/20 hover:text-white"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path
              d="M1 1L11 11M11 1L1 11"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>

        <div className="flex items-start gap-3 pr-8">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-zinc-700 to-zinc-900 text-lg font-bold text-white shadow-lg shadow-black/50">
            O
          </div>
          <div>
            <p className="text-sm font-semibold text-white">
              Install OutreachAI on your iPhone
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-zinc-400">
              Full-screen app, offline mode, instant access — just like the App
              Store version.
            </p>
          </div>
        </div>

        <ol className="mt-3 space-y-2 text-xs text-zinc-300">
          <li className="flex items-center gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-500/20 font-bold text-violet-300">
              1
            </span>
            Tap the{" "}
            <svg
              width="14"
              height="16"
              viewBox="0 0 14 18"
              fill="none"
              className="inline-block shrink-0 text-white"
            >
              <path
                d="M7 1v10M7 1L4 4M7 1l3 3M2.5 7H2a1 1 0 00-1 1v8a1 1 0 001 1h10a1 1 0 001-1V8a1 1 0 00-1-1h-.5"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>{" "}
            <strong className="text-white">Share</strong> icon in Safari's
            toolbar
          </li>
          <li className="flex items-center gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-500/20 font-bold text-violet-300">
              2
            </span>
            Scroll and tap{" "}
            <strong className="whitespace-nowrap text-white">
              ＋ Add to Home Screen
            </strong>
          </li>
        </ol>

        <button
          onClick={dismiss}
          className="mt-4 w-full rounded-xl bg-gradient-to-r from-zinc-800 to-black py-2.5 text-sm font-semibold text-white shadow-lg shadow-black/50 transition-transform active:scale-[0.98]"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
