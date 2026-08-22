"use server";

import { requireRoles } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { revalidateAfterStaffWrite } from "@/lib/cache/revalidate";
import { firstIssue, type ActionResult } from "@/lib/forms";
import { isScheduleKind } from "@/lib/enums";
import { announcementSchema } from "@/lib/validation/messages";
import { scheduleIdSchema, scheduleItemSchema } from "@/lib/validation/schedule";

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

export async function createScheduleItem(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const access = await requireRoles(["organizer", "admin"]);
  const parsed = scheduleItemSchema.safeParse({
    eventId: formData.get("eventId"),
    title: formData.get("title"),
    kind: formData.get("kind"),
    starts_at: formData.get("starts_at"),
    ends_at: formData.get("ends_at") ?? "",
    location: formData.get("location") ?? "",
    description: formData.get("description") ?? "",
  });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  if (!isScheduleKind(parsed.data.kind)) return { ok: false, error: "Invalid session kind." };

  const gate = await requireStaffOnEvent(parsed.data.eventId, access.user.id);
  if (!gate.ok) return gate;

  const { error } = await gate.supabase.from("schedule_items").insert({
    event_id: parsed.data.eventId,
    title: parsed.data.title,
    kind: parsed.data.kind,
    starts_at: parsed.data.starts_at,
    ends_at: parsed.data.ends_at,
    location: parsed.data.location,
    description: parsed.data.description,
  });
  if (error) return { ok: false, error: error.message };
  revalidateAfterStaffWrite();
  return { ok: true, message: "Added to the schedule." };
}

export async function updateScheduleItem(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const access = await requireRoles(["organizer", "admin"]);
  const ids = scheduleIdSchema.safeParse({ eventId: formData.get("eventId"), itemId: formData.get("itemId") });
  if (!ids.success) return { ok: false, error: firstIssue(ids.error) };
  const parsed = scheduleItemSchema.safeParse({
    eventId: ids.data.eventId,
    title: formData.get("title"),
    kind: formData.get("kind"),
    starts_at: formData.get("starts_at"),
    ends_at: formData.get("ends_at") ?? "",
    location: formData.get("location") ?? "",
    description: formData.get("description") ?? "",
  });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const gate = await requireStaffOnEvent(parsed.data.eventId, access.user.id);
  if (!gate.ok) return gate;

  const { error } = await gate.supabase
    .from("schedule_items")
    .update({
      title: parsed.data.title,
      kind: parsed.data.kind,
      starts_at: parsed.data.starts_at,
      ends_at: parsed.data.ends_at,
      location: parsed.data.location,
      description: parsed.data.description,
    })
    .eq("id", ids.data.itemId)
    .eq("event_id", parsed.data.eventId);
  if (error) return { ok: false, error: error.message };
  revalidateAfterStaffWrite();
  return { ok: true, message: "Schedule updated." };
}

export async function deleteScheduleItem(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const access = await requireRoles(["organizer", "admin"]);
  const parsed = scheduleIdSchema.safeParse({
    eventId: formData.get("eventId"),
    itemId: formData.get("itemId"),
  });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const gate = await requireStaffOnEvent(parsed.data.eventId, access.user.id);
  if (!gate.ok) return gate;

  const { error } = await gate.supabase
    .from("schedule_items")
    .delete()
    .eq("id", parsed.data.itemId)
    .eq("event_id", parsed.data.eventId);
  if (error) return { ok: false, error: error.message };
  revalidateAfterStaffWrite();
  return { ok: true, message: "Removed from the schedule." };
}

export async function postAnnouncement(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const access = await requireRoles(["organizer", "admin"]);
  const parsed = announcementSchema.safeParse({
    eventId: formData.get("eventId"),
    body: formData.get("body"),
    urgent: formData.get("urgent") === "on",
  });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const gate = await requireStaffOnEvent(parsed.data.eventId, access.user.id);
  if (!gate.ok) return gate;

  const { error } = await gate.supabase.from("messages").insert({
    event_id: parsed.data.eventId,
    channel_type: "announcement",
    team_id: null,
    sender_id: access.user.id,
    body: parsed.data.body,
    urgent: parsed.data.urgent,
  });
  if (error) return { ok: false, error: error.message };
  revalidateAfterStaffWrite();
  return { ok: true, message: "Announcement sent." };
}
