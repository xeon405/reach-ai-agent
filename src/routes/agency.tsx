import { createFileRoute, Link } from "@tanstack/react-router";
import { EnOnlyNotice } from "@/components/EnOnlyNotice";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/agency")({
  component: AgencyPage,
});

const INCLUDED = [
  { icon: "🎯", title: "Customer research", desc: "We build your ideal-customer list every week — country, niche, company size, you choose." },
  { icon: "✍️", title: "AI-personalized emails", desc: "Every person gets an email written just for them. No templates that read like spam." },
  { icon: "🔁", title: "Automated follow-ups", desc: "Gentle persistence until they answer — up to 5 touches, perfectly timed." },
  { icon: "🤖", title: "AI reply handling", desc: "Replies sorted and answered instantly; the interested ones surface on your radar the moment they reply." },
  { icon: "📊", title: "Weekly report", desc: "Emails sent, opens, replies, booking-intent conversations — one clean email every Monday." },
  { icon: "🛡️", title: "Spam protection", desc: "Safe sending limits, spam-word screening, and unsubscribe handling built in." },
];

const STEPS = [
  { n: 1, title: "Tell us your offer", desc: "Your industry, the country to target, and what you sell. A short email is enough." },
  { n: 2, title: "We set everything up", desc: "We build your customer list and write the emails from your own address — live within 48 hours." },
  { n: 3, title: "Warm replies land in your inbox", desc: "People who are interested reply to you. You take the call and close the deal." },
];

const FAQ = [
  {
    q: "Who is this for?",
    a: "Small teams and business owners who want steady leads but don't want to run the software themselves. Our team operates it for you.",
  },
  {
    q: "Do the emails come from my address?",
    a: "Yes. We send from your own Gmail address, so replies and bookings come straight to you.",
  },
  {
    q: "Is there a contract or lock-in?",
    a: "No lock-in. Plans are monthly and you can cancel anytime. There's a one-time $199 setup fee to build your first campaign.",
  },
  {
    q: "What does the monthly email number mean?",
    a: "It's the sending volume included in your plan (Launch 500, Growth 2,000 per month). We keep safe sending limits so your address stays healthy.",
  },
  {
    q: "What if I'm not happy?",
    a: "We stand behind the work — see our refund policy for the guarantee on your first payment.",
  },
  {
    q: "How is this different from the app?",
    a: "The app is self-serve and starts at $37/month if you run it yourself. This service means our team runs it for you.",
  },
];

function AgencyPage() {
  return (
    <div className="min-h-screen bg-background">
      <EnOnlyNotice />
      <SiteHeader />

      <section className="mx-auto max-w-4xl px-4 pb-16 pt-10 text-center">
        <div className="mx-auto mb-6 w-fit rounded-full border border-primary/30 bg-primary/5 px-4 py-1.5 text-xs font-semibold text-primary">
          Done-For-You Service
        </div>
        <h1 className="font-display text-4xl font-black tracking-tight sm:text-5xl">
          Warm conversations land in your inbox.<br />
          <span className="text-gradient">You close.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
          Our AI sales team finds your ideal customers worldwide, writes them personal emails from your own address, follows up automatically, and hands you warm conversations — starting at{" "}
          <strong className="text-foreground">$299/month</strong>. No ads. No cold calls.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <a href="mailto:outshipai@gmail.com?subject=I%20want%20more%20sales%20calls&body=Tell%20me%20about%20your%20industry%2C%20target%20country%20and%20offer.%0A%0AIndustry:%0ACountry:%0AOffer:%0AMonthly%20email%20volume%20wanted:">
            <Button size="lg" className="bg-gradient-primary px-8 text-base shadow-lg">
              Start finding customers 🚀
            </Button>
          </a>
          <a href="#faq">
            <Button size="lg" variant="outline" className="px-8 text-base">Ask a question</Button>
          </a>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">Setup in 48 hours · No lock-in, cancel anytime · Your data stays yours</p>
        <p className="mt-3 text-sm text-muted-foreground">
          <a href="/#pricing" className="font-medium underline underline-offset-4 hover:text-foreground">
            Rather run it yourself? Self-serve plans start at $37/month →
          </a>
        </p>
      </section>

      <section className="border-t border-border bg-muted/30 py-16">
        <div className="mx-auto max-w-5xl px-4">
          <h2 className="mb-10 text-center font-display text-3xl font-bold tracking-tight">How it works</h2>
          <div className="grid gap-5 sm:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="rounded-2xl border border-border bg-card p-6 shadow-card">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-primary font-bold text-white">{s.n}</div>
                <h3 className="mt-4 font-semibold">{s.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="mx-auto max-w-5xl px-4">
          <h2 className="mb-10 text-center font-display text-3xl font-bold tracking-tight">Everything handled for you</h2>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {INCLUDED.map((f) => (
              <div key={f.title} className="rounded-2xl border border-border bg-card p-6 shadow-card">
                <div className="text-2xl">{f.icon}</div>
                <h3 className="mt-3 font-semibold">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-border bg-muted/30 py-16">
        <div className="mx-auto max-w-4xl px-4 text-center">
          <h2 className="text-3xl font-bold">Simple pricing</h2>
          <div className="mx-auto mt-8 grid max-w-3xl gap-5 sm:grid-cols-2">
            <div className="rounded-3xl border border-border bg-card p-8 shadow-card">
              <div className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Launch</div>
              <div className="mt-3 text-4xl font-extrabold">$299<span className="text-base font-medium text-muted-foreground">/mo</span></div>
              <ul className="mt-6 space-y-2.5 text-left text-sm">
                <li>✅ 500 AI emails / month</li>
                <li>✅ Weekly customer research</li>
                <li>✅ Automated follow-ups</li>
                <li>✅ Weekly report</li>
              </ul>
              <a href="mailto:outshipai@gmail.com?subject=Launch%20plan%20—%20$299/mo">
                <Button className="mt-7 w-full" variant="outline">Start Launch</Button>
              </a>
            </div>
            <div className="relative rounded-3xl border-2 border-primary bg-card p-8 shadow-glow">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-primary px-3 py-1 text-xs font-bold text-white">
                MOST POPULAR
              </div>
              <div className="text-sm font-semibold uppercase tracking-wide text-primary">Growth</div>
              <div className="mt-3 text-4xl font-extrabold">$699<span className="text-base font-medium text-muted-foreground">/mo</span></div>
              <ul className="mt-6 space-y-2.5 text-left text-sm">
                <li>✅ 2,000 AI emails / month</li>
                <li>✅ Multi-country targeting</li>
                <li>✅ Spam-checked AI subject lines</li>
                <li>✅ Priority reply handling</li>
                <li>✅ Dedicated manager</li>
              </ul>
              <a href="mailto:outshipai@gmail.com?subject=Growth%20plan%20—%20$699/mo">
                <Button className="mt-7 w-full bg-gradient-primary">Start Growth</Button>
              </a>
            </div>
          </div>
          <p className="mt-6 text-xs text-muted-foreground">
            One-time setup $199 · Prices in USD · No lock-in, cancel anytime ·{" "}
            <Link to="/refunds" className="underline">Refund policy</Link>
          </p>
        </div>
      </section>

      <section id="faq" className="scroll-mt-20 py-16">
        <div className="mx-auto max-w-3xl px-4">
          <h2 className="mb-10 text-center font-display text-3xl font-bold tracking-tight">Frequently asked questions</h2>
          <div className="space-y-3">
            {FAQ.map((item) => (
              <details key={item.q} className="group rounded-2xl border border-border bg-card p-5 shadow-card">
                <summary className="cursor-pointer list-none font-semibold marker:content-none">
                  <span className="flex items-center justify-between gap-4">
                    {item.q}
                    <span className="text-muted-foreground transition-transform group-open:rotate-45">+</span>
                  </span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-border py-14 text-center">
        <div className="mx-auto max-w-2xl px-4">
          <h2 className="font-display text-2xl font-bold tracking-tight">Ready to fill your calendar?</h2>
          <p className="mt-3 text-muted-foreground">Tell us your industry and target country — we'll set it up within 48 hours.</p>
          <a href="mailto:outshipai@gmail.com?subject=I%20want%20more%20sales%20calls&body=Industry:%0ACountry:%0AOffer:">
            <Button size="lg" className="mt-6 bg-gradient-primary px-8 text-base shadow-lg">Start finding customers 🚀</Button>
          </a>
        </div>
      </section>

      <footer className="border-t border-border py-8 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} OutshipAi ·{" "}
        <Link to="/privacy" className="underline">Privacy</Link>
        <Link to="/terms" className="ml-2 underline">Terms</Link>
        <Link to="/refunds" className="ml-2 underline">Refunds</Link>
        <Link to="/honesty" className="ml-2 underline">Honesty</Link>
      </footer>
    </div>
  );
}
