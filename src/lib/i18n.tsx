import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Lang = "en" | "ar";

const DICT: Record<string, { en: string; ar: string }> = {
  // Nav / header
  nav_features: { en: "Features", ar: "المميزات" },
  nav_pricing: { en: "Pricing", ar: "الأسعار" },
  nav_login: { en: "Log in", ar: "تسجيل الدخول" },
  nav_open_app: { en: "Open app", ar: "فتح التطبيق" },
  // Hero
  hero_badge: { en: "Powered by advanced AI — built for B2B teams worldwide", ar: "مدعوم بالذكاء الاصطناعي المتقدم — لفرق الأعمال حول العالم" },
  hero_title_a: { en: "Your AI sales agent finds,", ar: "وكيل المبيعات الذكي يجد،" },
  hero_title_b: { en: "writes & sends.", ar: "يكتب ويُرسل." },
  hero_sub: {
    en: "OutreachAI builds your lead list, writes personalized cold emails with AI, and sends them on autopilot — while you focus on closing.",
    ar: "يبني OutreachAI قائمة عملائك المحتملين، ويكتب رسائل بريد مخصصة بالذكاء الاصطناعي، ويرسلها تلقائياً — بينما تركّز أنت على إتمام الصفقات.",
  },
  hero_cta: { en: "Start free — no card needed", ar: "ابدأ مجاناً — بدون بطاقة" },
  hero_cta2: { en: "See how it works", ar: "كيف يعمل" },
  // Sections
  sec_features: { en: "Everything you need to fill your pipeline", ar: "كل ما تحتاجه لتعبئة خط مبيعاتك" },
  sec_pricing_title: { en: "Simple, scalable pricing", ar: "أسعار بسيطة وقابلة للتوسع" },
  sec_pricing_sub: { en: "Start on the free plan — upgrade when you are booking meetings.", ar: "ابدأ بالخطة المجانية — رقِّ حسابك عندما تبدأ بحجز الاجتماعات." },
  pricing_anchor: { en: "An AI sales employee that works 24/7 — for less than 2% of a hire", ar: "موظف مبيعات ذكي يعمل ٢٤/٧ — بأقل من ٢٪ من تكلفة توظيف شخص" },
  badge_guarantee: { en: "✅ 14-day money-back guarantee", ar: "✅ ضمان استرداد الأموال لمدة 14 يوماً" },
  badge_cancel: { en: "✅ Cancel anytime, keep your data", ar: "✅ ألغِ في أي وقت واحتفظ ببياناتك" },
  badge_support: { en: "✅ Human support within 24h", ar: "✅ دعم بشري خلال 24 ساعة" },
  security_link: { en: "🔒 See exactly how we protect your Gmail account", ar: "🔒 تعرّف على كيف نحمي حساب Gmail الخاص بك" },
  plan_popular: { en: "Most popular", ar: "الأكثر شيوعاً" },
  per_month: { en: "/mo", ar: "/شهرياً" },
  start_free: { en: "Start free", ar: "ابدأ مجاناً" },
  // Founder note
  founder_quote: {
    en: "\"We built OutreachAI because small teams deserve the same outreach firepower as companies with entire SDR departments — without expensive tools or extra hires.\"",
    ar: "\"بنينا OutreachAI لأن الفرق الصغيرة تستحق نفس قوة التواصل التي تملكها الشركات بأقسام مبيعات كاملة — دون أدوات باهظة أو توظيف إضافي.\"",
  },
  founder_role: { en: "The OutreachAI Team", ar: "فريق OutreachAI" },
  founder_note: { en: "Our team responds to every email within 24 hours", ar: "فريق الدعم يرد خلال 24 ساعة" },
  // Footer
  footer_terms: { en: "Terms", ar: "الشروط" },
  footer_privacy: { en: "Privacy", ar: "الخصوصية" },
  footer_security: { en: "Security", ar: "الأمان" },
  footer_status: { en: "Status", ar: "حالة النظام" },
};

interface LangCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: keyof typeof DICT | string) => string;
}

const Ctx = createContext<LangCtx>({ lang: "en", setLang: () => {}, t: (k) => String(k) });

function detect(): Lang {
  try {
    const saved = localStorage.getItem("oai-lang");
    if (saved === "ar" || saved === "en") return saved;
    if (navigator.language?.toLowerCase().startsWith("ar")) return "ar";
  } catch { /* noop */ }
  return "en";
}

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detect);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    try { localStorage.setItem("oai-lang", lang); } catch { /* noop */ }
  }, [lang]);

  const setLang = (l: Lang) => setLangState(l);
  const t = (key: string) => DICT[key]?.[lang] ?? key;

  return <Ctx.Provider value={{ lang, setLang, t }}>{children}</Ctx.Provider>;
}

export function useLang() {
  return useContext(Ctx);
}

export function LangToggle({ className = "" }: { className?: string }) {
  const { lang, setLang } = useLang();
  return (
    <button
      onClick={() => setLang(lang === "en" ? "ar" : "en")}
      className={`rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground ${className}`}
    >
      {lang === "en" ? "العربية" : "English"}
    </button>
  );
}
