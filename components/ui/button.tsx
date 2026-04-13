import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00E5FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0A0A] disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
  {
    variants: {
      variant: {
        default:
          "bg-[#00E5FF] text-black font-semibold shadow-lg shadow-[#00E5FF]/10 hover:bg-[#53EDFF] hover:shadow-[#00E5FF]/20 hover:scale-[1.02] active:scale-[0.98]",
        destructive:
          "bg-[#FF5F57] text-white shadow-lg shadow-[#FF5F57]/20 hover:bg-[#FF5F57]/90 hover:scale-[1.02] active:scale-[0.98]",
        outline:
          "border border-[#222222] bg-[#111111] text-white hover:bg-[#1A1A1A] hover:border-[#333333]",
        secondary:
          "bg-[#1A1A1A] text-white border border-[#222222] hover:bg-[#222222] hover:scale-[1.02] active:scale-[0.98]",
        ghost: "text-[#888888] hover:bg-[#1A1A1A] hover:text-white",
        link: "text-[#00E5FF] underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 px-3 text-xs rounded-md",
        lg: "h-12 px-6 text-base rounded-xl",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
