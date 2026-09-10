import { useEffect, useRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  indeterminate?: boolean;
}

export function Checkbox({ className, indeterminate = false, ...props }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <input
      ref={ref}
      type="checkbox"
      className={cn(
        "h-3 w-3 cursor-pointer rounded-sm accent-accent focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-accent",
        className,
      )}
      {...props}
    />
  );
}
