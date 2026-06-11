import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export function OnlinePresenceDot({ className }: { className?: string }) {
  return (
    <span className={cn("relative inline-flex h-4 w-4", className)} aria-hidden="true">
      <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400/55 animate-ping" />
      <span className="relative inline-flex h-full w-full items-center justify-center rounded-full border border-background bg-emerald-500 shadow-[0_0_0_1px_rgba(16,185,129,0.35)]">
        <Sparkles className="h-2.5 w-2.5 text-white animate-pulse" />
      </span>
    </span>
  );
}

export function OnlinePresenceLabel({
  text = "Online agora",
  className,
}: {
  text?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300",
        className
      )}
    >
      <OnlinePresenceDot className="h-3.5 w-3.5" />
      {text}
    </span>
  );
}
