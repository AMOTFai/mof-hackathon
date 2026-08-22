import { z } from "zod";
import { SCHEDULE_KINDS } from "@/lib/enums";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null));

function parseIso(value: string): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export const scheduleItemSchema = z
  .object({
    eventId: z.string().uuid("Choose an event"),
    title: z.string().trim().min(2, "Title must be at least 2 characters").max(160),
    kind: z.enum(SCHEDULE_KINDS),
    starts_at: z.string().trim().min(1, "Start time is required"),
    ends_at: z.string().trim().optional(),
    location: optionalText(160),
    description: optionalText(1000),
  })
  .superRefine((value, ctx) => {
    if (!parseIso(value.starts_at)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Start time is not a valid date", path: ["starts_at"] });
    }
    const endsRaw = value.ends_at?.trim() ?? "";
    if (endsRaw && !parseIso(endsRaw)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "End time is not a valid date", path: ["ends_at"] });
    }
  })
  .transform((value) => {
    const startsAt = parseIso(value.starts_at)!.toISOString();
    const endsRaw = value.ends_at?.trim() ?? "";
    const endsAt = endsRaw.length > 0 ? parseIso(endsRaw)!.toISOString() : null;
    return { ...value, starts_at: startsAt, ends_at: endsAt };
  })
  .refine((value) => !value.ends_at || value.ends_at >= value.starts_at, {
    message: "End time must be after the start",
    path: ["ends_at"],
  });

export const scheduleIdSchema = z.object({
  eventId: z.string().uuid(),
  itemId: z.string().uuid(),
});
