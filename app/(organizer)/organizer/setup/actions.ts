"use server";

import { requireRoles } from "@/lib/auth/guards";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { revalidateAfterStaffWrite } from "@/lib/cache/revalidate";
import { firstIssue, type ActionResult } from "@/lib/forms";
import {
  assignJudgeSchema,
  calibrationSampleSchema,
  createInviteSchema,
  criterionIdSchema,
  deleteCalibrationSampleSchema,
  inviteJudgeSchema,
  milestoneIdSchema,
  milestoneSchema,
  removeAssignmentSchema,
  revokeInviteSchema,
  rubricCriterionSchema,
} from "@/lib/validation/event";
import { createRecruiterOrgSchema, inviteRecruiterSchema } from "@/lib/validation/talent";

async function requireStaffOnEvent(eventId: string, userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("event_roles")
    .select("role")
    .eq("event_id", eventId)
    .eq("user_id", userId)
    .in("role", ["organizer", "admin"]);
  if (error) throw error;
  if (!data?.length) return { ok: false as const, error: "You are not staff on this event." };
  return { ok: true as const, supabase };
}

// --- Milestones -------------------------------------------------------

export async function createMilestone(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const access = await requireRoles(["organizer", "admin"]);
  const parsed = milestoneSchema.safeParse({
    eventId: formData.get("eventId"),
    key: formData.get("key"),
    label: formData.get("label"),
    due_at: formData.get("due_at"),
    required: formData.get("required") === "on",
    penalty: formData.get("penalty"),
    sort_order: formData.get("sort_order") ?? "0",
  });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const gate = await requireStaffOnEvent(parsed.data.eventId, access.user.id);
  if (!gate.ok) return gate;

  const { error } = await gate.supabase.from("milestones").insert({
    event_id: parsed.data.eventId,
    key: parsed.data.key,
    label: parsed.data.label,
    due_at: parsed.data.due_at,
    required: parsed.data.required,
    penalty: parsed.data.penalty,
    sort_order: parsed.data.sort_order,
  });
  if (error) {
    if (/duplicate key/i.test(error.message)) return { ok: false, error: "A milestone with that key already exists." };
    return { ok: false, error: error.message };
  }
  revalidateAfterStaffWrite();
  return { ok: true, message: "Milestone added." };
}

export async function deleteMilestone(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const access = await requireRoles(["organizer", "admin"]);
  const parsed = milestoneIdSchema.safeParse({ id: formData.get("id"), eventId: formData.get("eventId") });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const gate = await requireStaffOnEvent(parsed.data.eventId, access.user.id);
  if (!gate.ok) return gate;

  const { error } = await gate.supabase.from("milestones").delete().eq("id", parsed.data.id).eq("event_id", parsed.data.eventId);
  if (error) return { ok: false, error: error.message };
  revalidateAfterStaffWrite();
  return { ok: true, message: "Milestone removed." };
}

// --- Rubric criteria ---------------------------------------------------

export async function createCriterion(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const access = await requireRoles(["organizer", "admin"]);
  const parsed = rubricCriterionSchema.safeParse({
    eventId: formData.get("eventId"),
    key: formData.get("key"),
    label: formData.get("label"),
    description: formData.get("description"),
    weight: formData.get("weight"),
    scale_max: formData.get("scale_max") ?? "5",
    sort_order: formData.get("sort_order") ?? "0",
  });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const gate = await requireStaffOnEvent(parsed.data.eventId, access.user.id);
  if (!gate.ok) return gate;

  const { error } = await gate.supabase.from("rubric_criteria").insert({
    event_id: parsed.data.eventId,
    key: parsed.data.key,
    label: parsed.data.label,
    description: parsed.data.description,
    weight: parsed.data.weight,
    scale_max: parsed.data.scale_max,
    sort_order: parsed.data.sort_order,
  });
  if (error) {
    if (/duplicate key/i.test(error.message)) return { ok: false, error: "A criterion with that key already exists." };
    return { ok: false, error: error.message };
  }
  revalidateAfterStaffWrite();
  return { ok: true, message: "Rubric criterion added." };
}

export async function deleteCriterion(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const access = await requireRoles(["organizer", "admin"]);
  const parsed = criterionIdSchema.safeParse({ id: formData.get("id"), eventId: formData.get("eventId") });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const gate = await requireStaffOnEvent(parsed.data.eventId, access.user.id);
  if (!gate.ok) return gate;

  const { error } = await gate.supabase.from("rubric_criteria").delete().eq("id", parsed.data.id).eq("event_id", parsed.data.eventId);
  if (error) {
    if (/foreign key|violates/i.test(error.message)) {
      return { ok: false, error: "Can't delete a criterion that already has scores against it." };
    }
    return { ok: false, error: error.message };
  }
  revalidateAfterStaffWrite();
  return { ok: true, message: "Criterion removed." };
}

// --- Judges --------------------------------------------------------

/**
 * Looks up a user by email via the service role (no RLS path exists for an
 * organizer to find a user with no role on their event yet — the same
 * "there is no row to scope the policy to" problem event creation has), then
 * inserts the role via the USER-SCOPED client so the real "staff write event
 * roles" policy is what actually authorizes the write.
 */
export async function inviteJudge(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const access = await requireRoles(["organizer", "admin"]);
  const parsed = inviteJudgeSchema.safeParse({ eventId: formData.get("eventId"), email: formData.get("email") });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const gate = await requireStaffOnEvent(parsed.data.eventId, access.user.id);
  if (!gate.ok) return gate;

  const service = createServiceClient();
  const { data: profile } = await service.from("profiles").select("id").eq("email", parsed.data.email).maybeSingle();
  if (!profile) {
    return { ok: false, error: "No account found with that email yet — they need to sign in at least once first." };
  }

  const { error } = await gate.supabase.from("event_roles").insert({
    event_id: parsed.data.eventId,
    user_id: profile.id,
    role: "judge",
  });
  if (error) {
    if (/duplicate key/i.test(error.message)) return { ok: false, error: "That person already has a role on this event." };
    return { ok: false, error: error.message };
  }
  revalidateAfterStaffWrite();
  return { ok: true, message: "Judge invited." };
}

export async function assignJudge(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const access = await requireRoles(["organizer", "admin"]);
  const parsed = assignJudgeSchema.safeParse({
    eventId: formData.get("eventId"),
    judgeId: formData.get("judgeId"),
    teamId: formData.get("teamId"),
  });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const gate = await requireStaffOnEvent(parsed.data.eventId, access.user.id);
  if (!gate.ok) return gate;

  const { error } = await gate.supabase.from("judge_assignments").insert({
    event_id: parsed.data.eventId,
    judge_id: parsed.data.judgeId,
    team_id: parsed.data.teamId,
    status: "pending",
  });
  if (error) {
    if (/duplicate key/i.test(error.message)) return { ok: false, error: "Already assigned." };
    return { ok: false, error: error.message };
  }
  revalidateAfterStaffWrite();
  return { ok: true, message: "Judge assigned." };
}

export async function removeAssignment(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const access = await requireRoles(["organizer", "admin"]);
  const parsed = removeAssignmentSchema.safeParse({ assignmentId: formData.get("assignmentId") });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { data: assignment } = await supabase.from("judge_assignments").select("event_id").eq("id", parsed.data.assignmentId).maybeSingle();
  if (!assignment) return { ok: false, error: "Assignment not found." };
  const gate = await requireStaffOnEvent(assignment.event_id, access.user.id);
  if (!gate.ok) return gate;

  const { error } = await gate.supabase.from("judge_assignments").delete().eq("id", parsed.data.assignmentId);
  if (error) return { ok: false, error: error.message };
  revalidateAfterStaffWrite();
  return { ok: true, message: "Assignment removed." };
}

// --- Calibration samples --------------------------------------------

export async function createCalibrationSample(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const access = await requireRoles(["organizer", "admin"]);
  const raw = formData.get("referenceScores");
  let referenceScores: Record<string, number> = {};
  try {
    referenceScores = raw ? JSON.parse(String(raw)) : {};
  } catch {
    return { ok: false, error: "Invalid reference scores." };
  }
  const parsed = calibrationSampleSchema.safeParse({
    eventId: formData.get("eventId"),
    title: formData.get("title"),
    description: formData.get("description"),
    referenceScores,
  });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const gate = await requireStaffOnEvent(parsed.data.eventId, access.user.id);
  if (!gate.ok) return gate;

  const referenceScoresArray = Object.entries(parsed.data.referenceScores).map(([criterionId, value]) => ({
    criterionId,
    value,
  }));
  if (referenceScoresArray.length === 0) return { ok: false, error: "Score every criterion for the reference sample." };

  const { error } = await gate.supabase.from("calibration_samples").insert({
    event_id: parsed.data.eventId,
    title: parsed.data.title,
    content: { description: parsed.data.description },
    reference_scores: referenceScoresArray,
  });
  if (error) return { ok: false, error: error.message };
  revalidateAfterStaffWrite();
  return { ok: true, message: "Calibration sample added." };
}

export async function deleteCalibrationSample(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const access = await requireRoles(["organizer", "admin"]);
  const parsed = deleteCalibrationSampleSchema.safeParse({ id: formData.get("id"), eventId: formData.get("eventId") });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const gate = await requireStaffOnEvent(parsed.data.eventId, access.user.id);
  if (!gate.ok) return gate;

  const { error } = await gate.supabase.from("calibration_samples").delete().eq("id", parsed.data.id).eq("event_id", parsed.data.eventId);
  if (error) return { ok: false, error: error.message };
  revalidateAfterStaffWrite();
  return { ok: true, message: "Calibration sample removed." };
}

// --- Recruiter access (talent layer) --------------------------------

/**
 * `recruiter_orgs` has no per-event link (see `auth_recruiter_org_id()`):
 * ANY DPA-signed org unlocks recruiter access for ANY user with a `recruiter`
 * event role on ANY event. That's existing Session-1 schema, not new here —
 * this action just gives staff a UI for what only Supabase Studio could do
 * before. `requireStaffOnEvent` still scopes WHO can create an org through
 * this form to this event's own staff, even though the resulting org's reach
 * is broader than that by the schema's own design.
 */
export async function createRecruiterOrg(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const access = await requireRoles(["organizer", "admin"]);
  const parsed = createRecruiterOrgSchema.safeParse({
    eventId: formData.get("eventId"),
    name: formData.get("name"),
    domain: formData.get("domain") ?? "",
    hiringIntent: formData.get("hiringIntent"),
    dpaSigned: formData.get("dpaSigned") === "on",
  });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const gate = await requireStaffOnEvent(parsed.data.eventId, access.user.id);
  if (!gate.ok) return gate;

  const { data: event } = await gate.supabase.from("events").select("tenant_id").eq("id", parsed.data.eventId).maybeSingle();

  const { error } = await gate.supabase.from("recruiter_orgs").insert({
    tenant_id: event?.tenant_id ?? null,
    name: parsed.data.name,
    domain: parsed.data.domain,
    hiring_intent: parsed.data.hiringIntent,
    dpa_signed_at: parsed.data.dpaSigned ? new Date().toISOString() : null,
  });
  if (error) return { ok: false, error: error.message };
  revalidateAfterStaffWrite();
  return { ok: true, message: "Recruiter org added." };
}

export async function inviteRecruiter(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const access = await requireRoles(["organizer", "admin"]);
  const parsed = inviteRecruiterSchema.safeParse({ eventId: formData.get("eventId"), email: formData.get("email") });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const gate = await requireStaffOnEvent(parsed.data.eventId, access.user.id);
  if (!gate.ok) return gate;

  const service = createServiceClient();
  const { data: profile } = await service.from("profiles").select("id").eq("email", parsed.data.email).maybeSingle();
  if (!profile) {
    return { ok: false, error: "No account found with that email yet — they need to sign in at least once first." };
  }

  const { error } = await gate.supabase.from("event_roles").insert({ event_id: parsed.data.eventId, user_id: profile.id, role: "recruiter" });
  if (error) {
    if (/duplicate key/i.test(error.message)) return { ok: false, error: "That person already has a role on this event." };
    return { ok: false, error: error.message };
  }
  revalidateAfterStaffWrite();
  return { ok: true, message: "Recruiter invited." };
}

// --- Invite links -------------------------------------------------------

export async function createInvite(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const access = await requireRoles(["organizer", "admin"]);
  const parsed = createInviteSchema.safeParse({
    eventId: formData.get("eventId"),
    role: formData.get("role"),
    email: formData.get("email"),
    maxUses: formData.get("maxUses"),
    expiresInDays: formData.get("expiresInDays"),
  });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const gate = await requireStaffOnEvent(parsed.data.eventId, access.user.id);
  if (!gate.ok) return gate;

  const { error } = await gate.supabase.from("event_invites").insert({
    event_id: parsed.data.eventId,
    role: parsed.data.role,
    email: parsed.data.email,
    max_uses: parsed.data.maxUses,
    expires_at: new Date(Date.now() + parsed.data.expiresInDays * 86_400_000).toISOString(),
    created_by: access.user.id,
  });
  if (error) return { ok: false, error: error.message };
  revalidateAfterStaffWrite();
  return { ok: true, message: "Invite link created." };
}

export async function revokeInvite(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const access = await requireRoles(["organizer", "admin"]);
  const parsed = revokeInviteSchema.safeParse({ id: formData.get("id"), eventId: formData.get("eventId") });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const gate = await requireStaffOnEvent(parsed.data.eventId, access.user.id);
  if (!gate.ok) return gate;

  const { error } = await gate.supabase
    .from("event_invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", parsed.data.id)
    .eq("event_id", parsed.data.eventId);
  if (error) return { ok: false, error: error.message };
  revalidateAfterStaffWrite();
  return { ok: true, message: "Invite revoked." };
}
