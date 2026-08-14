# Minds of the Future — KCL AI Hackathon platform

A process-visibility platform for running the KCL AI Hackathon. Teams log their
progress against daily checkpoints; judges review that trail — with an AI summary,
GitHub activity, and the final video — and score against a weighted rubric. The
point: assess **how** a team worked, not just the final demo.

## Stack

- **Next.js 14** (App Router, server actions) + **TypeScript** + **Tailwind**
- **Prisma + SQLite** locally (swap `provider` to `postgresql` to deploy)
- **Anthropic SDK** for AI log review — optional, with a deterministic heuristic fallback
- **Aurora Glass** design system — animated gradient-mesh background, frosted glass, Inter + JetBrains Mono

## Run it

```bash
npm install
cp .env.example .env      # SQLite defaults; add ANTHROPIC_API_KEY for real AI review
npm run db:reset          # schema + seed (event auto-anchors to the current week)
npm run dev               # http://localhost:3000
```

The seed anchors the event to the **current week** (Mon–Sun) so checkpoints are
always live: some past (hit/missed), today's due soon, the rest upcoming.

## Demo accounts (email only, no password)

| Email | Role | Notes |
|---|---|---|
| `organizer@motf.dev` | organizer | Console, judge assignment, reopen submissions, CSV export |
| `judge.garry@motf.dev` | judge (commercial) | Assigned Cup + Plate |
| `judge.ada@motf.dev` | judge (technical) | Assigned Cup; **has a declared COI on Forge** (scoring disabled) |
| `maya.chen@motf.dev` | participant | Team **Forge** (live — post check-ins here) |
| `grace.kim@motf.dev` | participant | Team **Nimbus** (struggling, Plate-capped) |

## What's in it

**Participant**
- Overview: next-deadline countdown, checkpoint grid, mandatory **6pm daily check-in** state
- Team workspace: roster, **6 KCL checkpoints** (submit/update each), <30s check-in, project details, YC-style final submission (locks check-ins)
- Team channel + read-only announcements, schedule, profile

**Checkpoints** (KCL structure, `lib/checkpoints.ts`)
- Problem statement → Plan → **V1 slice (Wed)** → Feature-complete → Feature freeze → Final
- Per-team status: hit / late / missed / due-soon / pending
- **Missing the Wed V1 slice auto-caps the team to Plate**; missing the final flags DQ risk

**Judge**
- Dashboard: score-ring per team, weighted totals, bracket filter, "assigned to you" / "your conflict" flags
- Team detail: AI log review (checkpoint-aware), checkpoint timeline, check-in log, GitHub commits, **inline video player**, private notes
- **Weighted 100-pt rubric** (Technical 30 / Originality 20 / Business-GTM 25 / Pitch 15 / Team-execution 10)
- **Two-phase scoring**: pre-panel (async) + live pitch (Sunday); live overrides pre-panel in the final
- **Conflict of interest**: declare → recused, scoring disabled

**Organizer**
- Console: judge→bracket assignment (3–5 per bracket), team bracket control, reopen submissions, COI register
- **Leaderboard**: live rankings by weighted score, per bracket
- **CSV export** (`/api/scores.csv`): every judge/phase/criterion + weighted totals for the final tally

## API proxy — a third activity signal

Teams point their AI SDK's `base_url` at us instead of the provider. We forward the
call **unmodified using the team's own API key** and log metadata about it, so a
team's AI usage shows up on the judge log next to commits and check-ins. It's a
visibility layer, not enforcement: nothing is blocked, teams can bypass it, and a
gap between API activity and commit history is a flag for a human judge — never an
automated penalty.

- **Endpoint** — `POST /api/proxy/{provider}/...` (`app/api/proxy/[provider]/[...path]`). A thin pass-through: resolve team → forward → stream the response back, counting bytes.
- **Team token** — each team gets a `motf_…` token (in `Team.proxyToken`), sent as an `x-motf-team` header or `?team=` query param. Setup snippets are on the team member's **profile** page (base_url + header + a copy-paste OpenAI example).
- **Adapters** — `lib/providers.ts` registry, currently `openai` (+ OpenAI-compatible) and `anthropic`. Adding a provider is one object; the route handler has no provider-specific logic.
- **Content logging is opt-in** — default logs metadata only (provider, model, timing, request/response sizes). A team can opt in from their profile to also store full prompt/response content (`Team.logApiContent`), capped at 100 KB/field.
- **Judge view** — an **API activity** section on each team's detail page: call count vs. commit count, providers/models used, active window, and a per-call timeline.

## Optional integrations

- **AI review** — set `ANTHROPIC_API_KEY` for qualitative Claude reviews; otherwise a heuristic reads cadence, gaps, and checkpoint discipline. Always a judging *aid*, shown beside the raw log.
- **GitHub** — teams link a repo; judges click **Sync commits**. `GITHUB_TOKEN` raises rate limits.

## Data model

`User`, `Team`, `CheckIn`, `Message`, `ScheduleItem`, `Checkpoint`, `TeamCheckpoint`,
`Score` (phased), `Commit`, `ApiCall`, `AIReview`, `JudgeAssignment`, `ConflictOfInterest`,
`JudgeNote`. SQLite has no enums — role/bracket/phase are strings backed by typed
constants in `lib/enums.ts`.

## Deploy

1. `prisma/schema.prisma`: `provider = "postgresql"`.
2. Point `DATABASE_URL` at Postgres/Supabase.
3. `npm run build && npm run start`; run `prisma db push` + seed once against the new DB.

## Scope note

Process-visibility, not surveillance. Check-ins are opt-in and framed as helping
judges understand a team's journey. Not repurposed beyond this event's judging.
