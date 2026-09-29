import { Zap } from "lucide-react";

/**
 * `showText` is passed explicitly by the collapsed sidebar instead of relying
 * on the `group-data-[collapsible=icon]` CSS variant. That variant depends on
 * an ancestor carrying both `.group` and `data-collapsible="icon"`, and when
 * it failed to match the wordmark stayed visible and wrapped onto a second
 * line inside the 64px icon rail. Passing it as a prop makes the collapsed
 * state deterministic, and `whitespace-nowrap` guarantees the word can never
 * break onto two lines.
 */
export function Logo({
  className = "",
  showText = true,
}: {
  className?: string;
  showText?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2 whitespace-nowrap font-semibold tracking-tight ${className}`}
    >
      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-primary shadow-glow">
        <Zap className="h-4 w-4 text-primary-foreground" strokeWidth={2.5} />
      </span>
      {showText && <span className="truncate text-lg">OutshipAi</span>}
    </div>
  );
}
