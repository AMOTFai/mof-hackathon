export type RubricCriterion = {
  id: string;
  key: string;
  label: string;
  description: string;
  weight: number;
  scaleMax: number;
  sortOrder: number;
};

export type ScoreEntry = { criterionId: string; value: number };

/**
 * A "card" is one judge's scores for one team in one phase. Only complete
 * cards (every criterion scored) count toward aggregates, so a judge who
 * scored 3 of 5 criteria and stopped doesn't quietly drag the average down —
 * this is the project's stated rule (CLAUDE.md), not an incidental default.
 */
export function isCardComplete(criteria: RubricCriterion[], scores: ScoreEntry[]): boolean {
  if (criteria.length === 0) return false;
  const scored = new Set(scores.map((s) => s.criterionId));
  return criteria.every((c) => scored.has(c.id));
}

/**
 * Weighted total on a 0-100 scale. Each criterion's value (0..scaleMax) is
 * normalized to a fraction before weighting, so criteria with different scale
 * maxima combine correctly. Returns null for an incomplete card — callers must
 * not silently treat a partial card as a low score.
 */
export function weightedTotal(criteria: RubricCriterion[], scores: ScoreEntry[]): number | null {
  if (!isCardComplete(criteria, scores)) return null;
  const byId = new Map(scores.map((s) => [s.criterionId, s.value]));
  let weightedSum = 0;
  let totalWeight = 0;
  for (const c of criteria) {
    const value = byId.get(c.id) ?? 0;
    const fraction = c.scaleMax > 0 ? clamp(value, 0, c.scaleMax) / c.scaleMax : 0;
    weightedSum += fraction * c.weight;
    totalWeight += c.weight;
  }
  if (totalWeight === 0) return null;
  return (weightedSum / totalWeight) * 100;
}

export function clampScoreValue(value: number, scaleMax: number): number {
  return clamp(Math.round(value * 100) / 100, 0, scaleMax);
}

/**
 * The schema has no CHECK constraint bounding `scores.value` to a criterion's
 * `scale_max` (aggregation clamps defensively via weightedTotal, but a raw
 * out-of-range value should never be storable). Server actions must call
 * this before every insert/update — it's the actual gate, not the clamp.
 */
export function isValueInRange(value: number, scaleMax: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= scaleMax;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
