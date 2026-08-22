import type { ReactNode } from "react";
import { requireRoles } from "@/lib/auth/guards";

export default async function RecruiterLayout({ children }: { children: ReactNode }) {
  await requireRoles(["recruiter"]);
  return children;
}
