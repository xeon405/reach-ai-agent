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
  perk_auto: { en: "Autopilot AI replies", ar: "ردود تلقائية بالذكاء الاصطناعي" },
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
