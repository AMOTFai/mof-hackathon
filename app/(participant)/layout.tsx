import type { ReactNode } from "react";
import { requireRoles } from "@/lib/auth/guards";

export default async function ParticipantLayout({ children }: { children: ReactNode }) {
  await requireRoles(["participant"]);
  return children;
}
