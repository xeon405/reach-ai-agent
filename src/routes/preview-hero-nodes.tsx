import { createFileRoute } from "@tanstack/react-router";
import { HeroNodes } from "@/components/hero-nodes";

export const Route = createFileRoute("/preview-hero-nodes")({
  head: () => ({
    meta: [{ title: "Preview — HeroNodes" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: PreviewHeroNodes,
});

function PreviewHeroNodes() {
  return (
    <div className="min-h-screen bg-[#F7F6F3] dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100">
      <style>{`[data-frame="fill"] .hero-nodes { height: 100%; }`}</style>
      <div className="mx-auto max-w-7xl px-6 py-6">
        <p className="text-xs uppercase tracking-widest text-neutral-500 dark:text-neutral-400">
          Preview route — not linked, not indexed
        </p>
        <h1 className="mt-1 text-xl font-semibold text-neutral-950 dark:text-neutral-50">
          hero-nodes.tsx — node &amp; wire network
        </h1>
      </div>

      <section className="mx-auto w-full max-w-7xl px-6">
        <p className="mb-2 text-sm text-neutral-500 dark:text-neutral-400">
          Hero scale (18rem mobile → 26rem md → 30rem lg; drag the window or use DevTools device
          mode)
        </p>
        <div className="relative w-full overflow-hidden rounded-2xl border border-border/50 bg-white/50 dark:bg-white/5">
          <HeroNodes />
        </div>
      </section>

      <section className="mx-auto mt-10 w-full max-w-7xl px-6">
        <p className="mb-2 text-sm text-neutral-500 dark:text-neutral-400">
          Viewport fill (~80vh — best for throttled/CPU-limited feel)
        </p>
        <div
          data-frame="fill"
          className="relative w-full h-[80vh] overflow-hidden rounded-2xl border border-border/50 bg-white/50 dark:bg-white/5"
        >
          <HeroNodes />
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-6 py-8 text-sm text-neutral-500 dark:text-neutral-400">
        WebGL-capable devices get the full three.js scene. Reduced-motion renders a static frame;
        no-WebGL hides the canvas entirely (is-fallback). Pixel ratio is capped at 1.5, rendering
        pauses when the element leaves the viewport, and all GPU resources are disposed on unmount —
        the same guards the live hero orb uses.
      </div>
    </div>
  );
}
