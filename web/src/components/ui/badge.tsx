import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Tone = "neutral" | "ok" | "warn" | "danger" | "accent" | "caution" | "orange";

const tones: Record<Tone, string> = {
  neutral: "border-border bg-bg text-muted",
  ok: "border-ok-border bg-ok-bg text-ok",
  warn: "border-warn-border bg-warn-bg text-warn",
  danger: "border-danger-border bg-danger-bg text-danger",
  caution: "border-caution-border bg-caution-bg text-caution-fg",
  orange: "border-orange-border bg-orange-bg text-orange-fg",
  accent: "border-accent-border bg-accent-weak text-accent",
};

export function Badge({
  tone = "neutral",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm border px-1 py-0 text-xs font-semibold",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
