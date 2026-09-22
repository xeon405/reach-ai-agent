// supabase/functions/_shared/app-base-url.ts — THE ONE shared frontend base URL.
// Every clickable link this agent can put in front of a lead (the digest's
// per-lead /lead-edit/{uuid}, its /leads fallback, the unsubscribe footer)
// reads APP_BASE_URL from THIS single file. Change ONE line when a real domain
// ships; no other file moves anything.
//
// Byte-truth (proven by curl on this box):
//   out-ship.com  -> HTTP 200 (and /lead-edit/{uuid} -> 200)
//   www.out-ship.com -> HTTP 200 (redirects to apex)
export const APP_BASE_URL = "https://out-ship.com";
