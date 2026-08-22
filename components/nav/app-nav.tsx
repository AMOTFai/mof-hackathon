"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

export function AppNav({
  label,
  links,
}: {
  label: string;
  links: readonly { href: string; label: string }[];
}) {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  return (
    <nav className="glass flex flex-wrap gap-1 p-1.5" aria-label={label}>
      {links.map((link) => {
        const active = pathname === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "relative rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              // text-foreground, not text-primary — blue text on the
              // bg-primary/15 tinted pill measures ~4.0:1 (fails WCAG AA's
              // 4.5:1); the tinted background is the state indicator, text
              // stays a color that's compliant against it.
              active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {active ? (
              <motion.span
                layoutId={reduceMotion ? undefined : "app-nav-active"}
                className="absolute inset-0 rounded-md bg-primary/15"
                transition={{ type: "spring", stiffness: 400, damping: 32 }}
              />
            ) : null}
            <span className="relative">{link.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
