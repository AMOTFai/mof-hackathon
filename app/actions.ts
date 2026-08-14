"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { clearSession, getCurrentUser, requireStaff, requireUser } from "@/lib/session";
import { ANNOUNCEMENTS, BRACKETS, PHASES, isStaff } from "@/lib/enums";
import { fetchCommits } from "@/lib/github";
import { generateReview } from "@/lib/ai-review";
import { statusFor, isPlateCapped, type CheckpointDef } from "@/lib/checkpoints";
import { RUBRIC_KEYS } from "@/lib/rubric";
import { genProxyToken } from "@/lib/proxy";

export async function signOut() {
  clearSession();
  redirect("/signin");
}

// A participant write (check-in, checkpoint, final) changes what staff see too,
// so refresh the team view AND every staff surface derived from it.
function revalidateTeamAndStaff(teamId: string) {
  revalidatePath("/");
  revalidatePath("/team");
  revalidatePath("/judge");
  revalidatePath(`/judge/${teamId}`);
  revalidatePath("/leaderboard");
  revalidatePath("/organizer");
}

// ---------- Profile ----------
export async function updateProfile(formData: FormData) {
  const user = await requireUser();
  await prisma.user.update({
    where: { id: user.id },
    data: {
      name: String(formData.get("name") || user.name).trim(),
      university: String(formData.get("university") || "").trim() || null,
      skills: String(formData.get("skills") || "").trim() || null,
      bio: String(formData.get("bio") || "").trim() || null,
    },
  });
  revalidatePath("/profile");
}

// ---------- Teams ----------
export async function createTeam(formData: FormData) {
  const user = await requireUser();
  const name = String(formData.get("name") || "").trim();
  if (!name) return;
  const team = await prisma.team.create({ data: { name, projectName: String(formData.get("projectName") || "").trim() || null, proxyToken: genProxyToken() } });
  await prisma.user.update({ where: { id: user.id }, data: { teamId: team.id } });
  revalidatePath("/team");
}

export async function joinTeam(formData: FormData) {
  const user = await requireUser();
  const teamId = String(formData.get("teamId") || "");
  // Re-count inside a transaction so two concurrent joins can't both pass the cap.
  await prisma.$transaction(async (tx) => {
    const team = await tx.team.findUnique({ where: { id: teamId }, include: { _count: { select: { members: true } } } });
    if (!team) throw new Error("Team not found.");
    if (team.submittedAt) throw new Error("This team has already submitted.");
    if (team._count.members >= 5) throw new Error("Team is full (max 5).");
    await tx.user.update({ where: { id: user.id }, data: { teamId } });
  });
  revalidatePath("/team");
}

export async function leaveTeam() {
  const user = await requireUser();
  const teamId = user.teamId;
  if (!teamId) return;
  await prisma.user.update({ where: { id: user.id }, data: { teamId: null } });
  // Clean up a team that just lost its last member (unless it already submitted).
  const remaining = await prisma.user.count({ where: { teamId } });
  if (remaining === 0) {
    const team = await prisma.team.findUnique({ where: { id: teamId } });
    if (team && !team.submittedAt) await prisma.team.delete({ where: { id: teamId } });
  }
  revalidatePath("/team");
}

export async function updateTeam(formData: FormData) {
  const user = await requireUser();
  if (!user.teamId) return;
  await prisma.team.update({
    where: { id: user.teamId },
    data: {
      projectName: String(formData.get("projectName") || "").trim() || null,
      description: String(formData.get("description") || "").trim() || null,
      repoUrl: String(formData.get("repoUrl") || "").trim() || null,
    },
  });
  revalidatePath("/team");
}

// ---------- API proxy ----------
// Opt-in: a team can choose to have full prompt/response content stored (not just
// metadata) for deeper judge review. Framed as consent, defaults off.
export async function setApiContentLogging(formData: FormData) {
  const user = await requireUser();
  if (!user.teamId) return;
  const enabled = String(formData.get("enabled")) === "true";
  await prisma.team.update({ where: { id: user.teamId }, data: { logApiContent: enabled } });
  revalidatePath("/profile");
}

// Rotate the proxy token (e.g. if it leaked). Old base_url stops routing.
export async function regenProxyToken() {
  const user = await requireUser();
  if (!user.teamId) return;
  await prisma.team.update({ where: { id: user.teamId }, data: { proxyToken: genProxyToken() } });
  revalidatePath("/profile");
}

// ---------- Check-ins ----------
export async function createCheckIn(formData: FormData) {
  const user = await requireUser();
  if (!user.teamId || !user.team) return;
  if (user.team.submittedAt) throw new Error("Check-ins are locked after final submission.");
  const text = String(formData.get("text") || "").trim();
  if (!text) return;
  await prisma.checkIn.create({
    data: {
      teamId: user.teamId,
      authorName: user.name,
      text,
      stuckOn: String(formData.get("stuckOn") || "").trim() || null,
      link: String(formData.get("link") || "").trim() || null,
    },
  });
  revalidateTeamAndStaff(user.teamId);
}

// ---------- Checkpoints ----------
export async function submitCheckpoint(formData: FormData) {
  const user = await requireUser();
  if (!user.teamId || !user.team) return;
  if (user.team.submittedAt) throw new Error("Checkpoints are locked after final submission.");
  const checkpointId = String(formData.get("checkpointId") || "");
  const content = String(formData.get("content") || "").trim();
  const cp = await prisma.checkpoint.findUnique({ where: { id: checkpointId } });
  if (!cp) return;
  if (cp.requiresText && !content) throw new Error("This checkpoint needs a short note.");
  await prisma.teamCheckpoint.upsert({
    where: { teamId_checkpointId: { teamId: user.teamId, checkpointId } },
    create: { teamId: user.teamId, checkpointId, content: content || null },
    update: { content: content || null, submittedAt: new Date() },
  });
  revalidateTeamAndStaff(user.teamId);
}

// ---------- Final submission ----------
export async function submitFinal(formData: FormData) {
  const user = await requireUser();
  if (!user.teamId) return;
  await prisma.team.update({
    where: { id: user.teamId },
    data: {
      projectName: String(formData.get("projectName") || "").trim() || null,
      description: String(formData.get("description") || "").trim() || null,
      repoUrl: String(formData.get("repoUrl") || "").trim() || null,
      videoUrl: String(formData.get("videoUrl") || "").trim() || null,
      submittedAt: new Date(),
    },
  });
  // Mark the "final" checkpoint hit.
  const final = await prisma.checkpoint.findUnique({ where: { key: "final" } });
  if (final) {
    await prisma.teamCheckpoint.upsert({
      where: { teamId_checkpointId: { teamId: user.teamId, checkpointId: final.id } },
      create: { teamId: user.teamId, checkpointId: final.id, content: "Final submitted." },
      update: { submittedAt: new Date() },
    });
  }
  revalidateTeamAndStaff(user.teamId);
}

export async function reopenSubmission(formData: FormData) {
  await requireStaff();
  const teamId = String(formData.get("teamId") || "");
  await prisma.team.update({ where: { id: teamId }, data: { submittedAt: null } });
  revalidateTeamAndStaff(teamId);
}

// ---------- Messaging ----------
export async function sendMessage(formData: FormData) {
  const user = await requireUser();
  const channel = String(formData.get("channel") || "");
  const text = String(formData.get("text") || "").trim();
  if (!text || !channel) return;
  if (channel === ANNOUNCEMENTS) {
    if (!isStaff(user.role)) throw new Error("Only organizers can post announcements.");
  } else if (channel !== user.teamId && !isStaff(user.role)) {
    throw new Error("Not a member of this channel.");
  }
  await prisma.message.create({ data: { channel, senderId: user.id, text } });
  revalidatePath("/messages");
}

// ---------- Schedule ----------
export async function addScheduleItem(formData: FormData) {
  await requireStaff();
  const startsAt = new Date(String(formData.get("startsAt")));
  const title = String(formData.get("title") || "").trim();
  if (!title || isNaN(startsAt.getTime())) return;
  await prisma.scheduleItem.create({
    data: { startsAt, title, location: String(formData.get("location") || "").trim() || null, description: String(formData.get("description") || "").trim() || null },
  });
  revalidatePath("/schedule");
}

export async function deleteScheduleItem(formData: FormData) {
  await requireStaff();
  await prisma.scheduleItem.delete({ where: { id: String(formData.get("id") || "") } });
  revalidatePath("/schedule");
}

// ---------- Judge: GitHub, AI review, scoring, brackets, COI, notes ----------
export async function syncGithub(formData: FormData) {
  await requireStaff();
  const teamId = String(formData.get("teamId") || "");
  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team?.repoUrl) return;
  const commits = await fetchCommits(team.repoUrl);
  for (const c of commits) {
    await prisma.commit.upsert({
      where: { teamId_sha: { teamId, sha: c.sha } },
      create: { teamId, sha: c.sha, message: c.message, author: c.author, committedAt: c.committedAt, url: c.url },
      update: {},
    });
  }
  revalidatePath(`/judge/${teamId}`);
}

export async function generateAIReview(formData: FormData) {
  await requireStaff();
  const teamId = String(formData.get("teamId") || "");
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: { checkIns: true, commits: true, checkpoints: { include: { checkpoint: true } } },
  });
  if (!team) return;
  const cps = await prisma.checkpoint.findMany({ orderBy: { order: "asc" } });

  const checkpointSummary = cps.map((c) => {
    const rec = team.checkpoints.find((t) => t.checkpointId === c.id);
    const st = statusFor(
      { ...c } as any,
      rec ? { checkpointId: rec.checkpointId, content: rec.content, submittedAt: rec.submittedAt } : undefined,
    );
    return { label: c.label, status: st };
  });

  const result = await generateReview({
    teamName: team.name,
    projectName: team.projectName,
    checkIns: team.checkIns.map((c) => ({ createdAt: c.createdAt, text: c.text, stuckOn: c.stuckOn })),
    commits: team.commits.map((c) => ({ committedAt: c.committedAt, message: c.message })),
    checkpoints: checkpointSummary,
    eventStart: cps[0]?.dueAt ?? null,
    eventEnd: cps[cps.length - 1]?.dueAt ?? null,
  });

  await prisma.aIReview.upsert({
    where: { teamId },
    create: { teamId, summary: result.summary, strengths: JSON.stringify(result.strengths), improvements: JSON.stringify(result.improvements), generatedByAI: result.generatedByAI },
    update: { summary: result.summary, strengths: JSON.stringify(result.strengths), improvements: JSON.stringify(result.improvements), generatedByAI: result.generatedByAI, createdAt: new Date() },
  });
  revalidatePath(`/judge/${teamId}`);
}

export async function saveScores(formData: FormData) {
  const judge = await requireStaff();
  const teamId = String(formData.get("teamId") || "");
  const phase = String(formData.get("phase") || "prepanel");
  if (!PHASES.includes(phase as any)) return;

  // Block scoring a team the judge has a conflict on.
  const coi = await prisma.conflictOfInterest.findUnique({ where: { judgeId_teamId: { judgeId: judge.id, teamId } } });
  if (coi) throw new Error("You have a declared conflict on this team.");

  for (const [key, raw] of formData.entries()) {
    if (!key.startsWith("score__")) continue;
    const criterion = key.slice("score__".length);
    if (!RUBRIC_KEYS.has(criterion)) continue; // ignore unknown criteria
    const parsed = parseInt(String(raw), 10);
    if (isNaN(parsed)) continue;
    const value = Math.max(1, Math.min(10, parsed)); // enforce 1-10 server-side
    const comment = String(formData.get(`comment__${criterion}`) || "").trim() || null;
    await prisma.score.upsert({
      where: { teamId_judgeId_criterion_phase: { teamId, judgeId: judge.id, criterion, phase } },
      create: { teamId, judgeId: judge.id, criterion, phase, value, comment },
      update: { value, comment },
    });
  }
  revalidatePath(`/judge/${teamId}`);
}

export async function setBracket(formData: FormData) {
  await requireStaff();
  const teamId = String(formData.get("teamId") || "");
  const bracket = String(formData.get("bracket") || "unassigned");
  if (!BRACKETS.includes(bracket as any)) return;
  // A Plate-capped team (missed the Wed slice) cannot be promoted to Cup.
  if (bracket === "cup") {
    const [team, cpsRaw] = await Promise.all([
      prisma.team.findUnique({ where: { id: teamId }, include: { checkpoints: true } }),
      prisma.checkpoint.findMany({ orderBy: { order: "asc" } }),
    ]);
    const defs: CheckpointDef[] = cpsRaw.map((c) => ({ ...c }));
    const recs = (team?.checkpoints ?? []).map((c) => ({ checkpointId: c.checkpointId, content: c.content, submittedAt: c.submittedAt }));
    if (isPlateCapped(defs, recs)) throw new Error("Team is Plate-capped (missed the Wed V1 slice) and can't be promoted to Cup.");
  }
  await prisma.team.update({ where: { id: teamId }, data: { bracket } });
  revalidatePath("/judge");
  revalidatePath("/organizer");
  revalidatePath("/leaderboard");
  revalidatePath(`/judge/${teamId}`);
}

export async function toggleConflict(formData: FormData) {
  const judge = await requireStaff();
  const teamId = String(formData.get("teamId") || "");
  const existing = await prisma.conflictOfInterest.findUnique({ where: { judgeId_teamId: { judgeId: judge.id, teamId } } });
  if (existing) {
    await prisma.conflictOfInterest.delete({ where: { id: existing.id } });
  } else {
    await prisma.conflictOfInterest.create({ data: { judgeId: judge.id, teamId, reason: String(formData.get("reason") || "").trim() || null } });
    // A recused judge's earlier scores must not keep influencing the team's final.
    await prisma.score.deleteMany({ where: { judgeId: judge.id, teamId } });
  }
  revalidatePath(`/judge/${teamId}`);
  revalidatePath("/judge");
  revalidatePath("/leaderboard");
}

export async function saveNote(formData: FormData) {
  const judge = await requireStaff();
  const teamId = String(formData.get("teamId") || "");
  const text = String(formData.get("text") || "").trim();
  if (!text) {
    await prisma.judgeNote.deleteMany({ where: { judgeId: judge.id, teamId } });
  } else {
    await prisma.judgeNote.upsert({
      where: { teamId_judgeId: { teamId, judgeId: judge.id } },
      create: { teamId, judgeId: judge.id, text },
      update: { text },
    });
  }
  revalidatePath(`/judge/${teamId}`);
}

// ---------- Organizer: judge assignment ----------
export async function toggleAssignment(formData: FormData) {
  await requireOrganizer();
  const judgeId = String(formData.get("judgeId") || "");
  const bracket = String(formData.get("bracket") || "");
  if (!["cup", "plate"].includes(bracket)) return;
  const existing = await prisma.judgeAssignment.findUnique({ where: { judgeId_bracket: { judgeId, bracket } } });
  if (existing) await prisma.judgeAssignment.delete({ where: { id: existing.id } });
  else await prisma.judgeAssignment.create({ data: { judgeId, bracket } });
  revalidatePath("/organizer");
}

// ---------- Guards ----------
export async function assertStaff() {
  const user = await getCurrentUser();
  if (!user || !isStaff(user.role)) redirect("/");
  return user;
}

export async function requireOrganizer() {
  const user = await getCurrentUser();
  if (!user || user.role !== "organizer") redirect("/");
  return user;
}
