export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

export function firstIssue(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? "Invalid input";
}
