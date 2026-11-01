// ============================================================
// SIGNUP-SIGNAL — record the device and network a signup came from.
//
// Purpose: OBSERVATION ONLY. Nothing in this function blocks, delays or
// challenges anyone. A sold laptop, a shared office PC and a family computer
// all look identical to "the same device", so blocking on this signal would
// punish innocent buyers. The signal exists so the operator can SEE a pattern
// (e.g. 12 accounts from one machine) and decide later, with evidence.
//
// What is stored:
//   device_id  — random UUID the client generates once and keeps in
//                localStorage. Not a fingerprint: it identifies a browser
//                profile, not a person.
//   ip_hash    — sha256(salt + ip). The raw IP is never stored, so the table
//                cannot be used to geolocate or identify a visitor.
//   user_agent — as sent, for a human reading the row.
//
// One row per (user, device). A second login from the same browser writes
// nothing, otherwise this table would become a login log and the actual signup
// pattern would be lost in noise.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** First hop of x-forwarded-for is the real client at Supabase's edge. */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for") ?? "";
  const first = xff.split(",")[0].trim();
  if (first) return first;
  return req.headers.get("cf-connecting-ip")?.trim() ?? "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const env = Deno.env.toObject();
    const db = createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return json({ ok: false }, 401);
    const { data: { user }, error: authErr } = await db.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authErr || !user) return json({ ok: false }, 401);

    const body = await req.json().catch(() => ({}));
    const deviceId = String(body?.device_id ?? "").trim().slice(0, 64);
    if (!deviceId) return json({ ok: true, recorded: false, reason: "no_device_id" });

    // Already seen this pair — nothing to add.
    const { data: existing } = await db
      .from("signup_signals")
      .select("id")
      .eq("user_id", user.id)
      .eq("device_id", deviceId)
      .maybeSingle();
    if (existing) return json({ ok: true, recorded: false, reason: "already_recorded" });

    const ip = clientIp(req);
    const salt = env.SIGNAL_SALT ?? env.SUPABASE_SERVICE_ROLE_KEY!;
    const ipHash = ip ? await sha256Hex(`${salt}:${ip}`) : null;

    const { error } = await db.from("signup_signals").insert({
      user_id: user.id,
      device_id: deviceId,
      ip_hash: ipHash,
      user_agent: (req.headers.get("user-agent") ?? "").slice(0, 500) || null,
    });

    // A logging failure must never surface to the user or block their session.
    if (error) return json({ ok: true, recorded: false, reason: "write_failed" });

    return json({ ok: true, recorded: true });
  } catch {
    return json({ ok: true, recorded: false, reason: "error" });
  }
});
