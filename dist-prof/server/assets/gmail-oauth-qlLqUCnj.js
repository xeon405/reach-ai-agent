const SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
  "email",
  "profile"
].join(" ");
function buildGmailAuthUrl() {
  const clientId = "406153763540-qof008upn9op5vlsi1a9kgruc4utagkg.apps.googleusercontent.com";
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
function consumeGmailState(state) {
  const expected = sessionStorage.getItem("gmail_oauth_state");
  sessionStorage.removeItem("gmail_oauth_state");
  if (!expected) return false;
  return expected === state;
}
export {
  buildGmailAuthUrl as b,
  consumeGmailState as c
};
//# sourceMappingURL=gmail-oauth-qlLqUCnj.js.map
