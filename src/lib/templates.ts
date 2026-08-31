export type Template = {
  niche: string;
  name: string;
  subject: string;
  body: string;
};

export const TEMPLATES: Template[] = [
  {
    niche: "Real Estate",
    name: "Listing exposure audit",
    subject: "{{first_name}}, quick idea for {{company}}'s listings",
    body: "Hi {{first_name}},\n\nI noticed {{company}} has several active listings — are they getting the online attention they deserve?\n\nI run AI-powered email outreach that puts listings in front of qualified buyers automatically. For a firm your size, that usually means 5-10 extra viewings a month without extra ad spend.\n\nWorth a quick 10-minute call this week? Here's my calendar: {{booking_link}}\n\nBest regards,\n{{sender_name}}",
  },
  {
    niche: "Real Estate",
    name: "Expired listing revival",
    subject: "Idea for the unsold listings at {{company}}",
    body: "Hi {{first_name}},\n\nUnsold listings usually aren't a pricing problem — they're an exposure problem.\n\nI help agencies like {{company}} reach hundreds of potential buyers directly in their inbox using automated personalized outreach. No ad budget needed.\n\nOpen to seeing how it works on one listing? I'll show you free.\n\nBest regards,\n{{sender_name}}",
  },
  {
    niche: "Marketing Agencies",
    name: "White-label partnership",
    subject: "Extra revenue stream for {{company}}?",
    body: "Hi {{first_name}},\n\nQuick question — when clients ask {{company}} for email outreach, do you run it in-house or turn it away?\n\nI provide white-label AI outreach: you sell it, we run it, your brand on everything. Agencies typically add $2-4k MRR with zero extra workload.\n\nCan I show you how it works? {{booking_link}}\n\nBest regards,\n{{sender_name}}",
  },
  {
    niche: "Marketing Agencies",
    name: "Capacity overflow",
    subject: "When {{company}} is at capacity…",
    body: "Hi {{first_name}},\n\nEvery agency hits the wall: more clients than hours. That's usually when good retainers get turned away.\n\nMy AI outreach system fills your pipeline automatically — so the next slow month never happens. It runs from your own domain, writes like your best copywriter, and books calls straight into your calendar.\n\nWant to see a sample pipeline built for an agency like {{company}}? {{booking_link}}\n\nBest regards,\n{{sender_name}}",
  },
  {
    niche: "Dental Clinics",
    name: "Patient reactivation",
    subject: "{{first_name}} — your inactive patients list",
    body: "Hi {{first_name}},\n\nMost dental clinics sit on hundreds of patients who haven't booked in 6+ months. They don't need ads — they need a nudge.\n\nI set up AI systems that email those patients personally and bring them back for cleanings and checkups. Clinics typically recover 15-30 patients in the first month.\n\nWould it help if I showed you exactly how? {{booking_link}}\n\nBest regards,\n{{sender_name}}",
  },
  {
    niche: "Dental Clinics",
    name: "High-value treatment bookings",
    subject: "Filling {{company}}'s calendar with implant consults",
    body: "Hi {{first_name}},\n\nImplant and ortho consults are the highest-value appointments in any clinic — but they rarely come from walk-ins.\n\nI run targeted email outreach that educates local patients and books consults directly into your calendar. No ads, no cold calls — just informed patients asking for you by name.\n\nInterested in a free analysis of your local opportunity? {{booking_link}}\n\nBest regards,\n{{sender_name}}",
  },
  {
    niche: "Recruiting / Staffing",
    name: "Candidate sourcing help",
    subject: "Hard-to-fill roles at {{company}}?",
    body: "Hi {{first_name}},\n\nThe best candidates aren't on job boards anymore — they're buried in inboxes nobody reaches.\n\nI build AI outreach pipelines that contact passive candidates personally at scale. Recruiting teams use it to fill senior roles 2-3x faster without LinkedIn costs.\n\nIf {{company}} has a role that's been open too long, I'll show you what's possible. {{booking_link}}\n\nBest regards,\n{{sender_name}}",
  },
  {
    niche: "Recruiting / Staffing",
    name: "BD pipeline for agencies",
    subject: "Who finds YOUR next client, {{first_name}}?",
    body: "Hi {{first_name}},\n\nRecruiters are great at filling other companies' roles — but who fills your own client pipeline?\n\nI automate prospecting for staffing firms: AI finds companies hiring in your niches, emails them personally, and books intro calls while you focus on placements.\n\nWorth 10 minutes? {{booking_link}}\n\nBest regards,\n{{sender_name}}",
  },
  {
    niche: "SaaS / Startups",
    name: "Founder-led sales",
    subject: "{{first_name}}, outbound without hiring an SDR",
    body: "Hi {{first_name}},\n\nMost founders wait too long to hire sales — then pay $80k+ for someone who spends half their day writing emails.\n\nOutshipAi does that part automatically: finds your ideal customers, writes personal emails in your voice, follows up until they answer. Founders book 10-20 demos/month without touching a spreadsheet.\n\nWant me to show you a sample list of your ideal customers? {{booking_link}}\n\nBest regards,\n{{sender_name}}",
  },
  {
    niche: "SaaS / Startups",
    name: "Demo pipeline boost",
    subject: "More demos from your ICP, {{first_name}}",
    body: "Hi {{first_name}},\n\nQuick question: if {{product_area}} demos doubled next month, would capacity be a problem? (Good problem — but a problem.)\n\nI run AI outbound that targets your exact ICP with personal emails from your team's real inboxes. SaaS teams typically see 8-15% reply rates because it doesn't read like spam.\n\nCan I send you 3 sample emails written for {{company}}? {{booking_link}}\n\nBest regards,\n{{sender_name}}",
  },
  {
    niche: "Coaches / Consultants",
    name: "Discovery call machine",
    subject: "{{first_name}}, clients finding YOU vs chasing them",
    body: "Hi {{first_name}},\n\nThe best coaches spend their mornings coaching — not cold DMing strangers.\n\nI set up AI systems that find people actively looking for {{coaching_topic}} help and start conversations with them automatically. Coaches using this book 5-10 discovery calls a week on autopilot.\n\nWant to see what that would look like for {{company}}? {{booking_link}}\n\nBest regards,\n{{sender_name}}",
  },
  {
    niche: "E-commerce",
    name: "Wholesale/B2B channel",
    subject: "A B2B channel {{company}} isn't using yet",
    body: "Hi {{first_name}},\n\nMost DTC brands live and die by ad costs. But there's a quieter channel: direct outreach to boutiques, retailers, and corporate buyers who stock products like yours.\n\nI automate that outreach — personalized emails to thousands of potential stockists. Brands typically land their first 3-5 wholesale accounts in month one.\n\nCurious what {{product_type}} buyers exist in your region? {{booking_link}}\n\nBest regards,\n{{sender_name}}",
  },
  {
    niche: "Gyms / Fitness",
    name: "Membership revival",
    subject: "{{first_name}} — the members who stopped coming",
    body: "Hi {{first_name}},\n\nEvery gym has a silent leak: members who quietly stopped showing up and eventually cancelled.\n\nI build AI win-back campaigns that reach those people personally — with the right message at the right moment. Gyms typically reactivate 10-20% of lapsed members within weeks.\n\nWant to see the exact emails that do it? {{booking_link}}\n\nBest regards,\n{{sender_name}}",
  },
  {
    niche: "Law Firms",
    name: "Corporate client development",
    subject: "Business development without billable-hour guilt, {{first_name}}",
    body: "Hi {{first_name}},\n\nPartners lose dozens of billable hours a year to manual business development — with mixed results.\n\nI run AI outreach for law firms: it identifies companies needing {{practice_area}}, starts conversations, and only involves partners when there's genuine interest.\n\nWould a quiet pilot for {{company}} be worth exploring? {{booking_link}}\n\nBest regards,\n{{sender_name}}",
  },
  {
    niche: "Accounting / Finance",
    name: "Advisory upgrade",
    subject: "Turning compliance clients into advisory clients",
    body: "Hi {{first_name}},\n\nCompliance work pays the bills; advisory work builds the firm. The gap? Most accountants never systematically pitch advisory to existing clients.\n\nI automate that conversation — identifying which clients of {{company}} have advisory-relevant events (growth, funding, restructuring) and starting those discussions.\n\nWorth exploring before tax season? {{booking_link}}\n\nBest regards,\n{{sender_name}}",
  },
  {
    niche: "Home Services",
    name: "Commercial contracts",
    subject: "Recurring revenue idea for {{company}}",
    body: "Hi {{first_name}},\n\nResidential jobs keep the crew busy; commercial contracts make the business valuable.\n\nI reach out to property managers and facility directors in your area on your behalf — personalized emails that land maintenance contracts, not one-off jobs.\n\nWant to see a list of who needs {{service_type}} near you? {{booking_link}}\n\nBest regards,\n{{sender_name}}",
  },
  {
    niche: "Photography / Creative",
    name: "Corporate bookings",
    subject: "Corporate clients for {{company}}?",
    body: "Hi {{first_name}},\n\nWeddings and portrait sessions are feast-or-famine. Corporate work — headshots, events, brand content — is the steady retainer most studios want but rarely chase.\n\nI put {{company}} in front of marketing managers and HR directors monthly, so bookings come to you between shoots.\n\nShall I show you the local demand map? {{booking_link}}\n\nBest regards,\n{{sender_name}}",
  },
  {
    niche: "IT / MSPs",
    name: "IT audit offer",
    subject: "Free IT risk snapshot for {{company}}",
    body: "Hi {{first_name}},\n\nMost growing companies discover their IT gaps during a crisis — ransomware, an outage, a departed admin.\n\nI help MSPs reach those companies BEFORE the crisis with a free risk-snapshot offer delivered via personalized email. MSPs convert 5-10% of replies into paying clients.\n\nWant me to run this playbook for {{company}}? {{booking_link}}\n\nBest regards,\n{{sender_name}}",
  },
  {
    niche: "Insurance",
    name: "Policy review campaign",
    subject: "{{first_name}}, businesses overpaying without knowing",
    body: "Hi {{first_name}},\n\nCompanies change size, staff, and risk profile every year — but policies rarely keep up. That gap means lost premiums for brokers and gaps for clients.\n\nI run annual policy-review outreach for insurance professionals: automated, personal, compliant. Brokers typically write 20-40% more renewals.\n\nWould a pilot for your book of business help? {{booking_link}}\n\nBest regards,\n{{sender_name}}",
  },
  {
    niche: "Restaurants / Hospitality",
    name: "Catering & events B2B",
    subject: "Corporate catering leads for {{company}}",
    body: "Hi {{first_name}},\n\nWeekend rush is unpredictable; corporate catering contracts arrive every single month — office parties, client lunches, conferences.\n\nI connect {{company}} with office managers planning those events through personal email outreach. Restaurants typically add $2-6k/month in predictable catering revenue.\n\nWant a sample of upcoming opportunities near you? {{booking_link}}\n\nBest regards,\n{{sender_name}}",
  },
];
