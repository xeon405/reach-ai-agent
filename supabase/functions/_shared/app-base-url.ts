// supabase/functions/_shared/app-base-url.ts — THE ONE shared frontend base URL.
// Every clickable link this agent can put in front of a lead (the digest's
// per-lead /lead-edit/{uuid}, its /leads fallback, the unsubscribe footer)
// reads APP_BASE_URL from THIS single file. Change ONE line when a real domain
// ships; no other file moves anything.
//
// Byte-truth (proven by curl on this box):
//   outreach-ochre-sigma.vercel.app  -> HTTP 200 (and /lead-edit/{uuid} -> 200)
//   app.reach-ai.dev                -> HTTP 000, no DNS record from this box
export const APP_BASE_URL = "https://outreach-ochre-sigma.vercel.app";
