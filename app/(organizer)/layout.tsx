import type { ReactNode } from "react";
import { requireRoles } from "@/lib/auth/guards";

export default async function OrganizerLayout({ children }: { children: ReactNode }) {
  await requireRoles(["organizer", "admin"]);
  return children;
}
