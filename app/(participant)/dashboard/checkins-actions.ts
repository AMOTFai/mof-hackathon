"use server";

import { requireRoles } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { revalidateAfterParticipantWrite } from "@/lib/cache/revalidate";
import { firstIssue, type ActionResult } from "@/lib/forms";
import { createCheckInSchema, deleteCheckInSchema } from "@/lib/validation/checkin";

export async function createCheckIn(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const access = await requireRoles(["participant"]);
  const parsed = createCheckInSchema.safeParse({
    teamId: formData.get("teamId"),
    milestoneId: formData.get("milestoneId"),
    body: formData.get("body"),
    linkUrl: formData.get("linkUrl"),
    blockers: formData.get("blockers"),
  });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { data: member } = await supabase
    .from("team_members")
    .select("team_id")
    .eq("team_id", parsed.data.teamId)
    .eq("user_id", access.user.id)
    .maybeSingle();
  if (!member) return { ok: false, error: "You are not on this team." };

  const { error } = await supabase.from("check_ins").insert({
    team_id: parsed.data.teamId,
    author_id: access.user.id,
    milestone_id: parsed.data.milestoneId,
    body: parsed.data.body,
    link_url: parsed.data.linkUrl,
    blockers: parsed.data.blockers,
  });
  if (error) {
    if (/submitted_at/i.test(error.message) || /row-level security/i.test(error.message)) {
      return { ok: false, error: "This team's submission is locked — no further check-ins." };
    }
    return { ok: false, error: error.message };
  }
  revalidateAfterParticipantWrite();
  return { ok: true, message: "Check-in logged." };
}

export async function deleteCheckIn(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireRoles(["participant"]);
  const parsed = deleteCheckInSchema.safeParse({ checkInId: formData.get("checkInId") });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.from("check_ins").delete().eq("id", parsed.data.checkInId);
  if (error) return { ok: false, error: error.message };
  revalidateAfterParticipantWrite();
  return { ok: true, message: "Check-in removed." };
}
