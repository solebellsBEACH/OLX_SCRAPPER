import { forwardRef, type SelectHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        "h-[44px] rounded-sm border border-border bg-surface px-2 text-[16px] text-fg sm:h-8 sm:text-sm",
        "focus:outline focus:outline-2 focus:outline-offset-0 focus:outline-accent",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  ),
);
Select.displayName = "Select";
