"use client";

import { AppNav } from "@/components/nav/app-nav";

const LINKS = [
  { href: "/judge", label: "Dashboard" },
  { href: "/judge/chat", label: "Chat" },
  { href: "/judge/announcements", label: "Announcements" },
  { href: "/judge/schedule", label: "Schedule" },
  { href: "/judge/about", label: "About" },
] as const;

export function JudgeNav() {
  return <AppNav label="Judge" links={LINKS} />;
}
