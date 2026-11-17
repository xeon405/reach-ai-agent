import { defineConfig } from "@lovable.dev/vite-tanstack-config";

/** Public routes that get their own pre-rendered HTML. Without this the SPA
 *  shell renders the homepage title for every path, which is bad for search
 *  and for link previews. Each page is rendered once at build time; the client
 *  router then hydrates it normally. */
const PUBLIC_PAGES = [
  "/about",
  "/agency",
  "/demo",
  "/developers",
  "/honesty",
  "/privacy",
  "/refunds",
  "/security",
  "/stats",
  "/status",
  "/terms",
  "/tools",
];

export default defineConfig({
  tanstackStart: {
    spa: {
      enabled: true,
    },
    pages: PUBLIC_PAGES.map((path) => ({
      path,
      // Do not crawl from these pages: a link to an authenticated route would
      // prerender the redirect target (the login page) under the wrong URL.
      prerender: { crawlLinks: false },
    })),
  },
});
