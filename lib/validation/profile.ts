import { z } from "zod";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null));

export const profileUpdateSchema = z.object({
  full_name: optionalText(120),
  university: optionalText(160),
  course: optionalText(160),
  grad_year: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null))
    .superRefine((value, ctx) => {
      if (value === null) return;
      if (!/^\d{4}$/.test(value)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Graduation year must be a 4-digit year" });
        return;
      }
      const year = Number(value);
      if (year < 2000 || year > 2040) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Graduation year must be between 2000 and 2040",
        });
      }
    })
    .transform((value) => (value === null ? null : Number(value))),
  bio: optionalText(1000),
  skills: z
    .string()
    .optional()
    .transform((value) =>
      (value ?? "")
        .split(",")
        .map((skill) => skill.trim())
        .filter((skill) => skill.length > 0)
        .slice(0, 24),
    ),
  github_username: optionalText(80).superRefine((value, ctx) => {
    if (value === null) return;
    if (!/^[A-Za-z0-9-]+$/.test(value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "GitHub username can only use letters, numbers, and hyphens",
      });
    }
  }),
  timezone: z.string().trim().min(1).max(80),
});

export type ProfileUpdateInput = z.output<typeof profileUpdateSchema>;
