import { z } from "zod";
import { isHttpUrl } from "@/lib/url";

const optionalHttpUrl = z
  .string()
  .trim()
  .max(2048)
  .optional()
  .transform((value) => (value && value.length > 0 ? value : null))
  .refine((value) => value === null || isHttpUrl(value), "Enter a valid http(s) URL");

export const createTeamSchema = z.object({
  eventId: z.string().uuid("Choose an event"),
  name: z.string().trim().min(2, "Team name must be at least 2 characters").max(80),
});

export const joinTeamSchema = z.object({
  eventId: z.string().uuid("Choose an event"),
  inviteCode: z
    .string()
    .trim()
    .min(4, "Enter the invite code")
    .max(16)
    .transform((value) => value.toLowerCase()),
});

export const updateTeamSchema = z.object({
  teamId: z.string().uuid(),
  name: z.string().trim().min(2, "Team name must be at least 2 characters").max(80),
  project_name: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null)),
  description: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null)),
  repo_url: optionalHttpUrl,
  video_url: optionalHttpUrl,
});

export const submitTeamSchema = z.object({
  teamId: z.string().uuid(),
  idempotencyKey: z.string().uuid(),
});

export const memberActionSchema = z.object({
  teamId: z.string().uuid(),
  userId: z.string().uuid(),
});

export const setMemberRoleSchema = memberActionSchema.extend({
  role: z.enum(["captain", "member"]),
});
