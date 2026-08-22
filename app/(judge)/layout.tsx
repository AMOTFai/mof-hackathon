import type { ReactNode } from "react";
import { requireRoles } from "@/lib/auth/guards";

export default async function JudgeLayout({ children }: { children: ReactNode }) {
  await requireRoles(["judge"]);
  return children;
}
