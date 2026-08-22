"use server";

import { requireRoles } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { revalidateAfterStaffWrite } from "@/lib/cache/revalidate";
import { firstIssue, type ActionResult } from "@/lib/forms";
import { z } from "zod";
import { isBracket } from "@/lib/enums";
import { listRubricCriteria, getJudgeCardsForTeam, getTeamRatings } from "@/lib/judging/queries";
import { aggregateRubricScore } from "@/lib/judging/aggregate";
import { computeBracket, rankTeams } from "@/lib/judging/results";
import { isPlateCapped, type MilestoneDef, type CheckInRec } from "@/lib/checkins/status";
import { isHttpUrl } from "@/lib/url";

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

const eventIdSchema = z.object({ eventId: z.string().uuid() });

/**
 * Computes bracket + ranks for every submitted team and writes `results`.
 * Does NOT publish (participants can't see it yet) — that's a separate
 * explicit toggle, so an organizer can recompute and sanity-check before a
 * team ever sees a rank.
 */
export async function computeResults(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const access = await requireRoles(["organizer", "admin"]);
  const parsed = eventIdSchema.safeParse({ eventId: formData.get("eventId") });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const gate = await requireStaffOnEvent(parsed.data.eventId, access.user.id);
  if (!gate.ok) return gate;
  const { supabase } = gate;

  const { data: event, error: eventErr } = await supabase
    .from("events")
    .select("pairwise_blend, cup_score_threshold, working_demo_required")
    .eq("id", parsed.data.eventId)
    .single();
  if (eventErr) return { ok: false, error: eventErr.message };

  const { data: teams, error: teamsErr } = await supabase
    .from("teams")
    .select("id, submitted_at, video_url")
    .eq("event_id", parsed.data.eventId)
    .not("submitted_at", "is", null);
  if (teamsErr) return { ok: false, error: teamsErr.message };
  if (!teams || teams.length === 0) return { ok: false, error: "No submitted teams to score yet." };

  const { data: milestoneRows, error: milestoneErr } = await supabase
    .from("milestones")
    .select("id, key, label, due_at, required, penalty, sort_order")
    .eq("event_id", parsed.data.eventId);
  if (milestoneErr) return { ok: false, error: milestoneErr.message };
  const milestoneDefs: MilestoneDef[] = (milestoneRows ?? []).map((m) => ({
    id: m.id,
    key: m.key,
    label: m.label,
    dueAt: m.due_at,
    required: m.required,
    penalty: m.penalty as MilestoneDef["penalty"],
    sortOrder: m.sort_order,
  }));

  const criteria = await listRubricCriteria(supabase, parsed.data.eventId);
  const ratings = await getTeamRatings(supabase, parsed.data.eventId);
  const ratingByTeam = new Map(ratings.map((r) => [r.teamId, r.mu]));

  const perTeam = await Promise.all(
    teams.map(async (team) => {
      const [cards, { data: checkInRows }] = await Promise.all([
        getJudgeCardsForTeam(supabase, team.id, criteria),
        supabase.from("check_ins").select("milestone_id, created_at").eq("team_id", team.id),
      ]);
      const checkIns: CheckInRec[] = (checkInRows ?? []).map((c) => ({
        milestoneId: c.milestone_id,
        createdAt: c.created_at,
      }));
      const capped = isPlateCapped(milestoneDefs, checkIns);
      const rubricScore = aggregateRubricScore(cards);
      const bracket = computeBracket({
        capped,
        rubricScore,
        cupScoreThreshold: event.cup_score_threshold,
        hasWorkingDemo: isHttpUrl(team.video_url),
        workingDemoRequired: event.working_demo_required,
      });
      return { teamId: team.id, rubricScore, pairwiseMu: ratingByTeam.get(team.id) ?? null, bracket };
    }),
  );

  const ranks = rankTeams(
    perTeam.map((t) => ({ teamId: t.teamId, rubricScore: t.rubricScore, pairwiseMu: t.pairwiseMu })),
    event.pairwise_blend,
  );
  const rankByTeam = new Map(ranks.map((r) => [r.teamId, r]));

  const rows = perTeam.map((t) => {
    const rank = rankByTeam.get(t.teamId);
    return {
      team_id: t.teamId,
      rubric_score: t.rubricScore,
      pairwise_rank: rank?.pairwiseRank ?? null,
      final_rank: rank?.finalRank ?? null,
      bracket: t.bracket,
    };
  });

  // Preserve any existing `published` flag and an explicit `disqualified`
  // override — this recompute must never silently un-disqualify a team an
  // organizer flagged by hand (see setTeamBracket).
  const { data: existing } = await supabase
    .from("results")
    .select("team_id, published, bracket")
    .in("team_id", rows.map((r) => r.team_id));
  const existingByTeam = new Map((existing ?? []).map((r) => [r.team_id, r]));

  const upsertRows = rows.map((r) => {
    const prior = existingByTeam.get(r.team_id);
    return {
      ...r,
      bracket: prior?.bracket === "disqualified" ? "disqualified" : r.bracket,
      published: prior?.published ?? false,
    };
  });

  const { error } = await supabase.from("results").upsert(upsertRows, { onConflict: "team_id" });
  if (error) return { ok: false, error: error.message };

  revalidateAfterStaffWrite();
  return { ok: true, message: `Computed results for ${rows.length} team(s). Not published yet.` };
}

const publishSchema = z.object({ eventId: z.string().uuid(), published: z.boolean() });

export async function setResultsPublished(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const access = await requireRoles(["organizer", "admin"]);
  const parsed = publishSchema.safeParse({
    eventId: formData.get("eventId"),
    published: formData.get("published") === "true",
  });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const gate = await requireStaffOnEvent(parsed.data.eventId, access.user.id);
  if (!gate.ok) return gate;

  const { data: teams, error: teamsErr } = await gate.supabase
    .from("teams")
    .select("id")
    .eq("event_id", parsed.data.eventId);
  if (teamsErr) return { ok: false, error: teamsErr.message };
  const teamIds = (teams ?? []).map((t) => t.id);
  if (teamIds.length === 0) return { ok: false, error: "No teams to publish for." };

  const { error } = await gate.supabase
    .from("results")
    .update({ published: parsed.data.published })
    .in("team_id", teamIds);
  if (error) return { ok: false, error: error.message };

  revalidateAfterStaffWrite();
  return { ok: true, message: parsed.data.published ? "Results published to teams." : "Results unpublished." };
}

const setBracketSchema = z.object({ teamId: z.string().uuid(), bracket: z.string() });

/** Explicit, human-only override — e.g. disqualification. Never set by computeResults. */
export async function setTeamBracket(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const access = await requireRoles(["organizer", "admin"]);
  const parsed = setBracketSchema.safeParse({ teamId: formData.get("teamId"), bracket: formData.get("bracket") });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  if (!isBracket(parsed.data.bracket)) return { ok: false, error: "Invalid bracket." };

  const supabase = await createClient();
  const { data: team } = await supabase.from("teams").select("event_id").eq("id", parsed.data.teamId).maybeSingle();
  if (!team) return { ok: false, error: "Team not found." };
  const gate = await requireStaffOnEvent(team.event_id, access.user.id);
  if (!gate.ok) return gate;

  const { error } = await gate.supabase
    .from("results")
    .upsert({ team_id: parsed.data.teamId, bracket: parsed.data.bracket }, { onConflict: "team_id" });
  if (error) return { ok: false, error: error.message };

  revalidateAfterStaffWrite();
  return { ok: true, message: `Bracket set to ${parsed.data.bracket}.` };
}
