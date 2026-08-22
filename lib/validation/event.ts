import { z } from "zod";

const slugRe = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const createEventSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .min(2)
      .max(60)
      .regex(slugRe, "Lowercase letters, numbers, and hyphens only."),
    tagline: z.string().trim().max(200).optional().transform((v) => (v && v.length > 0 ? v : null)),
    venue: z.string().trim().max(200).optional().transform((v) => (v && v.length > 0 ? v : null)),
    starts_at: z.string().min(1).transform((v) => new Date(v).toISOString()),
    ends_at: z.string().min(1).transform((v) => new Date(v).toISOString()),
    submission_deadline: z.string().min(1).transform((v) => new Date(v).toISOString()),
    max_team_size: z.coerce.number().int().min(1).max(20).default(5),
  })
  .refine((v) => new Date(v.ends_at) > new Date(v.starts_at), {
    message: "End must be after start.",
    path: ["ends_at"],
  })
  .refine((v) => new Date(v.submission_deadline) <= new Date(v.ends_at), {
    message: "Submission deadline must be at or before the event ends.",
    path: ["submission_deadline"],
  });

export const milestoneSchema = z.object({
  eventId: z.string().uuid(),
  key: z
    .string()
    .trim()
    .toLowerCase()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9_]+$/, "Lowercase letters, numbers, underscores only."),
  label: z.string().trim().min(1).max(120),
  due_at: z.string().min(1).transform((v) => new Date(v).toISOString()),
  required: z.boolean(),
  penalty: z.enum(["none", "flag", "plate_cap", "disqualify"]),
  sort_order: z.coerce.number().int().min(0).max(1000),
});

export const milestoneIdSchema = z.object({ id: z.string().uuid(), eventId: z.string().uuid() });

export const rubricCriterionSchema = z.object({
  eventId: z.string().uuid(),
  key: z
    .string()
    .trim()
    .toLowerCase()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9_]+$/, "Lowercase letters, numbers, underscores only."),
  label: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(500),
  weight: z.coerce.number().int().min(1).max(100),
  scale_max: z.coerce.number().int().min(2).max(20),
  sort_order: z.coerce.number().int().min(0).max(1000),
});

export const criterionIdSchema = z.object({ id: z.string().uuid(), eventId: z.string().uuid() });

export const inviteJudgeSchema = z.object({
  eventId: z.string().uuid(),
  email: z.string().trim().toLowerCase().email(),
});

export const assignJudgeSchema = z.object({
  eventId: z.string().uuid(),
  judgeId: z.string().uuid(),
  teamId: z.string().uuid(),
});

export const removeAssignmentSchema = z.object({ assignmentId: z.string().uuid() });

export const calibrationSampleSchema = z.object({
  eventId: z.string().uuid(),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(2000),
  referenceScores: z.record(z.string().uuid(), z.number().min(0)),
});

export const deleteCalibrationSampleSchema = z.object({ id: z.string().uuid(), eventId: z.string().uuid() });

export const createInviteSchema = z.object({
  eventId: z.string().uuid(),
  role: z.enum(["participant", "judge", "recruiter"]),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(320)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null))
    .refine((v) => v === null || z.string().email().safeParse(v).success, "Enter a valid email or leave blank."),
  maxUses: z.coerce.number().int().min(1).max(500).default(1),
  expiresInDays: z.coerce.number().int().min(1).max(365).default(14),
});

export const revokeInviteSchema = z.object({ id: z.string().uuid(), eventId: z.string().uuid() });
