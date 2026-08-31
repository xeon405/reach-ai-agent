import { Zap } from "lucide-react";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 font-semibold tracking-tight ${className}`}>
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-primary shadow-glow">
        <Zap className="h-4 w-4 text-primary-foreground" strokeWidth={2.5} />
      </span>
      <span className="text-lg group-data-[collapsible=icon]:hidden">OutshipAi</span>
    </div>
  );
}
