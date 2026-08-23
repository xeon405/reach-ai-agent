import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const shellPath = "dist/client/_shell.html";
if (!existsSync(shellPath)) {
  console.error("generate-csp: dist/client/_shell.html not found — run build first");
  process.exit(1);
}

const html = readFileSync(shellPath, "utf8");
const inlineScripts = html.match(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g) ?? [];
const hashes = [...new Set(
  inlineScripts.map((tag) => {
    const body = tag.replace(/^<script[^>]*>/, "").replace(/<\/script>$/, "");
    return `'sha256-${createHash("sha256").update(body).digest("base64")}'`;
  })
)];

console.log(`generate-csp: ${hashes.length} unique inline script hash(es)`);

const vercel = JSON.parse(readFileSync("vercel.json", "utf8"));
for (const entry of vercel.headers) {
  for (const h of entry.headers) {
    if (h.key !== "Content-Security-Policy") continue;
    h.value = h.value.replace(
      /script-src '[^']*'[^;]*/,
      `script-src 'self' ${hashes.join(" ")}`
    );
  }
}
writeFileSync("vercel.json", JSON.stringify(vercel, null, 2) + "\n");
console.log("generate-csp: vercel.json updated");
