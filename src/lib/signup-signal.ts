import { supabase } from "@/integrations/supabase/client";

/**
 * Device/network signal reporting.
 *
 * This is observation only — it never blocks anything, and the UI must never
 * mention it. A sold laptop or a shared office machine is not evidence of
 * abuse, so we record and move on. See supabase/functions/signup-signal.
 */

const DEVICE_KEY = "outship_device_id";

/** Stable random id for this browser profile. Not a device fingerprint. */
export function deviceId(): string | null {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    // Private mode / storage disabled — skip silently.
    return null;
  }
}

/**
 * Report once per user per browser. The `reported` flag is written only after
 * the server confirms, so a failed first attempt retries on the next load.
 */
export async function reportSignupSignal(userId: string): Promise<void> {
  const flag = `outship_signal_${userId}`;
  try {
    if (localStorage.getItem(flag)) return;
  } catch {
    return;
  }

  const id = deviceId();
  if (!id) return;

  try {
    const { data, error } = await supabase.functions.invoke("signup-signal", {
      body: { device_id: id },
    });
    if (!error && data?.ok) {
      try {
        localStorage.setItem(flag, "1");
      } catch {
        /* ignore */
      }
    }
  } catch {
    // Never blocks sign-in.
  }
}
