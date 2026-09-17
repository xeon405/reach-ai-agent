// Frontend counterpart to supabase/functions/_shared/app-base-url.ts.
//
// The Deno edge module cannot be imported into the Vite bundle (different
// runtime + module graph), so this file is the client-side single source of
// truth for the public app base URL. When the real domain ships, change ONE
// edit here and ONE edit in the Deno module — both sides stay in lockstep.
//
// Override without a code change by setting VITE_APP_BASE_URL in .env
// (public value — never put secrets in a VITE_ var; it ships to the browser).
export const APP_BASE_URL: string =
  import.meta.env.VITE_APP_BASE_URL ?? "https://outreach-ochre-sigma.vercel.app";
