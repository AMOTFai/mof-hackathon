"use server";

import { randomBytes } from "node:crypto";
import { requireRoles } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { revalidateAfterParticipantWrite } from "@/lib/cache/revalidate";
import { isTeamMemberRole } from "@/lib/enums";
import { profileUpdateSchema } from "@/lib/validation/profile";
import {
  createTeamSchema,
  joinTeamSchema,
  memberActionSchema,
  setMemberRoleSchema,
  submitTeamSchema,
  updateTeamSchema,
} from "@/lib/validation/team";
import { firstIssue, type ActionResult } from "@/lib/forms";
import { isLastCaptain, mapTeamWriteError } from "@/lib/teams/membership";
import { findTeamByInvite, getMembershipForEvent } from "@/lib/teams/queries";

export type { ActionResult };

async function requireParticipantOnEvent(eventId: string, userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("event_roles")
    .select("id")
    .eq("event_id", eventId)
    .eq("user_id", userId)
    .eq("role", "participant")
    .maybeSingle();
  if (error) throw error;
  if (!data) return { ok: false as const, error: "You are not a participant on this event." };
  return { ok: true as const, supabase };
}

export async function updateProfile(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const access = await requireRoles(["participant", "judge"]);
  const parsed = profileUpdateSchema.safeParse({
    full_name: formData.get("full_name") ?? "",
    university: formData.get("university") ?? "",
    course: formData.get("course") ?? "",
    grad_year: formData.get("grad_year") ?? "",
    bio: formData.get("bio") ?? "",
    skills: formData.get("skills") ?? "",
    github_username: formData.get("github_username") ?? "",
    timezone: formData.get("timezone") || "Europe/London",
  });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: parsed.data.full_name,
      university: parsed.data.university,
      course: parsed.data.course,
      grad_year: parsed.data.grad_year,
      bio: parsed.data.bio,
      skills: parsed.data.skills,
      github_username: parsed.data.github_username,
      timezone: parsed.data.timezone,
    })
    .eq("id", access.user.id);

  if (error) return { ok: false, error: error.message };
  revalidateAfterParticipantWrite();
  return { ok: true, message: "Profile saved." };
}

export async function createTeam(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const access = await requireRoles(["participant"]);
  const parsed = createTeamSchema.safeParse({
    eventId: formData.get("eventId"),
    name: formData.get("name"),
  });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const gate = await requireParticipantOnEvent(parsed.data.eventId, access.user.id);
  if (!gate.ok) return gate;
  const { supabase } = gate;

  const existing = await getMembershipForEvent(supabase, access.user.id, parsed.data.eventId);
  if (existing) return { ok: false, error: "You already have a team on this event." };

  const { data: team, error: teamError } = await supabase
    .from("teams")
    .insert({ event_id: parsed.data.eventId, name: parsed.data.name })
    .select("id, invite_code")
    .single();

  if (teamError || !team) {
    return { ok: false, error: mapTeamWriteError(teamError?.message) };
  }

  const { error: memberError } = await supabase.from("team_members").insert({
    team_id: team.id,
    user_id: access.user.id,
    role: "captain",
  });

  if (memberError) {
    return {
      ok: false,
      error: `${mapTeamWriteError(memberError.message)} Team was created — join with code ${team.invite_code}.`,
    };
  }

  revalidateAfterParticipantWrite();
  return { ok: true, message: `Team created. Invite code: ${team.invite_code}` };
}

export async function joinTeam(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const access = await requireRoles(["participant"]);
  const parsed = joinTeamSchema.safeParse({
    eventId: formData.get("eventId"),
    inviteCode: formData.get("inviteCode"),
  });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const gate = await requireParticipantOnEvent(parsed.data.eventId, access.user.id);
  if (!gate.ok) return gate;
  const { supabase } = gate;

  const existing = await getMembershipForEvent(supabase, access.user.id, parsed.data.eventId);
  if (existing) return { ok: false, error: "You already have a team on this event." };

  const team = await findTeamByInvite(supabase, parsed.data.inviteCode);
  if (!team) return { ok: false, error: "No team found with that invite code." };
  if (team.event_id !== parsed.data.eventId) {
    return { ok: false, error: "That invite code belongs to a different event." };
  }

  const { error } = await supabase.from("team_members").insert({
    team_id: team.id,
    user_id: access.user.id,
    role: "member",
  });

  if (error) return { ok: false, error: mapTeamWriteError(error.message) };
  revalidateAfterParticipantWrite();
  return { ok: true, message: `Joined ${team.name}.` };
}

export async function updateTeam(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const access = await requireRoles(["participant"]);
  const parsed = updateTeamSchema.safeParse({
    teamId: formData.get("teamId"),
    name: formData.get("name"),
    project_name: formData.get("project_name") ?? "",
    description: formData.get("description") ?? "",
    repo_url: formData.get("repo_url") ?? "",
    video_url: formData.get("video_url") ?? "",
  });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { data: membership } = await supabase
    .from("team_members")
    .select("role")
    .eq("team_id", parsed.data.teamId)
    .eq("user_id", access.user.id)
    .maybeSingle();
  if (!membership || membership.role !== "captain") {
    return { ok: false, error: "Only the captain can edit the team." };
  }

  const { error } = await supabase
    .from("teams")
    .update({
      name: parsed.data.name,
      project_name: parsed.data.project_name,
      description: parsed.data.description,
      repo_url: parsed.data.repo_url,
      video_url: parsed.data.video_url,
    })
    .eq("id", parsed.data.teamId);

  if (error) return { ok: false, error: mapTeamWriteError(error.message) };
  revalidateAfterParticipantWrite();
  return { ok: true, message: "Team updated." };
}

export async function rotateProxyToken(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const access = await requireRoles(["participant"]);
  const parsed = memberActionSchema
    .pick({ teamId: true })
    .safeParse({ teamId: formData.get("teamId") });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { data: membership } = await supabase
    .from("team_members")
    .select("role")
    .eq("team_id", parsed.data.teamId)
    .eq("user_id", access.user.id)
    .maybeSingle();
  if (!membership || membership.role !== "captain") {
    return { ok: false, error: "Only the captain can rotate the proxy token." };
  }

  // App-generated, same shape as the column's own default — rotation is a
  // plain UPDATE (RLS still applies), not a privileged operation.
  const newToken = `motf_${randomBytes(16).toString("hex")}`;
  const { error } = await supabase.from("teams").update({ proxy_token: newToken }).eq("id", parsed.data.teamId);
  if (error) return { ok: false, error: mapTeamWriteError(error.message) };

  revalidateAfterParticipantWrite();
  return { ok: true, message: "Proxy token rotated. Update any SDK configs using the old one." };
}

export async function submitTeam(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireRoles(["participant"]);
  const parsed = submitTeamSchema.safeParse({
    teamId: formData.get("teamId"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_team", {
    p_team_id: parsed.data.teamId,
    p_idempotency_key: parsed.data.idempotencyKey,
  });
  if (error) return { ok: false, error: error.message };
  const replay = Boolean(data && typeof data === "object" && "replay" in data && (data as { replay: boolean }).replay);
  revalidateAfterParticipantWrite();
  return { ok: true, message: replay ? "Already submitted." : "Submitted." };
}

export async function leaveTeam(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const access = await requireRoles(["participant"]);
  const parsed = memberActionSchema.safeParse({
    teamId: formData.get("teamId"),
    userId: access.user.id,
  });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { data: roster, error: rosterError } = await supabase
    .from("team_members")
    .select("user_id, role")
    .eq("team_id", parsed.data.teamId);
  if (rosterError) return { ok: false, error: rosterError.message };
  if (!roster?.some((row) => row.user_id === access.user.id)) {
    return { ok: false, error: "You are not on this team." };
  }
  if (isLastCaptain(roster, access.user.id)) {
    return { ok: false, error: "Promote another captain before leaving." };
  }

  const { error } = await supabase
    .from("team_members")
    .delete()
    .eq("team_id", parsed.data.teamId)
    .eq("user_id", access.user.id);
  if (error) return { ok: false, error: error.message };
  revalidateAfterParticipantWrite();
  return { ok: true, message: "You left the team." };
}

export async function removeMember(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const access = await requireRoles(["participant"]);
  const parsed = memberActionSchema.safeParse({
    teamId: formData.get("teamId"),
    userId: formData.get("userId"),
  });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  if (parsed.data.userId === access.user.id) {
    return { ok: false, error: "Use leave to remove yourself." };
  }

  const supabase = await createClient();
  const { data: me } = await supabase
    .from("team_members")
    .select("role")
    .eq("team_id", parsed.data.teamId)
    .eq("user_id", access.user.id)
    .maybeSingle();
  if (!me || me.role !== "captain") return { ok: false, error: "Only the captain can remove members." };

  const { error } = await supabase
    .from("team_members")
    .delete()
    .eq("team_id", parsed.data.teamId)
    .eq("user_id", parsed.data.userId);
  if (error) return { ok: false, error: error.message };
  revalidateAfterParticipantWrite();
  return { ok: true, message: "Member removed." };
}

export async function setMemberRole(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const access = await requireRoles(["participant"]);
  const parsed = setMemberRoleSchema.safeParse({
    teamId: formData.get("teamId"),
    userId: formData.get("userId"),
    role: formData.get("role"),
  });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  if (!isTeamMemberRole(parsed.data.role)) return { ok: false, error: "Invalid role." };

  const supabase = await createClient();
  const { data: roster, error: rosterError } = await supabase
    .from("team_members")
    .select("user_id, role")
    .eq("team_id", parsed.data.teamId);
  if (rosterError) return { ok: false, error: rosterError.message };

  const me = roster?.find((row) => row.user_id === access.user.id);
  if (!me || me.role !== "captain") return { ok: false, error: "Only the captain can change roles." };

  if (parsed.data.role === "member" && isLastCaptain(roster ?? [], parsed.data.userId)) {
    return { ok: false, error: "Promote another captain before demoting the last one." };
  }

  const { error } = await supabase
    .from("team_members")
    .update({ role: parsed.data.role })
    .eq("team_id", parsed.data.teamId)
    .eq("user_id", parsed.data.userId);
  if (error) return { ok: false, error: error.message };
  revalidateAfterParticipantWrite();
  return { ok: true, message: "Role updated." };
}
