import Anthropic from "@anthropic-ai/sdk";

export type ReviewInput = {
  teamName: string;
  projectName: string | null;
  checkIns: { createdAt: Date; text: string; stuckOn: string | null }[];
  commits: { committedAt: Date; message: string }[];
  checkpoints?: { label: string; status: string }[];
  eventStart: Date | null;
  eventEnd: Date | null;
};

export type ReviewResult = {
  summary: string;
  strengths: string[];
  improvements: string[];
  generatedByAI: boolean;
};

// Generates a judging aid from the team's process trail. Uses Claude when
// ANTHROPIC_API_KEY is set; otherwise falls back to a deterministic heuristic
// so the judge dashboard always has something to show.
export async function generateReview(input: ReviewInput): Promise<ReviewResult> {
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      return await aiReview(input);
    } catch (err) {
      console.error("AI review failed, using heuristic fallback:", err);
    }
  }
  return heuristicReview(input);
}

async function aiReview(input: ReviewInput): Promise<ReviewResult> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const model = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";

  const timeline = [
    ...input.checkIns.map((c) => ({
      t: c.createdAt,
      kind: "check-in",
      text: c.stuckOn ? `${c.text} (stuck on: ${c.stuckOn})` : c.text,
    })),
    ...input.commits.map((c) => ({ t: c.committedAt, kind: "commit", text: c.message })),
  ]
    .sort((a, b) => a.t.getTime() - b.t.getTime())
    .map((e) => `[${e.t.toISOString()}] ${e.kind}: ${e.text}`)
    .join("\n");

  const checkpointLine = input.checkpoints?.length
    ? input.checkpoints.map((c) => `${c.label}: ${c.status}`).join(" | ")
    : "(no checkpoint data)";

  const prompt = `You are helping judges at the KCL AI Hackathon understand HOW a team worked over the week, as a judging aid alongside their final demo. This does not replace human scoring. The rubric rewards "team execution under constraint" — steady iteration and checkpoint discipline.

Team: ${input.teamName}
Project: ${input.projectName ?? "(unnamed)"}
${input.eventStart ? `Event window: ${input.eventStart.toISOString()} to ${input.eventEnd?.toISOString() ?? "?"}` : ""}

Checkpoint discipline: ${checkpointLine}

Process trail (check-ins + git commits, chronological):
${timeline || "(no activity logged)"}

Return ONLY minified JSON with this exact shape:
{"summary": string (2-3 sentences on how they worked), "strengths": string[] (2-4 concrete items, e.g. steady iteration, clear problem framing, good pivots), "improvements": string[] (2-4 concrete items, e.g. long gaps, late start, scope thrash)}
Be specific and cite patterns from the trail. Be fair and constructive.`;

  const resp = await client.messages.create({
    model,
    max_tokens: 700,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  const json = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
  const parsed = JSON.parse(json);
  return {
    summary: String(parsed.summary ?? ""),
    strengths: Array.isArray(parsed.strengths) ? parsed.strengths.map(String) : [],
    improvements: Array.isArray(parsed.improvements) ? parsed.improvements.map(String) : [],
    generatedByAI: true,
  };
}

// Deterministic analysis of cadence + gaps. No external calls.
function heuristicReview(input: ReviewInput): ReviewResult {
  const events = [
    ...input.checkIns.map((c) => c.createdAt.getTime()),
    ...input.commits.map((c) => c.committedAt.getTime()),
  ].sort((a, b) => a - b);

  const strengths: string[] = [];
  const improvements: string[] = [];
  const nCheckIns = input.checkIns.length;
  const nCommits = input.commits.length;

  if (events.length === 0) {
    return {
      summary: `${input.teamName} has no logged check-ins or commits yet, so there is no process trail to assess. Judge on the demo alone.`,
      strengths: [],
      improvements: ["No activity logged during the event"],
      generatedByAI: false,
    };
  }

  const start = input.eventStart?.getTime() ?? events[0];
  const end = input.eventEnd?.getTime() ?? events[events.length - 1];
  const span = Math.max(1, end - start);
  const firstOffsetH = (events[0] - start) / 3_600_000;

  // Cadence: how evenly distributed is activity across the window?
  const buckets = 7;
  const active = new Set<number>();
  for (const t of events) active.add(Math.min(buckets - 1, Math.floor(((t - start) / span) * buckets)));
  const coverage = active.size / buckets;

  // Largest idle gap.
  let maxGapH = 0;
  for (let i = 1; i < events.length; i++) maxGapH = Math.max(maxGapH, (events[i] - events[i - 1]) / 3_600_000);

  const stuckCount = input.checkIns.filter((c) => c.stuckOn && c.stuckOn.trim()).length;

  // Checkpoint discipline.
  const cps = input.checkpoints ?? [];
  const missed = cps.filter((c) => c.status === "missed");
  const hit = cps.filter((c) => c.status === "hit");
  if (missed.length) improvements.push(`Missed ${missed.length} checkpoint${missed.length === 1 ? "" : "s"} (${missed.map((c) => c.label).join(", ")})`);
  if (hit.length >= 3) strengths.push(`Strong checkpoint discipline — ${hit.length} hit on time`);

  if (firstOffsetH <= 24) strengths.push("Started early — first activity within a day of kickoff");
  else improvements.push(`Slow start — first activity ~${Math.round(firstOffsetH)}h after kickoff`);

  if (coverage >= 0.6) strengths.push("Steady iteration — activity spread across most of the event");
  else improvements.push("Bursty cadence — work clustered into a few windows rather than spread out");

  if (maxGapH >= 24) improvements.push(`Long quiet stretch — ~${Math.round(maxGapH)}h with no check-ins or commits`);
  else if (events.length > 3) strengths.push("No long silent gaps in the process trail");

  if (stuckCount > 0) strengths.push(`Surfaced blockers openly — flagged what they were stuck on ${stuckCount}×`);
  if (nCheckIns === 0) improvements.push("No manual check-ins — process visibility relies on commits alone");

  const summary = `${input.teamName} logged ${nCheckIns} check-in${nCheckIns === 1 ? "" : "s"} and ${nCommits} commit${
    nCommits === 1 ? "" : "s"
  } across the event, covering ${Math.round(coverage * 100)}% of the timeline with a largest quiet gap of ~${Math.round(
    maxGapH,
  )}h. This is a heuristic read of cadence only — set ANTHROPIC_API_KEY for a qualitative AI review.`;

  return { summary, strengths, improvements, generatedByAI: false };
}
