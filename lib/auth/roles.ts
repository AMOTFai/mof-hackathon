import { cache } from "react";
import { isRole, type Role } from "@/lib/enums";
import { createClient } from "@/lib/supabase/server";
import { homePath } from "@/lib/auth/paths";
import { ensureProfile, requireUser } from "@/lib/auth/session";

export type EventRoleRow = {
  role: Role;
  eventId: string;
  eventSlug: string;
  eventName: string;
};

export const getEventRoles = cache(async (userId: string): Promise<EventRoleRow[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("event_roles")
    .select("role, event_id, events!event_roles_event_id_fkey(slug, name)")
    .eq("user_id", userId);

  if (error) throw error;

  const rows: EventRoleRow[] = [];
  for (const row of data ?? []) {
    if (!isRole(row.role)) continue;
    const event = Array.isArray(row.events) ? row.events[0] : row.events;
    if (!event) continue;
    rows.push({
      role: row.role,
      eventId: row.event_id,
      eventSlug: event.slug,
      eventName: event.name,
    });
  }
  return rows;
});

export const isAlumnus = cache(async (): Promise<boolean> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("auth_is_alumnus");
  if (error) throw error;
  return Boolean(data);
});

export async function resolveAccess() {
  const user = await requireUser();
  await ensureProfile(user);
  const eventRoles = await getEventRoles(user.id);
  const alumnus = await isAlumnus();
  const roles = eventRoles.map((row) => row.role);
  return {
    user,
    eventRoles,
    roles,
    isAlumnus: alumnus,
    home: homePath(roles, alumnus),
  };
}
