import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, Bot, Mail, Repeat, Check, Sparkles, Flame, ShieldCheck, CreditCard, Trash2, MailX } from "lucide-react";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useLang, LangToggle } from "@/lib/i18n";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "OutreachAI — AI Cold Email Agent That Books Meetings On Autopilot" },
      {
        name: "description",
        content:
          "OutreachAI finds your ideal customers worldwide, writes personalized cold emails, follows up automatically, and books meetings into your calendar.",
      },
    ],
  }),
  component: Landing,
});

const features = [
  {
    icon: Bot,
    title: "AI Finds Leads",
    desc: "Searches globally for your ideal customers automatically — no list-buying, no scraping headaches.",
  },
  {
    icon: Mail,
    title: "Personalised Emails",
    desc: "Claude AI writes a unique, on-brand email for every single lead. No templates, no spray-and-pray.",
  },
  {
    icon: Repeat,
    title: "Auto Follow-ups",
    desc: "Follows up every 3 days until they reply or politely opt out. Pipeline never goes cold.",
  },
];

const plans = [
  {
    name: "Starter",
    price: 37,
    cap: "500 emails/month",
    perks: ["1 active campaign", "AI lead discovery", "Gmail integration", "Auto follow-ups"],
  },
  {
    name: "Growth",
    price: 79,
    cap: "2,000 emails/month",
    perks: ["5 active campaigns", "Priority lead sourcing", "A/B subject testing", "Reply detection"],
    featured: true,
  },
  {
    name: "Agency",
    price: 149,
    cap: "Unlimited emails",
    perks: ["Unlimited campaigns", "Multi-workspace", "CRM integrations", "Dedicated success mgr"],
  },
];

function Landing() {
  const { lang, t } = useLang();
  const [stats, setStats] = useState<{ emails_sent: number; agents: number } | null>(null);

  useEffect(() => {
    supabase.rpc("public_stats").then(({ data }) => {
      if (data && data.length > 0) setStats(data[0]);
    });
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Logo />
          <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
            <a href="#features" className="hover:text-foreground">{t("nav_features")}</a>
            <a href="#pricing" className="hover:text-foreground">{t("nav_pricing")}</a>
            <Link to="/tools" className="hover:text-foreground">Free tools</Link>
            <Link to="/agency" className="font-medium text-primary hover:text-foreground">Hire us — done-for-you</Link>
            <Link to="/stats" className="hover:text-foreground">Live stats</Link>
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
          <div className="mx-auto mb-8 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-xs font-medium text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            {t("hero_badge")}
          </div>
          {stats && stats.emails_sent > 0 && (
            <div className="mx-auto mt-4 inline-flex items-center gap-2 rounded-full border border-orange-500/30 bg-orange-500/10 px-4 py-1.5 text-xs font-semibold text-orange-400">
              <Flame className="h-3.5 w-3.5" />
              {stats.emails_sent.toLocaleString()} cold emails already sent by OutreachAI agents
            </div>
          )}
          <h1 className="text-balance text-5xl font-bold tracking-tight md:text-7xl">
            {t("hero_title_a")}{" "}
            <span className="text-gradient">{t("hero_title_b")}</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-balance text-lg text-muted-foreground md:text-xl">
            {t("hero_sub")}
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg" className="bg-gradient-primary shadow-glow text-base h-12 px-7">
              <Link to="/auth">
                {t("hero_cta")} <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="h-12 px-7">
              <a href="#pricing">{t("nav_pricing")}</a>
            </Button>
          </div>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-primary" /> Your data stays yours</span>
            <span className="flex items-center gap-1.5"><CreditCard className="h-4 w-4 text-primary" /> No credit card</span>
            <span className="flex items-center gap-1.5"><Trash2 className="h-4 w-4 text-primary" /> Delete anytime, for real</span>
            <span className="flex items-center gap-1.5"><MailX className="h-4 w-4 text-primary" /> Unsubscribe always honored</span>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            See our <Link to="/stats" className="underline hover:text-foreground">live numbers</Link> — we hide nothing.
          </p>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-6xl px-6 py-24">
        <div className="mb-16 text-center">
          <h2 className="text-4xl font-bold tracking-tight md:text-5xl">
            Your full outbound team, automated
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            Three AI workers running 24/7 so you can focus on closing.
          </p>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {features.map((f, i) => (
            <div
              key={f.title}
              className="group relative overflow-hidden rounded-2xl border border-border bg-card p-8 shadow-card transition-transform hover:-translate-y-1"
              style={{ animation: `fadeUp 0.6s ease ${i * 0.1}s both` }}
            >
              <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-primary shadow-glow">
                <f.icon className="h-6 w-6 text-primary-foreground" />
              </div>
              <h3 className="text-xl font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="border-t border-border/50 bg-card/30">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <div className="mb-16 text-center">
            <h2 className="text-4xl font-bold tracking-tight md:text-5xl">{t("sec_pricing_title")}</h2>
            <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            {t("sec_pricing_sub")}
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {plans.map((p) => (
              <div
                key={p.name}
                className={`relative rounded-2xl border bg-card p-8 shadow-card ${
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
                <h3 className="text-lg font-semibold">{p.name}</h3>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-5xl font-bold tracking-tight">${p.price}</span>
                  <span className="text-muted-foreground">{t("per_month")}</span>
                </div>
                <p className="mt-2 text-sm font-medium text-primary">{p.cap}</p>
                <ul className="mt-6 space-y-3 text-sm">
                  {p.perks.map((perk) => (
                    <li key={perk} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                      <span>{perk}</span>
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
          <p className="mt-6 text-center text-sm">
            <Link to="/security" className="text-primary underline underline-offset-4 hover:opacity-80">
              {t("security_link")}
            </Link>
          </p>
        </div>
      </section>

      <section className="border-t border-border/50">
        <div className="mx-auto max-w-3xl px-6 py-24 text-center">
          <p className="text-2xl font-medium leading-relaxed tracking-tight md:text-3xl">
            {t("founder_quote")}
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

      <footer className="border-t border-border/50">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-10 md:flex-row">
          <Logo />
          <div className="flex flex-wrap justify-center gap-6 text-sm text-muted-foreground">
            <a href="#features" className="hover:text-foreground">{t("nav_features")}</a>
            <a href="#pricing" className="hover:text-foreground">{t("nav_pricing")}</a>
            <Link to="/security" className="hover:text-foreground">{t("footer_security")}</Link>
            <Link to="/status" className="hover:text-foreground">{t("footer_status")}</Link>
            <Link to="/terms" className="hover:text-foreground">{t("footer_terms")}</Link>
            <Link to="/privacy" className="hover:text-foreground">{t("footer_privacy")}</Link>
            <Link to="/auth" className="hover:text-foreground">{t("nav_login")}</Link>
          </div>
          <p className="text-xs text-muted-foreground">© 2026 OutreachAI</p>
        </div>
      </footer>

      <style>{`@keyframes fadeUp { from { opacity:0; transform: translateY(20px);} to {opacity:1; transform:none;} }`}</style>
    </div>
  );
}