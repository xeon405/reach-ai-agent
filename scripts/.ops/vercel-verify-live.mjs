// End-to-end: is the agent UI code actually served to real browsers?
import { readFileSync } from "node:fs";
const H = { Authorization: "Bearer " + readFileSync(".env", "utf8").split("\n").find((l) => l.startsWith("VERCEL_TOKEN="))?.slice(13).trim() };

// 1. Production deployment == my commit?
const d = await (await fetch("https://api.vercel.com/v6/deployments?projectId=prj_TjBxwmR0IkIgJd0vgTBb6smbMG2m&limit=1&target=production", { headers: H })).json();
const dep = d.deployments[0];
console.log("production:", dep.uid, dep.readyState + "/" + dep.readySubstate, "| commit:", dep.meta?.githubCommitSha?.slice(0, 7));

// 2. Does the live site serve, and for /agent?
for (const url of ["https://out-ship.com/", "https://out-ship.com/agent"]) {
  const r = await fetch(url, { redirect: "follow" });
  const body = await r.text();
  console.log(`GET ${url} -> ${r.status}, ${body.length} bytes`);
}

// 3. Pull the real JS the browser gets and look for the agent route + labels.
const shell = await (await fetch("https://out-ship.com/agent")).text();
const srcs = [...shell.matchAll(/src="([^"]+\.js)"/g)].map((m) => m[1]);
console.log("entry scripts:", srcs.length);
let found = { agentRoute: false, agentLabel: false, confirmUi: false, chunks: 0 };
for (const s of srcs) {
  const url = s.startsWith("http") ? s : "https://out-ship.com" + s;
  const js = await (await fetch(url)).text();
  found.chunks++;
  if (/\/_authenticated\/agent/.test(js)) found.agentRoute = true;
  if (/app_agent/.test(js) || /Agent<\/h1>|Ask about your contacts/.test(js)) found.agentLabel = true;
  if (/Yes, do it|Nothing happens without your OK|confirm:!0/.test(js)) found.confirmUi = true;
}
console.log("scanned chunks:", found.chunks);
console.log("agent route present:   ", found.agentRoute);
console.log("agent UI labels present:", found.agentLabel);
console.log("confirm UI present:    ", found.confirmUi);
