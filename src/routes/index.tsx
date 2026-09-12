import { createFileRoute, Link } from "@tanstack/react-router";
import { Children, lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode, type CSSProperties } from "react";
import { ArrowRight, Bot, Mail, Repeat, Check, Menu, X, Inbox, Search, Send, Target, Calendar } from "lucide-react";
import { Logo } from "@/components/Logo";
import { SupportChat } from "@/components/support-chat";
import { ThemeToggle } from "@/components/theme-provider";

// three.js is big (~560 kB minified); load the orb only after first paint/idle
// so the page's copy, CTAs and CSS render instantly. Vite splits it into its own chunk.
const HeroOrb = lazy(() => import("@/components/hero-orb").then((m) => ({ default: m.HeroOrb })));

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useLang, LangToggle } from "@/lib/i18n";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "OutshipAi — AI Sales Agent That Finds Leads & Sends Cold Emails For You" },
      {
        name: "description",
        content:
          "OutshipAi finds your ideal customers worldwide, writes personalized cold emails, follows up automatically, and sends interested leads your way.",
      },
      { property: "og:title", content: "OutshipAi — Your AI Sales Agent" },
      {
        property: "og:description",
        content:
          "Finds leads worldwide, writes personalized cold emails, handles replies, and hands you the interested ones — automatically.",
      },
      { property: "og:image", content: "/og.png" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "OutshipAi — Your AI Sales Agent" },
      {
        name: "twitter:description",
        content:
          "Finds leads worldwide, writes personalized cold emails, handles replies, and hands you the interested ones — automatically.",
      },
      { name: "twitter:image", content: "/og.png" },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Organization",
              name: "OutshipAi",
              url: "https://outreach-ochre-sigma.vercel.app",
              email: "outreachai.team@gmail.com",
              description:
                "OutshipAi is an AI sales agent that finds ideal customers, writes personalized cold emails, follows up automatically, and surfaces interested replies.",
            },
            {
              "@type": "FAQPage",
              mainEntity: [
                {
                  "@type": "Question",
                  name: "Is this cold email spam?",
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: "No. Every email is personalized for the lead and sent from your own real inbox at safe, low volumes, with strict deliverability checks. Spam hurts senders — our system is built to avoid it.",
                  },
                },
                {
                  "@type": "Question",
                  name: "What happens when someone unsubscribes?",
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: "Every email carries a one-click unsubscribe that is honored instantly. OutshipAi keeps those addresses permanently excluded from future campaigns.",
                  },
                },
                {
                  "@type": "Question",
                  name: "Will this work with my existing inbox?",
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: "Yes — you connect your own Gmail or Google Workspace account. Emails are sent from you, in your voice, and replies land directly in your real inbox.",
                  },
                },
                {
                  "@type": "Question",
                  name: "How fast will I see results?",
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: "Setup takes about three minutes, and your first emails go out almost immediately. Most users see replies within the first week as personalization and follow-ups kick in.",
                  },
                },
                {
                  "@type": "Question",
                  name: "Can it write in Arabic or other languages?",
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: "Yes. Drafts respond naturally to the lead's context and language — Arabic, English, French, and more are supported.",
                  },
                },
                {
                  "@type": "Question",
                  name: "How much does it cost?",
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: "It's free to start. Paid plans are $37, $79, or $149 per month depending on volume, and you can cancel anytime.",
                  },
                },
              ],
            },
          ],
        }),
      },
    ],
  }),
  component: Landing,
});

const features = [
  {
    icon: Bot,
    tKey: "feat1_tt",
    dKey: "feat1_dd",
  },
  {
    icon: Mail,
    tKey: "feat2_tt",
    dKey: "feat2_dd",
  },
  {
    icon: Repeat,
    tKey: "feat3_tt",
    dKey: "feat3_dd",
  },
];

function FooterCol({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h4 className="mb-4 text-xs font-semibold uppercase tracking-[0.16em] text-foreground">{title}</h4>
      <ul className="space-y-2.5 text-sm text-muted-foreground">{Children.map(children, (c) => <li>{c}</li>)}</ul>
    </div>
  );
}

const faqs = [
  {
    q: "Is this cold email spam?",
    a: "No. Every email is personalized for the lead and sent from your own real inbox at safe, low volumes, with strict deliverability checks. Spam hurts senders — our system is built to avoid it.",
  },
  {
    q: "What happens when someone unsubscribes?",
    a: "Every email carries a one-click unsubscribe that is honored instantly. OutshipAi keeps those addresses permanently excluded from future campaigns.",
  },
  {
    q: "Will this work with my existing inbox?",
    a: "Yes — you connect your own Gmail or Google Workspace account. Emails are sent from you, in your voice, and replies land directly in your real inbox.",
  },
  {
    q: "How fast will I see results?",
    a: "Setup takes about three minutes, and your first emails go out almost immediately. Most users see replies within the first week as personalization and follow-ups kick in.",
  },
  {
    q: "Can it write in Arabic or other languages?",
    a: "Yes. Drafts respond naturally to the lead's context and language — Arabic, English, French, and more are supported.",
  },
  {
    q: "How much does it cost?",
    a: "It's free to start. Paid plans are $37, $79, or $149 per month depending on volume, and you can cancel anytime.",
  },
];

const steps = [
  {
    n: "01",
    icon: Inbox,
    title: "Connect your inbox",
    text: "Link Gmail or Google Workspace in minutes — no credit card needed.",
  },
  {
    n: "02",
    icon: Search,
    title: "We research & write",
    text: "Your agent finds ideal prospects, validates them, and drafts personalized cold emails in your voice.",
  },
  {
    n: "03",
    icon: Send,
    title: "We send & follow up",
    text: "Autopilot sends, re-engages non-replies, and hands interested leads to your booking link the moment they're ready.",
  },
];

function Step({ n, icon: Icon, title, text, style }: { n: string; icon: typeof Inbox; title: string; text: string; style?: CSSProperties }) {
  return (
    <li data-reveal style={style} className="reveal relative overflow-hidden rounded-2xl border border-border/60 bg-card/60 p-8 transition-all duration-300 hover:-translate-y-1 hover:border-border hover:shadow-lift md:p-10">
      <span className="step-num" aria-hidden>{n}</span>
      <div className="relative">
        <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-full bg-foreground text-background shadow-sm">
          <Icon className="h-5 w-5" />
        </div>
        <h3 className="font-display text-xl font-semibold tracking-tight">{title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{text}</p>
      </div>
    </li>
  );
}

function CountUp({ value }: { value: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const started = useRef(false);
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplay(value);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !started.current) {
            started.current = true;
            const duration = 1200;
            const t0 = performance.now();
            const tick = (now: number) => {
              const p = Math.min((now - t0) / duration, 1);
              const eased = 1 - Math.pow(1 - p, 3);
              setDisplay(Math.round(value * eased));
              if (p < 1) requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
            io.disconnect();
          }
        });
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [value]);

  return <div ref={ref}>{display.toLocaleString()}</div>;
}

const plans = [
  {
    nameKey: "plan_starter",
    price: 37,
    capKey: "cap_starter",
    perkKeys: ["perk_ai","perk_fu","perk_warm","perk_spam"],
  },
  {
    nameKey: "plan_growth",
    price: 79,
    capKey: "cap_growth",
    perkKeys: ["perk_ai","perk_5camp","perk_reply","perk_ab","perk_tz"],
    featured: true,
  },
  {
    nameKey: "plan_agency",
    price: 149,
    capKey: "cap_agency",
    perkKeys: ["perk_unlim","perk_arabic","perk_bulk","perk_auto","badge_support"],
  },
];

function Landing() {
  const { lang, t } = useLang();
  const [stats, setStats] = useState<{ emails_sent: number; agents: number } | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [orbReady, setOrbReady] = useState(false);
  const [orbDone, setOrbDone] = useState(false);
  const [orbHidden, setOrbHidden] = useState(false);
  const handleOrbReady = useCallback(() => setOrbDone(true), []);

  useEffect(() => {
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let timer: number | undefined;
    let cancelled = false;

    const boot = () => {
      if (cancelled) return;
      if (w.requestIdleCallback) {
        const id = w.requestIdleCallback(() => {
          // Warm the three.js chunk during idle so the swap is instant once the
          // webgl orb has painted its first frame.
          void import("@/components/hero-orb");
          setOrbReady(true);
        }, { timeout: 2500 });
        timer = id;
      } else {
        timer = window.setTimeout(() => setOrbReady(true), 900);
      }
    };

    if (document.readyState === "complete") {
      boot();
    } else {
      window.addEventListener("load", boot, { once: true });
    }

    return () => {
      cancelled = true;
      window.removeEventListener("load", boot);
      if (timer !== undefined) {
        if (w.cancelIdleCallback) w.cancelIdleCallback(timer);
        else window.clearTimeout(timer);
      }
    };
  }, []);

  useEffect(() => {
    if (!orbDone) return;
    // crossfade the poster out, then drop it from the DOM
    const t = window.setTimeout(() => setOrbHidden(true), 750);
    return () => window.clearTimeout(t);
  }, [orbDone]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const spyEls = Array.from(document.querySelectorAll<HTMLElement>("[data-spy]"));
    const ids = spyEls
      .map((a) => a.getAttribute("href")?.slice(1) ?? "")
      .filter(Boolean);
    const onSpy = () => {
      const pos = window.scrollY + 168;
      let current = "";
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.offsetTop <= pos) current = id;
      }
      spyEls.forEach((a) =>
        a.classList.toggle("is-active", current !== "" && a.getAttribute("href") === `#${current}`),
      );
    };
    onSpy();
    window.addEventListener("scroll", onSpy, { passive: true, capture: true });
    return () => window.removeEventListener("scroll", onSpy, true);
  }, []);

  useEffect(() => {
    supabase.rpc("public_stats").then(({ data }) => {
      if (data && data.length > 0) setStats(data[0]);
    });
  }, []);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const els = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    if (reduce || !("IntersectionObserver" in window)) {
      els.forEach((el) => el.classList.add("is-visible"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -48px 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header
        className={`sticky top-0 z-50 border-b bg-background/70 backdrop-blur-xl transition-all duration-300 ${
          scrolled ? "border-border/50 py-2 shadow-sm" : "border-transparent py-4"
        }`}
      >
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6">
          <Logo />
          <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
            <a href="#features" data-spy className="nav-link hover:text-foreground">{t("nav_features")}</a>
            <a href="#pricing" data-spy className="nav-link hover:text-foreground">{t("nav_pricing")}</a>
            <a href="#how" data-spy className="nav-link hover:text-foreground">How it works</a>
            <a href="#faq" data-spy className="nav-link hover:text-foreground">FAQ</a>
            <Link to="/stats" className="nav-link hover:text-foreground">{t("nav_stats")}</Link>
          </nav>
          <div className="flex items-center gap-2">
            <div className="hidden md:flex">
              <LangToggle />
            </div>
            <ThemeToggle />
            <Button asChild variant="ghost" size="sm" className="hidden md:inline-flex">
              <Link to="/auth">{t("nav_login")}</Link>
            </Button>
            <Button asChild size="sm" className="hidden bg-gradient-primary shadow-glow md:inline-flex">
              <Link to="/auth">{t("start_free")}</Link>
            </Button>
            <button
              type="button"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-foreground md:hidden"
            >
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
        {menuOpen && (
          <div className="border-t border-border/50 bg-background animate-fade-in md:hidden">
            <nav className="mx-auto flex max-w-6xl flex-col gap-1 px-6 py-4 text-sm">
              <a href="#features" onClick={() => setMenuOpen(false)} className="rounded-md px-3 py-2.5 hover:bg-accent hover:text-accent-foreground">{t("nav_features")}</a>
              <a href="#pricing" onClick={() => setMenuOpen(false)} className="rounded-md px-3 py-2.5 hover:bg-accent hover:text-accent-foreground">{t("nav_pricing")}</a>
              <a href="#how" onClick={() => setMenuOpen(false)} className="rounded-md px-3 py-2.5 hover:bg-accent hover:text-accent-foreground">How it works</a>
              <a href="#faq" onClick={() => setMenuOpen(false)} className="rounded-md px-3 py-2.5 hover:bg-accent hover:text-accent-foreground">FAQ</a>
              <Link to="/stats" onClick={() => setMenuOpen(false)} className="rounded-md px-3 py-2.5 hover:bg-accent hover:text-accent-foreground">{t("nav_stats")}</Link>
              <div className="mt-3 flex items-center gap-2 border-t border-border/50 px-3 pt-4 pb-1">
                <LangToggle />
                <Button asChild variant="ghost" size="sm" className="ml-auto">
                  <Link to="/auth" onClick={() => setMenuOpen(false)}>{t("nav_login")}</Link>
                </Button>
                <Button asChild size="sm" className="bg-gradient-primary shadow-glow">
                  <Link to="/auth" onClick={() => setMenuOpen(false)}>{t("start_free")}</Link>
                </Button>
              </div>
            </nav>
          </div>
        )}
      </header>

      {/* Hero */}
      <section className="relative w-full min-h-screen bg-[#F7F6F3] dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 pt-24 pb-14 px-6 md:px-12 overflow-hidden flex flex-col justify-between">
        <div className="mx-auto w-full max-w-7xl grid grid-cols-1 md:grid-cols-2 gap-12 items-center mb-16">
          <div className="flex flex-col items-start space-y-6 text-left max-w-xl z-10">
            <div className="inline-flex items-center gap-2 bg-white/70 border border-[#E0DED9] dark:bg-white/5 dark:border-neutral-700 dark:text-neutral-300 px-3.5 py-1.5 rounded-full text-xs text-neutral-500 font-normal">
              <span className="w-1.5 h-1.5 rounded-full bg-neutral-900 dark:bg-neutral-100" />
              Built by a hands-on outbound agency
            </div>
            <h1 className="font-serif text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tighter leading-[1.08] text-neutral-950 dark:text-neutral-50">
              Your AI sales agent <br /> finds, writes &amp; sends.
            </h1>
            <p className="text-base md:text-lg text-neutral-500 dark:text-neutral-400 font-normal leading-relaxed max-w-[420px]">
              OutshipAI builds your lead list, writes personalized cold emails with AI, and sends them on autopilot — while you focus on closing.
            </p>
            <div className="flex flex-wrap gap-3 pt-1">
              <a
                href="/auth"
                className="bg-neutral-950 hover:bg-neutral-800 dark:bg-neutral-100 dark:hover:bg-white dark:text-neutral-950 text-white font-medium px-6 py-3.5 rounded-full transition duration-200 flex items-center gap-2 text-sm shadow-md shadow-neutral-950/10 cursor-pointer"
              >
                <span>Start free — no card needed</span>
                <span>→</span>
              </a>
              <a
                href="#pricing"
                className="bg-transparent hover:border-neutral-400 text-neutral-900 dark:text-neutral-100 border-[1.5px] border-[#E0DED9] dark:border-neutral-700 font-medium px-6 py-3.5 rounded-full transition duration-200 text-sm cursor-pointer"
              >
                Pricing
              </a>
            </div>
          </div>

          <div className="relative w-full h-[450px] md:h-[520px]">
            <div className={`hero-orb${orbDone ? " orb-live" : ""}`} aria-hidden>
              {!orbHidden && (
                <img
                  className="hero-orb-poster"
                  src="/3d-core.jpg"
                  alt=""
                  draggable={false}
                  fetchPriority="high"
                  decoding="async"
                />
              )}
              <Suspense fallback={null}>
                {orbReady ? <HeroOrb onReady={handleOrbReady} /> : null}
              </Suspense>
            </div>
            <div className="float-email float1"><Mail className="h-3.5 w-3.5 shrink-0 text-neutral-900 dark:text-neutral-100" aria-hidden /> New lead found · Chicago</div>
            <div className="float-email float2"><Target className="h-3.5 w-3.5 shrink-0 text-neutral-900 dark:text-neutral-100" aria-hidden /> Reply detected · Interested</div>
            <div className="float-email float3"><Calendar className="h-3.5 w-3.5 shrink-0 text-neutral-900 dark:text-neutral-100" aria-hidden /> Meeting booked · Tomorrow 2pm</div>
          </div>
        </div>

        <div className="mx-auto w-full max-w-5xl relative z-10">
          <div className="hero-mock">
            <span className="mock-accent" aria-hidden />
            <div className="float-chip float-chip-a"><i aria-hidden />7.5% reply rate</div>
            <div className="float-chip float-chip-b"><i aria-hidden />Booking requested</div>
            <div className="mock-head">
              <span className="mock-title">Your outbound engine</span>
              <span className="mock-live"><span className="mock-live-dot" />Running</span>
            </div>
            <div className="mock-body">
              <div>
                <div className="mock-num">{stats?.emails_sent ? stats.emails_sent.toLocaleString() : "8,940"}</div>
                <div className="mock-num-lbl">cold emails sent</div>
              </div>
              <div className="mock-bars">
                <div className="mock-row"><span>Leads researched</span><span className="mock-track"><i className="mock-fill" style={{ width: "68%" }} /></span><b>1,240</b></div>
                <div className="mock-row"><span>New replies</span><span className="mock-track"><i className="mock-fill" style={{ width: "42%" }} /></span><b>96</b></div>
                <div className="mock-row"><span>Meetings booked</span><span className="mock-track"><i className="mock-fill" style={{ width: "18%" }} /></span><b>12</b></div>
              </div>
            </div>
            <div className="mock-foot">
              <span className="mock-chip"><i aria-hidden />Personalized drafts by AI</span>
              <span className="mock-chip"><i aria-hidden />Follow-ups on autopilot</span>
              <span className="mock-chip"><i aria-hidden />One-click unsubscribe</span>
            </div>
          </div>
        </div>

        <div className="mx-auto w-full max-w-5xl flex flex-wrap items-center justify-center gap-12 md:gap-20 pt-14 z-10">
          <div className="text-center">
            <div className="font-display text-3xl md:text-4xl font-extrabold tracking-tight text-neutral-950 dark:text-neutral-50"><CountUp value={stats?.emails_sent ?? 8940} /></div>
            <div className="text-[13px] text-neutral-500 dark:text-neutral-400 mt-1">Cold emails sent</div>
          </div>
          <div className="text-center">
            <div className="font-display text-3xl md:text-4xl font-extrabold tracking-tight text-neutral-950 dark:text-neutral-50">5%+</div>
            <div className="text-[13px] text-neutral-500 dark:text-neutral-400 mt-1">Avg reply rate</div>
          </div>
          <div className="text-center">
            <div className="font-display text-3xl md:text-4xl font-extrabold tracking-tight text-neutral-950 dark:text-neutral-50">3 min</div>
            <div className="text-[13px] text-neutral-500 dark:text-neutral-400 mt-1">Setup to first send</div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-6 py-24 md:px-10">
        <div data-reveal className="reveal mb-16 text-center">
          <div className="mb-5 flex items-center justify-center gap-3">
            <span className="h-px w-8 bg-foreground/20" aria-hidden />
            <p className="kicker">{t("nav_features")}</p>
            <span className="h-px w-8 bg-foreground/20" aria-hidden />
          </div>
          <h2 className="font-display text-4xl font-black tracking-tight text-balance md:text-5xl">
            Your full outbound team, <span className="italic font-semibold">automated</span>
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            Three AI workers running 24/7 so you can focus on closing.
          </p>
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          {features.map((f, i) => (
            <div
              key={f.tKey}
              data-reveal
              style={{ transitionDelay: `${i * 80}ms` }}
              className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card p-8 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-border hover:shadow-lift md:p-10 reveal"
            >
              <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-primary shadow-glow transition-transform duration-300 group-hover:scale-105">
                <f.icon className="h-6 w-6 text-primary-foreground" />
              </div>
              <h3 className="font-display text-xl font-semibold tracking-tight">{t(f.tKey)}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t(f.dKey)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="scroll-mt-20 border-t border-border/50 bg-gradient-hero">
        <div className="mx-auto max-w-6xl px-6 py-16 md:px-10">
          <div data-reveal className="reveal mb-12 text-center">
            <div className="mb-4 flex items-center justify-center gap-3">
              <span className="h-px w-8 bg-foreground/20" aria-hidden />
              <p className="kicker">How it works</p>
              <span className="h-px w-8 bg-foreground/20" aria-hidden />
            </div>
            <h2 className="font-display text-3xl font-black tracking-tight text-balance md:text-4xl">
              Outbound on autopilot <span className="italic font-semibold">in three steps</span>
            </h2>
            <p className="mx-auto mt-3 max-w-xl leading-relaxed text-muted-foreground">
              No setup headaches. No template spam. Your agent does the heavy lifting.
            </p>
          </div>
          <ol className="grid gap-5 md:grid-cols-3">
            {steps.map((s, i) => <Step key={s.n} n={s.n} icon={s.icon} title={s.title} text={s.text} style={{ transitionDelay: `${i * 80}ms` }} />)}
          </ol>
        </div>
      </section>

      {/* Stats */}
      <div data-reveal className="reveal stats-strip">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-x-6 gap-y-10 px-6 py-14 text-center md:grid-cols-4 md:px-10">
          <div>
            <div className="font-display text-4xl font-bold text-brand"><CountUp value={stats?.emails_sent ?? 8940} /></div>
            <div className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Cold emails sent</div>
          </div>
          <div>
            <div className="font-display text-4xl font-bold text-brand">5%+</div>
            <div className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Avg reply rate</div>
          </div>
          <div>
            <div className="font-display text-4xl font-bold text-brand">24/7</div>
            <div className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Autopilot send + follow-up</div>
          </div>
          <div>
            <div className="font-display text-4xl font-bold text-brand">3 min</div>
            <div className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Setup to first send</div>
          </div>
        </div>
      </div>

      {/* Pricing */}
      <section id="pricing" className="scroll-mt-20 border-t border-border/50 bg-card/30">
        <div className="mx-auto max-w-6xl px-6 py-24 md:px-10">
          <div data-reveal className="reveal mb-16 text-center">
            <div className="mb-5 flex items-center justify-center gap-3">
              <span className="h-px w-8 bg-foreground/20" aria-hidden />
              <p className="kicker">{t("nav_pricing")}</p>
              <span className="h-px w-8 bg-foreground/20" aria-hidden />
            </div>
            <h2 className="font-display text-4xl font-black tracking-tight text-balance md:text-5xl">{t("sec_pricing_title")}</h2>
            <p className="mx-auto mt-4 max-w-xl leading-relaxed text-muted-foreground">
            {t("sec_pricing_sub")}
            </p>
          </div>
          <p className="mb-10 text-center text-lg font-semibold text-primary">{t("pricing_anchor")}</p>
          <div className="grid gap-6 md:grid-cols-3">
            {plans.map((p, i) => (
              <div
                key={p.nameKey}
                data-reveal
                style={{ transitionDelay: `${i * 80}ms` }}
                className={`reveal relative rounded-2xl border bg-card p-8 shadow-card md:p-10 ${
                  p.featured
                    ? "border-primary shadow-glow ring-1 ring-primary/40"
                    : "border-border"
                }`}
              >
                {p.featured && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
                    {t("plan_popular")}
                  </div>
                )}
                <h3 className="text-lg font-semibold">{t(p.nameKey)}</h3>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-5xl font-bold tracking-tight">${p.price}</span>
                  <span className="text-muted-foreground">{t("per_month")}</span>
                </div>
                <p className="mt-2 text-sm font-medium text-primary">{t(p.capKey)}</p>
                <ul className="mt-6 divide-y divide-border/40 text-sm">
                  {(p.perkKeys).map((perkKey) => (
                    <li key={perkKey} className="flex items-start gap-2 py-3 first:pt-0 last:pb-0">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-foreground" />
                      <span>{t(perkKey)}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  asChild
                  className={`mt-8 w-full ${p.featured ? "bg-gradient-primary shadow-glow" : ""}`}
                  variant={p.featured ? "default" : "outline"}
                >
                  <Link to="/auth">{t("start_free")}</Link>
                </Button>
              </div>
            ))}
          </div>
          <div className="mx-auto mt-12 flex max-w-3xl flex-wrap items-center justify-center gap-x-8 gap-y-3 rounded-2xl border border-border bg-card/60 px-6 py-5 text-sm text-muted-foreground">
            <span className="flex items-center gap-2">{t("badge_guarantee")}</span>
            <span className="flex items-center gap-2">{t("badge_cancel")}</span>
            <span className="flex items-center gap-2">{t("badge_support")}</span>
          </div>
          <p className="mt-8 text-center text-sm text-muted-foreground">
            {t("free_pre")}<strong className="text-foreground">{t("free_num")}</strong>{t("free_post")}
          </p>
          <p className="mt-4 text-center text-sm">
            <Link to="/security" className="text-primary underline underline-offset-4 hover:opacity-80">
              {t("security_link")}
            </Link>
          </p>
        </div>
      </section>

      <section className="border-t border-border/50">
        <div className="mx-auto max-w-4xl px-6 py-16 md:px-10">
          {(() => {
            const [leads, setLeads] = useState(50);
            const [replyPct, setReplyPct] = useState(5);
            const [closePct, setClosePct] = useState(20);
            const [deal, setDeal] = useState(1000);
            const monthlyMeetings = Math.round(leads * 30 * (replyPct / 100) * (closePct / 100));
            const revenue = monthlyMeetings * deal;
            const Slider = ({ label, value, set, min, max, suffix }: { label: string; value: number; set: (n: number) => void; min: number; max: number; suffix: string }) => (
              <div>
                <div className="mb-1.5 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-semibold text-primary">{value}{suffix}</span>
                </div>
                <input type="range" min={min} max={max} value={value}
                  onChange={(e) => set(Number(e.target.value))}
                  className="slider-mono w-full" />
              </div>
            );
            return (
              <>
                <div data-reveal className="reveal mb-10 text-center">
                  <div className="mb-4 flex items-center justify-center gap-3">
                    <span className="h-px w-8 bg-foreground/20" aria-hidden />
                    <p className="kicker">Calculator</p>
                    <span className="h-px w-8 bg-foreground/20" aria-hidden />
                  </div>
                  <h2 className="font-display text-2xl font-black tracking-tight md:text-3xl">What could this <span className="italic font-semibold">do for you?</span></h2>
                  <p className="mx-auto mt-3 max-w-xl leading-relaxed text-muted-foreground">{t("roi_sub")}</p>
                </div>
                <div data-reveal className="reveal grid gap-8 rounded-2xl border border-border bg-card p-8 shadow-card md:grid-cols-2 md:p-10">
                  <div className="space-y-6">
                    <Slider label="Leads contacted per day" value={leads} set={setLeads} min={10} max={200} suffix="" />
                    <Slider label="Expected reply rate" value={replyPct} set={setReplyPct} min={1} max={15} suffix="%" />
                    <Slider label="Replies that become meetings" value={closePct} set={setClosePct} min={5} max={60} suffix="%" />
                    <Slider label="Average deal value" value={deal} set={setDeal} min={100} max={10000} suffix="$" />
                  </div>
                  <div className="flex flex-col justify-center rounded-2xl bg-gradient-primary p-8 text-center text-primary-foreground">
                    <div className="text-sm font-medium opacity-80">{t("roi_result")}</div>
                    <div className="mt-4 text-5xl font-extrabold tracking-tight">{monthlyMeetings}</div>
                    <div className="text-sm opacity-90">{t("roi_meetings")}</div>
                    <div className="mt-6 border-t border-white/20 pt-5">
                      <div className="text-2xl font-bold">${revenue.toLocaleString()}</div>
                      <div className="text-xs opacity-80">{t("roi_rev")}</div>
                    </div>
                  </div>
                </div>
                <p className="mt-6 text-center text-xs text-muted-foreground">
                  {t("roi_note")}
                </p>
              </>
            );
          })()}
        </div>
      </section>

      <section className="border-t border-border/50">
        <div className="mx-auto max-w-3xl px-6 py-16 text-center md:px-10">
          <p className="font-display text-2xl font-medium italic leading-relaxed tracking-tight text-balance md:text-3xl">
            &ldquo;{t("founder_quote")}&rdquo;
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-primary font-bold text-primary-foreground">O</div>
            <div className="text-left">
              <div className="text-sm font-semibold">{t("founder_role")}</div>
              <div className="text-xs text-muted-foreground">{t("founder_note")}</div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="scroll-mt-20 border-t border-border/50 bg-card/30">
        <div className="mx-auto max-w-3xl px-6 py-16 md:px-10">
          <div data-reveal className="reveal mb-12 text-center">
            <div className="mb-4 flex items-center justify-center gap-3">
              <span className="h-px w-8 bg-foreground/20" aria-hidden />
              <p className="kicker">FAQ</p>
              <span className="h-px w-8 bg-foreground/20" aria-hidden />
            </div>
            <h2 className="font-display text-3xl font-black tracking-tight md:text-4xl">Questions, <span className="italic font-semibold">answered</span></h2>
          </div>
          <div data-reveal className="reveal space-y-3">
            {faqs.map((f) => (
              <details key={f.q} className="faq">
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 pb-24 pt-4">
        <div data-reveal className="reveal cta-band">
          <h2 className="font-display text-3xl font-black tracking-tight md:text-4xl">Ready to outsource your cold outreach?</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-white/70 md:text-base">
            OutshipAi finds the leads, writes the emails, follows up, and hands you ready-to-talk leads — so you only close.
          </p>
          <div className="mt-8 flex justify-center">
            <Button asChild size="lg" className="h-12 bg-white px-8 text-black hover:bg-white/90 hover:shadow-lg">
              <Link to="/auth">
                Start free today <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <footer className="border-t border-border/50 bg-card/30">
        <div className="mx-auto max-w-6xl px-6 py-14 md:px-10">
          <div className="grid gap-10 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
            <div>
              <Logo />
              <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">
                Your AI sales agent — finds the leads, writes the cold emails, follows up, and surfaces hot replies. On autopilot.
              </p>
            </div>
            <FooterCol title="Product">
              <a href="#features" className="nav-link hover:text-foreground">{t("nav_features")}</a>
              <a href="#pricing" className="nav-link hover:text-foreground">{t("nav_pricing")}</a>
              <a href="#how" className="nav-link hover:text-foreground">How it works</a>
              <a href="#faq" className="nav-link hover:text-foreground">FAQ</a>
            </FooterCol>
            <FooterCol title="Company">
              <Link to="/about" className="nav-link hover:text-foreground">About</Link>
              <Link to="/agency" className="nav-link hover:text-foreground">{t("nav_hire")}</Link>
              <Link to="/tools" className="nav-link hover:text-foreground">Free tools</Link>
              <Link to="/stats" className="nav-link hover:text-foreground">Live stats</Link>
              <Link to="/status" className="nav-link hover:text-foreground">{t("footer_status")}</Link>
              <Link to="/honesty" className="nav-link hover:text-foreground">Honesty</Link>
            </FooterCol>
            <FooterCol title="Legal">
              <Link to="/security" className="nav-link hover:text-foreground">{t("footer_security")}</Link>
              <Link to="/terms" className="nav-link hover:text-foreground">{t("footer_terms")}</Link>
              <Link to="/privacy" className="nav-link hover:text-foreground">{t("footer_privacy")}</Link>
              <Link to="/refunds" className="nav-link hover:text-foreground">Refunds</Link>
            </FooterCol>
          </div>
          <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-border/50 pt-6 text-xs text-muted-foreground md:flex-row">
            <span>© 2026 OutshipAi. All rights reserved.</span>
            <span className="flex items-center gap-2"><Link to="/status" className="nav-link hover:text-foreground">System status</Link> · <Link to="/auth" className="nav-link hover:text-foreground">{t("nav_login")}</Link></span>
          </div>
        </div>
      </footer>

      <SupportChat />
    </div>
  );
}