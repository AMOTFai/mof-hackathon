"use client";

import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * The platform's signature visual device (DESIGN-SYSTEM.md section 4): a
 * connected-node timeline, the same visual language the judge dashboard
 * uses for a team's process signal (check-ins + commits + milestones),
 * reused here to represent the Scout → Build → Judge → Network flywheel.
 * Used sparingly — this is the one place brand gets to be distinctive
 * rather than the everyday app chrome.
 */
const STAGES = ["Scout", "Build", "Judge", "Network"] as const;

export function BuildTimeline({ className }: { className?: string }) {
  const reduceMotion = useReducedMotion();
  return (
    <div className={cn("flex items-center", className)} aria-hidden="true">
      {STAGES.map((stage, i) => (
        <div key={stage} className="flex flex-1 items-center last:flex-none">
          <motion.div
            initial={reduceMotion ? undefined : { opacity: 0, scale: 0.6 }}
            animate={reduceMotion ? undefined : { opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, delay: reduceMotion ? 0 : i * 0.08, ease: "easeOut" }}
            className="flex flex-col items-center gap-2"
          >
            <span className="h-2.5 w-2.5 rounded-full bg-primary" />
            <span className="whitespace-nowrap font-mono text-xs uppercase tracking-eyebrow text-muted-foreground">
              {stage}
            </span>
          </motion.div>
          {i < STAGES.length - 1 ? (
            <motion.span
              initial={reduceMotion ? undefined : { scaleX: 0 }}
              animate={reduceMotion ? undefined : { scaleX: 1 }}
              transition={{ duration: 0.4, delay: reduceMotion ? 0 : i * 0.08 + 0.15, ease: "easeOut" }}
              style={{ transformOrigin: "left" }}
              className="mx-2 mb-5 h-px flex-1 bg-gradient-to-r from-primary to-primary/20"
            />
          ) : null}
        </div>
      ))}
    </div>
  );
}
