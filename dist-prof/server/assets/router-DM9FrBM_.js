import { QueryClientProvider, useQueryClient, QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, useRouter, Link, Outlet, HeadContent, Scripts, createFileRoute, lazyRouteComponent, createRouter } from "@tanstack/react-router";
import { jsx, jsxs } from "react/jsx-runtime";
import { useState, useEffect, createContext, useContext } from "react";
import { Toaster as Toaster$1 } from "sonner";
import { s as supabase } from "./client-Bf7kAZ3f.js";
const appCss = "/assets/styles-CllUVRHH.css";
const Toaster = ({ ...props }) => {
  return /* @__PURE__ */ jsx(
    Toaster$1,
    {
      className: "toaster group",
      toastOptions: {
        classNames: {
          toast: "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground"
        }
      },
      ...props
    }
  );
};
const DISMISS_KEY = "ios-install-dismissed-at";
function detectIos() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const isIosDevice = /iphone|ipad|ipod/i.test(ua) || navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return isIosDevice;
}
function isStandalone() {
  if (typeof window === "undefined") return true;
  const standaloneMode = window.matchMedia?.("(display-mode: standalone)").matches ?? false;
  const iosStandalone = window.navigator.standalone === true;
  return standaloneMode || iosStandalone;
}
function IosInstallBanner() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!detectIos() || isStandalone()) return;
    try {
      const dismissed = localStorage.getItem(DISMISS_KEY);
      if (dismissed && Date.now() - Number(dismissed) < 14 * 24 * 60 * 60 * 1e3)
        return;
    } catch {
    }
    const timer = setTimeout(() => setVisible(true), 3e3);
    return () => clearTimeout(timer);
  }, []);
  if (!visible) return null;
  const dismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
    }
  };
  return /* @__PURE__ */ jsx("div", { className: "fixed inset-x-0 bottom-0 z-50 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]", children: /* @__PURE__ */ jsxs("div", { className: "relative mx-auto max-w-md overflow-hidden rounded-2xl border border-white/15 bg-gradient-to-br from-zinc-900 via-zinc-900 p-4 shadow-2xl shadow-black/50 backdrop-blur-xl", children: [
    /* @__PURE__ */ jsx(
      "button",
      {
        onClick: dismiss,
        "aria-label": "Dismiss",
        className: "absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-white/70 transition-colors hover:bg-white/20 hover:text-white",
        children: /* @__PURE__ */ jsx("svg", { width: "12", height: "12", viewBox: "0 0 12 12", fill: "none", children: /* @__PURE__ */ jsx(
          "path",
          {
            d: "M1 1L11 11M11 1L1 11",
            stroke: "currentColor",
            strokeWidth: "2",
            strokeLinecap: "round"
          }
        ) })
      }
    ),
    /* @__PURE__ */ jsxs("div", { className: "flex items-start gap-3 pr-8", children: [
      /* @__PURE__ */ jsx("div", { className: "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-zinc-700 to-zinc-900 text-lg font-bold text-white shadow-lg shadow-black/50", children: "O" }),
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("p", { className: "text-sm font-semibold text-white", children: "Install OutreachAI on your iPhone" }),
        /* @__PURE__ */ jsx("p", { className: "mt-0.5 text-xs leading-relaxed text-zinc-400", children: "Full-screen app, offline mode, instant access — just like the App Store version." })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("ol", { className: "mt-3 space-y-2 text-xs text-zinc-300", children: [
      /* @__PURE__ */ jsxs("li", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsx("span", { className: "flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-500/20 font-bold text-violet-300", children: "1" }),
        "Tap the",
        " ",
        /* @__PURE__ */ jsx(
          "svg",
          {
            width: "14",
            height: "16",
            viewBox: "0 0 14 18",
            fill: "none",
            className: "inline-block shrink-0 text-white",
            children: /* @__PURE__ */ jsx(
              "path",
              {
                d: "M7 1v10M7 1L4 4M7 1l3 3M2.5 7H2a1 1 0 00-1 1v8a1 1 0 001 1h10a1 1 0 001-1V8a1 1 0 00-1-1h-.5",
                stroke: "currentColor",
                strokeWidth: "1.6",
                strokeLinecap: "round",
                strokeLinejoin: "round"
              }
            )
          }
        ),
        " ",
        /* @__PURE__ */ jsx("strong", { className: "text-white", children: "Share" }),
        " icon in Safari's toolbar"
      ] }),
      /* @__PURE__ */ jsxs("li", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsx("span", { className: "flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-500/20 font-bold text-violet-300", children: "2" }),
        "Scroll and tap",
        " ",
        /* @__PURE__ */ jsx("strong", { className: "whitespace-nowrap text-white", children: "＋ Add to Home Screen" })
      ] })
    ] }),
    /* @__PURE__ */ jsx(
      "button",
      {
        onClick: dismiss,
        className: "mt-4 w-full rounded-xl bg-gradient-to-r from-zinc-800 to-black py-2.5 text-sm font-semibold text-white shadow-lg shadow-black/50 transition-transform active:scale-[0.98]",
        children: "Got it"
      }
    )
  ] }) });
}
const ThemeContext = createContext({
  theme: "light",
  toggle: () => {
  }
});
const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("theme");if(t==="dark"){document.documentElement.classList.add("dark");}}catch(e){}})();`;
function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    if (typeof window === "undefined") return "light";
    try {
      return localStorage.getItem("theme") === "dark" ? "dark" : "light";
    } catch {
      return "light";
    }
  });
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    try {
      localStorage.setItem("theme", theme);
    } catch {
    }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme === "dark" ? "#15171e" : "#ffffff");
  }, [theme]);
  return /* @__PURE__ */ jsx(
    ThemeContext.Provider,
    {
      value: { theme, toggle: () => setTheme((t) => t === "dark" ? "light" : "dark") },
      children
    }
  );
}
function useTheme() {
  return useContext(ThemeContext);
}
function ThemeToggle({ className = "" }) {
  const { theme, toggle } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const dark = mounted && theme === "dark";
  return /* @__PURE__ */ jsx(
    "button",
    {
      onClick: toggle,
      "aria-label": dark ? "Switch to light mode" : "Switch to dark mode",
      title: dark ? "Light mode" : "Dark mode",
      className: `inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground ${className}`,
      children: dark ? /* @__PURE__ */ jsxs("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", children: [
        /* @__PURE__ */ jsx("circle", { cx: "12", cy: "12", r: "4.5", stroke: "currentColor", strokeWidth: "2" }),
        /* @__PURE__ */ jsx(
          "path",
          {
            d: "M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
            stroke: "currentColor",
            strokeWidth: "2",
            strokeLinecap: "round"
          }
        )
      ] }) : /* @__PURE__ */ jsx("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", children: /* @__PURE__ */ jsx(
        "path",
        {
          d: "M21 12.8A8.5 8.5 0 1111.2 3a6.8 6.8 0 009.8 9.8z",
          stroke: "currentColor",
          strokeWidth: "2",
          strokeLinecap: "round",
          strokeLinejoin: "round"
        }
      ) })
    }
  );
}
const DICT = {
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
    ar: "يبني OutreachAI قائمة عملائك المحتملين، ويكتب رسائل بريد مخصصة بالذكاء الاصطناعي، ويرسلها تلقائياً — بينما تركّز أنت على إتمام الصفقات."
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
    en: '"We built OutreachAI because small teams deserve the same outreach firepower as companies with entire SDR departments — without expensive tools or extra hires."',
    ar: '"بنينا OutreachAI لأن الفرق الصغيرة تستحق نفس قوة التواصل التي تملكها الشركات بأقسام مبيعات كاملة — دون أدوات باهظة أو توظيف إضافي."'
  },
  founder_role: { en: "The OutreachAI Team", ar: "فريق OutreachAI" },
  founder_note: { en: "Our team responds to every email within 24 hours", ar: "فريق الدعم يرد خلال 24 ساعة" },
  // Footer
  footer_terms: { en: "Terms", ar: "الشروط" },
  footer_privacy: { en: "Privacy", ar: "الخصوصية" },
  footer_security: { en: "Security", ar: "الأمان" },
  footer_status: { en: "Status", ar: "حالة النظام" },
  feat1_tt: { en: "AI Finds Leads", ar: "الذكاء الاصطناعي يجد العملاء" },
  feat1_dd: { en: "Searches globally for your ideal customers automatically — no list-buying, no scraping headaches.", ar: "يبحث تلقائياً عن عملائك المثاليين حول العالم — بدون شراء قوائم أو عناء الاستخراج." },
  feat2_tt: { en: "Personalised Emails", ar: "رسائل مخصصة" },
  feat2_dd: { en: "Claude AI writes a unique, on-brand email for every single lead. No templates, no spray-and-pray.", ar: "يكتب الذكاء الاصطناعي رسالة فريدة لكل عميل على حدة. بدون قوالب وبدون إرسال عشوائي." },
  feat3_tt: { en: "Auto Follow-ups", ar: "متابعات تلقائية" },
  feat3_dd: { en: "Follows up every 3 days until they reply or politely opt out. Pipeline never goes cold.", ar: "يتابع كل 3 أيام حتى يرد العميل أو يلغي الاشتراك بلباقة. خط مبيعاتك لا يبرد أبداً." },
  cap_starter: { en: "50 emails/day · 1 active campaign", ar: "50 رسالة يومياً · حملة نشطة واحدة" },
  cap_growth: { en: "200 emails/day · 5 active campaigns", ar: "200 رسالة يومياً · 5 حملات نشطة" },
  cap_agency: { en: "500 emails/day · unlimited campaigns", ar: "500 رسالة يومياً · حملات غير محدودة" },
  perk_ai: { en: "AI finds & writes everything", ar: "الذكاء الاصطناعي يجد ويكتب كل شيء" },
  perk_fu: { en: "Auto follow-ups", ar: "متابعات تلقائية" },
  perk_warm: { en: "Warm-up protection", ar: "حماية التسخين التدريجي" },
  perk_spam: { en: "Spam guard", ar: "الحماية من البريد المزعج" },
  perk_5camp: { en: "5 campaigns", ar: "5 حملات" },
  perk_reply: { en: "Reply detection + AI drafts", ar: "كشف الردود + مسودات الذكاء الاصطناعي" },
  perk_tz: { en: "Smart timezone sending", ar: "إرسال ذكي حسب المنطقة الزمنية" },
  perk_unlim: { en: "Unlimited campaigns", ar: "حملات غير محدودة" },
  perk_arabic: { en: "Arabic emails for Gulf leads", ar: "رسائل عربية للعملاء الخليجيين" },
  perk_bulk: { en: "Bulk import 500 at once", ar: "استيراد 500 عميل دفعة واحدة" },
  plan_starter: { en: "Starter", ar: "المبتدئ" },
  plan_growth: { en: "Growth", ar: "النمو" },
  plan_agency: { en: "Agency", ar: "الوكالة" },
  auth_google: { en: "Continue with Google", ar: "المتابعة عبر Google" },
  auth_or: { en: "OR", ar: "أو" },
  chip_data: { en: "Your data stays yours", ar: "بياناتك تبقى ملكك" },
  chip_card: { en: "No credit card", ar: "بدون بطاقة ائتمان" },
  chip_delete: { en: "Delete anytime, for real", ar: "احذف في أي وقت، فعلاً" },
  chip_unsub: { en: "Unsubscribe always honored", ar: "إلغاء الاشتراك محفوظ دائماً" },
  stats_pre: { en: "See our ", ar: "شاهد " },
  stats_link: { en: "live numbers", ar: "أرقامنا المباشرة" },
  stats_post: { en: " — we hide nothing.", ar: " — لا نخفي شيئاً." },
  nav_tools: { en: "Free tools", ar: "أدوات مجانية" },
  nav_hire: { en: "Hire us — done-for-you", ar: "وظّفنا — خدمة كاملة" },
  nav_stats: { en: "Live stats", ar: "إحصائيات مباشرة" },
  roi_title: { en: "What could this do for YOU?", ar: "ماذا يمكن أن يفعل هذا من أجلك؟" },
  roi_sub: { en: "Drag the sliders — see your potential pipeline in real numbers.", ar: "اسحب المؤشرات — وشاهد خط مبيعاتك المحتمل بالأرقام الحقيقية." },
  roi_leads: { en: "Leads contacted per day", ar: "عملاء يتم التواصل معهم يومياً" },
  roi_reply: { en: "Expected reply rate", ar: "معدل الرد المتوقع" },
  roi_close: { en: "Replies that become meetings", ar: "الردود التي تتحول إلى اجتماعات" },
  roi_deal: { en: "Average deal value", ar: "متوسط قيمة الصفقة" },
  roi_result: { en: "Your projected results", ar: "نتائجك المتوقعة" },
  roi_meetings: { en: "meetings booked / month", ar: "اجتماع محجوز / شهرياً" },
  roi_rev: { en: "new monthly revenue potential", ar: "إيرادات شهرية جديدة محتملة" },
  roi_note: { en: "Estimates based on typical cold-email performance. Your agent works daily to beat these numbers.", ar: "تقديرات بناءً على أداء نموذجي للبريد البارد. وكيلك يعمل يومياً لتجاوز هذه الأرقام." },
  free_pre: { en: "Not ready to pay? The free plan gives you ", ar: "غير مستعد للدفع؟ الخطة المجانية تمنحك " },
  free_num: { en: "10 emails/day, forever", ar: "10 رسائل يومياً، للأبد" },
  free_post: { en: " — no card needed.", ar: " — بدون بطاقة." },
  auth_email: { en: "Email", ar: "البريد الإلكتروني" },
  auth_pass: { en: "Password", ar: "كلمة المرور" },
  auth_signin: { en: "Sign in", ar: "تسجيل الدخول" },
  auth_signup: { en: "Sign up", ar: "إنشاء حساب" },
  auth_working: { en: "Working…", ar: "جارٍ العمل…" },
  app_dash: { en: "Dashboard", ar: "لوحة التحكم" },
  app_campaigns: { en: "Campaigns", ar: "الحملات" },
  app_leads: { en: "Leads", ar: "العملاء المحتملون" },
  app_lead_finder: { en: "Lead Finder", ar: "البحث عن العملاء" },
  app_emails: { en: "Emails Sent", ar: "الرسائل المُرسلة" },
  app_billing: { en: "Billing", ar: "الفواتير" },
  app_settings: { en: "Settings", ar: "الإعدادات" },
  dash_sub: { en: "Your AI agent activity at a glance.", ar: "نشاط وكيل الذكاء الاصطناعي بنظرة سريعة." },
  dash_add: { en: "Add New Campaign", ar: "أضف حملة جديدة" },
  dash_active: { en: "Active campaign", ar: "الحملة النشطة" },
  dash_activity: { en: "Recent activity", ar: "النشاط الأخير" },
  dash_empty: { en: "No emails sent yet — your AI agent is warming up.", ar: "لم تُرسل رسائل بعد — وكيلك في فترة التسخين." },
  card_won: { en: "Meetings Won", ar: "اجتماعات محققة" },
  stat_emails: { en: "Emails Sent", ar: "رسائل مُرسلة" },
  stat_reply: { en: "Replies", ar: "الردود" },
  btn_launch: { en: "Launch", ar: "إطلاق" },
  perk_ab: { en: "A/B tested subject lines", ar: "اختبار A/B لعناوين الرسائل" },
  perk_auto: { en: "Autopilot AI replies", ar: "ردود تلقائية بالذكاء الاصطناعي" }
};
const Ctx = createContext({ lang: "en", setLang: () => {
}, t: (k) => String(k) });
function detect() {
  try {
    const saved = localStorage.getItem("oai-lang");
    if (saved === "ar" || saved === "en") return saved;
    if (navigator.language?.toLowerCase().startsWith("ar")) return "ar";
  } catch {
  }
  return "en";
}
function LangProvider({ children }) {
  const [lang, setLangState] = useState(detect);
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    try {
      localStorage.setItem("oai-lang", lang);
    } catch {
    }
  }, [lang]);
  const setLang = (l) => setLangState(l);
  const t = (key) => DICT[key]?.[lang] ?? key;
  return /* @__PURE__ */ jsx(Ctx.Provider, { value: { lang, setLang, t }, children });
}
function useLang() {
  return useContext(Ctx);
}
function LangToggle({ className = "" }) {
  const { lang, setLang } = useLang();
  return /* @__PURE__ */ jsx(
    "button",
    {
      onClick: () => setLang(lang === "en" ? "ar" : "en"),
      className: `rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground ${className}`,
      children: lang === "en" ? "العربية" : "English"
    }
  );
}
function NotFoundComponent() {
  return /* @__PURE__ */ jsx("div", { className: "flex min-h-screen items-center justify-center bg-background px-4", children: /* @__PURE__ */ jsxs("div", { className: "max-w-md text-center", children: [
    /* @__PURE__ */ jsx("h1", { className: "text-7xl font-bold text-gradient", children: "404" }),
    /* @__PURE__ */ jsx("h2", { className: "mt-4 text-xl font-semibold", children: "Page not found" }),
    /* @__PURE__ */ jsx("p", { className: "mt-2 text-sm text-muted-foreground", children: "The page you're looking for doesn't exist." }),
    /* @__PURE__ */ jsx("div", { className: "mt-6", children: /* @__PURE__ */ jsx(
      Link,
      {
        to: "/",
        className: "inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90",
        children: "Go home"
      }
    ) })
  ] }) });
}
function ErrorComponent({ error, reset }) {
  console.error(error);
  const router2 = useRouter();
  return /* @__PURE__ */ jsx("div", { className: "flex min-h-screen items-center justify-center bg-background px-4", children: /* @__PURE__ */ jsxs("div", { className: "max-w-md text-center", children: [
    /* @__PURE__ */ jsx("h1", { className: "text-xl font-semibold", children: "Something went wrong" }),
    /* @__PURE__ */ jsx("p", { className: "mt-2 text-sm text-muted-foreground", children: error.message }),
    /* @__PURE__ */ jsxs("div", { className: "mt-6 flex flex-wrap justify-center gap-2", children: [
      /* @__PURE__ */ jsx(
        "button",
        {
          onClick: () => {
            router2.invalidate();
            reset();
          },
          className: "inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90",
          children: "Try again"
        }
      ),
      /* @__PURE__ */ jsx(
        "a",
        {
          href: "/",
          className: "inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground",
          children: "Go home"
        }
      )
    ] })
  ] }) });
}
const Route$s = createRootRouteWithContext()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1, viewport-fit=cover"
      },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      {
        name: "apple-mobile-web-app-status-bar-style",
        content: "black-translucent"
      },
      { name: "apple-mobile-web-app-title", content: "OutreachAI" },
      { name: "mobile-web-app-capable", content: "yes" },
      { title: "OutreachAI — AI Cold Email Agent That Books Meetings On Autopilot" },
      {
        name: "description",
        content: "OutreachAI finds your ideal customers worldwide, writes personalized cold emails, follows up automatically, and books meetings into your calendar."
      },
      {
        property: "og:title",
        content: "OutreachAI — AI Cold Email Agent That Books Meetings On Autopilot"
      },
      {
        property: "og:description",
        content: "Give us your ideal customer. We find them, email them, follow up, and book meetings — while you sleep."
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      {
        name: "twitter:title",
        content: "OutreachAI — AI Cold Email Agent That Books Meetings On Autopilot"
      },
      {
        property: "og:image",
        content: "/og.png"
      },
      {
        name: "twitter:image",
        content: "/og.png"
      }
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "icon", href: "/icon.svg", type: "image/svg+xml" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png", sizes: "180x180" },
      { name: "theme-color", content: "#7c3aed" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
      }
    ]
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent
});
function RootShell({ children }) {
  return /* @__PURE__ */ jsxs("html", { lang: "en", suppressHydrationWarning: true, children: [
    /* @__PURE__ */ jsxs("head", { children: [
      /* @__PURE__ */ jsx("script", { dangerouslySetInnerHTML: { __html: THEME_INIT_SCRIPT } }),
      /* @__PURE__ */ jsx(HeadContent, {})
    ] }),
    /* @__PURE__ */ jsxs("body", { children: [
      children,
      /* @__PURE__ */ jsx(Scripts, {})
    ] })
  ] });
}
function AuthListener() {
  const router2 = useRouter();
  const queryClient = useQueryClient();
  useEffect(() => {
    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange(() => {
      router2.invalidate();
      queryClient.invalidateQueries();
    });
    return () => subscription.unsubscribe();
  }, [router2, queryClient]);
  return null;
}
function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || false) return;
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.warn("Service worker registration failed:", err);
      });
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);
  return null;
}
function RootComponent() {
  const { queryClient } = Route$s.useRouteContext();
  return /* @__PURE__ */ jsx(QueryClientProvider, { client: queryClient, children: /* @__PURE__ */ jsx(ThemeProvider, { children: /* @__PURE__ */ jsxs(LangProvider, { children: [
    /* @__PURE__ */ jsx(AuthListener, {}),
    /* @__PURE__ */ jsx(ServiceWorkerRegistrar, {}),
    /* @__PURE__ */ jsx(Outlet, {}),
    /* @__PURE__ */ jsx(IosInstallBanner, {}),
    /* @__PURE__ */ jsx(Toaster, {})
  ] }) }) });
}
const $$splitComponentImporter$r = () => import("./unsubscribe-DWqCbIa5.js");
const Route$r = createFileRoute("/unsubscribe")({
  component: lazyRouteComponent($$splitComponentImporter$r, "component")
});
const $$splitComponentImporter$q = () => import("./tools-BtJeRQIh.js");
const Route$q = createFileRoute("/tools")({
  head: () => ({
    meta: [{
      title: "Free Email Tools — Validate Lists & Generate Subject Lines | OutreachAI"
    }, {
      name: "description",
      content: "Free tools, no signup: check if your email list can actually receive mail, and generate cold-email subject lines that get opens."
    }]
  }),
  component: lazyRouteComponent($$splitComponentImporter$q, "component")
});
const $$splitComponentImporter$p = () => import("./terms-DoRTyYvA.js");
const Route$p = createFileRoute("/terms")({
  head: () => ({
    meta: [{
      title: "Terms of Service — OutreachAI"
    }]
  }),
  component: lazyRouteComponent($$splitComponentImporter$p, "component")
});
const $$splitComponentImporter$o = () => import("./status-NnHi966G.js");
const Route$o = createFileRoute("/status")({
  component: lazyRouteComponent($$splitComponentImporter$o, "component")
});
const $$splitComponentImporter$n = () => import("./stats-Dx-DnRNx.js");
const Route$n = createFileRoute("/stats")({
  head: () => ({
    meta: [{
      title: "Live Stats — OutreachAI"
    }, {
      name: "description",
      content: "Radical transparency: live numbers from the OutreachAI platform — agents running, cold emails sent, replies detected."
    }]
  }),
  component: lazyRouteComponent($$splitComponentImporter$n, "component")
});
const $$splitComponentImporter$m = () => import("./security-BYknbV-m.js");
const Route$m = createFileRoute("/security")({
  component: lazyRouteComponent($$splitComponentImporter$m, "component")
});
const $$splitComponentImporter$l = () => import("./refunds-BtRYmAAF.js");
const Route$l = createFileRoute("/refunds")({
  component: lazyRouteComponent($$splitComponentImporter$l, "component")
});
const $$splitComponentImporter$k = () => import("./privacy-xENpHFD8.js");
const Route$k = createFileRoute("/privacy")({
  head: () => ({
    meta: [{
      title: "Privacy Policy — OutreachAI"
    }]
  }),
  component: lazyRouteComponent($$splitComponentImporter$k, "component")
});
const $$splitComponentImporter$j = () => import("./honesty-3hT6wfn7.js");
const Route$j = createFileRoute("/honesty")({
  component: lazyRouteComponent($$splitComponentImporter$j, "component")
});
const $$splitComponentImporter$i = () => import("./auth-CqQXCbWx.js");
const Route$i = createFileRoute("/auth")({
  head: () => ({
    meta: [{
      title: "Sign in — OutreachAI"
    }, {
      name: "description",
      content: "Log in or create your OutreachAI account."
    }]
  }),
  component: lazyRouteComponent($$splitComponentImporter$i, "component")
});
const $$splitComponentImporter$h = () => import("./agency-BhnrMeP5.js");
const Route$h = createFileRoute("/agency")({
  component: lazyRouteComponent($$splitComponentImporter$h, "component")
});
const $$splitComponentImporter$g = () => import("./about-CMsNlhOK.js");
const Route$g = createFileRoute("/about")({
  component: lazyRouteComponent($$splitComponentImporter$g, "component")
});
const $$splitComponentImporter$f = () => import("./_authenticated-BFhHr4IC.js");
const Route$f = createFileRoute("/_authenticated")({
  component: lazyRouteComponent($$splitComponentImporter$f, "component")
});
const $$splitComponentImporter$e = () => import("./index-CXvHTdbV.js");
const Route$e = createFileRoute("/")({
  head: () => ({
    meta: [{
      title: "OutreachAI — AI Sales Agent That Finds Leads & Sends Cold Emails For You"
    }, {
      name: "description",
      content: "OutreachAI finds your ideal customers worldwide, writes personalized cold emails, follows up automatically, and books meetings into your calendar."
    }, {
      property: "og:title",
      content: "OutreachAI — Your AI Sales Agent"
    }, {
      property: "og:description",
      content: "Finds leads worldwide, writes personalized cold emails, handles replies, and books meetings — automatically."
    }, {
      property: "og:image",
      content: "/og.png"
    }, {
      property: "og:type",
      content: "website"
    }, {
      name: "twitter:card",
      content: "summary_large_image"
    }, {
      name: "twitter:title",
      content: "OutreachAI — Your AI Sales Agent"
    }, {
      name: "twitter:description",
      content: "Finds leads worldwide, writes personalized cold emails, handles replies, and books meetings — automatically."
    }, {
      name: "twitter:image",
      content: "/og.png"
    }]
  }),
  component: lazyRouteComponent($$splitComponentImporter$e, "component")
});
const $$splitComponentImporter$d = () => import("./gmail.callback-CfjIG32V.js");
const Route$d = createFileRoute("/gmail/callback")({
  component: lazyRouteComponent($$splitComponentImporter$d, "component")
});
const $$splitComponentImporter$c = () => import("./auth.callback-CjxidaHX.js");
const Route$c = createFileRoute("/auth/callback")({
  component: lazyRouteComponent($$splitComponentImporter$c, "component")
});
const $$splitComponentImporter$b = () => import("./settings-Cqi_HkMN.js");
const Route$b = createFileRoute("/_authenticated/settings")({
  component: lazyRouteComponent($$splitComponentImporter$b, "component")
});
const $$splitComponentImporter$a = () => import("./onboarding-CaOPWBaH.js");
const Route$a = createFileRoute("/_authenticated/onboarding")({
  component: lazyRouteComponent($$splitComponentImporter$a, "component")
});
const $$splitComponentImporter$9 = () => import("./leads-D5r9nKlG.js");
const Route$9 = createFileRoute("/_authenticated/leads")({
  component: lazyRouteComponent($$splitComponentImporter$9, "component")
});
const $$splitComponentImporter$8 = () => import("./lead-finder-BGxHz0zN.js");
const Route$8 = createFileRoute("/_authenticated/lead-finder")({
  component: lazyRouteComponent($$splitComponentImporter$8, "component")
});
const $$splitComponentImporter$7 = () => import("./emails-B6E502ma.js");
const Route$7 = createFileRoute("/_authenticated/emails")({
  component: lazyRouteComponent($$splitComponentImporter$7, "component")
});
const $$splitComponentImporter$6 = () => import("./dashboard-kvOm2ita.js");
const Route$6 = createFileRoute("/_authenticated/dashboard")({
  component: lazyRouteComponent($$splitComponentImporter$6, "component")
});
const $$splitComponentImporter$5 = () => import("./campaigns-CkGKEp9S.js");
const Route$5 = createFileRoute("/_authenticated/campaigns")({
  component: lazyRouteComponent($$splitComponentImporter$5, "component")
});
const $$splitComponentImporter$4 = () => import("./billing-Dbkn7yjs.js");
const Route$4 = createFileRoute("/_authenticated/billing")({
  component: lazyRouteComponent($$splitComponentImporter$4, "component")
});
const $$splitComponentImporter$3 = () => import("./auth.google.callback-CtYBGbCl.js");
const Route$3 = createFileRoute("/auth/google/callback")({
  component: lazyRouteComponent($$splitComponentImporter$3, "component")
});
const $$splitComponentImporter$2 = () => import("./lead-edit._leadId-CYTpH3Sm.js");
const Route$2 = createFileRoute("/_authenticated/lead-edit/$leadId")({
  component: lazyRouteComponent($$splitComponentImporter$2, "component")
});
const $$splitComponentImporter$1 = () => import("./campaign-review._campaignId-Cb2VgSD0.js");
const Route$1 = createFileRoute("/_authenticated/campaign-review/$campaignId")({
  component: lazyRouteComponent($$splitComponentImporter$1, "component")
});
const $$splitComponentImporter = () => import("./campaign-edit._campaignId-B6Fpx8xy.js");
const Route = createFileRoute("/_authenticated/campaign-edit/$campaignId")({
  component: lazyRouteComponent($$splitComponentImporter, "component")
});
const UnsubscribeRoute = Route$r.update({
  id: "/unsubscribe",
  path: "/unsubscribe",
  getParentRoute: () => Route$s
});
const ToolsRoute = Route$q.update({
  id: "/tools",
  path: "/tools",
  getParentRoute: () => Route$s
});
const TermsRoute = Route$p.update({
  id: "/terms",
  path: "/terms",
  getParentRoute: () => Route$s
});
const StatusRoute = Route$o.update({
  id: "/status",
  path: "/status",
  getParentRoute: () => Route$s
});
const StatsRoute = Route$n.update({
  id: "/stats",
  path: "/stats",
  getParentRoute: () => Route$s
});
const SecurityRoute = Route$m.update({
  id: "/security",
  path: "/security",
  getParentRoute: () => Route$s
});
const RefundsRoute = Route$l.update({
  id: "/refunds",
  path: "/refunds",
  getParentRoute: () => Route$s
});
const PrivacyRoute = Route$k.update({
  id: "/privacy",
  path: "/privacy",
  getParentRoute: () => Route$s
});
const HonestyRoute = Route$j.update({
  id: "/honesty",
  path: "/honesty",
  getParentRoute: () => Route$s
});
const AuthRoute = Route$i.update({
  id: "/auth",
  path: "/auth",
  getParentRoute: () => Route$s
});
const AgencyRoute = Route$h.update({
  id: "/agency",
  path: "/agency",
  getParentRoute: () => Route$s
});
const AboutRoute = Route$g.update({
  id: "/about",
  path: "/about",
  getParentRoute: () => Route$s
});
const AuthenticatedRoute = Route$f.update({
  id: "/_authenticated",
  getParentRoute: () => Route$s
});
const IndexRoute = Route$e.update({
  id: "/",
  path: "/",
  getParentRoute: () => Route$s
});
const GmailCallbackRoute = Route$d.update({
  id: "/gmail/callback",
  path: "/gmail/callback",
  getParentRoute: () => Route$s
});
const AuthCallbackRoute = Route$c.update({
  id: "/callback",
  path: "/callback",
  getParentRoute: () => AuthRoute
});
const AuthenticatedSettingsRoute = Route$b.update({
  id: "/settings",
  path: "/settings",
  getParentRoute: () => AuthenticatedRoute
});
const AuthenticatedOnboardingRoute = Route$a.update({
  id: "/onboarding",
  path: "/onboarding",
  getParentRoute: () => AuthenticatedRoute
});
const AuthenticatedLeadsRoute = Route$9.update({
  id: "/leads",
  path: "/leads",
  getParentRoute: () => AuthenticatedRoute
});
const AuthenticatedLeadFinderRoute = Route$8.update({
  id: "/lead-finder",
  path: "/lead-finder",
  getParentRoute: () => AuthenticatedRoute
});
const AuthenticatedEmailsRoute = Route$7.update({
  id: "/emails",
  path: "/emails",
  getParentRoute: () => AuthenticatedRoute
});
const AuthenticatedDashboardRoute = Route$6.update({
  id: "/dashboard",
  path: "/dashboard",
  getParentRoute: () => AuthenticatedRoute
});
const AuthenticatedCampaignsRoute = Route$5.update({
  id: "/campaigns",
  path: "/campaigns",
  getParentRoute: () => AuthenticatedRoute
});
const AuthenticatedBillingRoute = Route$4.update({
  id: "/billing",
  path: "/billing",
  getParentRoute: () => AuthenticatedRoute
});
const AuthGoogleCallbackRoute = Route$3.update({
  id: "/google/callback",
  path: "/google/callback",
  getParentRoute: () => AuthRoute
});
const AuthenticatedLeadEditLeadIdRoute = Route$2.update({
  id: "/lead-edit/$leadId",
  path: "/lead-edit/$leadId",
  getParentRoute: () => AuthenticatedRoute
});
const AuthenticatedCampaignReviewCampaignIdRoute = Route$1.update({
  id: "/campaign-review/$campaignId",
  path: "/campaign-review/$campaignId",
  getParentRoute: () => AuthenticatedRoute
});
const AuthenticatedCampaignEditCampaignIdRoute = Route.update({
  id: "/campaign-edit/$campaignId",
  path: "/campaign-edit/$campaignId",
  getParentRoute: () => AuthenticatedRoute
});
const AuthenticatedRouteChildren = {
  AuthenticatedBillingRoute,
  AuthenticatedCampaignsRoute,
  AuthenticatedDashboardRoute,
  AuthenticatedEmailsRoute,
  AuthenticatedLeadFinderRoute,
  AuthenticatedLeadsRoute,
  AuthenticatedOnboardingRoute,
  AuthenticatedSettingsRoute,
  AuthenticatedCampaignEditCampaignIdRoute,
  AuthenticatedCampaignReviewCampaignIdRoute,
  AuthenticatedLeadEditLeadIdRoute
};
const AuthenticatedRouteWithChildren = AuthenticatedRoute._addFileChildren(
  AuthenticatedRouteChildren
);
const AuthRouteChildren = {
  AuthCallbackRoute,
  AuthGoogleCallbackRoute
};
const AuthRouteWithChildren = AuthRoute._addFileChildren(AuthRouteChildren);
const rootRouteChildren = {
  IndexRoute,
  AuthenticatedRoute: AuthenticatedRouteWithChildren,
  AboutRoute,
  AgencyRoute,
  AuthRoute: AuthRouteWithChildren,
  HonestyRoute,
  PrivacyRoute,
  RefundsRoute,
  SecurityRoute,
  StatsRoute,
  StatusRoute,
  TermsRoute,
  ToolsRoute,
  UnsubscribeRoute,
  GmailCallbackRoute
};
const routeTree = Route$s._addFileChildren(rootRouteChildren)._addFileTypes();
const getRouter = () => {
  const queryClient = new QueryClient();
  const router2 = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0
  });
  return router2;
};
const router = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  getRouter
}, Symbol.toStringTag, { value: "Module" }));
export {
  LangToggle as L,
  Route$2 as R,
  ThemeToggle as T,
  Route$1 as a,
  Route as b,
  router as r,
  useLang as u
};
//# sourceMappingURL=router-DM9FrBM_.js.map
