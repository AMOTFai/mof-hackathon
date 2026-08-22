import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { isTeamMemberRole, type TeamMemberRole } from "@/lib/enums";

type Client = SupabaseClient<Database>;

export type ParticipantEvent = {
  eventId: string;
  eventSlug: string;
  eventName: string;
  maxTeamSize: number;
};

export type RosterMember = {
  userId: string;
  role: TeamMemberRole;
  joinedAt: string;
  fullName: string | null;
  email: string;
  githubUsername: string | null;
};

export type TeamMembership = {
  teamId: string;
  eventId: string;
  eventName: string;
  eventSlug: string;
  maxTeamSize: number;
  name: string;
  inviteCode: string;
  projectName: string | null;
  description: string | null;
  repoUrl: string | null;
  videoUrl: string | null;
  submittedAt: string | null;
  submissionDeadline: string;
  proxyToken: string;
  myRole: TeamMemberRole;
  members: RosterMember[];
};

function asEvent(value: unknown): { name: string; slug: string; max_team_size: number } | null {
  if (!value || typeof value !== "object") return null;
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object") return null;
  const rec = row as { name?: unknown; slug?: unknown; max_team_size?: unknown };
  if (typeof rec.name !== "string" || typeof rec.slug !== "string") return null;
  return {
    name: rec.name,
    slug: rec.slug,
    max_team_size: typeof rec.max_team_size === "number" ? rec.max_team_size : 5,
  };
}

function asProfile(value: unknown): { full_name: string | null; email: string; github_username: string | null } | null {
  if (!value || typeof value !== "object") return null;
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object") return null;
  const rec = row as { full_name?: unknown; email?: unknown; github_username?: unknown };
  return {
    full_name: typeof rec.full_name === "string" ? rec.full_name : null,
    email: typeof rec.email === "string" ? rec.email : "",
    github_username: typeof rec.github_username === "string" ? rec.github_username : null,
  };
}

export async function listParticipantEvents(supabase: Client, userId: string): Promise<ParticipantEvent[]> {
  const { data, error } = await supabase
    .from("event_roles")
    .select("event_id, events!event_roles_event_id_fkey(id, slug, name, max_team_size)")
    .eq("user_id", userId)
    .eq("role", "participant");
  if (error) throw error;

  const events: ParticipantEvent[] = [];
  for (const row of data ?? []) {
    const event = asEvent(row.events);
    if (!event) continue;
    events.push({
      eventId: row.event_id,
      eventSlug: event.slug,
      eventName: event.name,
      maxTeamSize: event.max_team_size,
    });
  }
  return events;
}

export async function getMembershipForEvent(
  supabase: Client,
  userId: string,
  eventId: string,
): Promise<TeamMembership | null> {
  const { data: mine, error: mineError } = await supabase
    .from("team_members")
    .select(
      "role, team_id, teams!inner(id, name, invite_code, event_id, project_name, description, repo_url, video_url, submitted_at, proxy_token)",
    )
    .eq("user_id", userId);
  if (mineError) throw mineError;

  const row = (mine ?? []).find((item) => {
    const team = item.teams as unknown as { event_id?: string };
    return team?.event_id === eventId;
  });
  if (!row) return null;

  const team = row.teams as unknown as {
    id: string;
    name: string;
    invite_code: string;
    event_id: string;
    project_name: string | null;
    description: string | null;
    repo_url: string | null;
    video_url: string | null;
    submitted_at: string | null;
    proxy_token: string;
  };
  const { data: eventRow, error: eventError } = await supabase
    .from("events")
    .select("name, slug, max_team_size, submission_deadline")
    .eq("id", team.event_id)
    .single();
  if (eventError) throw eventError;
  const myRole = isTeamMemberRole(row.role) ? row.role : "member";

  const { data: roster, error: rosterError } = await supabase
    .from("team_members")
    .select("user_id, role, joined_at, profiles!team_members_user_id_fkey(full_name, email, github_username)")
    .eq("team_id", team.id)
    .order("joined_at", { ascending: true });
  if (rosterError) throw rosterError;

  const members: RosterMember[] = [];
  for (const member of roster ?? []) {
    if (!isTeamMemberRole(member.role)) continue;
    const profile = asProfile(member.profiles);
    members.push({
      userId: member.user_id,
      role: member.role,
      joinedAt: member.joined_at,
      fullName: profile?.full_name ?? null,
      email: profile?.email ?? "",
      githubUsername: profile?.github_username ?? null,
    });
  }

  return {
    teamId: team.id,
    eventId: team.event_id,
    eventName: eventRow.name,
    eventSlug: eventRow.slug,
    maxTeamSize: eventRow.max_team_size,
    name: team.name,
    inviteCode: team.invite_code,
    projectName: team.project_name,
    description: team.description,
    repoUrl: team.repo_url,
    videoUrl: team.video_url,
    submittedAt: team.submitted_at,
    submissionDeadline: eventRow.submission_deadline,
    proxyToken: team.proxy_token,
    myRole,
    members,
  };
}

export async function findTeamByInvite(supabase: Client, inviteCode: string) {
  const { data, error } = await supabase
    .from("teams")
    .select("id, event_id, name, invite_code")
    .eq("invite_code", inviteCode)
    .maybeSingle();
  if (error) throw error;
  return data;
}
