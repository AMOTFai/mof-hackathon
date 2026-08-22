import { z } from "zod";
import { TALENT_VISIBILITY } from "@/lib/enums";

export const CONSENT_SCOPE_KEYS = ["profile", "projects", "contact"] as const;
export type ConsentScopeKey = (typeof CONSENT_SCOPE_KEYS)[number];

export const upsertTalentProfileSchema = z.object({
  visibility: z.enum(TALENT_VISIBILITY),
  headline: z.string().trim().max(200).optional().transform((v) => (v && v.length > 0 ? v : null)),
  openTo: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) =>
      (v ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
    ),
  scopes: z.record(z.enum(CONSENT_SCOPE_KEYS), z.boolean()),
  // Consent duration in days from now — expiry is a real, enforced field, not cosmetic.
  durationDays: z.coerce.number().int().min(1).max(365).default(90),
});

export const requestErasureSchema = z.object({
  scope: z.enum(["full", "talent_only"]),
});

export const completeErasureSchema = z.object({ requestId: z.string().uuid() });

export const createRecruiterOrgSchema = z.object({
  eventId: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  domain: z.string().trim().max(120).optional().transform((v) => (v && v.length > 0 ? v : null)),
  hiringIntent: z.string().trim().min(2).max(200),
  dpaSigned: z.boolean(),
});

export const inviteRecruiterSchema = z.object({
  eventId: z.string().uuid(),
  email: z.string().trim().toLowerCase().email(),
});

// intro_requests is alumni-network territory (only an alumnus can be the
// requester per RLS) — that's Session 12, not this one. Left out here.
