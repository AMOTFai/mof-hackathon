import { isHttpUrl } from "@/lib/url";

export type SubmissionFields = {
  projectName: string | null;
  repoUrl: string | null;
  videoUrl: string | null;
};

/**
 * Mirrors the required-field checks in the submit_team RPC so the UI can
 * disable the button before a round trip. The RPC stays the source of truth —
 * this is a hint, not the gate.
 */
export function missingSubmissionFields(team: SubmissionFields): string[] {
  const missing: string[] = [];
  if (!team.projectName || team.projectName.trim().length === 0) missing.push("project name");
  if (!isHttpUrl(team.repoUrl)) missing.push("repo URL");
  if (!isHttpUrl(team.videoUrl)) missing.push("demo video URL");
  return missing;
}

export function isSubmissionReady(team: SubmissionFields): boolean {
  return missingSubmissionFields(team).length === 0;
}

export function isPastDeadline(deadlineIso: string, now = new Date()): boolean {
  return now.getTime() > new Date(deadlineIso).getTime();
}
