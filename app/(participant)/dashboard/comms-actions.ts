"use server";

import { requireRoles } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { revalidateAfterParticipantWrite } from "@/lib/cache/revalidate";
import { firstIssue, type ActionResult } from "@/lib/forms";
import { markReadSchema, teamMessageSchema } from "@/lib/validation/messages";

export async function sendTeamMessage(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const access = await requireRoles(["participant"]);
  const parsed = teamMessageSchema.safeParse({
    eventId: formData.get("eventId"),
    teamId: formData.get("teamId"),
    body: formData.get("body"),
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

  const { error } = await supabase.from("messages").insert({
    event_id: parsed.data.eventId,
    channel_type: "team",
    team_id: parsed.data.teamId,
    sender_id: access.user.id,
    body: parsed.data.body,
  });
  if (error) return { ok: false, error: error.message };
  revalidateAfterParticipantWrite();
  return { ok: true };
}

export async function markAnnouncementRead(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const access = await requireRoles(["participant"]);
  const parsed = markReadSchema.safeParse({ messageId: formData.get("messageId") });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.from("announcement_reads").insert({
    message_id: parsed.data.messageId,
    user_id: access.user.id,
  });
  if (error && !/duplicate|announcement_reads_pkey/i.test(error.message)) {
    return { ok: false, error: error.message };
  }
  revalidateAfterParticipantWrite();
  return { ok: true, message: "Marked as read." };
}
