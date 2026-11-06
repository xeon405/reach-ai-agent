"""Build a self-contained HTML and a print-ready PDF from SYSTEM-MANUAL.md.

Usage:
    python scripts/.ops/build-manual.py

Outputs:
    SYSTEM-MANUAL.html   (one file, no external assets, openable anywhere)
    SYSTEM-MANUAL.pdf    (A4, via headless Chrome)

Nothing here reaches the network. All styling is inline so the HTML survives
being emailed, zipped, or opened offline.
"""

import html
import os
import re
import subprocess
import sys
from pathlib import Path

import markdown

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "SYSTEM-MANUAL.md"
OUT_HTML = ROOT / "SYSTEM-MANUAL.html"
OUT_PDF = ROOT / "SYSTEM-MANUAL.pdf"

CHROME_CANDIDATES = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
]

CSS = """
:root {
  --ink: #12151a;
  --muted: #5b6472;
  --line: #d9dee6;
  --accent: #0b5fff;
  --accent-soft: #eef3ff;
  --code-bg: #f5f7fa;
  --warn: #b42318;
}
* { box-sizing: border-box; }
html { font-size: 16px; }
body {
  margin: 0;
  color: var(--ink);
  font-family: "Charter", "Georgia", "Cambria", serif;
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
}
.page { max-width: 210mm; margin: 0 auto; padding: 22mm 20mm 26mm; }

/* ---------- cover ---------- */
.cover {
  min-height: 245mm;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  break-after: page;
}
.cover .kicker {
  font-family: "Segoe UI", system-ui, sans-serif;
  font-size: 11px;
  letter-spacing: .18em;
  text-transform: uppercase;
  color: var(--accent);
  font-weight: 700;
}
.cover h1 {
  font-size: 46px;
  line-height: 1.05;
  margin: 18px 0 10px;
  letter-spacing: -.02em;
  border: 0;
  padding: 0;
}
.cover .sub {
  font-size: 17px;
  color: var(--muted);
  max-width: 150mm;
  margin-bottom: 26px;
}
.cover .rule { height: 4px; width: 64px; background: var(--accent); margin: 0 0 26px; }
.cover .meta {
  font-family: "Segoe UI", system-ui, sans-serif;
  font-size: 12px;
  border-top: 1px solid var(--line);
  padding-top: 14px;
}
.cover .meta div { display: flex; gap: 10px; padding: 3px 0; }
.cover .meta span:first-child { width: 52mm; flex: 0 0 52mm; color: var(--muted); }
.cover .meta span:last-child { font-family: Consolas, monospace; }

/* ---------- typography ---------- */
h1, h2, h3, h4 {
  font-family: "Segoe UI", system-ui, sans-serif;
  line-height: 1.2;
  color: var(--ink);
}
h1 {
  font-size: 28px;
  margin: 0 0 18px;
  padding-bottom: 10px;
  border-bottom: 2px solid var(--ink);
  break-before: page;
}
h1:first-of-type { break-before: auto; }
h2 {
  font-size: 21px;
  margin: 34px 0 12px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--line);
  break-after: avoid;
}
h3 { font-size: 17px; margin: 26px 0 8px; break-after: avoid; }
h4 { font-size: 15px; margin: 20px 0 6px; color: var(--muted); break-after: avoid; }
p { margin: 0 0 12px; }
ul, ol { margin: 0 0 14px; padding-left: 22px; }
li { margin: 4px 0; }
a { color: var(--accent); text-decoration: none; }
strong { font-weight: 700; }
hr { border: 0; border-top: 1px solid var(--line); margin: 28px 0; }
blockquote {
  margin: 16px 0;
  padding: 12px 16px;
  border-left: 3px solid var(--accent);
  background: var(--accent-soft);
  font-style: italic;
}

/* ---------- code ---------- */
code {
  font-family: Consolas, "SFMono-Regular", Menlo, monospace;
  font-size: .84em;
  background: var(--code-bg);
  padding: 1px 5px;
  border-radius: 3px;
  border: 1px solid var(--line);
}
pre {
  background: #10141b;
  color: #e6edf3;
  padding: 14px 16px;
  border-radius: 6px;
  overflow-x: auto;
  font-size: 12.5px;
  line-height: 1.45;
  break-inside: avoid;
  margin: 14px 0 18px;
}
pre code { background: none; border: 0; padding: 0; color: inherit; font-size: inherit; }

/* ---------- tables ---------- */
table {
  width: 100%;
  border-collapse: collapse;
  margin: 14px 0 20px;
  font-family: "Segoe UI", system-ui, sans-serif;
  font-size: 12.5px;
  break-inside: auto;
}
thead { display: table-header-group; }
tr { break-inside: avoid; }
th {
  text-align: left;
  background: #f1f4f9;
  border-bottom: 2px solid #c8d0dc;
  padding: 7px 9px;
  font-weight: 700;
}
td {
  border-bottom: 1px solid var(--line);
  padding: 6px 9px;
  vertical-align: top;
}
tbody tr:nth-child(even) td { background: #fafbfd; }
td code { white-space: nowrap; }

/* ---------- table of contents ---------- */
.toc { break-after: page; }
.toc h1 { break-before: auto; border-bottom: 2px solid var(--ink); }
.toc ol { list-style: none; padding: 0; margin: 0; font-family: "Segoe UI", system-ui, sans-serif; }
.toc li { margin: 0; padding: 5px 0; border-bottom: 1px dotted var(--line); font-size: 13px; }
.toc li.lvl1 { font-weight: 700; margin-top: 10px; border-bottom: 0; }
.toc li.lvl2 { padding-left: 16px; color: #2b3440; }
.toc a { color: inherit; }

/* ---------- print ---------- */
@page { size: A4; margin: 16mm 14mm 18mm; }
@media print {
  html { font-size: 10.5pt; }
  body { line-height: 1.45; }
  .page { padding: 0; max-width: none; }
  .cover { min-height: 250mm; }
  h1 { font-size: 20pt; break-before: page; }
  h2 { font-size: 14pt; }
  h3 { font-size: 12pt; }
  table { font-size: 8.4pt; }
  td, th { padding: 4px 5px; }
  pre { font-size: 8pt; }
  a { color: inherit; text-decoration: none; }
  .cover, .toc { break-after: page; }
}
"""

COVER_META = [
    ("Repository", "C:\\Dev\\reach-ai-agent"),
    ("Branch / HEAD", "main / 74701dd"),
    ("Period", "22 Aug 2026 - 3 Nov 2026"),
    ("Commits", "324"),
    ("Forward migrations", "84 (+17 rollback files)"),
    ("Edge Functions", "36"),
    ("Tables / columns", "51 / 499"),
    ("SQL functions", "43"),
    ("RLS policies / triggers", "34 / 13"),
    ("Frontend routes", "33"),
    ("Shared modules", "39"),
    ("Live project", "zvohdvopmvzsujktrdmu"),
]


def strip_code_fences(text: str) -> str:
    return re.sub(r"```.*?```", "", text, flags=re.S)


def build_toc(tokens):
    """Flatten the heading tree. python-markdown nests deeper headings inside
    `children`, so a naive top-level loop silently drops every section.

    The first H1 is the document title, not a section. Appendix children are
    51 table names and 84 migration files: noise in a contents list.
    """
    rows = []
    state = {"seen_title": False}

    def walk(nodes):
        for node in nodes:
            if node["level"] == 1:
                if not state["seen_title"]:
                    state["seen_title"] = True
                    # still descend, so narrative H2s are not lost
                    if node.get("children"):
                        walk(node["children"])
                    continue
                rows.append(("lvl1", node["id"], node["name"]))
                if not node["name"].startswith("Appendix") and node.get("children"):
                    walk(node["children"])
            else:
                rows.append(("lvl2", node["id"], node["name"]))
                if node.get("children"):
                    walk(node["children"])

    walk(tokens)
    return rows


def main() -> int:
    if not SRC.exists():
        print(f"missing {SRC}", file=sys.stderr)
        return 1

    text = SRC.read_text(encoding="utf-8")

    # The markdown keeps a hand-written Contents table for plain-text readers.
    # The PDF/HTML build generates its own linked TOC, so drop the duplicate.
    text = re.sub(
        r"\n## Contents\n.*?(?=\n## 0\.)",
        "\n",
        text,
        count=1,
        flags=re.S,
    )

    md = markdown.Markdown(
        extensions=["tables", "fenced_code", "toc", "sane_lists", "attr_list"],
        extension_configs={"toc": {"permalink": False, "toc_depth": "1-2"}},
    )
    body = md.convert(text)
    toc_rows = build_toc(md.toc_tokens)

    meta_html = "\n".join(
        f"<div><span>{html.escape(k)}</span><span>{html.escape(v)}</span></div>"
        for k, v in COVER_META
    )

    toc_html = "\n".join(
        f'<li class="{cls}"><a href="#{tid}">{html.escape(name)}</a></li>'
        for cls, tid, name in toc_rows
    )

    doc = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>OutshipAi - Complete System Manual</title>
<style>{CSS}</style>
</head>
<body>
<section class="cover">
  <div>
    <div class="kicker">Technical architecture and system manual</div>
    <h1>OutshipAi</h1>
    <div class="rule"></div>
    <p class="sub">Every engine, function, table, migration and route, from the first commit to today. Verified against the live database, not written from memory.</p>
  </div>
  <div class="meta">
    {meta_html}
  </div>
</section>

<section class="toc">
  <h1>Contents</h1>
  <ol>
    {toc_html}
  </ol>
</section>

<main>
{body}
</main>
</body>
</html>
"""
    OUT_HTML.write_text(doc, encoding="utf-8")
    print(f"html  {OUT_HTML}  ({OUT_HTML.stat().st_size // 1024} KB)")

    chrome = next((p for p in CHROME_CANDIDATES if os.path.exists(p)), None)
    if not chrome:
        print("chrome/edge not found - HTML only", file=sys.stderr)
        return 0

    cmd = [
        chrome,
        "--headless=new",
        "--disable-gpu",
        "--no-sandbox",
        "--no-pdf-header-footer",
        "--virtual-time-budget=20000",
        f"--print-to-pdf={OUT_PDF}",
        OUT_HTML.as_uri(),
    ]
    res = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    if res.returncode != 0 or not OUT_PDF.exists():
        print(res.stdout[-800:], res.stderr[-800:], file=sys.stderr)
        return 2
    print(f"pdf   {OUT_PDF}  ({OUT_PDF.stat().st_size // 1024} KB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
