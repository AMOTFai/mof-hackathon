import type { ReactNode } from "react";
import { requireAlumnus } from "@/lib/auth/guards";

export default async function AlumniLayout({ children }: { children: ReactNode }) {
  await requireAlumnus();
  return children;
}
