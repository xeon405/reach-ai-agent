import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { buildGmailAuthUrl } from "@/lib/gmail-oauth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowRight, ArrowLeft, Check, Mail, Rocket } from "lucide-react";

export const Route = createFileRoute("/_authenticated/onboarding")({
  component: Onboarding,
});

const COUNTRIES = [
  "United States", "United Kingdom", "Canada", "Australia", "India",
  "Germany", "France", "Spain", "Netherlands", "Singapore",
  "United Arab Emirates", "South Africa", "Nigeria", "Brazil", "Global",
];

const TOTAL_STEPS = 5;

function Onboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [gmailConnected, setGmailConnected] = useState(false);

  // Step 1: Your Business
  const [businessDescription, setBusinessDescription] = useState("");
  const [offer, setOffer] = useState("");
  const [problemSolved, setProblemSolved] = useState("");

  // Step 2: Target Customer
  const [targetCustomer, setTargetCustomer] = useState("");
  const [jobTitles, setJobTitles] = useState("");
  const [industries, setIndustries] = useState("");
  const [countries, setCountries] = useState<string[]>([]);
  const [cities, setCities] = useState("");
  const [companySize, setCompanySize] = useState("1-50");

  // Step 3: Links & Assets
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [bookingLink, setBookingLink] = useState("");
  const [hasProductImage, setHasProductImage] = useState(false);

  // Step 4: Voice & Guardrails
  const [communicationStyle, setCommunicationStyle] = useState("");
  const [dontClaim, setDontClaim] = useState("");
  const [signature, setSignature] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: p } = await supabase.from("profiles").select("*").eq("id", data.user.id).single();
      if (p) {
        setName(p.name ?? "");
        setCompany(p.company ?? "");
        setOffer(p.offer ?? "");
        setWebsiteUrl(p.website_url ?? "");
        setBookingLink(p.booking_link ?? "");
        setSignature(p.signature ?? "");
        setGmailConnected(p.gmail_connected ?? false);
        setBusinessDescription(p.business_description ?? "");
        setProblemSolved(p.problem_solved ?? "");
        setTargetCustomer(p.target_customer ?? "");
        setCountries((p.icp as Record<string, string[]> | null)?.countries ?? []);
        setCities((p.cities ?? []).join(", "));
        setCompanySize((p.icp as Record<string, string> | null)?.companySize ?? "1-50");
        setJobTitles((p.icp as Record<string, string> | null)?.jobTitle ?? "");
        setIndustries((p.icp as Record<string, string> | null)?.industry ?? "");
        setCommunicationStyle(p.communication_style ?? "");
        setDontClaim(p.dont_claim ?? "");
        setHasProductImage(p.has_product_image ?? false);
      }
    });
  }, []);

  function toggleCountry(c: string) {
    setCountries((cs) => cs.includes(c) ? cs.filter((x) => x !== c) : [...cs, c]);
  }

  async function launch() {
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { setSaving(false); return; }

    const icp = {
      jobTitle: jobTitles || null,
      industry: industries || null,
      companySize,
      countries,
    };
    const citiesArray = cities.split(",").map((c) => c.trim()).filter(Boolean);

    const { error } = await supabase.from("profiles").update({
      name,
      company: company || null,
      offer: offer || null,
      icp,
      website_url: websiteUrl.trim() || null,
      booking_link: bookingLink.trim() || null,
      signature: signature.trim() || null,
      business_description: businessDescription.trim() || null,
      problem_solved: problemSolved.trim() || null,
      target_customer: targetCustomer.trim() || null,
      cities: citiesArray.length > 0 ? citiesArray : null,
      communication_style: communicationStyle.trim() || null,
      dont_claim: dontClaim.trim() || null,
      has_product_image: hasProductImage,
      onboarded: true,
    }).eq("id", u.user.id);

    if (error) { toast.error(error.message); setSaving(false); return; }

    await supabase.from("campaigns").insert({
      user_id: u.user.id,
      name: `${industries || "ICP"} Outreach`,
      status: "active",
      target_icp: icp,
    });

    toast.success("Your AI agent is configured and ready!");
    navigate({ to: "/dashboard" });
  }

  const canNext = () => {
    if (step === 1) return businessDescription.trim().length > 0 || offer.trim().length > 0;
    if (step === 2) return countries.length > 0;
    return true;
  };

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Set up your AI agent</h1>
        <span className="text-sm text-muted-foreground">Step {step} of {TOTAL_STEPS}</span>
      </div>

      <div className="mb-8 flex gap-2">
        {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((s) => (
          <div key={s} className={`h-1.5 flex-1 rounded-full ${s <= step ? "bg-primary" : "bg-muted"}`} />
        ))}
      </div>

      <div className="rounded-lg border border-border bg-card p-6">

        {/* STEP 1: Your Business */}
        {step === 1 && (
          <div className="space-y-5">
            <h2 className="text-xl font-semibold">Tell us about your business</h2>
            <p className="text-sm text-muted-foreground">This helps the AI understand what you do before writing any outreach.</p>
            <div className="space-y-1.5">
              <Label>What is your business? *</Label>
              <Textarea rows={3} value={businessDescription} onChange={(e) => setBusinessDescription(e.target.value)}
                placeholder="e.g. We build AI-powered sales automation software for B2B companies." />
              <p className="text-xs text-muted-foreground">One or two sentences describing what your company does.</p>
            </div>
            <div className="space-y-1.5">
              <Label>What product or service are you selling? *</Label>
              <Textarea rows={3} value={offer} onChange={(e) => setOffer(e.target.value)}
                placeholder="e.g. A monthly SaaS subscription that automates cold email outreach with AI-generated personalized messages." />
              <p className="text-xs text-muted-foreground">Be specific — the AI will use this exact pitch in emails.</p>
            </div>
            <div className="space-y-1.5">
              <Label>What problem does it solve?</Label>
              <Textarea rows={3} value={problemSolved} onChange={(e) => setProblemSolved(e.target.value)}
                placeholder="e.g. Sales teams waste hours writing cold emails that get ignored. Our tool sends personalized outreach that gets 3x more replies." />
              <p className="text-xs text-muted-foreground">Why should anyone care? What pain do you take away?</p>
            </div>
            <div className="flex gap-2">
              <Button className="flex-1 bg-primary" onClick={() => setStep(2)} disabled={!canNext()}>
                Next <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* STEP 2: Target Customer */}
        {step === 2 && (
          <div className="space-y-5">
            <h2 className="text-xl font-semibold">Who is your ideal customer?</h2>
            <p className="text-sm text-muted-foreground">The AI uses this to decide who to email and how to personalize each message.</p>
            <div className="space-y-1.5">
              <Label>Describe your ideal customer</Label>
              <Textarea rows={3} value={targetCustomer} onChange={(e) => setTargetCustomer(e.target.value)}
                placeholder="e.g. Marketing directors at mid-size SaaS companies who are struggling to generate pipeline through outbound." />
              <p className="text-xs text-muted-foreground">Free-text description — the AI reads this to understand who you're after.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Job titles</Label>
                <Input value={jobTitles} onChange={(e) => setJobTitles(e.target.value)}
                  placeholder="e.g. Marketing Manager, VP Sales, CEO" />
                <p className="text-xs text-muted-foreground">Comma-separated</p>
              </div>
              <div className="space-y-1.5">
                <Label>Industries</Label>
                <Input value={industries} onChange={(e) => setIndustries(e.target.value)}
                  placeholder="e.g. SaaS, E-commerce, Real Estate" />
                <p className="text-xs text-muted-foreground">Comma-separated</p>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Company size</Label>
              <Select value={companySize} onValueChange={setCompanySize}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1-10">1-10 employees</SelectItem>
                  <SelectItem value="10-50">10-50 employees</SelectItem>
                  <SelectItem value="50-200">50-200 employees</SelectItem>
                  <SelectItem value="200+">200+ employees</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Target countries *</Label>
              <div className="flex flex-wrap gap-2">
                {COUNTRIES.map((c) => (
                  <button key={c} type="button" onClick={() => toggleCountry(c)}
                    className={`rounded-full border px-3 py-1.5 text-sm transition ${countries.includes(c) ? "border-primary bg-primary/15 text-primary" : "border-border hover:bg-accent/30"}`}>
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Cities or regions (optional)</Label>
              <Input value={cities} onChange={(e) => setCities(e.target.value)}
                placeholder="e.g. New York, London, Singapore" />
              <p className="text-xs text-muted-foreground">Comma-separated. Leave blank for nationwide.</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(1)}><ArrowLeft className="mr-2 h-4 w-4" /> Back</Button>
              <Button className="flex-1 bg-primary" onClick={() => setStep(3)} disabled={!canNext()}>
                Next <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* STEP 3: Links & Assets */}
        {step === 3 && (
          <div className="space-y-5">
            <h2 className="text-xl font-semibold">Your details &amp; links</h2>
            <p className="text-sm text-muted-foreground">How the AI represents you and where it sends people.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Your name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Alex Rivera" />
              </div>
              <div className="space-y-1.5">
                <Label>Company name</Label>
                <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Acme Inc." />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Website or app URL</Label>
              <Input value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} placeholder="https://yourproduct.com" />
              <p className="text-xs text-muted-foreground">The AI reads this to answer lead questions and direct people to your site.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Booking link (optional)</Label>
<Input value={bookingLink} onChange={(e) => setBookingLink(e.target.value)} placeholder="https://cal.com/you/15min" />
 <p className="text-xs text-muted-foreground">Added to outbound emails so leads can book a call. To track confirmed bookings automatically, head to Settings after launch and wire up the Calendly webhook.</p>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-border bg-background/40 p-4">
              <input type="checkbox" checked={hasProductImage} onChange={(e) => setHasProductImage(e.target.checked)}
                className="h-4 w-4 rounded border-input accent-primary" />
              <div>
                <div className="text-sm font-medium">I have a product/demo image to include</div>
                <div className="text-xs text-muted-foreground">You can upload it later in Settings.</div>
              </div>
            </div>
            <Button variant={gmailConnected ? "secondary" : "outline"} className="w-full"
              onClick={() => { window.location.href = buildGmailAuthUrl(); }}>
              <Mail className="mr-2 h-4 w-4" />
              {gmailConnected ? "Gmail Connected" : "Connect Gmail"}
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(2)}><ArrowLeft className="mr-2 h-4 w-4" /> Back</Button>
              <Button className="flex-1 bg-primary" onClick={() => setStep(4)}>
                Next <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* STEP 4: Voice & Guardrails */}
        {step === 4 && (
          <div className="space-y-5">
            <h2 className="text-xl font-semibold">How the AI communicates</h2>
            <p className="text-sm text-muted-foreground">Set the tone and guardrails — what the AI should and should never say.</p>
            <div className="space-y-1.5">
              <Label>What should OutshipAi communicate?</Label>
              <Textarea rows={4} value={communicationStyle} onChange={(e) => setCommunicationStyle(e.target.value)}
                placeholder="e.g. Be direct and value-focused. Lead with ROI. Sound like a peer, not a salesperson. Always mention our free trial." />
              <p className="text-xs text-muted-foreground">Tone, key messages, things to always include. The AI follows these instructions.</p>
            </div>
            <div className="space-y-1.5">
              <Label>What should OutshipAi NEVER claim?</Label>
              <Textarea rows={4} value={dontClaim} onChange={(e) => setDontClaim(e.target.value)}
                placeholder="e.g. Never promise specific revenue numbers. Never claim we're endorsed by competitors. Never mention pricing — book a call for that." />
              <p className="text-xs text-muted-foreground">Guardrails — the AI will not say anything you list here.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Email signature (optional)</Label>
              <Textarea rows={3} value={signature} onChange={(e) => setSignature(e.target.value)}
                placeholder={"Alex Rivera\nFounder, Acme Inc.\n+1 555 010 2030"} />
              <p className="text-xs text-muted-foreground">Appended to every outbound email.</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(3)}><ArrowLeft className="mr-2 h-4 w-4" /> Back</Button>
              <Button className="flex-1 bg-primary" onClick={() => setStep(5)}>
                Review &amp; Launch <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* STEP 5: Review & Launch */}
        {step === 5 && (
          <div className="space-y-5">
            <h2 className="text-xl font-semibold">Review your setup</h2>
            <div className="rounded-xl border border-border bg-background/40 p-5 text-sm space-y-0.5">
              <Row label="Your business">{businessDescription || "—"}</Row>
              <Row label="Product / service">{offer || "—"}</Row>
              <Row label="Problem solved">{problemSolved || "—"}</Row>
              <Row label="Ideal customer">{targetCustomer || "—"}</Row>
              <Row label="Job titles">{jobTitles || "—"}</Row>
              <Row label="Industries">{industries || "—"}</Row>
              <Row label="Company size">{companySize}</Row>
              <Row label="Countries">
                <div className="flex flex-wrap gap-1">
                  {countries.map((c) => <Badge key={c} variant="secondary">{c}</Badge>)}
                  {countries.length === 0 && "—"}
                </div>
              </Row>
              <Row label="Cities">{cities || "Nationwide"}</Row>
              <Row label="Sender">{name || "—"} {company ? `· ${company}` : ""}</Row>
              <Row label="Website">{websiteUrl || "—"}</Row>
              <Row label="Booking link">{bookingLink || "—"}</Row>
              <Row label="Voice">{communicationStyle || "Default (professional, direct)"}</Row>
              <Row label="Never claim">{dontClaim || "None set"}</Row>
              <Row label="Gmail">
                {gmailConnected
                  ? <span className="inline-flex items-center gap-1 text-success"><Check className="h-3.5 w-3.5" /> Connected</span>
                  : "Not connected — you can do this later"}
              </Row>
            </div>
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground">
              The AI will use everything above to write personalized outreach. It will not invent facts about your product — only use what you've told it here and what it reads from your website.
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(4)}><ArrowLeft className="mr-2 h-4 w-4" /> Back</Button>
              <Button className="flex-1 bg-primary" onClick={launch} disabled={saving}>
                <Rocket className="mr-2 h-4 w-4" /> Launch My AI Agent
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/60 py-2.5 last:border-0">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-right font-medium">{children}</span>
    </div>
  );
}
