import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

const sizes = { sm: "h-3 w-3", md: "h-4 w-4", lg: "h-6 w-6" } as const;

export function Spinner({ size = "md", className }: { size?: keyof typeof sizes; className?: string }) {
  return <Loader2 aria-hidden className={cn("animate-spin text-muted", sizes[size], className)} />;
}
