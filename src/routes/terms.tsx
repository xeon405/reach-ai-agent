import { createFileRoute } from "@tanstack/react-router";
import { EnOnlyNotice } from "@/components/EnOnlyNotice";
import { Logo } from "@/components/Logo";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — OutshipAi" },
      {
        name: "description",
        content:
          "The terms for using OutshipAi: your account, acceptable use, sending limits, billing, and liability — in plain English.",
      },
    ],
  }),
  component: Terms,
});

function Terms() {
  return (
    <div className="min-h-screen bg-background">
        <EnOnlyNotice />
      <div className="mx-auto max-w-3xl px-4 py-12">
        <div className="mb-10"><Logo /></div>
        <h1 className="text-3xl font-bold tracking-tight">Terms of Service</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: August 22, 2026</p>

        <div className="mt-8 space-y-8 text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold">1. Acceptance</h2>
            <p className="mt-2">
              By creating an account or using OutshipAi ("the Service"), you agree to these Terms.
              If you do not agree, do not use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">2. The Service</h2>
            <p className="mt-2">
              OutshipAi finds business contacts, drafts personal emails using artificial
              intelligence, and sends them through your own Gmail account, including automated
              follow-ups.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">3. Your responsibilities</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>You are solely responsible for the emails sent from your account.</li>
              <li>You must comply with all applicable anti-spam laws, including the US CAN-SPAM Act: honor opt-out requests promptly, include accurate sender information, and only email recipients where you have a lawful basis.</li>
              <li>You must not use the Service to send unlawful, harassing, deceptive, or unsolicited bulk messages in violation of any law or provider terms.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold">4. AI-generated content</h2>
            <p className="mt-2">
              Emails are generated automatically by AI. You should review content before it is sent
              to real people. We disclose in each email that it was written by an AI agent.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">5. Subscriptions &amp; billing</h2>
            <p className="mt-2">
              Paid plans renew monthly until cancelled. You can cancel at any time from the Billing
              page. Payments are processed securely by our payment provider; we never see or store your full card details.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">6. Account termination</h2>
            <p className="mt-2">
              We may suspend or terminate accounts that violate these Terms or abuse the Service.
              You may delete your account at any time from Settings.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">7. Disclaimer</h2>
            <p className="mt-2">
              The Service is provided "as is" without warranties of any kind. We are not liable for
              lost profits, whether emails reach the inbox, or damages arising from your use of the Service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">8. Refund Policy (Right of Return)</h2>
            <p className="mt-2">Every paid plan includes a <strong>14-day money-back guarantee on your first payment</strong> — no forms and no reason needed. To request a refund, email support within 14 days of your payment and it will be processed in full on an account in good standing (not suspended for spam or abuse). Additionally, if a hidden defect is discovered that we cannot fix promptly, you are entitled to a full refund at any point during your subscription.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">9. Honest Pricing &amp; Exact Limits</h2>
            <p className="mt-2">The price displayed for each plan is the complete price — there are no hidden fees, no overage charges, and no automatic surprise renewals beyond the stated subscription. Each plan states its exact daily and monthly email caps; the sending agent hard-stops at those limits. We do not use artificial scarcity, fake discounts, or invented urgency in any of our marketing.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">10. Contact</h2>
            <p className="mt-2">
              For questions, support, refunds, or any concern about these Terms, contact our team
              at{" "}
              <a href="mailto:outshipai@gmail.com" className="text-primary underline underline-offset-4">
                outshipai@gmail.com
              </a>
              . We respond within 24 hours.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
