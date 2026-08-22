# CLAUDE.md

Guidance for working on **Minds of the Future** — a venue-agnostic process-visibility hackathon platform. Judges score the artifact *and* the journey (check-ins, commits, optional AI-call metadata). AI assists; humans decide. Consent is granular, expiring, and revocable.

Authoritative spec: `BUILD-PLAN-v3.md`.

## Commands

```bash
pnpm dev              # Next.js 15, http://localhost:3000
pnpm build            # next build
pnpm lint             # next lint
pnpm test             # vitest run
pnpm test:rls         # schema coverage + RLS (live cases need .env.local)
npx tsc --noEmit      # typecheck
```

Apply schema (after verifying the Supabase project is **EU London / eu-west-2**):

```bash
pnpm supabase:types   # supabase gen types → lib/database.types.ts
```

Migrations live in `supabase/migrations/`. After any schema change, regenerate types. A running `next dev` will not pick up new generated types until restarted.

## Environment

Copy `.env.example` → `.env.local`. Required to talk to a live project:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` — server-only, never in a client bundle

Optional, degrade gracefully:

- `ANTHROPIC_API_KEY` (+ `ANTHROPIC_MODEL`) — real log reviews; else heuristic
- `GITHUB_TOKEN` — commit-sync rate limits
- `RESEND_API_KEY` — transactional email
- `NEXT_PUBLIC_APP_URL` — public origin for proxy setup copy
- `SENTRY_DSN`

## Architecture

Next.js 15 App Router + TypeScript strict + Tailwind + shadcn/ui. Data access is the **Supabase JS client** (server) with types from `supabase gen types` — never hand-written table types. Mutations go through server actions / route handlers that use the user-scoped client so **RLS is the authorisation boundary**. The service-role client is only for webhooks, cron, and bootstrap.

**Auth** — Supabase Auth (magic link + GitHub). Session in `@/lib/supabase/{client,server,middleware}.ts`. Roles are **per-event** in `event_roles` (`participant | judge | organizer | recruiter | admin`), never a column on `profiles`.

**Route groups** — `(auth)`, `(participant)`, `(judge)`, `(organizer)`, `(recruiter)`, `(alumni)`. Guards in `lib/auth/`. Direct URL access to another role's group must redirect.

**Domain logic** lives in pure `lib/` functions, not in SQL views:

- `lib/judging/rubric.ts` — weighted rubric, complete-card rule
- `lib/judging/aggregate.ts` — drop-high/low, two-phase (prepanel/live)
- `lib/judging/pairwise.ts` — Crowd-BT + information-gain pair selection
- `lib/ai/summarize.ts` — cached `ai_reviews`, never a score
- `lib/consent/` — scopes, expiry, erasure
- `lib/validation/` — Zod schemas shared client + server

**Proxy** (`app/api/proxy/[provider]/route.ts`) — thin pass-through, metadata only, never prompt/response bodies, fail-open.

## Conventions

- Validate enums against `lib/enums.ts` before writes.
- Clamp scores to the criterion `scale_max` server-side.
- After a participant write, revalidate participant + judge + organizer paths.
- No KCL-specific copy, checkpoints, or branding anywhere.
- Design: shadcn/ui + Tailwind. Interactive islands are `"use client"`; pages stay server components.
