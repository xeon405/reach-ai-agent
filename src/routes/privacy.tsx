import { createFileRoute } from "@tanstack/react-router";
import { EnOnlyNotice } from "@/components/EnOnlyNotice";
import { Logo } from "@/components/Logo";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [{ title: "Privacy Policy — OutshipAi" }],
  }),
  component: Privacy,
});

function Privacy() {
  return (
    <div className="min-h-screen bg-background">
        <EnOnlyNotice />
      <div className="mx-auto max-w-3xl px-4 py-12">
        <div className="mb-10"><Logo /></div>
        <h1 className="text-3xl font-bold tracking-tight">Privacy Policy</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: August 22, 2026</p>

        <div className="mt-8 space-y-8 text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold">1. What we collect</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li><strong>Account data:</strong> your name, email address, and company.</li>
              <li><strong>Gmail access:</strong> OAuth tokens allowing the Service to send emails on your behalf via your Google account. Tokens are stored encrypted-at-rest in our database (Supabase).</li>
              <li><strong>Email data:</strong> the contact details you import or find through the Service, and the emails sent to them.</li>
              <li><strong>Usage data:</strong> plan, sending counters, and product telemetry needed to operate the Service.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold">2. How we use it</h2>
            <p className="mt-2">
              Data is used only to operate the Service: finding customers, generating and sending
              emails, follow-ups, billing, and support. We do not sell your personal data or your
              contacts' data.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">3. Third parties</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li><strong>Supabase</strong> — database, authentication, and serverless functions.</li>
              <li><strong>Google</strong> — Gmail API for sending emails from your account.</li>
              <li><strong>Apollo</strong> — business contact database used when you search for customers.</li>
              <li><strong>Groq</strong> — AI model provider used to draft emails, generate subject lines, and classify incoming replies (reply subject/preview only — never full message bodies).</li>
              <li>Our payment provider processes subscription payments on our behalf. We never see or store your full card details.</li>
            </ul>
            <p className="mt-2">
              Use of Gmail API data is limited to the practices described here and complies with
              Google's API Services User Data Policy, including the Limited Use requirements.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">4. Data retention &amp; deletion</h2>
            <p className="mt-2">
              Deleting your account removes your profile, contacts, and email records, and
              revokes stored Gmail tokens. Some billing records are retained as required by law.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">5. Your rights</h2>
            <p className="mt-2">
              Depending on your location you may have rights to access, correct, export, or delete
              your personal data. Contact outreachai.team@gmail.com to exercise them.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">6. Contact</h2>
            <p className="mt-2">Privacy questions? Email outreachai.team@gmail.com.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
