// Live check of generate-email against the fact writer. Creates a temporary
// user, generates one draft, prints the response, deletes the user.
// Run: node scripts/.stage8/live-fact-test.mjs
const URL = process.env.SUPABASE_URL;
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_PUBLISHABLE_KEY;

const h = (extra = {}) => ({ "Content-Type": "application/json", apikey: ANON, ...extra });
const email = `fact-test-${Date.now()}@example.com`;
const password = `T-${Math.random().toString(36).slice(2)}-${Date.now()}`;

let userId = null;
try {
  const created = await fetch(`${URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: h({ Authorization: `Bearer ${SR}` }),
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const user = await created.json();
  if (!created.ok) throw new Error("create user: " + JSON.stringify(user));
  userId = user.id;

  const login = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: h(),
    body: JSON.stringify({ email, password }),
  });
  const session = await login.json();
  if (!login.ok) throw new Error("login: " + JSON.stringify(session));
  const token = session.access_token;

  const leadRes = await fetch(`${URL}/rest/v1/leads`, {
    method: "POST",
    headers: h({ Authorization: `Bearer ${token}`, Prefer: "return=representation" }),
    body: JSON.stringify({
      user_id: userId,
      name: "Sam Whitfield",
      company: "Bright Smile Dental",
      job_title: "Owner",
      category: "Dental clinic",
      city: "Leeds",
      address: "12 Kirkgate, Leeds LS1 6BY",
      rating: 4.6,
      website: "https://brightsmile.example",
      phone: "+44 113 000 0000",
    }),
  });
  const lead = await leadRes.json();
  if (!leadRes.ok) throw new Error("lead: " + JSON.stringify(lead));

  const gen = await fetch(`${URL}/functions/v1/generate-email`, {
    method: "POST",
    headers: h({ Authorization: `Bearer ${token}` }),
    body: JSON.stringify({
      leadId: lead[0].id,
      leadName: "Sam Whitfield",
      leadCompany: "Bright Smile Dental",
      leadJobTitle: "Owner",
      yourCompany: "OutshipAi",
      yourOffer: "we help clinics fill quiet afternoon slots",
    }),
  });
  const out = await gen.json();
  console.log("status", gen.status);
  console.log(JSON.stringify(out, null, 2));
} catch (err) {
  console.error("ERROR", err.message);
  process.exitCode = 1;
} finally {
  if (userId) {
    await fetch(`${URL}/auth/v1/admin/users/${userId}`, {
      method: "DELETE",
      headers: h({ Authorization: `Bearer ${SR}` }),
    });
    console.log("temp user deleted");
  }
}
