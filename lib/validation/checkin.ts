import { z } from "zod";
import { isHttpUrl } from "@/lib/url";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null));

export const createCheckInSchema = z.object({
  teamId: z.string().uuid(),
  milestoneId: z
    .string()
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null))
    .refine((value) => value === null || z.string().uuid().safeParse(value).success, "Invalid milestone"),
  body: z.string().trim().min(1, "Say what happened").max(4000, "Keep it under 4000 characters"),
  linkUrl: z
    .string()
    .trim()
    .max(2048)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null))
    .refine((value) => value === null || isHttpUrl(value), "Enter a valid http(s) URL"),
  blockers: optionalText(2000),
});

export const deleteCheckInSchema = z.object({
  checkInId: z.string().uuid(),
});
