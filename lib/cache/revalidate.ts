import { revalidatePath } from "next/cache";

/** After a participant or staff write, refresh nested dashboards. */
export function revalidateAfterParticipantWrite() {
  revalidatePath("/dashboard", "layout");
  revalidatePath("/judge", "layout");
  revalidatePath("/organizer", "layout");
  revalidatePath("/alumni", "layout");
}

export const revalidateAfterStaffWrite = revalidateAfterParticipantWrite;
