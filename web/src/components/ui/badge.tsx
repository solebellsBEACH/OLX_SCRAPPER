import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Tone = "neutral" | "ok" | "warn" | "danger" | "accent";

const tones: Record<Tone, string> = {
  neutral: "border-border bg-bg text-muted",
  ok: "border-[#bbe7c6] bg-[#f2f8f3] text-ok",
  warn: "border-[#f2dcae] bg-[#fdf7ec] text-warn",
  danger: "border-[#f2c9c9] bg-[#fdf1f1] text-danger",
  accent: "border-[#c9dbff] bg-accent-weak text-accent",
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
