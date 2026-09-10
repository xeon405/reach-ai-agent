// Harness stub that re-exports the REAL GDPR_COUNTRY_ISOS set, parsed verbatim
// from supabase/functions/_shared/osm.ts at build time. The fold logic under
// test therefore runs against the exact same source-of-truth set as production
// (no copied literal that can drift).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const osmPath = path.resolve(here, "../../supabase/functions/_shared/osm.ts");
const src = fs.readFileSync(osmPath, "utf8");

const seg = src.slice(src.indexOf("export const GDPR_COUNTRY_ISOS"));
const m = seg.match(/new Set\(\[([\s\S]*?)\]\)/);
if (!m) throw new Error("GDPR_COUNTRY_ISOS block not found in osm.ts");
const inner = m[1].replace(/^\s*\/\/.*$/gm, "").replace(/,\s*$/, "").trim();
const isos: string[] = JSON.parse(`[${inner}]`);
if (!Array.isArray(isos) || isos.length < 30) throw new Error("unexpected GDPR set contents");

export const GDPR_COUNTRY_ISOS: ReadonlySet<string> = new Set(isos);