import * as React from "react";
import { cn } from "@/lib/utils";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "success" | "warning" | "error" | "info";
}

export function Badge({ variant = "default", className, ...props }: BadgeProps) {
  const variantClasses = {
    default: "bg-[#1A1A1A] text-[#888888] border-[#222222]",
    success: "bg-[#28C840]/10 text-[#28C840] border-[#28C840]/20",
    warning: "bg-[#FEBC2E]/10 text-[#FEBC2E] border-[#FEBC2E]/20",
    error: "bg-[#FF5F57]/10 text-[#FF5F57] border-[#FF5F57]/20",
    info: "bg-[#00E5FF]/10 text-[#00E5FF] border-[#00E5FF]/20",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-transparent px-2.5 py-0.5 text-xs font-medium transition-colors",
        variantClasses[variant],
        className
      )}
      {...props}
    />
  );
}
