"use client";

import { AppNav } from "@/components/nav/app-nav";

const LINKS = [
  { href: "/dashboard", label: "Home" },
  { href: "/dashboard/profile", label: "Profile" },
  { href: "/dashboard/team", label: "Workbench" },
  { href: "/dashboard/checkins", label: "Check-ins" },
  { href: "/dashboard/submit", label: "Submit" },
  { href: "/dashboard/talent", label: "Talent" },
  { href: "/dashboard/schedule", label: "Schedule" },
  { href: "/dashboard/chat", label: "Chat" },
  { href: "/dashboard/announcements", label: "Announcements" },
] as const;

export function ParticipantNav() {
  return <AppNav label="Participant" links={LINKS} />;
}
