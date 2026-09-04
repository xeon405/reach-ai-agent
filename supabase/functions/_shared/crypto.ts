// AES-GCM encryption for OAuth credentials at rest.
// Key: GOOGLE_TOKEN_ENC_KEY env secret (64 hex chars = 32 bytes).
// Format: "v1:<iv_b64>:<ct_b64>"  — legacy plaintext values pass through.

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function getKeyMaterial(): Uint8Array | null {
  const hex = Deno.env.get("GOOGLE_TOKEN_ENC_KEY");
  if (!hex || hex.length < 64) return null;
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

async function importKey(bytes: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", bytes as unknown as ArrayBuffer, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

export function encryptionEnabled(): boolean {
  return getKeyMaterial() !== null;
}

export async function encryptSecret(plain: string): Promise<string> {
  const material = getKeyMaterial();
  if (!material) {
    console.warn("[crypto] GOOGLE_TOKEN_ENC_KEY is not set — storing OAuth token in PLAINTEXT. Set the key in edge function secrets.");
    return plain; // fail-open to legacy behavior, never crash OAuth
  }
  const key = await importKey(material);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as unknown as ArrayBuffer },
    key,
    encoder.encode(plain) as unknown as ArrayBuffer
  );
  const b64 = (buf: ArrayBuffer | Uint8Array) =>
    btoa(String.fromCharCode(...new Uint8Array(buf as ArrayBuffer)));
  return `v1:${b64(iv)}:${b64(ct)}`;
}

export async function decryptSecret(stored: string): Promise<string> {
  if (!stored.startsWith("v1:")) return stored; // legacy plaintext token
  const material = getKeyMaterial();
  if (!material) throw new Error("Encrypted credential present but GOOGLE_TOKEN_ENC_KEY is not set");
  const [tag, ivB64, ctB64] = stored.split(":");
  if (tag !== "v1") throw new Error("Unknown ciphertext version");
  const key = await importKey(material);
  const iv = Uint8Array.from(atob(ivB64), (c) => c.charCodeAt(0));
  const ct = Uint8Array.from(atob(ctB64), (c) => c.charCodeAt(0));
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as unknown as ArrayBuffer },
    key,
    ct as unknown as ArrayBuffer
  );
  return decoder.decode(pt);
}

// ── HMAC signing for unsubscribe / track-click URLs ──
// Uses CRON_SECRET as the HMAC key. Tokens prevent unauthorized URL manipulation.

async function getHmacKey(): Promise<CryptoKey> {
  const secret = Deno.env.get("CRON_SECRET") || Deno.env.get("GOOGLE_TOKEN_ENC_KEY") || "";
  const keyBytes = encoder.encode(secret.padEnd(32, "0").slice(0, 32));
  return crypto.subtle.importKey("raw", keyBytes as unknown as ArrayBuffer, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function signToken(data: string): Promise<string> {
  const key = await getHmacKey();
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/[+/=]/g, (c) => ({ "+": "-", "/": "_", "=": "" })[c] as string).slice(0, 32);
}

export async function verifyToken(data: string, token: string): Promise<boolean> {
  if (!token) return false;
  const key = await getHmacKey();
  const expected = await signToken(data);
  if (expected.length !== token.length) return false;
  let result = 0;
  for (let i = 0; i < expected.length; i++) result |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  return result === 0;
}
