import { z } from "zod";
import { PHASES } from "@/lib/enums";

export const submitScoresSchema = z.object({
  teamId: z.string().uuid(),
  phase: z.enum(PHASES),
  scores: z.record(z.string().uuid(), z.number().min(0)),
});

export const submitCalibrationSchema = z.object({
  sampleId: z.string().uuid(),
  scores: z.record(z.string().uuid(), z.number().min(0)),
});

export const declareConflictSchema = z.object({
  teamId: z.string().uuid(),
  reason: z.string().trim().max(500).optional().transform((v) => (v && v.length > 0 ? v : null)),
});

export const pairwiseVoteSchema = z.object({
  eventId: z.string().uuid(),
  winnerId: z.string().uuid(),
  loserId: z.string().uuid(),
});

export const discussionFlagSchema = z.object({
  teamId: z.string().uuid(),
  note: z.string().trim().max(1000).optional().transform((v) => (v && v.length > 0 ? v : null)),
});

export const judgeNoteSchema = z.object({
  teamId: z.string().uuid(),
  body: z.string().trim().min(1).max(4000),
});

export const aiFeedbackSchema = z.object({
  teamId: z.string().uuid(),
  helpful: z.boolean(),
});

export const teamIdSchema = z.object({ teamId: z.string().uuid() });
