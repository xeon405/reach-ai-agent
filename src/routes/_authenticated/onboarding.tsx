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
import { ArrowRight, Check, Mail, Rocket } from "lucide-react";

export const Route = createFileRoute("/_authenticated/onboarding")({
  component: Onboarding,
});

const COUNTRIES = ["USA", "UK", "Australia", "Canada", "Europe", "Global"];

function Onboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [jobTitle, setJobTitle] = useState("");
  const [industry, setIndustry] = useState("");
  const [companySize, setCompanySize] = useState("10-50");
  const [countries, setCountries] = useState<string[]>(["USA"]);
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [offer, setOffer] = useState("");
  const [gmailConnected, setGmailConnected] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: p } = await supabase.from("profiles").select("*").eq("id", data.user.id).single();
      if (p) {
        setName(p.name ?? "");
        setCompany(p.company ?? "");
        setOffer(p.offer ?? "");
        setGmailConnected(p.gmail_connected ?? false);
      }
    });
  }, []);

  function toggleCountry(c: string) {
    setCountries((cs) => cs.includes(c) ? cs.filter((x) => x !== c) : [...cs, c]);
  }

  async function launch() {
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const icp = { jobTitle, industry, companySize, countries };
    const { error } = await supabase.from("profiles").update({
      name, company, offer, icp, onboarded: true,
    }).eq("id", u.user.id);
    if (error) { toast.error(error.message); setSaving(false); return; }
    await supabase.from("campaigns").insert({
      user_id: u.user.id,
      name: `${industry || "ICP"} Outreach`,
      status: "active",
      target_icp: icp,
    });
    toast.success("Your AI agent is live!");
    navigate({ to: "/dashboard" });
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Set up your AI agent</h1>
        <span className="text-sm text-muted-foreground">Step {step} of 3</span>
      </div>

      <div className="mb-8 flex gap-2">
        {[1, 2, 3].map((s) => (
          <div key={s} className={`h-1.5 flex-1 rounded-full ${s <= step ? "bg-gradient-primary" : "bg-muted"}`} />
        ))}
      </div>

      <div className="rounded-2xl border border-border bg-card p-8 shadow-card">
        {step === 1 && (
          <div className="space-y-5">
            <h2 className="text-xl font-semibold">Who is your ideal customer?</h2>
            <div className="space-y-1.5">
              <Label>Job Title</Label>
              <Input placeholder="e.g. Marketing Manager" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Industry</Label>
              <Input placeholder="e.g. SaaS, E-commerce, Real Estate" value={industry} onChange={(e) => setIndustry(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Company Size</Label>
              <Select value={companySize} onValueChange={setCompanySize}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1-10">1-10</SelectItem>
                  <SelectItem value="10-50">10-50</SelectItem>
                  <SelectItem value="50-200">50-200</SelectItem>
                  <SelectItem value="200+">200+</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Target Countries</Label>
              <div className="flex flex-wrap gap-2">
                {COUNTRIES.map((c) => (
                  <button key={c} type="button" onClick={() => toggleCountry(c)}
                    className={`rounded-full border px-3 py-1.5 text-sm transition ${countries.includes(c) ? "border-primary bg-primary/15 text-primary" : "border-border hover:bg-accent/30"}`}>
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <Button className="w-full bg-gradient-primary shadow-glow" onClick={() => setStep(2)}>
              Next <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <h2 className="text-xl font-semibold">Your email details</h2>
            <div className="space-y-1.5">
              <Label>Your Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Alex Founder" />
            </div>
            <div className="space-y-1.5">
              <Label>Your Company Name</Label>
              <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Acme Inc." />
            </div>
            <div className="space-y-1.5">
              <Label>What you offer</Label>
              <Textarea rows={4} value={offer} onChange={(e) => setOffer(e.target.value)}
                placeholder="One-sentence pitch for your product or service." />
            </div>
            <Button variant={gmailConnected ? "secondary" : "outline"} className="w-full"
              onClick={() => { window.location.href = buildGmailAuthUrl(); }}>
              <Mail className="mr-2 h-4 w-4" />
              {gmailConnected ? "Gmail Connected" : "Connect Gmail"}
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
              <Button className="flex-1 bg-gradient-primary shadow-glow" onClick={() => setStep(3)}>
                Next <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5">
            <h2 className="text-xl font-semibold">Review &amp; launch</h2>
            <div className="rounded-xl border border-border bg-background/40 p-5 text-sm">
              <Row label="Ideal customer">{jobTitle || "—"} at {industry || "—"} ({companySize})</Row>
              <Row label="Countries">
                <div className="flex flex-wrap gap-1">
                  {countries.map((c) => <Badge key={c} variant="secondary">{c}</Badge>)}
                </div>
              </Row>
              <Row label="Sender">{name || "—"} · {company || "—"}</Row>
              <Row label="Offer">{offer || "—"}</Row>
              <Row label="Gmail">
                {gmailConnected ? <span className="inline-flex items-center gap-1 text-success"><Check className="h-3.5 w-3.5"/> Connected</span> : "Not connected"}
              </Row>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
              <Button className="flex-1 bg-gradient-primary shadow-glow" onClick={launch} disabled={saving}>
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
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{children}</span>
    </div>
  );
}
