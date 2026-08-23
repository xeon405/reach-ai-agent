const { spawn } = require("child_process");
const path = require("path");
const os = require("os");
const fs = require("fs");

const bw = os.platform() === "win32" ? "bubblewrap.cmd" : "bubblewrap";
const child = spawn(bw, [
  "init",
  "--manifest=https://outreach-ochre-sigma.vercel.app/manifest.webmanifest",
  "--skipPwaValidation",
], { shell: true, cwd: __dirname });

let buf = "";
const KEYPASS = "OutreachAI2026!";

function answerFor(q) {
  const s = q.toLowerCase();
  if (s.includes("install the jdk")) return "N\n";
  if (s.includes("existing jdk 17")) {
    const home = path.join(os.homedir(), ".bubblewrap", "jdk");
    return home + "\n";
  }
  if (s.includes("android sdk")) return "Y\n";
  if (s.includes("license") || s.match(/^\(y\/n\)/)) return "y\n";
  if (s.includes("application id") || s.includes("package name")) return "com.outreachai.app\n";
  if (s.includes("name of your app") || s.includes("app name") || s.includes("android app name")) return "OutreachAI\n";
  if (s.includes("short name")) return "OutreachAI\n";
  if (s.includes("key store") || s.includes("keystore path") || s.includes("path of the keystore")) return "android.keystore\n";
  if (s.includes("alias")) return "android\n";
  if (s.includes("password")) return KEYPASS + "\n";
  if (s.match(/\(y\/n\)/i) || s.includes("(Y/n)") || s.includes("(y/N)")) return "y\n";
  if (s.trim().endsWith(":") && !s.includes("?")) return "\n";
  return "\n";
}

child.stdout.on("data", (d) => {
  buf += d.toString();
  process.stdout.write(d);
  const qMatch = buf.match(/\?[^\n]*$/);
  if (qMatch) {
    const a = answerFor(qMatch[0]);
    if (a !== null) { setTimeout(() => child.stdin.write(a), 300); buf = ""; }
  }
});
child.stderr.on("data", (d) => process.stderr.write(d));
child.on("close", (code) => {
  console.log(`\n=== INIT EXITED code=${code} ===`);
  process.exit(code);
});
