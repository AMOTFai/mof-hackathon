import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { isMilestonePenalty } from "@/lib/enums";
import type { CheckInRec, MilestoneDef } from "@/lib/checkins/status";

type Client = SupabaseClient<Database>;

export type CheckInEntry = {
  id: string;
  teamId: string;
  authorId: string;
  authorName: string | null;
  milestoneId: string | null;
  milestoneLabel: string | null;
  body: string;
  linkUrl: string | null;
  blockers: string | null;
  createdAt: string;
};

function asProfile(value: unknown): { full_name: string | null } | null {
  if (!value || typeof value !== "object") return null;
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object") return null;
  const rec = row as { full_name?: unknown };
  return { full_name: typeof rec.full_name === "string" ? rec.full_name : null };
}

function asMilestone(value: unknown): { label: string } | null {
  if (!value || typeof value !== "object") return null;
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object") return null;
  const rec = row as { label?: unknown };
  return { label: typeof rec.label === "string" ? rec.label : "" };
}

export async function listMilestones(supabase: Client, eventId: string): Promise<MilestoneDef[]> {
  const { data, error } = await supabase
    .from("milestones")
    .select("id, key, label, due_at, required, penalty, sort_order")
    .eq("event_id", eventId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []).flatMap((row) => {
    if (!isMilestonePenalty(row.penalty)) return [];
    return [
      {
        id: row.id,
        key: row.key,
        label: row.label,
        dueAt: row.due_at,
        required: row.required,
        penalty: row.penalty,
        sortOrder: row.sort_order,
      },
    ];
  });
}

export async function listCheckInRecs(supabase: Client, teamId: string): Promise<CheckInRec[]> {
  const { data, error } = await supabase
    .from("check_ins")
    .select("milestone_id, created_at")
    .eq("team_id", teamId);
  if (error) throw error;
  return (data ?? []).map((row) => ({ milestoneId: row.milestone_id, createdAt: row.created_at }));
}

export async function listCheckIns(supabase: Client, teamId: string): Promise<CheckInEntry[]> {
  const { data, error } = await supabase
    .from("check_ins")
    .select(
      "id, team_id, author_id, milestone_id, body, link_url, blockers, created_at, profiles!check_ins_author_id_fkey(full_name), milestones(label)",
    )
    .eq("team_id", teamId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    teamId: row.team_id,
    authorId: row.author_id,
    authorName: asProfile(row.profiles)?.full_name ?? null,
    milestoneId: row.milestone_id,
    milestoneLabel: asMilestone(row.milestones)?.label ?? null,
    body: row.body,
    linkUrl: row.link_url,
    blockers: row.blockers,
    createdAt: row.created_at,
  }));
}
