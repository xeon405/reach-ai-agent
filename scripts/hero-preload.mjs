// After `vite build`, inject a <link rel="modulepreload"> for the three.js hero chunk into
// _shell.html so it downloads in parallel with the entry bundle instead of only being
// discovered when the homepage lazy-imports it post-hydration.
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";

const clientDir = resolve(process.cwd(), "dist/client");
const shellPath = join(clientDir, "_shell.html");

if (!existsSync(shellPath)) {
  console.log("[hero-preload] no dist/client/_shell.html - skipping");
  process.exit(0);
}

const assetsDir = join(clientDir, "assets");
const chunk = existsSync(assetsDir)
  ? readdirSync(assetsDir).find((f) => /^RoomEnvironment-.*\.js$/.test(f))
  : null;
if (!chunk) {
  console.log("[hero-preload] no RoomEnvironment chunk in dist/client/assets - skipping");
  process.exit(0);
}

const link = `<link rel="modulepreload" href="/assets/${chunk}"/>`;
const html = readFileSync(shellPath, "utf8");
if (html.includes(link)) {
  console.log(`[hero-preload] already present: /assets/${chunk}`);
} else if (!html.includes("</head>")) {
  console.log("[hero-preload] no </head> found in _shell.html - skipping");
} else {
  writeFileSync(shellPath, html.replace("</head>", `${link}</head>`));
  console.log(`[hero-preload] injected /assets/${chunk}`);
}