import { z } from "zod";

export const ALUMNI_POST_KINDS = ["ask", "offer", "update", "intro_request"] as const;

export const createPostSchema = z.object({
  kind: z.enum(ALUMNI_POST_KINDS),
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(4000),
  tags: z
    .string()
    .trim()
    .max(300)
    .optional()
    .transform((v) =>
      (v ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
});

export const deletePostSchema = z.object({ id: z.string().uuid() });

export const sendIntroSchema = z.object({
  targetId: z.string().uuid(),
  context: z.string().trim().min(1).max(1000),
});

export const respondIntroSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["accepted", "declined"]),
});
