"use client";

import { AppNav } from "@/components/nav/app-nav";

const LINKS = [
  { href: "/organizer", label: "Home" },
  { href: "/organizer/schedule", label: "Schedule" },
  { href: "/organizer/announcements", label: "Announcements" },
  { href: "/organizer/setup", label: "Setup" },
  { href: "/organizer/results", label: "Results" },
] as const;

export function OrganizerNav() {
  return <AppNav label="Organizer" links={LINKS} />;
}
