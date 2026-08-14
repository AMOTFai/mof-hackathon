# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Minds of the Future** — a process-visibility platform for the KCL AI Hackathon. Teams log progress against daily checkpoints; judges assess **how** a team worked (the trail: check-ins, commits, proxied AI calls, checkpoint discipline) alongside the final demo, and score against a weighted rubric. The guiding principle across every feature is *visibility, not enforcement* — signals surface for human judgment, never automated penalties.

## Commands

```bash
npm run dev          # dev server, http://localhost:3000
npm run db:reset     # rm dev.db + prisma db push + seed  ← run after ANY schema change
npm run db:seed      # reseed only (tsx prisma/seed.ts)
npm run db:push      # apply schema to DB without seeding
npm run build        # prisma generate && next build
npm run lint         # next lint
npx tsc --noEmit     # typecheck (there is no test suite; this is the main correctness gate)
```

- **After editing `prisma/schema.prisma`, run `npm run db:reset`.** A running `next dev` holds the *old* generated Prisma client in memory + node_modules — it won't pick up schema/client changes until restarted. Reset regenerates the client and reseeds.
- No test framework is wired up. Verify changes with `tsc --noEmit` plus manually driving the app; for the proxy, curl it (see below).

## Environment

Copy `.env.example` → `.env`. `DATABASE_URL` (SQLite) is the only required var. All others are optional and the app degrades gracefully without them:
- `ANTHROPIC_API_KEY` (+ `ANTHROPIC_MODEL`) — real Claude log reviews; without it a deterministic heuristic is used.
- `GITHUB_TOKEN` — raises GitHub commit-sync rate limits.
- `NEXT_PUBLIC_APP_URL` — public origin baked into proxy setup instructions; inferred from request headers if unset.

## Architecture

Next.js 14 App Router + TypeScript + Tailwind, Prisma/SQLite, all data mutations via **server actions** (`app/actions.ts` — one file, grouped by domain). No client-side data fetching; pages are async server components reading Prisma directly.

**Auth (`lib/session.ts`)** — deliberately minimal for a single trusted event: sign-in looks up/creates a `User` by email (no password), stores the user id in an httpOnly cookie. Guards: `requireUser` / `requireStaff` (redirects), and in `actions.ts` `assertStaff` / `requireOrganizer`. Roles are `participant | judge | organizer`.

**Route groups** — `app/(app)/*` is the authed shell (`(app)/layout.tsx` calls `requireUser` + renders `Nav`); `app/signin` and `app/api/*` sit outside it. Key surfaces: `/team` (participant workspace), `/judge` + `/judge/[teamId]` (judge dashboard/detail), `/organizer`, `/leaderboard`, `/profile`.

**Enums are strings** — SQLite has no native enums. Role/bracket/expertise/phase are plain strings in the DB, backed by typed constants in `lib/enums.ts`. Always validate against these sets in actions before writing.

**Domain logic lives in pure `lib/` functions, not the DB**, so it's testable and reused across participant + judge + organizer views:
- `lib/checkpoints.ts` — derives per-team checkpoint status (`hit|late|missed|due-soon|pending`) from checkpoint defs + submissions. Encodes the two hard rules: **missing the Wed V1 slice auto-caps a team to Plate** (`isPlateCapped` / `effectiveBracket`), missing the final flags **DQ risk** (`isDisqualified`). Bracket promotion to Cup is blocked when capped.
- `lib/rubric.ts` — the 100-pt weighted rubric (Technical 30 / Originality 20 / Business-GTM 25 / Pitch 15 / Team 10). Scoring is **two-phase** (`prepanel` async + `live` Sunday pitch). Only **complete cards** (all 5 criteria) count toward aggregates so half-filled cards don't deflate a team; `finalWeighted` uses a judge's live card if present, else their pre-panel card, averaged across judges.
- `lib/ai-review.ts` — `generateReview` returns `{summary, strengths, improvements, generatedByAI}`; Claude path when the API key is set, deterministic heuristic otherwise. Result cached in the `AIReview` table (one per team). Always framed as a judging *aid*, never a score.

**Conflict of interest** — a judge declaring a COI on a team is recused: scoring disabled, and their existing scores for that team are **deleted** so they stop influencing the aggregate.

**Data model** — see `prisma/schema.prisma`. Activity signals (`CheckIn`, `Commit`, `ApiCall`) all link by `teamId` and are surfaced together on the judge detail page. `prisma/seed.ts` anchors the event to the **current week** (Mon–Sun) so checkpoints are always live in a demo; edit team fixtures there.

### API proxy layer (`app/api/proxy/[provider]/[...path]`)

Teams point their AI SDK's `base_url` at us; we forward the call **unmodified using the team's own API key** and log metadata, producing a third activity signal next to commits and check-ins.

- **Thin pass-through** — the route handler has zero provider-specific logic. It resolves the team by token, forwards, and streams the response back through a byte-counting `TransformStream`, logging an `ApiCall` on stream flush (or after buffering when content logging is on). Keep it dumb: no rewriting, no blocking, no rate limiting.
- **Provider adapters** — `lib/providers.ts` is a registry keyed by provider id (`openai`, `anthropic`). Adding a provider = adding one object (`host`, optional `defaultHeaders`, `extractModel`, `setupHint`). Don't push provider logic into the route.
- **Team token** — `Team.proxyToken` (`motf_…`), passed as `?team=` or an `x-motf-team` header. Generated on team creation and rotatable from the profile.
- **Content logging is opt-in per team** (`Team.logApiContent`, default off) — metadata only by default; opting in also stores full request/response (capped 100 KB/field). Surfaced as consent on the participant's profile.

Test the proxy live (forwards to the *real* provider; a bad key yields the provider's genuine error, which still logs correctly):
```bash
curl -s -X POST "http://localhost:3000/api/proxy/openai/v1/chat/completions?team=<token>" \
  -H "Authorization: Bearer sk-invalid" -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"hi"}]}'
```

## Conventions

- Mutations = server actions in `app/actions.ts`. A participant write changes staff views too, so call `revalidateTeamAndStaff(teamId)` (revalidates `/`, `/team`, `/judge`, `/judge/[id]`, `/leaderboard`, `/organizer`).
- Validate string enums against `lib/enums.ts` / `BRACKETS` / `PHASES` before persisting; clamp numeric scores 1–10 server-side.
- Design system is "Aurora Glass": `glass` / `glass-strong` / `chip` / `input` / `btn-*` utility classes in `app/globals.css`; shared bits in `components/ui.tsx`. Interactive pieces are small client components (`"use client"`), pages stay server components.
- Deploy: flip `schema.prisma` provider to `postgresql`, point `DATABASE_URL` at Postgres, `npm run build && npm start`, run `db push` + seed once.
