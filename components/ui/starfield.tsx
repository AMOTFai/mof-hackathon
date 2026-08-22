import { cn } from "@/lib/utils";

/**
 * Restrained geometric grid backdrop — used sparingly (login hero only,
 * DESIGN-SYSTEM.md section 4), not as everyday app chrome. Pure CSS, no
 * illustration layer: geometry-led, not illustration-led.
 */
export function Starfield({ className }: { className?: string }) {
  return (
    <div className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)} aria-hidden="true">
      <div className="absolute inset-0 bg-grid opacity-40" />
      <div className="absolute inset-0 bg-gradient-to-b from-background via-transparent to-background" />
    </div>
  );
}
