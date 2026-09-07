import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, Bot, Mail, Repeat, Check, Sparkles, Flame, ShieldCheck, CreditCard, Trash2, MailX } from "lucide-react";
import { Logo } from "@/components/Logo";
import { SupportChat } from "@/components/support-chat";
import { ThemeToggle } from "@/components/theme-provider";
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
          "OutshipAi finds your ideal customers worldwide, writes personalized cold emails, follows up automatically, and books meetings into your calendar.",
      },
      { property: "og:title", content: "OutshipAi — Your AI Sales Agent" },
      {
        property: "og:description",
        content:
          "Finds leads worldwide, writes personalized cold emails, handles replies, and books meetings — automatically.",
      },
      { property: "og:image", content: "/og.png" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "OutshipAi — Your AI Sales Agent" },
      {
        name: "twitter:description",
        content:
          "Finds leads worldwide, writes personalized cold emails, handles replies, and books meetings — automatically.",
      },
      { name: "twitter:image", content: "/og.png" },
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

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
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
          <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
            <a href="#features" className="hover:text-foreground">{t("nav_features")}</a>
            <a href="#pricing" className="hover:text-foreground">{t("nav_pricing")}</a>
            <Link to="/tools" className="hover:text-foreground">{t("nav_tools")}</Link>
            <Link to="/agency" className="font-medium text-primary hover:text-foreground">{t("nav_hire")}</Link>
            <Link to="/stats" className="hover:text-foreground">{t("nav_stats")}</Link>
          </nav>
          <div className="flex items-center gap-2">
            <LangToggle />
            <ThemeToggle />
            <Button asChild variant="ghost" size="sm">
              <Link to="/auth">{t("nav_login")}</Link>
            </Button>
            <Button asChild size="sm" className="bg-gradient-primary shadow-glow">
              <Link to="/auth">{t("start_free")}</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-hero">
        <div className="mx-auto max-w-5xl px-6 pt-24 pb-32 text-center">
          <div className="mx-auto mb-8 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-xs font-medium text-primary animate-fade-in">
            <Sparkles className="h-3.5 w-3.5" />
            {t("hero_badge")}
          </div>
          {stats && stats.emails_sent >= 100 && (
            <div className="mx-auto mt-4 inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand-soft px-4 py-1.5 text-xs font-semibold text-brand animate-fade-in">
              <Flame className="h-3.5 w-3.5" />
              {stats.emails_sent.toLocaleString()} cold emails already sent by OutshipAi agents
            </div>
          )}
          <h1 className="font-display text-balance text-5xl font-black tracking-tight md:text-7xl animate-fade-up" style={{ animationDelay: "60ms" }}>
            {t("hero_title_a")}{" "}
            <span className="text-gradient">{t("hero_title_b")}</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-balance text-lg text-muted-foreground md:text-xl animate-fade-up" style={{ animationDelay: "140ms" }}>
            {t("hero_sub")}
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3 animate-fade-up" style={{ animationDelay: "220ms" }}>
            <Button asChild size="lg" className="bg-gradient-primary shadow-glow h-12 px-7">
              <Link to="/auth">
                {t("hero_cta")} <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="h-12 px-7">
              <a href="#pricing">{t("nav_pricing")}</a>
            </Button>
          </div>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground animate-fade-up" style={{ animationDelay: "300ms" }}>
            <span className="flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-primary" /> {t("chip_data")}</span>
            <span className="flex items-center gap-1.5"><CreditCard className="h-4 w-4 text-primary" /> {t("chip_card")}</span>
            <span className="flex items-center gap-1.5"><Trash2 className="h-4 w-4 text-primary" /> {t("chip_delete")}</span>
            <span className="flex items-center gap-1.5"><MailX className="h-4 w-4 text-primary" /> {t("chip_unsub")}</span>
          </div>
          <div className="hero-mock animate-fade-up" style={{ animationDelay: "380ms" }}>
            <span className="mock-accent" aria-hidden />
            <div className="float-chip float-chip-a"><i aria-hidden />7.5% reply rate</div>
            <div className="float-chip float-chip-b"><i aria-hidden />Booked in calendar</div>
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
          <p className="mt-3 text-xs text-muted-foreground">
            {t("stats_pre")}<Link to="/stats" className="underline hover:text-foreground">{t("stats_link")}</Link>{t("stats_post")}
          </p>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-6 py-24">
        <div data-reveal className="reveal mb-16 text-center">
          <p className="kicker mb-3">{t("nav_features")}</p>
          <h2 className="font-display text-4xl font-black tracking-tight text-balance md:text-5xl">
            Your full outbound team, automated
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            Three AI workers running 24/7 so you can focus on closing.
          </p>
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.tKey}
              data-reveal
              className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card p-8 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-border hover:shadow-card reveal"
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

      {/* Stats */}
      <div data-reveal className="reveal stats-strip">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-x-6 gap-y-10 px-6 py-14 text-center md:grid-cols-4">
          <div>
            <div className="font-display text-4xl font-bold text-brand">{(stats?.emails_sent ?? 8940).toLocaleString()}</div>
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
        <div className="mx-auto max-w-6xl px-6 py-24">
          <div data-reveal className="reveal mb-16 text-center">
            <p className="kicker mb-3">{t("nav_pricing")}</p>
            <h2 className="font-display text-4xl font-black tracking-tight text-balance md:text-5xl">{t("sec_pricing_title")}</h2>
            <p className="mx-auto mt-4 max-w-xl leading-relaxed text-muted-foreground">
            {t("sec_pricing_sub")}
            </p>
          </div>
          <p className="mb-10 text-center text-lg font-semibold text-primary">{t("pricing_anchor")}</p>
          <div className="grid gap-6 md:grid-cols-3">
            {plans.map((p) => (
              <div
                key={p.nameKey}
                data-reveal
                className={`reveal relative rounded-2xl border bg-card p-8 shadow-card ${
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
                <ul className="mt-6 space-y-3 text-sm">
                  {(p.perkKeys).map((perkKey) => (
                    <li key={perkKey} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
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
        <div className="mx-auto max-w-4xl px-6 py-24">
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
                  className="w-full accent-brand" />
              </div>
            );
            return (
              <>
                <div data-reveal className="reveal mb-10 text-center">
                  <p className="kicker mb-3">Calculator</p>
                  <h2 className="font-display text-3xl font-black tracking-tight md:text-4xl">What could this do for you?</h2>
                  <p className="mx-auto mt-3 max-w-xl leading-relaxed text-muted-foreground">{t("roi_sub")}</p>
                </div>
                <div data-reveal className="reveal grid gap-8 rounded-2xl border border-border bg-card p-8 shadow-card md:grid-cols-2">
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
        <div className="mx-auto max-w-3xl px-6 py-24 text-center">
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

      {/* CTA */}
      <section className="px-6 pb-24 pt-4">
        <div data-reveal className="reveal cta-band">
          <h2 className="font-display text-3xl font-black tracking-tight md:text-4xl">Ready to outsource your cold outreach?</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-white/70 md:text-base">
            OutshipAi finds the leads, writes the emails, follows up, and books the meetings — so you only close.
          </p>
          <div className="mt-8 flex justify-center">
            <Button asChild size="lg" className="h-12 bg-white px-8 text-brand-strong hover:bg-white/90 hover:shadow-lg">
              <Link to="/auth">
                Start free today <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <footer className="border-t border-border/50">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-10 md:flex-row">
          <Logo />
          <div className="flex flex-wrap justify-center gap-6 text-sm text-muted-foreground">
            <a href="#features" className="hover:text-foreground">{t("nav_features")}</a>
            <a href="#pricing" className="hover:text-foreground">{t("nav_pricing")}</a>
            <Link to="/security" className="hover:text-foreground">{t("footer_security")}</Link>
            <Link to="/status" className="hover:text-foreground">{t("footer_status")}</Link>
            <Link to="/honesty" className="hover:text-foreground">Honesty</Link>
            <Link to="/refunds" className="hover:text-foreground">Refunds</Link>
            <Link to="/about" className="hover:text-foreground">About</Link>
            <Link to="/terms" className="hover:text-foreground">{t("footer_terms")}</Link>
            <Link to="/privacy" className="hover:text-foreground">{t("footer_privacy")}</Link>
            <Link to="/auth" className="hover:text-foreground">{t("nav_login")}</Link>
          </div>
          <p className="text-xs text-muted-foreground">© 2026 OutshipAi</p>
        </div>
      </footer>

      <SupportChat />
    </div>
  );
}