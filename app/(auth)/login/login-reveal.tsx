"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

export function LoginReveal({ children }: { children: ReactNode }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      initial={reduceMotion ? undefined : { opacity: 0, y: 20 }}
      animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className="relative z-10 flex w-full max-w-md justify-center"
    >
      {children}
    </motion.div>
  );
}
