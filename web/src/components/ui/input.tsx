import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-8 w-full rounded-sm border border-border bg-surface px-2 text-sm text-fg",
        "placeholder:text-subtle focus:outline focus:outline-2 focus:outline-offset-0 focus:outline-accent",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";
