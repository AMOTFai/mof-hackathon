import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const panelVariants = cva("glass p-6", {
  variants: {
    variant: {
      default: "",
      // Emphasis via border + a faint accent-tinted background — not a
      // shadow. Depth in this system comes from border/background-color
      // shifts (DESIGN-SYSTEM.md section 6), not drop shadows.
      glow: "border-primary/40 bg-primary/[0.04]",
      outline: "bg-transparent",
    },
  },
  defaultVariants: { variant: "default" },
});

export interface PanelProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof panelVariants> {}

const Panel = React.forwardRef<HTMLDivElement, PanelProps>(({ className, variant, ...props }, ref) => (
  <div className={cn(panelVariants({ variant, className }))} ref={ref} {...props} />
));
Panel.displayName = "Panel";

export { Panel, panelVariants };
