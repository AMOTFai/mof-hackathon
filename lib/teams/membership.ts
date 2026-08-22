import type { TeamMemberRole } from "@/lib/enums";

export function isLastCaptain(roster: readonly { user_id: string; role: string }[], userId: string): boolean {
  const captains = roster.filter((row) => row.role === "captain");
  return captains.length === 1 && captains[0]?.user_id === userId;
}

export function canEditTeam(role: TeamMemberRole): boolean {
  return role === "captain";
}

export function mapTeamWriteError(message: string | undefined): string {
  const text = message ?? "Something went wrong";
  if (/team is full/i.test(text)) {
    const match = text.match(/max\s+(\d+)/i);
    return match ? `This team is full (max ${match[1]}).` : "This team is full.";
  }
  if (/teams_event_id_name_key|duplicate key.*name/i.test(text)) {
    return "A team with that name already exists in this event.";
  }
  if (/team_members_pkey|duplicate key.*team_members/i.test(text)) {
    return "You are already on this team.";
  }
  if (/teams_proxy_token_key|duplicate key.*proxy_token/i.test(text)) {
    return "Token collision — try rotating again.";
  }
  return text;
}

export function formatSkills(skills: string[]): string {
  return skills.join(", ");
}
