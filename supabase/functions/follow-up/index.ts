// DEPRECATED — split into `send-worker` (outbound) and `inbox-agent` (inbound).
// Kept as an informational shim so stale cron triggers get a clear answer.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve((_req) =>
  new Response(
    JSON.stringify({
      deprecated: true,
      message: "This agent was split. Outbound → send-worker. Inbound → inbox-agent.",
    }),
    { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  )
);
