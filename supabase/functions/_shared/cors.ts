// Shared CORS config — restrict to the production frontend origin.
// Cron-only functions should omit CORS headers entirely (they're not called from browsers).

const ALLOWED_ORIGINS = [
  "https://outreach-ochre-sigma.vercel.app",
  "https://reach-ai-agent.vercel.app",
  "http://localhost:5173",
  "http://localhost:3000",
];

export function getCorsHeaders(req?: Request): Record<string, string> {
  const origin = req?.headers?.get("origin") ?? "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret, x-guest-id",
    "Vary": "Origin",
  };
}

export function corsResponse(req?: Request): Response {
  return new Response("ok", { headers: getCorsHeaders(req) });
}

export function jsonCors(body: unknown, status = 200, req?: Request): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}
