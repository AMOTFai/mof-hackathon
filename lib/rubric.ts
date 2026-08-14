// KCL AI Hackathon rubric — 100 points, weighted. Each criterion is scored 1-10
// per judge; the weighted contribution is (value / 10) * weight.
export const RUBRIC = [
  { key: "technical", label: "Technical execution", weight: 30, hint: "Does it work; is the AI genuinely load-bearing, not bolted on?" },
  { key: "originality", label: "Originality / problem", weight: 20, hint: "Real problem vs. hackathon cliché." },
  { key: "business", label: "Business viability / GTM", weight: 25, hint: "Commercial thinking — the King's Business School differentiator." },
  { key: "pitch", label: "Pitch / demo quality", weight: 15, hint: "Clarity and quality of the live Sunday pitch." },
  { key: "team", label: "Team execution under constraint", weight: 10, hint: "Log-informed: steady iteration, checkpoint discipline." },
] as const;

export type RubricKey = (typeof RUBRIC)[number]["key"];
export const TOTAL_POINTS = RUBRIC.reduce((s, r) => s + r.weight, 0); // 100
export const RUBRIC_KEYS = new Set<string>(RUBRIC.map((r) => r.key));

export type ScoreLite = { criterion: string; value: number; phase: string; judgeId: string };

// Raw weighted sum of the criteria present in `scores` (out of 100 when complete).
// Used for the live entry preview and the per-row CSV value, where a partial
// card is legitimately shown as "so far".
export function weightedForJudge(scores: ScoreLite[]): number {
  let total = 0;
  for (const r of RUBRIC) {
    const s = scores.find((x) => x.criterion === r.key);
    if (s) total += (s.value / 10) * r.weight;
  }
  return total;
}

export function isCompleteCard(scores: ScoreLite[]): boolean {
  return RUBRIC.every((r) => scores.some((s) => s.criterion === r.key));
}

// A complete judge card scored out of 100, or null if any criterion is missing.
// Only complete cards count toward a team's aggregate — a half-filled card
// mid-judging must not deflate the team by scoring blank criteria as 0.
function completeCardScore(scores: ScoreLite[]): number | null {
  return isCompleteCard(scores) ? weightedForJudge(scores) : null;
}

function groupByJudge(scores: ScoreLite[]): Map<string, ScoreLite[]> {
  const m = new Map<string, ScoreLite[]>();
  for (const s of scores) (m.get(s.judgeId) ?? m.set(s.judgeId, []).get(s.judgeId)!).push(s);
  return m;
}

// Panel average for a single phase: mean of COMPLETE cards in that phase.
export function aggregateWeighted(scores: ScoreLite[], phase: string): number | null {
  const cards: number[] = [];
  for (const [, list] of groupByJudge(scores)) {
    const card = completeCardScore(list.filter((s) => s.phase === phase));
    if (card !== null) cards.push(card);
  }
  return cards.length ? cards.reduce((a, b) => a + b, 0) / cards.length : null;
}

// Final score: per judge, use their complete LIVE card if they have one, else
// their complete PRE-PANEL card. Average across every judge with a usable card.
// This preserves pre-panel judges when only some of the panel re-scores live.
export function finalWeighted(scores: ScoreLite[]): number | null {
  const cards: number[] = [];
  for (const [, list] of groupByJudge(scores)) {
    const live = completeCardScore(list.filter((s) => s.phase === "live"));
    const pre = completeCardScore(list.filter((s) => s.phase === "prepanel"));
    const card = live ?? pre;
    if (card !== null) cards.push(card);
  }
  return cards.length ? cards.reduce((a, b) => a + b, 0) / cards.length : null;
}
