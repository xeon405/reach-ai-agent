import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import { Logo } from "./Logo";
import { ThemeToggle } from "./theme-provider";
import { Button } from "./ui/button";
import { LangToggle } from "@/lib/i18n";

export type SiteNavItem = {
  label: string;
  /** Router path — renders a TanStack <Link>. Mutually exclusive with href. */
  to?: string;
  /** Plain anchor (e.g. "#features") — renders an <a>. Mutually exclusive with to. */
  href?: string;
  /** Marks anchor items for the scroll-spy highlight on the marketing pages. */
  spy?: boolean;
};

export function SiteHeader({
  cta = "Open app",
  ctaVariant = "outline",
  nav,
  secondaryCta,
  showLangToggle = false,
}: {
  cta?: string;
  /** "outline" for the plain secondary pages, "primary" for the gradient homepage CTA. */
  ctaVariant?: "outline" | "primary";
  nav?: SiteNavItem[];
  /** Optional second (ghost) CTA, e.g. the homepage's "Login" link. */
  secondaryCta?: string;
  showLangToggle?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const showNav = !!nav?.length;
  const spy = nav?.some((n) => n.spy) ?? false;

  useEffect(() => {
    if (!showNav) return;
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [showNav]);

  useEffect(() => {
    if (!spy) return;
    const spyEls = Array.from(document.querySelectorAll<HTMLElement>("[data-spy]"));
    const ids = spyEls.map((a) => a.getAttribute("href")?.slice(1) ?? "").filter(Boolean);
    const onSpy = () => {
      const pos = window.scrollY + 168;
      let current = "";
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.offsetTop <= pos) current = id;
      }
      spyEls.forEach((a) =>
        a.classList.toggle("is-active", current !== "" && a.getAttribute("href") === `#${current}`),
      );
    };
    onSpy();
    window.addEventListener("scroll", onSpy, { passive: true, capture: true });
    return () => window.removeEventListener("scroll", onSpy, true);
  }, [spy]);

  const closeMenu = () => setMenuOpen(false);

  const renderNavItem = (item: SiteNavItem, mobile: boolean) => {
    const cls = mobile
      ? "rounded-md px-3 py-2.5 hover:bg-accent hover:text-accent-foreground"
      : "nav-link hover:text-foreground";
    if (item.to) {
      return (
        <Link
          key={item.label}
          to={item.to as never}
          onClick={mobile ? closeMenu : undefined}
          className={cls}
        >
          {item.label}
        </Link>
      );
    }
    return (
      <a
        key={item.label}
        href={item.href}
        data-spy={item.spy ? true : undefined}
        onClick={mobile ? closeMenu : undefined}
        className={cls}
      >
        {item.label}
      </a>
    );
  };

  const ctaButton = (mobile: boolean) => {
    const cls = showNav ? (mobile ? "" : "hidden md:inline-flex") : "";
    if (ctaVariant === "primary") {
      return (
        <Button asChild size="sm" className={`${cls} bg-gradient-primary shadow-glow`}>
          <Link to="/auth" onClick={closeMenu}>
            {cta}
          </Link>
        </Button>
      );
    }
    return (
      <Button asChild variant="outline" size="sm" className={cls}>
        <Link to="/auth" onClick={closeMenu}>
          {cta}
        </Link>
      </Button>
    );
  };

  return (
    <header
      className={`sticky top-0 z-50 border-b bg-background/70 backdrop-blur-xl transition-all duration-300 ${
        showNav
          ? scrolled
            ? "border-border/50 py-2 shadow-sm"
            : "border-border/30 py-4"
          : "border-border/50 py-3"
      }`}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 md:px-6">
        <Link to="/" aria-label="OutshipAi home">
          <Logo />
        </Link>

        {showNav && (
          <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
            {nav!.map((item) => renderNavItem(item, false))}
          </nav>
        )}

        <div className="flex items-center gap-2">
          {showLangToggle && (
            <div className="hidden md:flex">
              <LangToggle />
            </div>
          )}
          <ThemeToggle />
          {secondaryCta && (
            <Button
              asChild
              variant="ghost"
              size="sm"
              className={showNav ? "hidden md:inline-flex" : ""}
            >
              <Link to="/auth" onClick={closeMenu}>
                {secondaryCta}
              </Link>
            </Button>
          )}
          {ctaButton(false)}
          {showNav && (
            <button
              type="button"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-foreground md:hidden"
            >
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          )}
        </div>
      </div>

      {showNav && menuOpen && (
        <div className="border-t border-border/50 bg-background animate-fade-in md:hidden">
          <nav className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-4 text-sm">
            {nav!.map((item) => renderNavItem(item, true))}
            {showLangToggle && (
              <div className="mt-3 flex items-center gap-2 border-t border-border/50 px-3 pt-4 pb-1">
                <LangToggle />
                {secondaryCta && (
                  <Button asChild variant="ghost" size="sm" className="ml-auto">
                    <Link to="/auth" onClick={closeMenu}>
                      {secondaryCta}
                    </Link>
                  </Button>
                )}
                {ctaButton(true)}
              </div>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
