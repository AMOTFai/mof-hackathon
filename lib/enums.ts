export const ROLES = ["participant", "judge", "organizer", "recruiter", "admin"] as const;
export type Role = (typeof ROLES)[number];

export const BRACKETS = ["cup", "plate", "unassigned", "disqualified"] as const;
export type Bracket = (typeof BRACKETS)[number];

export const EVENT_STATUSES = ["draft", "open", "live", "judging", "complete", "archived"] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const PHASES = ["prepanel", "live"] as const;
export type Phase = (typeof PHASES)[number];

export const MILESTONE_PENALTIES = ["none", "flag", "plate_cap", "disqualify"] as const;
export type MilestonePenalty = (typeof MILESTONE_PENALTIES)[number];

export const MILESTONE_STATUSES = ["hit", "late", "missed"] as const;
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];

export const TEAM_MEMBER_ROLES = ["captain", "member"] as const;
export type TeamMemberRole = (typeof TEAM_MEMBER_ROLES)[number];

export const ASSIGNMENT_STATUSES = ["pending", "in_progress", "complete", "recused"] as const;
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

export const TALENT_VISIBILITY = ["private", "alumni", "recruiters"] as const;
export type TalentVisibility = (typeof TALENT_VISIBILITY)[number];

export const CONSENT_ACTIONS = ["granted", "updated", "withdrawn", "expired"] as const;
export type ConsentAction = (typeof CONSENT_ACTIONS)[number];

export const SCHEDULE_KINDS = ["session", "speaker", "deadline", "social", "judging", "ceremony"] as const;
export type ScheduleKind = (typeof SCHEDULE_KINDS)[number];

export const MESSAGE_CHANNELS = ["team", "announcement"] as const;
export type MessageChannel = (typeof MESSAGE_CHANNELS)[number];

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

export function isBracket(value: string): value is Bracket {
  return (BRACKETS as readonly string[]).includes(value);
}

export function isPhase(value: string): value is Phase {
  return (PHASES as readonly string[]).includes(value);
}

export function isTeamMemberRole(value: string): value is TeamMemberRole {
  return (TEAM_MEMBER_ROLES as readonly string[]).includes(value);
}

export function isScheduleKind(value: string): value is ScheduleKind {
  return (SCHEDULE_KINDS as readonly string[]).includes(value);
}

export function isMilestonePenalty(value: string): value is MilestonePenalty {
  return (MILESTONE_PENALTIES as readonly string[]).includes(value);
}
