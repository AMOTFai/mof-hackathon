# Handover — Minds of the Future (after Session 14 — build complete)

All 14 sessions of `BUILD-PLAN-v3.md` are done. This file is now mostly a record — there is no "next session" to read it before. If you're picking this repo back up for new work (bug fix, new feature, real deployment), skim "Locked decisions" and the per-session notes for the area you're touching; don't redo anything below.

Authoritative spec: `BUILD-PLAN-v3.md` (this copy is abbreviated; session list and DoDs are below). Product rules: `CLAUDE.md`.

---

## Status

| Session | Name | State |
|---|---|---|
| 1 | Foundation | **Done** (live schema + RLS) |
| 2 | Auth & roles | **Done** (code + HTTP DoD on localhost:3000) |
| 3 | Teams & profiles | **Done** (code + HTTP DoD; live size trigger) |
| 4 | Schedule & comms | **Done** (CRUD + realtime DoD) |
| 5 | Check-ins & milestones | **Done** (composer, milestone status, timeline, live DoD) |
| 6 | Submission | **Done** (RPC, idempotency, deadline, lock, k6 spike) |
| 7 | GitHub & process signal | **Done** (repo link, commits, unified timeline, cron) |
| 8 | AI proxy | **Done** (metadata-only, fail-open, no bodies) |
| 9 | Judging engine | **Done** (rubric, calibration gate, scoring, aggregation, pairwise) |
| 10 | Organizer console | **Done** (event bootstrap, milestone/rubric/judge/calibration CRUD) |
| 11 | Talent layer | **Done** (consent, recruiter search, erasure) |
| 12 | Alumni network | **Done** (directory, board, intro requests, gated on submission) |
| 13 | Hardening | **Done** (Sentry, Playwright E2E, a11y, expanded k6, DoD audit) |
| 14 | Dry run | **Done** (20 teams, 5 judges, compressed week, 6/6 sanity checks passed) |

There are **14** sessions. Event-critical core is 1–10. Talent (11) and alumni (12) can slip without blocking the event. **All 14 are complete — the platform build is done.**

---

## Locked decisions (do not relitigate)

- Rewrite **in this folder**. Prototype snapshotted at git `ec05d4a`.
- First migration is Part 2 **plus** later-session columns (`supabase/migrations/0001_init.sql`).
- One-shot sessions: finish the current session’s DoD, then continue.
- Venue-agnostic: **no KCL** copy, checkpoints, or branding.
- `api_calls` never stores prompt/response bodies.
- Roles are **per-event** in `event_roles`, never a column on `profiles`.
- RLS is the authorisation boundary. User-scoped Supabase client for mutations. Service role only for webhooks, cron, bootstrap.
- Do **not** re-apply `0001_init.sql`. Additive migrations only if a session truly needs schema.

---

## Environment

- Repo: this folder (`minds-of-the-future-main`).
- Stack: Next.js 15 App Router, TypeScript strict, Tailwind, shadcn (new-york / zinc), Vitest.
- Supabase: **eu-west-2**, project `iqclghgzyfpopqnyugvi`.
- Keys in `.env.local` (gitignored). Required: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. Also set: `SUPABASE_DB_URL` (session pooler — see Session 6 "Environment note"). Optional listed in `.env.example`.
- Supabase MCP is connected (same project).
- Pilot event: slug `pilot`, id `00000000-0000-4000-8000-000000000010`, status `open`, `max_team_size` **5** (unchanged), 5 milestones, 5 rubric criteria (`supabase/seed.sql`).
- Size-test event: slug `session3-size`, id `00000000-0000-4000-8000-000000000020`, `max_team_size` **2**.
- Dev: `pnpm dev` → http://localhost:3000.

```bash
pnpm dev
pnpm test
pnpm test:rls
npx tsc --noEmit
pnpm lint
```

`pnpm lint` is **green** as of Session 6 (the long-standing `app/(auth)/join/page.tsx` apostrophe error was fixed), so treat a lint failure as a real regression.

---

## Session 1 (done)

- 40 public tables, RLS on, helpers, `handle_new_user`, `enforce_max_team_size`.
- Typed client: `lib/database.types.ts` from `supabase gen types`. `@supabase/ssr@0.6.1` generics predate `__InternalSupabase` — `lib/supabase/{client,server}.ts` assert `SupabaseClient<Database>`. Do not “fix” by re-applying schema.

---

## Session 2 (done)

Magic-link + GitHub OAuth **starts**; middleware; per-event roles; dashboards at `/dashboard` `/judge` `/organizer` `/recruiter` `/alumni`; `/join` if no role. Fixture users `session2.{participant,judge,organizer,recruiter,admin,norole}@motf.test` on `pilot`. GitHub `client_id` may still be misconfigured — do not block later sessions on it.

Landing priority: admin → organizer → judge → recruiter → participant → alumni → `/join`.

Guards: `lib/auth/{paths,session,roles,guards,actions}.ts`. Role checks are in **layouts**, not middleware.

Magic-link verify for tests: `POST /auth/v1/admin/generate_link` then `/auth/callback?token_hash=…&type=magiclink` (hashed_token is **top-level** on the JSON).

---

## Session 3 (done)

**DoD met:**

- Profile edit at `/dashboard/profile` (name, university, course, grad year, bio, skills, GitHub, timezone). Email is read-only.
- Team create / join via invite code at `/dashboard/team`.
- Captain can edit team details, promote/demote, remove members. Last captain cannot leave or demote themselves until another captain exists. Members can leave.
- `enforce_max_team_size` trigger blocks inserts past `events.max_team_size`.
- Two accounts formed team **Binary Stars** on `session3-size`; a third join returned **This team is full (max 2).**
- Live vitest: `tests/unit/teams-live.test.ts` (ephemeral event, max 2, third insert rejected).
- `pnpm test` = 160 passed. `npx tsc --noEmit` clean.

**Do not change `pilot.max_team_size`.** Use `session3-size` for size checks.

### Routes added

| Path | Who |
|---|---|
| `/dashboard` | Participant home (profile blurb + team summary) |
| `/dashboard/profile` | Profile edit |
| `/dashboard/team` | Create / join / manage (one section per participant event) |

### Implementation notes

- Mutations: `app/(participant)/dashboard/actions.ts` via the **user-scoped** client. After writes, `lib/cache/revalidate.ts` revalidates `/dashboard`, `/judge`, `/organizer`, `/alumni`.
- Join always inserts `role = member`. Do **not** count existing roster before join — RLS hides `team_members` from non-members, so a count would look empty and wrongly insert a second captain.
- Create inserts the caller as `captain`.
- One team per user per event is enforced in the action (schema has no unique `(event_id, user_id)`).
- Invite codes are unique hex (`encode(gen_random_bytes(4), 'hex')`); join normalizes to lowercase.

### Fixture users (live Auth, on `session3-size` only)

- `session3.a@motf.test` — captain of Binary Stars, profile edited to Ada Lovelace
- `session3.b@motf.test` — member
- `session3.c@motf.test` — participant, no team (blocked at max 2)

Invite code on the live size-test team at DoD time: `d741ec4f` (may change if the team is recreated).

---

## Session 4 (done)

**DoD met:**

- Organizer schedule CRUD at `/organizer/schedule`; participant view at `/dashboard/schedule`.
- Team chat at `/dashboard/chat` (client insert + `postgres_changes` on `messages`).
- Announcements at `/organizer/announcements` and `/dashboard/announcements`. Mark-as-read writes `announcement_reads`. Organizer sees `readCount/participantCount`. B cannot see A's receipt (own-row RLS except staff).
- Live vitest `tests/unit/comms-live.test.ts`: staff schedule insert visible to participant; chat INSERT reaches the other member over Realtime in **&lt;2s**; organizer reads only the participant who marked the announcement.
- HTTP on localhost:3000: `session2.organizer` added “Session 4 Kickoff”, `session2.participant` saw it; announcement “Kitchen is open…” was sent, marked read, and still listed for staff.
- `pnpm test` = 165 passed (needs un-sandboxed network for the Realtime case). `npx tsc --noEmit` clean.
- Dev dep `ws` is the Node 20 WebSocket polyfill for that live test.

### Routes added

| Path | Who |
|---|---|
| `/organizer/schedule` | organizer / admin |
| `/organizer/announcements` | organizer / admin |
| `/dashboard/schedule` | participant |
| `/dashboard/chat` | participant (needs a team) |
| `/dashboard/announcements` | participant |

Chat uses the **browser** Supabase client so RLS still applies. No service role.

---

## Session 5 (done)

**DoD met:**

- `/dashboard/checkins`: milestone status list (hit/late/missed/due-soon/pending, computed live from `milestones` + `check_ins`, mirrors the old prototype's `checkpoints.ts`), a composer (body + optional milestone/link/blockers), and a team timeline. Plate-cap banner shown when a `plate_cap` milestone is missed or late (lateness does not redeem the cap).
- Composer cold load: ~1s steady-state in dev (curl timing against the live route); well inside the 30s budget. Production build will be faster.
- RLS does the enforcement, not app code: insert blocked for non-members and after `teams.submitted_at` is set; delete restricted to the author. Verified live in `tests/unit/checkins-live.test.ts`.
- `pnpm test` = 183 passed (needs un-sandboxed network for the three `-live` suites). `npx tsc --noEmit` clean. `pnpm lint` has one pre-existing failure (`app/(auth)/join/page.tsx`, unrelated).
- Security pass (manual CSO-methodology review, since the automated `/cso` pipeline's bootstrap scripts aren't present in this environment): found and fixed a stored-XSS gap — `linkUrl` validation used `z.string().url()`, which accepts `javascript:`/`data:` schemes; a check-in link with `javascript:...` would execute in a teammate's session on click. Fixed in `lib/validation/checkin.ts` (protocol allowlist: http/https only) with defense-in-depth at render time in `components/checkins/checkin-composer.tsx`, plus regression tests in `tests/unit/checkins.test.ts`. Confirmed no service-role client is used on any participant-facing path (`lib/supabase/server.ts`'s `createClient()` is anon-key + user-scoped; `createServiceClient()` isn't imported anywhere under Session 5 code).

### Routes added

| Path | Who |
|---|---|
| `/dashboard/checkins` | participant (needs a team) |

### Implementation notes

- `lib/checkins/status.ts` — pure status derivation, no DB writes. The `milestone_status` table exists in schema (staff-write only per RLS) but is not populated by this session; it's for a later cron/organizer flow. Status shown to participants is computed live from `milestones` + `check_ins`, same pattern as the old Prisma prototype's `lib/checkpoints.ts`.
- `lib/checkins/queries.ts` — `listMilestones`, `listCheckInRecs` (lightweight, for status calc), `listCheckIns` (full timeline with author + milestone label joins).
- Mutations: `app/(participant)/dashboard/checkins-actions.ts` (`createCheckIn`, `deleteCheckIn`), sibling to `comms-actions.ts`. Membership is checked in the action AND enforced by RLS (defense in depth); deletion relies on the `author_update_check_in`/`author_delete_check_in` RLS policies alone.
- `milestoneId` on a check-in isn't cross-checked against the team's event — a bad ID just fails to match in the status/timeline UI, no RLS boundary is crossed (low-severity data-integrity nit, not fixed this session).

---

## Session 6 (done)

**DoD met:** form, video URL validation, idempotency, deadline, lock, k6 spike.

- `/dashboard/submit`: save-draft (project name / repo URL / demo video URL) + a separate final Submit step, live countdown, and a locked read-only panel after submission. Non-captains see a read-only notice.
- **Submission goes through a new RPC, not an UPDATE.** `supabase/migrations/0002_submit_team.sql` adds `public.submit_team(p_team_id uuid, p_idempotency_key text)`. This is required, not stylistic: the existing `captain updates team` RLS policy has `with check (submitted_at is null)`, so a plain UPDATE can never set `submitted_at`. The RPC is `security definer`, does its own captain + deadline + required-field checks, and takes `for update` on the team row so concurrent submits serialize.
- **Idempotency:** same key replays and returns the original `submitted_at` with `replay: true`; a *different* key after submission is a genuine double-submit and is rejected. The form generates one key per mount, so a double-click replays instead of erroring.
- **k6 spike** (`tests/load/`): 30 captains submitting simultaneously, each also replaying its own key. Thresholds are correctness-first, not just latency: `submit_accepted==30`, `double_submit==0`, `replay_mismatch==0`, `replay_ok==30`, p95 < 2500ms. Result: all green, p95 774ms, and an independent SQL check confirmed 30 teams / 30 submitted / 30 distinct keys. `pnpm load:seed [n]` → `pnpm load:spike` → `pnpm load:teardown`.
- Live vitest `tests/unit/submission-live.test.ts` (6 cases): happy path + idempotent replay + edit-blocked-after-submit, non-captain blocked, past-deadline blocked, incomplete submission blocked, 5-way concurrent race yields exactly one winner, and a stranger cannot submit another team.
- Verified in the running app over HTTP: submit button renders `disabled` while fields are missing (with "Still needed: project name, repo URL, demo video URL"), enables when complete, and after submitting the page shows the locked panel and the Session 5 check-in button flips to "Submission locked".
- `pnpm test` = **198 passed**. `npx tsc --noEmit` exit 0. `pnpm build` succeeds. **`pnpm lint` is now green** — the long-standing `app/(auth)/join/page.tsx` apostrophe error is fixed, so lint is a real gate again.

### Security pass (Session 6)

- A `security definer` function is the sharpest thing added, so it was probed live, not just read. Supabase's default privileges grant `EXECUTE` to `anon` on function creation — the in-function `auth.uid() is null` guard did reject anonymous calls, but relying on that alone leaves a definer function reachable pre-auth. The migration now explicitly `revoke all ... from anon`; an anon call is refused at the permission layer (`42501 permission denied`) before the body runs.
- URL scheme validation is now one shared helper, `lib/url.ts` (`isHttpUrl`, a type predicate). It had drifted into three copies. Enforced on write (Zod, both check-in and team schemas), in the RPC (`!~* '^https?://'`), and again at render time on every `href` — because rows can be written by paths that skip Zod (service role, organizer tooling).
- Fixed a data-loss bug found while wiring this up: `/dashboard/team`'s edit form doesn't render the submission URL fields, so saving there would have nulled `repo_url`/`video_url`. They are preserved as hidden inputs.
- No service-role client, `dangerouslySetInnerHTML`, or `eval` on any participant-facing path.

### Environment note (new)

- `SUPABASE_DB_URL` is now in `.env.local` (gitignored) — the **session pooler** host `aws-0-eu-west-2.pooler.supabase.com:5432`. The direct `db.<ref>.supabase.co` host is IPv6-only and does not resolve on this network. Used with `psql` from `brew install libpq` (`/opt/homebrew/opt/libpq/bin/psql`).
- `supabase db push` does **not** work here: the remote migration history table has 13 entries that predate the local `supabase/migrations/` files, so the CLI refuses. Additive migrations are applied with `psql -v ON_ERROR_STOP=1 -f <file>` instead. Do not "fix" this by running `supabase migration repair` or `db pull` without checking with Alex.
- `supabase gen types` needs Docker, which isn't installed. The `submit_team` entry in `lib/database.types.ts` was hand-added to match the live signature (verified via `psql \df`), consistent with the existing hand-maintained bits of that file.
- k6 installed via brew (`k6 v2.2.0`).

### Known flake

- `tests/unit/comms-live.test.ts` (Session 4 realtime) timed out once on `SUBSCRIBED` during a full-suite run, then passed alone and on the next two full runs. It's a 5s subscribe budget that is sensitive to concurrent load, not a regression. Worth a longer timeout or a retry when Session 13 hardening comes around.

---

## Session 7 (done)

**DoD met:** repo link, commits, unified timeline.

- `/dashboard/checkins` is now the **Process** page and carries one unified, reverse-chronological timeline of check-ins **and** commits on the same axis, plus a summary bar (check-ins / commits / active days), the linked repo, and a "Sync commits" button. Deliberately extended rather than adding a second timeline page.
- `lib/github/parse.ts` — strict repo-URL parser. Host is checked by **URL parsing against an allowlist**, not a substring match: the prototype's `/github\.com[/:]([^/]+)/` regex also matched `https://evil.internal/github.com/a/b`, which turns a user-supplied field into an SSRF primitive. Owner/repo are charset-validated so nothing can be injected into the API path we build.
- `lib/github/client.ts` — never throws; returns a typed `bad-url | not-found | rate-limited | unreachable` reason so a private/renamed repo degrades gracefully. Per-commit stats cost one request each, so enrichment is capped and only enabled when `GITHUB_TOKEN` is set.
- `lib/github/sync.ts` — upserts on `(team_id, sha)`, so re-syncing never duplicates. Takes an explicitly-named **service** client because `commits` has a SELECT policy but no INSERT policy; the doc comment states that callers must authorize first.
- `app/api/cron/sync-commits` + `vercel.json` (every 15 min) — polls every team with a repo on a running event. Authenticates the *caller* with `CRON_SECRET` and **fails closed** when it is unset.
- Verified live: real GitHub fetch (`vercel/next.js` → 10 commits), two syncs → still 10 rows (idempotent), page renders "Check-ins 0 / Commits 10" with real authors/messages/SHAs, a check-in then interleaves at the top, and cron returns 401 unauthenticated / `{"synced":1}` with the right secret.
- `pnpm test` = **248 passed** (four consecutive clean runs). `tsc --noEmit` exit 0, `pnpm lint` green, `pnpm build` succeeds.

### Two bugs found and fixed while building

1. **The cron route was unreachable.** The middleware matcher covered `/api/*`, so Vercel Cron got a `307` to `/login` and the job would have silently never run. `api` is now excluded from the matcher — which also future-proofs the Session 8 proxy, since that authenticates by team token, not cookie.
2. **A Session 5 regression I introduced.** Swapping the check-in list for the unified timeline dropped the author's Delete control. Extracted `components/checkins/delete-checkin-button.tsx` and wired it back in; the now-dead `CheckInTimeline` was deleted so there is only one renderer.

### Live-suite reliability (fixed properly, was masking real failures)

`pnpm test` had become flaky. It was **not** the realtime race it looked like — the real error was `AuthApiError: Request rate limit reached`. Supabase's auth sign-in quota is **per-IP and shared by every live test file**, and the suite had grown to ~28 sign-ins plus ~15 user creations per run; back-to-back runs blew through it. That is a hard ceiling that would only worsen through Sessions 8–14, so:

- `tests/helpers/live.ts` is now the single entry point: `signIn` **caches one client per email**, `createUser`/`withAuthRetry` retry through rate limits with 2s→32s backoff. No test file calls `signInWithPassword` directly any more (grep enforces this).
- `submission-live` shared its captain/member/stranger users across all 6 cases instead of creating 12 users; only events/teams are per-case. Note this required adding a **distinct** stranger user — sharing users had quietly made the cross-team test assert against itself.
- `vitest.config.ts`: `maxWorkers: 2` to stop the burst, and `testTimeout: 120_000` so a retry is not killed mid-backoff.
- Also fixed a genuine race in the Session 4 realtime test: `SUBSCRIBED` does not mean Postgres replication is streaming yet, so it now settles and retries the insert. Latency is measured from each insert, so the `<2s` DoD assertion stays honest.
- **Watch out:** `admin.createUser` *returns* `{error}` instead of throwing, so wrapping it in a retry that only catches throws does nothing. That mistake cost a debugging cycle here — `createUser` in the helper throws inside the retry callback.

---

## Session 8 (done)

**DoD met:** metadata only, fail-open, no bodies.

- `app/api/proxy/[provider]/[...path]/route.ts` — teams point their AI SDK's `base_url` here and use their own upstream API key as normal; the route forwards the request **unmodified** and logs metadata after the fact. Zero provider-specific logic in the route itself — that lives entirely in `lib/proxy/providers.ts` (currently `openai`, `anthropic`; adding a provider is one object).
- **No Supabase Auth session exists for an external SDK call**, so the team lookup by `proxy_token` is one of the sanctioned service-role paths (this route is effectively a webhook receiver, same class as cron). Everything else about the call — headers, body, streaming — passes through untouched.
- **Token accounting without buffering or blocking.** Non-streaming and streaming (SSE) responses are both handled via `ReadableStream.tee()`: one branch goes to the caller completely unmodified, the other is read internally (by `lib/proxy/sse.ts` for SSE, plain JSON parse otherwise) to extract `usage` and write the `api_calls` row. The caller's copy is never delayed or altered by this.
- **Fail-open is structural, not just intended.** `logCall` swallows its own errors; `trackUsage`'s `usage` promise never rejects (both its streaming and non-streaming paths catch internally). A logging failure cannot affect the proxied response.
- Logging is scheduled via `after()` (`next/server`), not a bare floating promise — on Vercel's serverless runtime a promise left running after `return` can be killed the instant the response stream closes. `after()` keeps the invocation alive to finish the write.
- The schema itself guarantees "never bodies": `api_calls` has no body columns at all (verified live — selecting a `request_body` column returns a genuine "column does not exist" error), and has no INSERT policy, so a team cannot forge its own metadata log either.
- `/dashboard/team` gained a `ProxySetup` panel: copyable team token + per-provider `base_url`, and a captain-only rotate action (`rotateProxyToken`, plain RLS-scoped UPDATE — no privileged path needed). `lib/app-url.ts` resolves the public origin from `NEXT_PUBLIC_APP_URL` or, if unset, the incoming request's host headers, per CLAUDE.md.
- `api_calls` is now the third variant in the unified timeline (`lib/timeline/merge.ts`), alongside check-ins and commits — same pattern established in Session 7, extended rather than duplicated.
- Verified live: real requests through the running proxy against real OpenAI/Anthropic hosts with a deliberately bad upstream key (same sanctioned test method as the old CLAUDE.md's curl example) — both providers' genuine error bodies pass through byte-for-byte, `api_calls` rows land with correct model/status/no body columns, unknown provider is 404, missing/unknown team token is 401, `x-motf-team` header works identically to `?team=`, and two teams' logs stay isolated from each other.
- `pnpm test` = **281 passed** (two consecutive clean runs). `tsc --noEmit` exit 0, `pnpm lint` green, `pnpm build` succeeds.

### Security pass (Session 8) — one real finding, fixed

**Cookie leak to third-party providers.** The route forwards the caller's headers to upstream, minus a hop-by-hop set — and that set did not include `cookie`. This endpoint is deliberately outside the session middleware (see Session 7's fix), so a browser-issued request to it would attach the participant's Supabase session cookie, and the original code would have forwarded that cookie on to OpenAI/Anthropic on every call. No legitimate SDK call ever sends a `Cookie` header, so there was no reason for it to ride along. Fixed by extracting header-building into `lib/proxy/headers.ts` (`buildUpstreamHeaders` strips `cookie`, `buildResponseHeaders` strips `set-cookie` symmetrically, in case a provider ever sent one) — both are unit-tested directly (`tests/unit/proxy.test.ts`), which is also why the extraction was worth doing rather than leaving the logic inline in the route.

Everything else checked out: `host` per provider is a fixed compile-time allowlist (never derived from `params.provider`, which is only used as an object-lookup key), `redirect: "manual"` prevents auto-following a provider redirect to somewhere unexpected, no service-role use outside the two sanctioned call sites, no secrets logged or echoed in errors, and the "no rate limiting" behavior is intentional per CLAUDE.md, not an oversight.

### Routes added

| Path | Who |
|---|---|
| `/api/proxy/[provider]/[...path]` | External SDK calls, authenticated by team token (no session) |

---

## Session 9 (done)

**DoD met:** rubric, calibration gate, scoring, aggregation, pairwise.

- `lib/judging/{rubric,calibration,aggregate,pairwise,results}.ts` — all pure, all unit-tested (41 tests). `rubric.ts` computes a 0-100 weighted total from per-criterion scores, only for **complete cards** (every criterion scored) per this repo's own convention. `aggregate.ts` implements the two-phase rule referenced in this file's own architecture notes: a judge's `live` card supersedes their `prepanel` card if they have both, then a drop-high/low trim (only with 4+ judges) before averaging. `pairwise.ts` is a simplified Crowd-BT (Bradley-Terry team skill + Beta judge reliability, reliability-weighted online updates, uncertainty shrinkage, entropy-based next-pair selection) — explicitly documented as a pragmatic approximation of the paper, not the exact variational algorithm; good enough for a weekend event's panel size. `results.ts` computes bracket (`cup|plate|unassigned` only) and blends rubric/pairwise standings by percentile per `events.pairwise_blend`.
- **The calibration gate is enforced in Postgres, not app code** — the existing `judge upsert own scores` RLS policy already required a `calibration_results` row before any score INSERT could succeed. Session 9's job was making that honest in the UI (dashboard won't show a scoring form until calibration is done) and verifying the gate live: an uncalibrated judge's insert is rejected by RLS, not just hidden by the UI.
- **Two RLS gaps found and closed with a migration, not a workaround.** Judges can only `SELECT` `teams` they're individually assigned to (`judge_assignments`-scoped), and `team_ratings` has no judge-readable policy at all (staff-only) — but pairwise comparison needs a judge to browse arbitrary *submitted* teams in their event with current ratings. `supabase/migrations/0003_pairwise_candidates.sql` adds `list_pairwise_candidates(p_event_id)`, a narrow security-definer RPC returning only `(id, name, project_name, mu, sigma_sq, comparison_count)` for submitted teams — same shape as the existing `view_talent_profile` RPC (a sanctioned exception to a blanket table policy, not a service-role bypass from application code). Verified live: a judge gets rows only for their own event, a plain participant's call is rejected, and direct `teams` table access to an unassigned team still returns nothing.
- **Pairwise votes and AI reviews follow the commits/api_calls pattern**: the user-authored write (`pairwise_votes` insert, resp. the judge-assignment check before generating a review) is what authorizes the actor; the *derived* state (`team_ratings`, `judge_reliability`, `ai_reviews`) has no user-facing write policy at all and is written by the service client only after that authorization succeeds.
- **Recusal is implemented as specified in this file's own "Conflict of interest" line**: declaring a conflict inserts into `judge_conflicts`, deletes that judge's existing `scores` for the team, and sets their `judge_assignments.status` to `recused` — verified live that the scores are actually gone afterward, not just hidden.
- `lib/ai/summarize.ts` generates the cached `ai_reviews` row: deterministic heuristic always available, Claude path when `ANTHROPIC_API_KEY` is set (this environment has no key, so only the heuristic path has been exercised live — the Claude path compiles and is unit-testable in isolation but wasn't hit against the real API this session). Every render puts the AI panel directly above the same unified timeline (check-ins + commits + AI calls) a judge would otherwise scroll to, per Part 13's "AI review never renders without raw evidence beside it."
- `/judge` (calibration gate, assignment list), `/judge/[teamId]` (two-phase scoring, conflict declare, discussion flag, private notes, AI panel, unified process-signal timeline), `/judge/pairwise` (next-pair vote screen). `/organizer/results` (compute → review → publish, plus a human-only bracket override — `computeResults` never sets or clears `disqualified`, and a prior `disqualified` override survives a recompute).
- `pnpm test` = **328 passed** (three consecutive clean runs at `maxWorkers: 1` — see below). `tsc --noEmit` exit 0, `pnpm lint` green, `pnpm build` succeeds.

### Security pass (Session 9) — two real findings, fixed

1. **No DB-level bound on `scores.value`.** The schema has no CHECK constraint tying a score to its criterion's `scale_max` — aggregation clamps defensively in `weightedTotal`, but a raw out-of-range value (or negative) was still storable. Added `lib/judging/rubric.ts#isValueInRange` and made `submitScores` validate every submitted value against the real criterion before insert, not just trust the client's slider. Unit-tested directly.
2. **Cost-amplification via AI review spam-regeneration.** `generateAiReview` calls the *organization's* `ANTHROPIC_API_KEY`, unlike the proxy (which is deliberately unrate-limited because that cost sits on the team's own key). A judge repeatedly clicking regenerate is real spend. Added a 60-second freshness check before calling out.

Everything else checked out: every judge action starts with `requireRoles(["judge"])`; `judge_notes` (private) is never read into the `ai_reviews` prompt or cache (would otherwise leak private notes into a row team members and other judges can read); AI-generated text renders through normal React (auto-escaped) so a malicious check-in body can't inject markup, and prompt-injection via check-in/commit text is an accepted, structurally-mitigated risk — the AI panel is never rendered without the same raw evidence directly below it, which is this project's own stated mitigation for LLM-as-judge instability (BUILD-PLAN Part 0 #3), not something to bolt input-sanitization onto.

### Live-suite reliability — the auth-quota ceiling tightened further

At 328 tests across 18 files, `maxWorkers: 2` (set in Session 7) started intermittently tripping the same per-IP Supabase auth rate limit again — one file failed on a second consecutive run, passed on a third. Not a new bug, the same documented ceiling growing tighter as the suite grows. Dropped to `maxWorkers: 1`: three consecutive clean runs, ~50-70s instead of ~15-20s. If Session 10+ adds significantly more live suites, expect to eventually need to either shard live tests into their own slower CI lane or reduce total sign-ins further (most files already share fixture users per Session 7/8's pattern).

---

## Session 10 (done)

**DoD met:** run a mock event with zero DB surgery — proven, not just built (see the live test below).

- **The critical gap: there was no way to create an event at all.** `events` and `tenants` have no INSERT policy anywhere in the schema — by design, since RLS scopes "staff" access via an `event_roles` row that, for a brand-new event, cannot exist yet. That's the classic bootstrap chicken-and-egg problem, and it's explicitly one of the three sanctioned service-role uses in this repo's own conventions (webhooks, cron, **bootstrap**). `app/(auth)/join/new-event/actions.ts#createEvent`: any signed-in user creates a tenant + event + becomes its organizer, via the service role, but the write is narrowly scoped — it only ever inserts an `event_roles` row referencing the event it just created in the same call, never one supplied by the caller. Verified live that this can't be turned into a privilege-escalation primitive against an *existing* event.
- **This page had to live outside the `(organizer)` route group.** That group's layout already requires `organizer|admin` — which would make the one page meant for users with *no* role yet unreachable. Placed at `/join/new-event` instead (linked from `/join`, which has no role gate), following the same reasoning as Session 7's `/api/*` middleware exclusion: a bootstrap surface can't sit behind the gate it's bootstrapping past.
- `/organizer/setup` — milestones, rubric criteria, judge invites (by email, service-role lookup + user-scoped RLS-authorized insert — same split-authorization pattern as everything else service-role-adjacent in this app), judge→team assignment, and calibration sample authoring, all previously only possible via `supabase/seed.sql` or Supabase Studio. Every one of these was a real gap: Session 9 built the entire judging engine assuming criteria/assignments/samples already existed.
- **The end-to-end live test is the real deliverable here.** `tests/unit/organizer-live.test.ts` drives a full mock event from a zero-role user through: event bootstrap → rubric criteria → milestone → team + submission → judge invite by email → judge↔team assignment → calibration sample → and then that same freshly-onboarded judge actually clearing the calibration gate and scoring the team — all as real RLS-governed writes, not mocks. A second test proves a stranger cannot forge an `organizer` role on an event they didn't create.
- `pnpm test` = **327 passed, 3 soft-skipped** (the proxy's HTTP-integration tests, which need a reachable dev server — unrelated to this session's code, same documented soft-skip from Session 8). Two consecutive clean runs. `tsc --noEmit` exit 0, `pnpm lint` green, `pnpm build` succeeds.

### Security pass (Session 10) — clean

Every one of the 9 new organizer actions gates on `requireRoles(["organizer","admin"])` first. The two new service-role call sites (`createEvent`'s bootstrap, `inviteJudge`'s email→id lookup) both hand off to a user-scoped, RLS-authorized write for the actual privileged action — the service role never performs the authorization-bearing write itself. `inviteJudge` does leak email-existence (an "account not found" message), a common and low-severity invite-flow tradeoff, not flagged. No `dangerouslySetInnerHTML` anywhere in the new UI.

### Routes added

| Path | Who |
|---|---|
| `/join/new-event` | Any signed-in user (bootstrap) |
| `/organizer/setup` | organizer / admin |

---

## Session 11 (done)

**DoD met:** consent, recruiter search, erasure.

- `/dashboard/talent` — fully self-service consent: grant/renew/withdraw is a direct RLS-authorized write to the participant's own `talent_profiles` row (no service role needed at all for the participant side — Part 0 #2's "consent is the moat" only holds if granting/revoking it is genuinely frictionless). Every grant/renewal/withdrawal writes a `consent_events` row so there's an audit trail independent of the current row state. `consent_expires_at` is a real, participant-chosen duration (1-365 days), not a cosmetic field — verified live that an already-expired grant is invisible to recruiters immediately, same as an active withdrawal.
- **Recruiter reads are split deliberately: a lightweight unlogged browse list, and a logged detail view.** RLS actually permits recruiters to `SELECT` `talent_profiles` directly (`"recruiters read consented"`), which would silently bypass `recruiter_access_log` — the schema's own comment calls `view_talent_profile` "the non-bypassable access log," but that's only true if every full-profile read actually goes through it. `lib/talent/queries.ts#searchTalent` (unlogged, headline/open_to only, for the browse list) is kept strictly separate from `viewTalentProfile` (always the RPC, always logged) — the file comment on `viewTalentProfile` says explicitly: never add a raw `.from("talent_profiles")` full-detail read anywhere else.
- `/organizer/setup` gained recruiter org onboarding (DPA-signed toggle) and invite-by-email (same split-authorization pattern as `inviteJudge`: service-role email→id lookup, then a user-scoped RLS-authorized `event_roles` insert). Note `recruiter_orgs` has no `event_id` column at all — `auth_recruiter_org_id()` matches ANY DPA-signed org against ANY user with a `recruiter` role on ANY event. That's existing Session-1 schema, called out explicitly in the UI copy so a future organizer isn't confused about scope.
- **Erasure is honest about what it does.** Participant-facing request flow is two real scopes: `talent_only` (deletes the `talent_profiles` row) and a wider option that also anonymizes profile PII (name, bio, skills, school, GitHub, email → a placeholder). It does **not** delete the auth account or cascade into teams/scores/check-ins/commits — a same-session cascading delete across ~15 tables touching other people's data (teammates, judges, results) is a product decision this session does not make unilaterally, and the code/UI copy says so rather than silently under-delivering on a "full account" label. `completeErasure` is **admin-only**, not organizer — it writes another user's `profiles` row, which no RLS policy permits any staff role to do directly (there is no "staff write profiles" policy at all), so it's a genuine, narrow service-role case, verified live that a non-admin organizer's direct attempt matches zero rows.
- `pnpm test` = **332 passed** (two consecutive clean runs, dev server reachable so the proxy's soft-skips resolved too this time). `tsc --noEmit` exit 0, `pnpm lint` exits 0 (one harmless unused-arg warning on `withdrawConsent`, which takes no real input — not chased further). `pnpm build` succeeds.

### Security pass (Session 11) — clean

Every talent/erasure action gates on `requireRoles` first (`completeErasure` additionally checks `roles.includes("admin")`). Grepped for any raw `talent_profiles` read outside `lib/talent/queries.ts` — none found; the RPC-only discipline for recruiter detail views holds. `recruiter_access_log`'s own RLS (subject reads their own log; recruiter reads their own; staff reads all) was exercised live, including the candidate confirming they can see who viewed them. No `dangerouslySetInnerHTML`, all profile text renders through normal auto-escaped React.

### Routes added

| Path | Who |
|---|---|
| `/dashboard/talent` | participant |
| `/recruiter` (browse + `?view=<id>` detail) | recruiter |

---

## Session 12 (done)

**DoD met:** directory gated on submission.

- `/alumni` — directory, community board (`alumni_posts`), and intro requests (`intro_requests`), all gated by `requireAlumnus()` → `auth_is_alumnus()`, which was already built in Part 2 (checks the caller has a `team_members` row on a team with `submitted_at` not null — literally "gated on submission").
- **Same structural gap as Session 11's recruiter search, hit again.** RLS lets an alumnus browse `talent_profiles` rows directly (`"alumni read alumni-visible"`), but there's no policy letting them read another user's `profiles` row for the name/school/bio a directory entry needs. Migration `0004_alumni_directory.sql` adds `view_alumni_profile` — same security-definer shape as `view_talent_profile`, but deliberately **without** an access-log insert: the schema has no `alumni_access_log` table at all, meaning peer alumni browsing was never designed to be tracked the way recruiter/employer viewing is. Don't add one without a reason — that omission looks like the schema author's intent, not an oversight.
- `alumni_posts`: straightforward author-scoped CRUD, no service role needed — RLS already grants the participant the exact write surface required (`alumnus write post`, `author update/delete post`).
- `intro_requests`: RLS enforces that only an alumnus can be the `requester_id` — verified live that a non-alumnus's insert attempt is rejected outright, and that the intro's target (not a stranger) is the only one who can move it to `accepted`/`declined`. The requester/target names shown in the UI can legitimately come back null (no RLS path lets one alumnus read a stranger's `profiles` row even for an active intro thread) — handled with a graceful "another alum" fallback rather than a third narrow RPC, a deliberate scope call given diminishing returns for a secondary UI detail.
- `pnpm test` = **333 passed** (two consecutive clean runs). `tsc --noEmit` exit 0, `pnpm lint` exit 0 (same pre-existing harmless warning), `pnpm build` succeeds.

### Security pass (Session 12) — clean

No service-role usage anywhere in the alumni code — every write is a direct, RLS-authorized user-scoped insert/update/delete, which is correct: unlike Session 10/11's bootstrap-shaped problems, nothing here needs to write another user's row. All 4 actions gate on `requireAlumnus()`. No `dangerouslySetInnerHTML`.

### Routes added

| Path | Who |
|---|---|
| `/alumni` (directory + board + intros, `?view=<id>` detail) | alumni (submitted a project) |

---

## Session 13 (done)

**DoD met:** k6, Playwright, Sentry, a11y. Also audited the rest of Part 13's platform-level checklist rather than stopping at the four keywords — see below.

- **Sentry** (`@sentry/nextjs`) — `instrumentation.ts` (server + edge init, `onRequestError`), `instrumentation-client.ts` (browser init + `onRouterTransitionStart`), `app/global-error.tsx` (the one place a React render error doesn't otherwise reach Sentry), `next.config.mjs` wrapped with `withSentryConfig`. Same optional-integration contract as `ANTHROPIC_API_KEY`/`GITHUB_TOKEN`: no `SENTRY_DSN` (server) / `NEXT_PUBLIC_SENTRY_DSN` (browser), fully no-op. Source-map upload only runs with `SENTRY_AUTH_TOKEN` set. Verified: `pnpm build` clean with zero Sentry warnings, bundle still builds without any Sentry env vars configured (this environment has none).
- **Playwright** (`tests/e2e/`) — real browser E2E for both DoD-named critical paths. `submission.spec.ts`: signs in as a freshly-seeded captain, fills the actual `/dashboard/submit` form, submits, verifies the locked panel — then double-checks the DB directly. `judging.spec.ts`: signs in as a freshly-seeded judge, clears the calibration gate **through the UI** (not by inserting the row directly), confirms the gate disappears and the assignment becomes reachable, scores the team, verifies the row landed correctly. Fixtures (event/team/rubric/calibration data) are seeded via the service role — same fixture-then-drive-the-UI split as the vitest live suites; only the parts worth exercising in a real browser are exercised in one.
  - **Gotcha for later sessions:** `locator.fill()` does not reliably drive a React-controlled `<input type="range">` — it bypasses React's change detection. `tests/e2e/helpers.ts#setRangeValue` sets the value through the native `HTMLInputElement` setter and dispatches a real `input` event, which is what React's synthetic system actually listens for. Use it for any future range-input E2E interaction (rubric/calibration sliders).
- **Accessibility** — used axe-core (via `@axe-core/playwright`) instead of a single Lighthouse-style number: it checks the same underlying WCAG rules Lighthouse's a11y category runs, but reports concrete, fixable violations rather than a composite score that can hide what's actually broken. Ran against `/dashboard/checkins` and `/judge/[teamId]` (the two DoD-named flows) with zero serious/critical violations as the bar. **Found and fixed a real, site-wide bug**: shadcn's stock "destructive" button color (`app/globals.css`'s `--destructive: 0 84.2% 60.2%` in light mode) measured 3.6:1 contrast against its white text — below WCAG AA's 4.5:1 minimum. Darkened to `0 72% 42%` (~5.9:1). This affects every destructive-variant button across the whole app (Delete, Declare conflict, Remove, etc.), not just the two audited pages.
- **k6** — added a second spike (`tests/load/{seed-,}scoring-spike.{mjs,js}`) alongside Session 6's submission spike, since scoring is the other write-heavy, deadline-driven critical path (BUILD-PLAN's moat). 30 pre-calibrated judges scoring their assigned team simultaneously: `score_accepted==30`, `cross_contamination==0` (a judge's row landing under the wrong judge_id/team_id), p95 808ms. Verified independently in SQL: 30 scores, 30 distinct judges, 30 distinct teams.
- **Rest of Part 13's checklist, audited rather than assumed:**
  - RLS test suite green, every table covered — yes, `pnpm test:rls` = 150/150, `PUBLIC_TABLES` in `tests/unit/tables.ts` covers all 40 tables.
  - Consent grant → recruiter visibility → withdrawal → invisibility — yes, Session 11's live test.
  - Judge calibration gate cannot be bypassed — yes, Session 9's live test (RLS-level) plus this session's E2E test (UI-level, same conclusion via a different path).
  - AI review never renders without raw evidence beside it — yes, the AI panel in `/judge/[teamId]` sits directly above the same unified timeline.
  - Nothing KCL-specific anywhere in the codebase — verified clean; the only "KCL" hits anywhere in the repo are in the planning docs themselves (`CLAUDE.md`, `BUILD-PLAN-v3.md`, this file), which *describe* the venue-agnostic rule, not violate it.
  - **Erasure removes or anonymizes every trace — honest partial.** Session 11's erasure deletes `talent_profiles` and optionally anonymizes `profiles` PII, but does not cascade into `check_ins`/`commits`/`alumni_posts` free-text content a person may have typed themselves, nor delete the auth account. Flagged again here rather than silently claiming full compliance — this is real remaining scope if the platform needs to satisfy a stricter reading of this DoD line before a real deployment with real PII.
  - Full k6 suite passes — two spikes now (submission, scoring); "full" here means the two write-heavy DoD-critical paths, not literally every write path in the app.
- `pnpm test` = **331 passed, 2 soft-skipped** (proxy HTTP-integration, dev-server-reachability soft-skip, unrelated to this session). `pnpm test:rls` = 150/150. `npx playwright test` = 4/4 (submission, judging, both a11y specs). `tsc --noEmit` exit 0, `pnpm lint` exit 0 (one pre-existing harmless warning), `pnpm build` succeeds with zero Sentry warnings.

### Routes added

| Path | Who |
|---|---|
| _(none — hardening session, no new UI surfaces)_ | |

## Session 14 (done)

**DoD met:** "20 fake teams, 5 judges, compressed week" — a full dry run exercising every prior session's work together as one coherent event, not another isolated fixture.

- **`tests/dry-run/run.ts`** — a standalone script (`npx tsx tests/dry-run/run.ts`), not a vitest test, since it deliberately drives the *real* production code paths (`lib/judging/queries`, `lib/judging/aggregate`, `lib/judging/results`, `lib/checkins/status`, `lib/url`) rather than re-implementing scoring logic as fixture assertions. Creates a tenant + event with a "compressed week" timeline (event started 90 min ago, ends in 30 min, submission deadline in 15 min, status already `judging`, `working_demo_required: true`), 1 plate-cap milestone (already due), 5 rubric criteria at the standard 30/20/25/15/10 weights, 5 pre-calibrated judges, and 20 teams (1–3 members each): 17 submitted (one of which lacks a video despite submitting, to exercise the missing-demo path), 4 miss the plate-cap milestone, each submitted team scored by 4 of 5 judges (one judge rotated out per team) with jittered scores across all 5 criteria, plus 8 pairwise votes among judges. Runs the same `getJudgeCardsForTeam` → `aggregateRubricScore` → `computeBracket` → `rankTeams` pipeline `/organizer/results`'s compute action uses, upserts to `results`, then runs 6 sanity checks and tears everything down (44 real Supabase users + the event, cascading).
- **Sanity checks, all passing:** no duplicate final ranks; final ranks are a sequential 1..N over ranked teams; every submitted team that missed the plate-cap milestone is bracket=plate; no bracket is auto-set to disqualified (that's a human-only override per the locked decision); no unsubmitted team reaches bracket=cup; at least one team reached bracket=cup.
- **One test-assertion bug found and fixed during this session** (not a product bug): the first draft asserted "every unsubmitted team is bracket=unassigned." The first live run failed it — all 3 unsubmitted teams landed in `plate`, not `unassigned`. Diagnosed by reading `lib/judging/results.ts#computeBracket`: it checks `working_demo_required && !hasWorkingDemo` *before* it ever checks `rubricScore === null`, and since this dry run sets `working_demo_required: true`, any team without a video (all unsubmitted teams, since `video_url` is only set on submit) falls into the missing-demo branch of `plate`, not the "genuinely not yet judged" branch of `unassigned`. This is correct, intentional Session 9 behavior — `plate` is the catch-all for "didn't clear the bar," `unassigned` is reserved for a team that clears every rule but simply hasn't been scored yet (a real mid-judging state, not something this synthetic fixture produces since every submitted+demoed team gets scored). Fixed the assertion to check the actual invariant instead: no unsubmitted team can ever reach `cup`.
- **Result of the passing run:** Cup 13 / Plate 7 / Unassigned 0, 17 of 20 teams ranked, top-3 by final rank printed and spot-checked by hand. Teardown removed the event and all 44 fixture users cleanly (verified: no orphaned rows, script re-runnable — ran it twice across this session, both times clean create-through-teardown).
- **Full verification gates, all green:** `npx tsc --noEmit` exit 0. `pnpm lint` exit 0 (same one pre-existing harmless `withdrawConsent` unused-arg warning as every prior session — untouched, not newly introduced). `pnpm test` run twice consecutively: 333/333 passed both times (first run showed 330 passed + 3 soft-skipped due to dev-server-reachability skips, second run all 333 ran including those, both are expected/valid outcomes per the soft-skip contract noted in Sessions 7/9/13). `pnpm test:rls` = 150/150. `pnpm build` succeeds, zero Sentry warnings, 27 routes generated.

### Routes added

| Path | Who |
|---|---|
| _(none — this session is a standalone integration script, not a UI surface)_ | |

---

## Build complete

All 14 sessions of `BUILD-PLAN-v3.md` are done, live-verified against the real Supabase project (eu-west-2, `iqclghgzyfpopqnyugvi`), not just type-checked. Every session's Definition of Done was checked against the live database, security-reviewed (grep for service-role usage, `dangerouslySetInnerHTML`, `requireRoles` coverage — documented per-session above), and exercised together end-to-end in Session 14's dry run.

**Known, deliberately-scoped-out gaps** (flagged during Session 13/11's audits, not fixed since they're out of the 14-session plan's scope):
- Erasure (Session 11) deletes `talent_profiles` and optionally anonymizes `profiles` PII, but does not cascade into `check_ins`/`commits`/`alumni_posts` free-text content a person typed themselves, nor delete the auth account. Real remaining scope before a deployment handling real PII under a strict erasure requirement.
- `disqualified` bracket is always a human-only override, never auto-computed — by design (locked decision), not a gap, but worth restating: the platform will never silently DQ a team.

**If picking this back up:** the platform is ready to run a real event as-is. Natural next steps if this becomes an active project again (none currently planned): point production env vars at a production Supabase project (already Postgres, no schema-provider flip needed — this app talks to Supabase directly, unlike the sibling `minds-of-the-future` Prisma/SQLite prototype), decide whether to close the erasure gap before handling real participant PII, and consider whether `tests/dry-run/run.ts` is worth keeping wired into CI as a recurring integration check rather than a one-off Session 14 artifact.

---

## Session sequence (DoD)

1. Foundation — **Done.**
2. Auth & roles — **Done.**
3. Teams & profiles — **Done.**
4. Schedule & comms — **Done.**
5. Check-ins & milestones — composer **&lt;30s cold load**; milestone status; timeline. ⭐ — **Done.**
6. Submission — form, video URL validation, idempotency, deadline, lock, k6 spike. ⭐ critical — **Done.**
7. GitHub & process signal — repo link, commits, unified timeline. — **Done.**
8. AI proxy — metadata only, fail-open, no bodies. — **Done.**
9. Judging engine — rubric, calibration gate, scoring, aggregation, pairwise. ⭐ moat — **Done.**
10. Organizer console — run a mock event with zero DB surgery. — **Done.**
11. Talent layer — consent, recruiter search, erasure. — **Done.**
12. Alumni network — directory gated on submission. — **Done.**
13. Hardening — k6, Playwright, Sentry, a11y. — **Done.**
14. Dry run — 20 fake teams, 5 judges, compressed week.

---

## If you need to read code before making a change here

There's no more "next session" — the sequence below is history. For context on any given area, jump straight to that session's notes above rather than reading front-to-back. `tests/dry-run/run.ts` (Session 14) is the fastest way to sanity-check that a future change hasn't broken the judging pipeline end-to-end: it exercises Sessions 5, 6, 9, and 10 together against the live database and tears itself down.

---

## New chat brief (paste this — only needed if starting fresh work, not to "continue" a build)

```
Minds of the Future is a finished build (all 14 sessions of BUILD-PLAN-v3.md done). Do not re-apply the schema. Do not redo auth, teams, comms, check-ins, submission, GitHub sync, the AI proxy, the judging engine, the organizer console, the talent layer, the alumni network, hardening (Sentry/Playwright/a11y/k6 all wired up), or the Session 14 dry run (tests/dry-run/run.ts, 6/6 sanity checks passing against live data).

Done:
- Repo: this folder. Prototype snapshotted at ec05d4a. Next.js 15 + Supabase (eu-west-2, iqclghgzyfpopqnyugvi) + shadcn.
- Schema + RLS live. 40 public tables + submit_team RPC (migration 0002) + list_pairwise_candidates RPC (migration 0003) + view_alumni_profile RPC (migration 0004).
- Keys in .env.local (gitignored), including SUPABASE_DB_URL (session pooler).
- Pilot slug `pilot` (id 00000000-0000-4000-8000-000000000010), max_team_size 5. Size-test slug `session3-size` (id ...0020), max_team_size 2. Do not change pilot.
- Sessions 2-4: magic link + GitHub OAuth; per-event roles; /dashboard/{profile,team,schedule,chat,announcements}; /organizer/{schedule,announcements}; realtime chat; announcement receipts.
- Session 5: /dashboard/checkins - milestone status computed in lib/checkins/status.ts, composer, RLS blocks non-members and post-submission writes.
- Session 6: /dashboard/submit - draft save + final submit via the submit_team RPC (captain-only, deadline-checked, required fields, row lock, idempotency replay). k6 spike in tests/load/. lib/url.ts is the single URL-scheme allowlist.
- Session 7: lib/github/* (strict repo parser, graceful client, service-role upsert on (team_id,sha)), unified timeline in lib/timeline/merge.ts, /api/cron/sync-commits guarded by CRON_SECRET (vercel.json, every 15 min).
- Session 8: app/api/proxy/[provider]/[...path] - team-token-authenticated pass-through to OpenAI/Anthropic, streaming-safe usage extraction via tee() in lib/proxy/*, api_calls is the third timeline variant, ProxySetup UI + token rotation on /dashboard/team. Cookie-stripping fix in lib/proxy/headers.ts is load-bearing - do not remove it.
- Session 9: lib/judging/* (rubric weighting, calibration deviation, two-phase drop-high/low aggregation, simplified Crowd-BT pairwise ratings + info-gain pair selection, bracket/rank computation), lib/ai/summarize.ts (heuristic + Claude, never a score), /judge dashboard + [teamId] scoring + pairwise vote screen, /organizer/results (compute/publish/override). Calibration gate is enforced by existing RLS, not app code. isValueInRange in lib/judging/rubric.ts is a required server-side check on every score write - the schema has no CHECK constraint for it.
- Session 10: /join/new-event (event bootstrap - any signed-in user creates a tenant+event+becomes organizer via the one sanctioned service-role "bootstrap" path, deliberately placed OUTSIDE the (organizer) route group since that layout requires a role this page exists to grant), /organizer/setup (milestones, rubric criteria, judge invite-by-email, judge-to-team assignment, calibration samples). tests/unit/organizer-live.test.ts proves the full zero-DB-surgery event lifecycle end to end against the real database.
- Session 11: /dashboard/talent (self-service consent grant/renew/withdraw, real enforced expiry), /recruiter (unlogged browse list via lib/talent/queries.ts#searchTalent + logged detail view ALWAYS via the view_talent_profile RPC, never a raw table select), /organizer/setup gained recruiter org onboarding + invite, admin-only erasure completion (app/(organizer)/organizer/erasure-actions.ts - genuinely needs the service role since no RLS policy lets any staff role write another user's profiles row). Erasure is honest about scope: deletes talent data + optionally anonymizes profile PII, does NOT cascade into teams/scores/commits/alumni_posts.
- Session 12: /alumni (directory + board + intro requests, gated by auth_is_alumnus() i.e. a submitted project). view_alumni_profile RPC (migration 0004) mirrors view_talent_profile but deliberately has NO access-log insert - there's no alumni_access_log table, peer browsing was never meant to be tracked like recruiter viewing is.
- Session 13: Sentry (instrumentation.ts, instrumentation-client.ts, app/global-error.tsx, optional/no-op without DSN), Playwright E2E in tests/e2e/ (submission.spec.ts, judging.spec.ts, accessibility.spec.ts - real browser, real UI, fixtures via service role), a second k6 spike (tests/load/{seed-,}scoring-spike) for concurrent judge scoring. Found and fixed a real WCAG AA contrast failure in the shadcn "destructive" button color (app/globals.css) affecting every Delete/destructive button app-wide. tests/e2e/helpers.ts#setRangeValue is required for any range-input (rubric/calibration slider) E2E interaction - plain .fill() does not work on React-controlled range inputs.
- Session 14: tests/dry-run/run.ts - standalone script creating a full 20-team/5-judge "compressed week" event against the live database, running the real judging pipeline (lib/judging/queries, aggregate, results) exactly as /organizer/results does, then 6 sanity checks (no duplicate/non-sequential ranks, plate-cap enforcement, no auto-DQ, no unsubmitted team reaching cup, at least one cup team), then full teardown. Passed 6/6 on two separate live runs. This was the final session of the 14-session plan - the build is complete.
- Locked: rewrite in place; one-shot sessions; venue-agnostic (no KCL); api_calls never stores bodies; roles never on profiles; RLS is the authorization boundary; disqualified bracket is always a human-only override, never auto-computed; event creation never grants a role on an EXISTING event, only one it just created; recruiter/alumni full-profile reads always go through their respective RPC, never a raw talent_profiles select.

Gates (last verified end of Session 14): pnpm test run twice = 333/333 passed both times, pnpm test:rls = 150/150, npx playwright test = 4/4, npx tsx tests/dry-run/run.ts = 6/6 sanity checks passed (twice), tsc --noEmit exit 0, pnpm lint exit 0 (one harmless unused-arg warning on withdrawConsent, present since before Session 14 and unrelated to it), pnpm build succeeds with zero Sentry warnings, 27 routes generated. All expected to stay green.

Tooling gotchas (read "Environment note" under Session 6, "Live-suite reliability" under Session 7, 9, 13): `supabase db push` and `supabase gen types` do NOT work here (remote migration history predates local files; gen types needs Docker) - apply additive migrations with /opt/homebrew/opt/libpq/bin/psql using SUPABASE_DB_URL, hand-patch lib/database.types.ts. Live tests (vitest AND playwright) share a per-IP Supabase auth quota, tight enough that vitest.config.ts runs maxWorkers:1 - always sign in via tests/helpers/live.ts (vitest) or tests/e2e/helpers.ts (playwright), never signInWithPassword directly. Both vitest live suites and playwright E2E specs soft-skip (not a false failure) when `pnpm dev` isn't reachable on localhost:3000. If a read needs data RLS's table policies don't cover, follow migration 0003/0004's pattern (a narrow security-definer RPC) rather than reaching for the service role from application code; if a WRITE needs the service role (bootstrap-shaped problems), always hand off to a user-scoped RLS-authorized write for the actual privileged action.

Next: nothing planned. The 14-session build is complete; treat any further work as a new feature/change request against a finished platform, not a continuation of the build plan.
DoD: 20 fake teams, 5 judges, compressed week.

Read HANDOVER.md, BUILD-PLAN-v3.md, CLAUDE.md. This session is an integration exercise, not a new feature - reuse tests/unit/organizer-live.test.ts, tests/load/, and tests/e2e/ patterns rather than building parallel new infrastructure. Implement. This is the last session (14 of 14).
```
