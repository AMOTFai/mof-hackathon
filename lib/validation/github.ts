import { z } from "zod";

export const syncCommitsSchema = z.object({
  teamId: z.string().uuid(),
});
