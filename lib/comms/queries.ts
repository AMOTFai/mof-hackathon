import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { isScheduleKind, type ScheduleKind } from "@/lib/enums";

type Client = SupabaseClient<Database>;

export type ScheduleItem = {
  id: string;
  eventId: string;
  title: string;
  kind: ScheduleKind;
  startsAt: string;
  endsAt: string | null;
  location: string | null;
  description: string | null;
};

export type ChatMessage = {
  id: string;
  eventId: string;
  teamId: string | null;
  channelType: "team" | "announcement" | "judge";
  senderId: string;
  senderName: string | null;
  senderAvatarUrl: string | null;
  body: string;
  urgent: boolean;
  createdAt: string;
};

export type Announcement = ChatMessage & {
  readAt: string | null;
  readCount?: number;
};

function asProfile(value: unknown): { full_name: string | null; avatar_url: string | null } | null {
  if (!value || typeof value !== "object") return null;
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object") return null;
  const rec = row as { full_name?: unknown; avatar_url?: unknown };
  return {
    full_name: typeof rec.full_name === "string" ? rec.full_name : null,
    avatar_url: typeof rec.avatar_url === "string" ? rec.avatar_url : null,
  };
}

export async function listSchedule(supabase: Client, eventId: string): Promise<ScheduleItem[]> {
  const { data, error } = await supabase
    .from("schedule_items")
    .select("id, event_id, title, kind, starts_at, ends_at, location, description")
    .eq("event_id", eventId)
    .order("starts_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).flatMap((row) => {
    if (!isScheduleKind(row.kind)) return [];
    return [
      {
        id: row.id,
        eventId: row.event_id,
        title: row.title,
        kind: row.kind,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        location: row.location,
        description: row.description,
      },
    ];
  });
}

export async function listTeamMessages(supabase: Client, teamId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from("messages")
    .select(
      "id, event_id, team_id, channel_type, sender_id, body, urgent, created_at, profiles!messages_sender_id_fkey(full_name, avatar_url)",
    )
    .eq("team_id", teamId)
    .eq("channel_type", "team")
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    eventId: row.event_id,
    teamId: row.team_id,
    channelType: "team",
    senderId: row.sender_id,
    senderName: asProfile(row.profiles)?.full_name ?? null,
    senderAvatarUrl: asProfile(row.profiles)?.avatar_url ?? null,
    body: row.body,
    urgent: row.urgent,
    createdAt: row.created_at,
  }));
}

export async function listJudgeMessages(supabase: Client, eventId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from("messages")
    .select(
      "id, event_id, team_id, channel_type, sender_id, body, urgent, created_at, profiles!messages_sender_id_fkey(full_name, avatar_url)",
    )
    .eq("event_id", eventId)
    .eq("channel_type", "judge")
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    eventId: row.event_id,
    teamId: row.team_id,
    channelType: "judge",
    senderId: row.sender_id,
    senderName: asProfile(row.profiles)?.full_name ?? null,
    senderAvatarUrl: asProfile(row.profiles)?.avatar_url ?? null,
    body: row.body,
    urgent: row.urgent,
    createdAt: row.created_at,
  }));
}

export async function listAnnouncements(
  supabase: Client,
  eventId: string,
  userId: string,
): Promise<Announcement[]> {
  const { data, error } = await supabase
    .from("messages")
    .select(
      "id, event_id, team_id, channel_type, sender_id, body, urgent, created_at, profiles!messages_sender_id_fkey(full_name, avatar_url)",
    )
    .eq("event_id", eventId)
    .eq("channel_type", "announcement")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;

  const ids = (data ?? []).map((row) => row.id);
  const reads = new Map<string, string>();
  if (ids.length > 0) {
    const { data: receipts, error: readError } = await supabase
      .from("announcement_reads")
      .select("message_id, read_at")
      .eq("user_id", userId)
      .in("message_id", ids);
    if (readError) throw readError;
    for (const row of receipts ?? []) reads.set(row.message_id, row.read_at);
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    eventId: row.event_id,
    teamId: row.team_id,
    channelType: "announcement",
    senderId: row.sender_id,
    senderName: asProfile(row.profiles)?.full_name ?? null,
    senderAvatarUrl: asProfile(row.profiles)?.avatar_url ?? null,
    body: row.body,
    urgent: row.urgent,
    createdAt: row.created_at,
    readAt: reads.get(row.id) ?? null,
  }));
}

export async function announcementReadCounts(supabase: Client, messageIds: string[]) {
  if (messageIds.length === 0) return new Map<string, number>();
  const { data, error } = await supabase
    .from("announcement_reads")
    .select("message_id")
    .in("message_id", messageIds);
  if (error) throw error;
  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    counts.set(row.message_id, (counts.get(row.message_id) ?? 0) + 1);
  }
  return counts;
}

export async function countParticipants(supabase: Client, eventId: string): Promise<number> {
  const { count, error } = await supabase
    .from("event_roles")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId)
    .eq("role", "participant");
  if (error) throw error;
  return count ?? 0;
}

export function staffEvents(eventRoles: { role: string; eventId: string; eventSlug: string; eventName: string }[]) {
  const seen = new Map<string, { eventId: string; eventSlug: string; eventName: string }>();
  for (const row of eventRoles) {
    if (row.role === "organizer" || row.role === "admin") {
      seen.set(row.eventId, { eventId: row.eventId, eventSlug: row.eventSlug, eventName: row.eventName });
    }
  }
  return [...seen.values()];
}
