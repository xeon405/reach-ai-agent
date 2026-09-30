import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Lang = "en" | "ar";

const DICT: Record<string, { en: string; ar: string }> = {



  // Nav / header
  nav_features: { en: "Features", ar: "المميزات" },
  nav_pricing: { en: "Pricing", ar: "الأسعار" },
  nav_login: { en: "Log in", ar: "تسجيل الدخول" },
  nav_open_app: { en: "Open app", ar: "فتح التطبيق" },
  // Hero
  hero_badge: { en: "Powered by advanced AI — built for businesses worldwide", ar: "مدعوم بالذكاء الاصطناعي المتقدم — لشركات حول العالم" },
  hero_title_a: { en: "Your AI sales agent finds,", ar: "وكيل المبيعات الذكي يجد،" },
  hero_title_b: { en: "writes & sends.", ar: "يكتب ويُرسل." },
  hero_sub: {
    en: "OutshipAi finds new customers for you, writes a personal email to each one, and follows up for you — while you focus on closing.",
    ar: "يجد OutshipAi عملاء جدداً لك، ويكتب لكل منهم رسالة شخصية، ويتابع معك — بينما تركّز أنت على إتمام الصفقات.",
  },
  hero_cta: { en: "Start free — no card needed", ar: "ابدأ مجاناً — بدون بطاقة" },
  hero_cta2: { en: "See how it works", ar: "كيف يعمل" },
  // Sections
  sec_features: { en: "Everything you need to win more customers", ar: "كل ما تحتاجه لكسب عملاء أكثر" },
  sec_pricing_title: { en: "Simple, scalable pricing", ar: "أسعار بسيطة وقابلة للتوسع" },
  sec_pricing_sub: { en: "Start on the free plan — upgrade when you are booking meetings.", ar: "ابدأ بالخطة المجانية — رقِّ حسابك عندما تبدأ بحجز الاجتماعات." },
  pricing_anchor: { en: "An AI salesperson that works 24/7 — for less than 2% of a hire", ar: "مندوب مبيعات ذكي يعمل ٢٤/٧ — بأقل من ٢٪ من تكلفة توظيف شخص" },
  badge_guarantee: { en: "✅ 14-day money-back guarantee", ar: "✅ ضمان استرداد الأموال لمدة 14 يوماً" },
  badge_cancel: { en: "✅ Cancel anytime, keep your data", ar: "✅ ألغِ في أي وقت واحتفظ ببياناتك" },
  badge_support: { en: "✅ Human support within 24h", ar: "✅ دعم بشري خلال 24 ساعة" },
  security_link: { en: "🔒 See exactly how we protect your Gmail account", ar: "🔒 تعرّف على كيف نحمي حساب Gmail الخاص بك" },
  plan_popular: { en: "Most popular", ar: "الأكثر شيوعاً" },
  per_month: { en: "/mo", ar: "/شهرياً" },
  start_free: { en: "Start free", ar: "ابدأ مجاناً" },
  // Founder note
  founder_quote: {
    en: "\"We built OutshipAi because small businesses deserve the same sales power as companies with whole sales teams — without expensive tools or extra hires.\"",
    ar: "\"بنينا OutshipAi لأن الشركات الصغيرة تستحق نفس قوة البيع التي تملكها الشركات ذات فرق المبيعات الكاملة — دون أدوات باهظة أو توظيف إضافي.\"",
  },
  founder_role: { en: "The OutshipAi Team", ar: "فريق OutshipAi" },
  founder_note: { en: "Our team responds to every email within 24 hours", ar: "فريق الدعم يرد خلال 24 ساعة" },
  // Footer
  footer_terms: { en: "Terms", ar: "الشروط" },
  footer_privacy: { en: "Privacy", ar: "الخصوصية" },
  footer_security: { en: "Security", ar: "الأمان" },
  footer_status: { en: "Status", ar: "حالة النظام" },
  feat1_tt: { en: "AI Finds Customers", ar: "الذكاء الاصطناعي يجد العملاء" },
  feat1_dd: { en: "Searches the whole world for businesses like yours — you don't have to buy lists or clean up messy data.", ar: "يبحث في كل العالم عن شركات مثل شركتك — لا تحتاج شراء قوائم أو تنظيف بيانات معقدة." },
  feat2_tt: { en: "Personalised Emails", ar: "رسائل مخصصة" },
  feat2_dd: { en: "AI writes a different, on-brand email for every single person. No copy-paste, no blasting the same message at everyone.", ar: "يكتب الذكاء الاصطناعي رسالة مختلفة لكل شخص على حدة. بدون نسخ ولصق وبدون إرسال نفس الرسالة للجميع." },
  feat3_tt: { en: "Automatic Follow-ups", ar: "متابعات تلقائية" },
  feat3_dd: { en: "We follow up every 3 days until they reply or ask to stop. So no interested person is ever forgotten.", ar: "نتابع كل 3 أيام حتى يرد العميل أو يطلب التوقف. فلا يُنسى أي مهتم أبداً." },
  cap_starter: { en: "50 emails/day · 1 campaign at a time", ar: "50 رسالة يومياً · حملة واحدة في كل مرة" },
  cap_growth: { en: "200 emails/day · 5 campaigns at a time", ar: "200 رسالة يومياً · 5 حملات في كل مرة" },
  cap_agency: { en: "500 emails/day · unlimited campaigns", ar: "500 رسالة يومياً · حملات غير محدودة" },
  perk_ai: { en: "AI finds & writes everything", ar: "الذكاء الاصطناعي يجد ويكتب كل شيء" },
  perk_fu: { en: "Automatic follow-ups", ar: "متابعات تلقائية" },
  perk_warm: { en: "Keeps your sending safe at the start", ar: "يحمي إرسالك في البداية" },
  perk_spam: { en: "Stops emails landing in spam", ar: "يمنع وصول رسائلك إلى البريد المزعج" },
  perk_5camp: { en: "5 campaigns at a time", ar: "5 حملات في كل مرة" },
  perk_reply: { en: "Spots replies and writes the answer for you", ar: "يكتشف الردود ويكتب الرد نيابة عنك" },
  perk_tz: { en: "Sends at the right local time", ar: "يرسل في التوقيت المحلي المناسب" },
  perk_unlim: { en: "Unlimited campaigns", ar: "حملات غير محدودة" },
  perk_arabic: { en: "Arabic emails for Gulf customers", ar: "رسائل عربية لعملاء الخليج" },
  perk_bulk: { en: "Add 500 people at once", ar: "أضف 500 جهة اتصال دفعة واحدة" },
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
  roi_sub: { en: "Drag the sliders — see what more customers could mean for you.", ar: "اسحب المؤشرات — وشاهد ماذا يعني المزيد من العملاء بالنسبة لك." },
  roi_leads: { en: "People contacted per day", ar: "أشخاص يتم التواصل معهم يومياً" },
  roi_reply: { en: "How many reply", ar: "كم شخصاً سيرد" },
  roi_close: { en: "Replies that become meetings", ar: "الردود التي تتحول إلى اجتماعات" },
  roi_deal: { en: "Average value of a sale", ar: "متوسط قيمة الصفقة" },
  roi_result: { en: "Your projected results", ar: "نتائجك المتوقعة" },
  roi_meetings: { en: "meetings booked / month", ar: "اجتماع محجوز / شهرياً" },
  roi_rev: { en: "new monthly revenue potential", ar: "إيرادات شهرية جديدة محتملة" },
  roi_note: { en: "Estimates based on typical cold-email results. Your agent works daily to beat these numbers.", ar: "تقديرات بناءً على نتائج نموذجية للبريد البارد. وكيلك يعمل يومياً لتجاوز هذه الأرقام." },
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
  app_leads: { en: "Contacts", ar: "جهات الاتصال" },
  app_lead_finder: { en: "Find Businesses", ar: "البحث عن عملاء جدد" },
  app_emails: { en: "Emails Sent", ar: "الرسائل المُرسلة" },
  app_billing: { en: "Billing", ar: "الفواتير" },
  app_settings: { en: "Settings", ar: "الإعدادات" },
  app_agent: { en: "Agent", ar: "الوكيل" },
  app_agent_sub: { en: "Ask about your contacts, campaigns, and sending.", ar: "اسأل عن جهات اتصالك وحملاتك وإرسالك." },
  app_agent_new: { en: "New chat", ar: "محادثة جديدة" },
  app_agent_safe: { en: "Nothing happens without your OK", ar: "لا يحدث شيء دون موافقتك" },
  app_agent_safe_body: {
    en: "Reading things is instant. Anything that changes your account asks you first. The agent never sends email on its own.",
    ar: "القراءة فورية. وأي شيء يغيّر حسابك يسألك أولاً. الوكيل لا يرسل بريداً نيابة عنك.",
  },
  app_agent_yes: { en: "Yes, do it", ar: "نعم، نفّذ" },
  app_agent_no: { en: "No", ar: "لا" },
  app_agent_ai: { en: "Understood by AI", ar: "فُهم بواسطة الذكاء الاصطناعي" },
  app_agent_direct: { en: "Looked up directly", ar: "تم البحث مباشرة" },
  app_agent_working: { en: "Working…", ar: "جارٍ العمل…" },
  app_agent_placeholder: { en: "Ask something…", ar: "اسأل شيئاً…" },
  app_agent_chats: { en: "Past chats", ar: "المحادثات السابقة" },
  app_agent_chats_body: {
    en: "Your chats are saved. Open any of them, or delete one you no longer want. Nothing is deleted automatically.",
    ar: "محادثاتك محفوظة. افتح أياً منها أو احذف ما لا تريده. لا يُحذف أي شيء تلقائياً.",
  },
  app_agent_chats_empty: { en: "No chats yet.", ar: "لا توجد محادثات بعد." },
  app_agent_chat_delete: { en: "Delete this chat", ar: "حذف هذه المحادثة" },
  app_agent_learned: { en: "What the agent learned", ar: "ما تعلّمه الوكيل" },
  app_agent_learned_body: {
    en: "Words you use that the agent remembers. Words used in two different chats become shared with your whole account.",
    ar: "الكلمات التي تستخدمها والتي يتذكرها الوكيل. الكلمات المستخدمة في محادثتين مختلفتين تصبح مشتركة مع حسابك بالكامل.",
  },
  app_agent_learned_empty: { en: "Nothing learned yet.", ar: "لم يتعلّم شيئاً بعد." },
  app_agent_learned_error: {
    en: "Could not load this right now. Your chats still work normally.",
    ar: "تعذّر التحميل الآن. محادثاتك تعمل بشكل طبيعي.",
  },
  app_agent_learned_uses: { en: "uses", ar: "استخدام" },
  app_agent_learned_forget: { en: "Forget this", ar: "نسيان هذه" },
  dash_sub: { en: "Your AI agent activity at a glance.", ar: "نشاط وكيل الذكاء الاصطناعي بنظرة سريعة." },
  dash_add: { en: "Add New Campaign", ar: "أضف حملة جديدة" },
  dash_active: { en: "Currently sending", ar: "يُرسل الآن" },
  dash_activity: { en: "Recent activity", ar: "النشاط الأخير" },
  dash_empty: { en: "No emails sent yet — your AI agent is warming up.", ar: "لم تُرسل رسائل بعد — وكيلك في فترة التسخين." },
  card_won: { en: "Meetings Won", ar: "اجتماعات محققة" },
  stat_emails: { en: "Emails Sent", ar: "رسائل مُرسلة" },
  stat_reply: { en: "Replies", ar: "الردود" },
  btn_launch: { en: "Start", ar: "ابدأ" },
  perk_ab: { en: "Tests which subject line works best", ar: "يختبر أفضل عنوان للرسالة" },
  perk_auto: { en: "AI writes the replies for you", ar: "الذكاء الاصطناعي يكتب الردود نيابة عنك" },
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
