# Minds of the Future

Venue-agnostic process-visibility platform for hackathons. Judges score the
artifact **and** the journey. Spec: [`BUILD-PLAN-v3.md`](./BUILD-PLAN-v3.md).

## Stack

Next.js 15 (App Router) · Supabase Postgres (EU London) · Tailwind · shadcn/ui

## Run

```bash
pnpm install
cp .env.example .env.local   # add Supabase URL + keys; verify the project is eu-west-2
pnpm test:rls                # schema + RLS coverage (live cases need keys)
pnpm dev                     # http://localhost:3000
```

Do not apply `supabase/migrations/` until the project region is confirmed **London**.
