import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

type Client = SupabaseClient<Database>;

export type MilestoneRow = {
  id: string;
  key: string;
  label: string;
  dueAt: string;
  required: boolean;
  penalty: string;
  sortOrder: number;
};

export async function listMilestonesForOrganizer(supabase: Client, eventId: string): Promise<MilestoneRow[]> {
  const { data, error } = await supabase
    .from("milestones")
    .select("id, key, label, due_at, required, penalty, sort_order")
    .eq("event_id", eventId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((m) => ({
    id: m.id,
    key: m.key,
    label: m.label,
    dueAt: m.due_at,
    required: m.required,
    penalty: m.penalty,
    sortOrder: m.sort_order,
  }));
}

export type CriterionRow = {
  id: string;
  key: string;
  label: string;
  description: string;
  weight: number;
  scaleMax: number;
  sortOrder: number;
};

export async function listCriteriaForOrganizer(supabase: Client, eventId: string): Promise<CriterionRow[]> {
  const { data, error } = await supabase
    .from("rubric_criteria")
    .select("id, key, label, description, weight, scale_max, sort_order")
    .eq("event_id", eventId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((c) => ({
    id: c.id,
    key: c.key,
    label: c.label,
    description: c.description,
    weight: c.weight,
    scaleMax: c.scale_max,
    sortOrder: c.sort_order,
  }));
}

export type JudgeRow = { userId: string; fullName: string | null; email: string };

export async function listJudgesForEvent(supabase: Client, eventId: string): Promise<JudgeRow[]> {
  const { data, error } = await supabase
    .from("event_roles")
    .select("user_id, profiles!event_roles_user_id_fkey(full_name, email)")
    .eq("event_id", eventId)
    .eq("role", "judge");
  if (error) throw error;
  return (data ?? []).flatMap((row) => {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    if (!profile) return [];
    return [{ userId: row.user_id, fullName: profile.full_name, email: profile.email }];
  });
}

export type TeamRow = { id: string; name: string; submitted: boolean };

export async function listTeamsForOrganizer(supabase: Client, eventId: string): Promise<TeamRow[]> {
  const { data, error } = await supabase.from("teams").select("id, name, submitted_at").eq("event_id", eventId).order("name");
  if (error) throw error;
  return (data ?? []).map((t) => ({ id: t.id, name: t.name, submitted: t.submitted_at !== null }));
}

export type AssignmentRow = {
  id: string;
  judgeId: string;
  judgeName: string;
  teamId: string;
  teamName: string;
  status: string;
};

export async function listAssignmentsForOrganizer(supabase: Client, eventId: string): Promise<AssignmentRow[]> {
  const { data, error } = await supabase
    .from("judge_assignments")
    .select("id, judge_id, team_id, status, profiles!judge_assignments_judge_id_fkey(full_name, email), teams!judge_assignments_team_id_fkey(name)")
    .eq("event_id", eventId);
  if (error) throw error;
  return (data ?? []).flatMap((row) => {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    const team = Array.isArray(row.teams) ? row.teams[0] : row.teams;
    if (!profile || !team) return [];
    return [
      {
        id: row.id,
        judgeId: row.judge_id,
        judgeName: profile.full_name ?? profile.email,
        teamId: row.team_id,
        teamName: team.name,
        status: row.status,
      },
    ];
  });
}

export type RecruiterOrgRow = { id: string; name: string; hiringIntent: string; dpaSignedAt: string | null };

/**
 * `recruiter_orgs` has no `event_id` column at all — it's tenant-scoped, and
 * `auth_recruiter_org_id()` matches ANY DPA-signed org against ANY recruiter
 * anywhere (see the function body). This list is therefore not truly
 * per-event either; it's whatever "staff read recruiter orgs" RLS exposes to
 * this user (any organizer/admin/recruiter role, on any event).
 */
export async function listRecruiterOrgs(supabase: Client): Promise<RecruiterOrgRow[]> {
  const { data, error } = await supabase.from("recruiter_orgs").select("id, name, hiring_intent, dpa_signed_at");
  if (error) throw error;
  return (data ?? []).map((o) => ({ id: o.id, name: o.name, hiringIntent: o.hiring_intent, dpaSignedAt: o.dpa_signed_at }));
}

export type PendingErasureRow = { id: string; userId: string; userEmail: string; scope: string; requestedAt: string };

/** Same global (not per-event) scoping as recruiter_orgs — "staff read erasure" checks any organizer/admin role anywhere. */
export async function listPendingErasureRequests(supabase: Client): Promise<PendingErasureRow[]> {
  const { data, error } = await supabase
    .from("erasure_requests")
    .select("id, user_id, scope, requested_at, profiles!erasure_requests_user_id_fkey(email)")
    .is("completed_at", null);
  if (error) throw error;
  return (data ?? []).flatMap((r) => {
    const profile = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
    if (!profile) return [];
    return [{ id: r.id, userId: r.user_id, userEmail: profile.email, scope: r.scope, requestedAt: r.requested_at }];
  });
}

export type CalibrationSampleRow = {
  id: string;
  title: string;
  description: string;
  referenceScores: { criterionId: string; value: number }[];
};

export async function listCalibrationSamplesForOrganizer(supabase: Client, eventId: string): Promise<CalibrationSampleRow[]> {
  const { data, error } = await supabase.from("calibration_samples").select("id, title, content, reference_scores").eq("event_id", eventId);
  if (error) throw error;
  return (data ?? []).map((s) => {
    const content = s.content as { description?: string } | null;
    return {
      id: s.id,
      title: s.title,
      description: content?.description ?? "",
      referenceScores: Array.isArray(s.reference_scores) ? (s.reference_scores as unknown as { criterionId: string; value: number }[]) : [],
    };
  });
}

export type InviteRow = {
  id: string;
  role: string;
  token: string;
  email: string | null;
  maxUses: number;
  useCount: number;
  expiresAt: string;
  revokedAt: string | null;
};

export async function listInvitesForOrganizer(supabase: Client, eventId: string): Promise<InviteRow[]> {
  const { data, error } = await supabase
    .from("event_invites")
    .select("id, role, token, email, max_uses, use_count, expires_at, revoked_at")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((i) => ({
    id: i.id,
    role: i.role,
    token: i.token,
    email: i.email,
    maxUses: i.max_uses,
    useCount: i.use_count,
    expiresAt: i.expires_at,
    revokedAt: i.revoked_at,
  }));
}
