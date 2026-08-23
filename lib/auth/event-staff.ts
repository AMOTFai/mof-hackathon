import { createClient } from "@/lib/supabase/server";

/** Shared by every organizer/results server action that scopes a write to one event's own staff. */
export async function requireStaffOnEvent(eventId: string, userId: string) {
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
