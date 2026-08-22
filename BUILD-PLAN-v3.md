# Minds of the Future.ai — Engineering Build Plan v3

**Status:** Authoritative build spec. Supersedes v1 and v2.
**Scope:** Full platform, built to production standard from day one.
**Premise change from v2:** the event happens regardless of KCL. This plan is no longer gated on institutional approval. It is scoped to build the best hackathon platform in existence, and to be venue-agnostic so it runs wherever the event lands.

---

## Session 1 implementation notes (this repo)

Locked before the first migration:

- Rewrite in this folder. Commit `ec05d4a` is the KCL Prisma/SQLite prototype snapshot.
- First migration is Part 2 **plus** columns later sessions require (see `supabase/migrations/0001_init.sql` header).
- Scaffold now; live Supabase keys land in `.env.local` before `pnpm test:rls` can hit a real database.
- Nothing KCL-specific in new code.

The remainder of this file is the v3 spec as written.

---

## Part 0 — Product principles

These decide every ambiguous call downstream. When in doubt, return here.

1. **Process signal is the product.** Every competitor judges the artifact. We judge the artifact *and* the journey. Check-ins, commits, and optional AI-call metadata form a build story no CV or demo can fake.
2. **Consent is the moat, not the constraint.** Triplebyte's assessment tech was acquired; its scraped candidate database was switched off and thrown away. Participant-owned, portable, revocable profiles are what make the talent layer durable rather than legally radioactive.
3. **AI assists, humans decide.** LLM-as-judge research shows ranking instability of up to 14 positions and severe position bias. Every AI output in this system is a labelled aid presented next to raw evidence, never a score.
4. **The deadline is the failure mode.** Junction X 2023 crashed at submission and voting — the two moments that matter — and fell back to manual sponsor preselection. Those two paths get more engineering rigour than everything else combined.
5. **Never surveil.** No mandatory tool sandboxes, no non-consensual telemetry, no cross-company non-poach clauses. Every logging feature is opt-in and explained in participant-facing language.
6. **Build for 20,000, launch with 200.** Architecture assumes scale; defaults assume the pilot. Thresholds are configuration, not rewrites.

---

## Part 1 — Architecture

### 1.1 Stack (locked)

| Layer | Choice | Rationale |
|---|---|---|
| Framework | Next.js 15, App Router, TypeScript strict | Server components, route handlers, one deploy target |
| Database | Supabase Postgres, **EU (London) region** | GDPR residency. Irreversible — verify before first migration |
| Auth | Supabase Auth: magic link + GitHub OAuth | Already configured and live |
| ORM/Access | Supabase JS client + typed SQL via `supabase gen types` | Types generated from schema, never hand-written |
| Realtime | Supabase Realtime (Postgres changes + broadcast) | Chat, announcements, live judge progress |
| Storage | Supabase Storage | Avatars, sponsor logos, export bundles. **Not** pitch video |
| Hosting | Vercel | Connected, deploying |
| DNS/CDN | Cloudflare | Live on mindsofthefuture.ai |
| Email | Resend + React Email | Transactional only |
| AI | Anthropic API (Claude) | Log summaries, judge assist |
| UI | Tailwind + shadcn/ui + Radix | Speed, accessibility for free |
| Forms | react-hook-form + Zod | One schema for client and server validation |
| Jobs | Vercel Cron + Supabase Edge Functions | Digests, AI generation, commit polling |
| Observability | Sentry + Vercel Analytics + Supabase logs | Error tracking is non-optional at event time |
| Testing | Vitest (unit), Playwright (E2E), k6 (load) | E2E covers the two critical paths |

### 1.2 Repository layout

See the repo root. Route groups and `lib/` match this spec.

### 1.3 Roles

`participant` · `judge` · `organizer` · `recruiter` · `admin`

Roles are per-event, not global — a participant at one venue may judge elsewhere. Stored in `event_roles`, not on `users`.

---

## Part 2–10 — Data model, RLS, judging, AI, proxy, talent, alumni, reliability, GDPR

Implemented from the v3 spec. Schema lives in `supabase/migrations/`. Judging engine in `lib/judging/`. AI in `lib/ai/`. Consent in `lib/consent/`. Shared Zod in `lib/validation/`.

**Schema additions beyond the Part 2 DDL** (required by later sessions, added in the first migration):

- `tenant_id` on every table except `tenants`
- `scores.phase` (`prepanel` \| `live`) and unique `(team_id, judge_id, criterion_id, phase)`
- `teams.proxy_token`, `teams.submission_idempotency_key`
- `events.pairwise_blend`, `events.cup_score_threshold`, `events.working_demo_required`
- `judge_reliability` (Crowd-BT alpha/beta)
- `discussion_flags`, `judge_notes`, `ai_review_feedback`
- `view_talent_profile` RPC (Postgres cannot SELECT-trigger; this is the non-bypassable access log)
- `enforce_max_team_size` trigger
- `handle_new_user` trigger on `auth.users`
- Storage buckets: `avatars`, `sponsor-logos`, `exports`

`api_calls` never stores prompt or response bodies (v3 Part 6). The prototype's opt-in content logging is gone.

---

## Part 11 — Build sequence

Sessions 1–14 as specified. Session 1 DoD: `pnpm test:rls` passes; schema matches Part 2 plus the additions above.

---

## Part 13 — Definition of done (platform level)

Ship when all of these are true:

- [ ] Full k6 suite passes at stated thresholds
- [ ] RLS test suite green, every table covered
- [ ] Playwright E2E green on submission and judging paths
- [ ] A complete mock event runs end to end with zero DB intervention
- [ ] Check-in composer measured under 30 seconds from cold load
- [ ] Consent grant → recruiter visibility → withdrawal → invisibility verified
- [ ] Erasure request removes or anonymises every trace
- [ ] Judge calibration gate cannot be bypassed
- [ ] AI review never renders without raw evidence beside it
- [ ] Accessibility ≥ 95 on judging and check-in flows
- [ ] Sentry catching errors in production
- [ ] Nothing KCL-specific anywhere in the codebase
