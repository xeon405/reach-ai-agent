const SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
  "email",
  "profile",
].join(" ");

export function buildGmailAuthUrl(): string {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const redirectUri = `${window.location.origin}/gmail/callback`;
  const state = crypto.randomUUID();
  sessionStorage.setItem("gmail_oauth_state", state);

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPES);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  return url.toString();
}

export function consumeGmailState(state: string | null): boolean {
  const expected = sessionStorage.getItem("gmail_oauth_state");
  sessionStorage.removeItem("gmail_oauth_state");
  if (!expected) return false;
  return expected === state;
}
