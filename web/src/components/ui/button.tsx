import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Variant = "default" | "outline" | "ghost" | "danger";
type Size = "sm" | "md";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const base =
  "inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-sm font-semibold transition-[color,background-color,border-color,transform] duration-DEFAULT active:scale-95 disabled:opacity-50 disabled:pointer-events-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent";

const variants: Record<Variant, string> = {
  default: "bg-accent text-accent-fg hover:bg-accent-hover",
  outline: "border border-border bg-surface text-fg hover:bg-bg",
  ghost: "text-fg hover:bg-bg",
  danger: "border border-border bg-surface text-danger hover:bg-danger-hover",
};

const sizes: Record<Size, string> = {
  sm: "h-6 px-2 text-xs",
  md: "h-8 px-3 text-sm",
};

export const Button = forwardRef<HTMLButtonElement, Props>(
  ({ className, variant = "outline", size = "md", ...props }, ref) => (
    <button
      ref={ref}
      className={cn(base, variants[variant], sizes[size], className)}
      {...props}
    />
  ),
);
Button.displayName = "Button";
