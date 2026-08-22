/**
 * Generates the cached `ai_reviews` row for a team: a labelled aid for
 * judges, never a score (BUILD-PLAN Part 0 #3 — LLM-as-judge ranking
 * instability is well documented; every AI output here sits beside the raw
 * evidence it was built from, not in place of it). Degrades to a
 * deterministic heuristic without `ANTHROPIC_API_KEY`, same contract as
 * every other optional integration in this app.
 */

export type ProcessSignal = {
  projectName: string | null;
  description: string | null;
  checkInCount: number;
  commitCount: number;
  activeDays: number;
  hitMilestones: string[];
  lateMilestones: string[];
  missedMilestones: string[];
  hasRepo: boolean;
  hasVideo: boolean;
  recentCheckIns: { body: string; blockers: string | null }[];
  recentCommitMessages: string[];
};

export type GeneratedReview = {
  summary: string;
  strengths: string[];
  improvements: string[];
  processNotes: string | null;
  model: string;
  generatedByAI: boolean;
};

const HEURISTIC_MODEL = "heuristic-v1";

function heuristicReview(signal: ProcessSignal): GeneratedReview {
  const strengths: string[] = [];
  const improvements: string[] = [];

  if (signal.checkInCount >= 3) {
    strengths.push(`Logged ${signal.checkInCount} check-ins across ${signal.activeDays} active day(s) — a visible build story.`);
  } else if (signal.checkInCount === 0) {
    improvements.push("No check-ins logged — there's no build story to verify beyond the final submission.");
  } else {
    improvements.push(`Only ${signal.checkInCount} check-in(s) logged — hard to tell how the team got here.`);
  }

  if (signal.commitCount > 0) {
    strengths.push(`Active commit history (${signal.commitCount} commit(s) synced).`);
  } else if (signal.hasRepo) {
    improvements.push("Repo is linked but no commits have synced yet.");
  } else {
    improvements.push("No repository linked — process signal from GitHub is unavailable.");
  }

  if (signal.hitMilestones.length > 0 && signal.missedMilestones.length === 0 && signal.lateMilestones.length === 0) {
    strengths.push("Hit every required milestone on time.");
  }
  if (signal.missedMilestones.length > 0) {
    improvements.push(`Missed milestone(s): ${signal.missedMilestones.join(", ")}.`);
  } else if (signal.lateMilestones.length > 0) {
    improvements.push(`Late on milestone(s): ${signal.lateMilestones.join(", ")}.`);
  }

  if (!signal.hasVideo) {
    improvements.push("No demo video linked yet.");
  }

  if (strengths.length === 0) strengths.push("Submitted a project for judging.");
  if (improvements.length === 0) improvements.push("No obvious gaps in the process signal available.");

  const summary = `${signal.projectName ?? "This team"} logged ${signal.checkInCount} check-in(s) and ${signal.commitCount} commit(s) over ${signal.activeDays} active day(s).`;

  return {
    summary,
    strengths,
    improvements,
    processNotes: "Deterministic heuristic — no AI model was used to generate this summary.",
    model: HEURISTIC_MODEL,
    generatedByAI: false,
  };
}

type ClaudeShape = { summary?: unknown; strengths?: unknown; improvements?: unknown; process_notes?: unknown };

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

async function claudeReview(signal: ProcessSignal, apiKey: string, model: string): Promise<GeneratedReview | null> {
  const prompt = [
    "You are assisting hackathon judges by summarizing a team's BUILD PROCESS from their own logged activity.",
    "You are not scoring the team and must not output a numeric score of any kind.",
    "Base every claim strictly on the data below — do not invent details.",
    "",
    `Project: ${signal.projectName ?? "(untitled)"}`,
    `Description: ${signal.description ?? "(none)"}`,
    `Check-ins: ${signal.checkInCount}, Commits: ${signal.commitCount}, Active days: ${signal.activeDays}`,
    `Milestones hit: ${signal.hitMilestones.join(", ") || "none"}`,
    `Milestones late: ${signal.lateMilestones.join(", ") || "none"}`,
    `Milestones missed: ${signal.missedMilestones.join(", ") || "none"}`,
    `Repo linked: ${signal.hasRepo}, Video linked: ${signal.hasVideo}`,
    "Recent check-ins:",
    ...signal.recentCheckIns.slice(0, 8).map((c) => `- ${c.body}${c.blockers ? ` (blocked: ${c.blockers})` : ""}`),
    "Recent commit messages:",
    ...signal.recentCommitMessages.slice(0, 8).map((m) => `- ${m}`),
    "",
    'Respond with ONLY a JSON object: {"summary": string, "strengths": string[], "improvements": string[], "process_notes": string}.',
  ].join("\n");

  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;

  let text: string | undefined;
  try {
    const body = (await res.json()) as { content?: { type?: string; text?: string }[] };
    text = body.content?.find((b) => b.type === "text")?.text;
  } catch {
    return null;
  }
  if (!text) return null;

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  let parsed: ClaudeShape;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }
  if (typeof parsed.summary !== "string" || !isStringArray(parsed.strengths) || !isStringArray(parsed.improvements)) {
    return null;
  }

  return {
    summary: parsed.summary,
    strengths: parsed.strengths,
    improvements: parsed.improvements,
    processNotes: typeof parsed.process_notes === "string" ? parsed.process_notes : null,
    model,
    generatedByAI: true,
  };
}

/** Always succeeds — falls back to the heuristic on any Claude failure, never throws. */
export async function generateReview(signal: ProcessSignal): Promise<GeneratedReview> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return heuristicReview(signal);

  const model = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";
  const claude = await claudeReview(signal, apiKey, model);
  return claude ?? heuristicReview(signal);
}
