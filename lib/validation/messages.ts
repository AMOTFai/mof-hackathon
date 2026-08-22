import { z } from "zod";

export const teamMessageSchema = z.object({
  eventId: z.string().uuid(),
  teamId: z.string().uuid(),
  body: z.string().trim().min(1, "Message cannot be empty").max(4000),
});

export const announcementSchema = z.object({
  eventId: z.string().uuid(),
  body: z.string().trim().min(1, "Announcement cannot be empty").max(4000),
  urgent: z.boolean().default(false),
});

export const markReadSchema = z.object({
  messageId: z.string().uuid(),
});
