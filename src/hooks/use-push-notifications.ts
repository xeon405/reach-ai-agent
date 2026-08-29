import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const SUPABASE_URL =
  (import.meta.env.VITE_SUPABASE_URL as string) ||
  (typeof process !== "undefined" ? (process.env.SUPABASE_URL as string) : "") ||
  "";
const PUSH_URL = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/push-subscribe` : "";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64Url = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64Url);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function postToServer(payload: unknown) {
  if (!PUSH_URL) return null;
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) return null;
  const res = await fetch(PUSH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  return res.ok ? await res.json() : null;
}

function supportsPush(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export function usePushNotifications() {
  const [active, setActive] = useState<boolean | null>(null); // null = unsupported/unknown
  const [busy, setBusy] = useState(false);

  const getSubscription = useCallback(async (): Promise<PushSubscription | null> => {
    if (!supportsPush()) return null;
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return null;
    return reg.pushManager.getSubscription();
  }, []);

  // Re-sync whatever the browser already has (no prompt) — keeps the server
  // copy fresh when a device/hash changes or a session was deleted.
  const autoSync = useCallback(async () => {
    if (!supportsPush()) return;
    const sub = await getSubscription();
    if (sub) {
      await postToServer({
        enabled: true,
        subscription: { endpoint: sub.endpoint, keys: sub.toJSON() as { p256dh: string; auth: string } },
      });
    }
  }, [getSubscription]);

  const refresh = useCallback(async () => {
    const sub = await getSubscription();
    setActive(!!sub);
  }, [getSubscription]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function enable(): Promise<{ ok: boolean; reason?: string }> {
    if (!supportsPush()) return { ok: false, reason: "Browser doesn't support push notifications." };
    setBusy(true);
    try {
      let reg = await navigator.serviceWorker.getRegistration();
      if (!reg) reg = await navigator.serviceWorker.register("/sw.js");
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return { ok: false, reason: perm === "denied" ? "Permission was denied." : "Permission was blocked." };
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        const keyRes = await fetch(PUSH_URL);
        const keyJson = await keyRes.json();
        if (!keyJson?.vapidPublicKey) throw new Error("Missing VAPID public key");
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(keyJson.vapidPublicKey),
        });
      }
      const json = sub.toJSON() as { endpoint: string; keys?: { p256dh: string; auth: string } };
      await postToServer({ enabled: true, subscription: { endpoint: json.endpoint, keys: json.keys } });
      setActive(true);
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    } finally {
      setBusy(false);
    }
  }

  async function disable(): Promise<{ ok: boolean }> {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) await sub.unsubscribe();
      await postToServer({ enabled: false });
      setActive(false);
      return { ok: true };
    } catch {
      setActive(false);
      return { ok: true };
    } finally {
      setBusy(false);
    }
  }

  return { active, busy, enable, disable, refresh, autoSync };
}