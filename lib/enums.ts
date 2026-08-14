// SQLite stores these as plain strings; these constants keep app code typed.
export const ROLES = ["participant", "judge", "organizer"] as const;
export type Role = (typeof ROLES)[number];

export const BRACKETS = ["unassigned", "cup", "plate"] as const;
export type Bracket = (typeof BRACKETS)[number];

export const EXPERTISE = ["technical", "commercial"] as const;
export type Expertise = (typeof EXPERTISE)[number];

export const PHASES = ["prepanel", "live"] as const;
export type Phase = (typeof PHASES)[number];

export const ANNOUNCEMENTS = "announcements";

export function isStaff(role: string): boolean {
  return role === "judge" || role === "organizer";
}
