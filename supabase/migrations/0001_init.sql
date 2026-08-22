-- Minds of the Future — Session 1 schema
-- Part 2 DDL plus later-session columns (see header comments below).
-- VERIFY: the target project is EU London (eu-west-2) before applying.
--
-- Additions beyond the v3 Part 2 listing:
--   tenant_id on every table except tenants
--   scores.phase (prepanel|live) + unique (team_id, judge_id, criterion_id, phase)
--   teams.proxy_token, teams.submission_idempotency_key
--   events.pairwise_blend, cup_score_threshold, working_demo_required
--   judge_reliability, discussion_flags, judge_notes, ai_review_feedback
--   view_talent_profile RPC (SELECT cannot fire a trigger in Postgres)
--   enforce_max_team_size, handle_new_user, set_updated_at
--   storage buckets: avatars, sponsor-logos, exports
-- api_calls never stores prompt or response bodies.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2.1 Core
-- ---------------------------------------------------------------------------

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  tenant_id uuid references public.tenants,
  email text not null,
  full_name text,
  university text,
  course text,
  grad_year int,
  bio text,
  skills text[] not null default '{}',
  github_username text,
  avatar_url text,
  timezone text not null default 'Europe/London',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create table public.events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants,
  slug text unique not null,
  name text not null,
  tagline text,
  venue text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  submission_deadline timestamptz not null,
  status text not null default 'draft'
    check (status in ('draft','open','live','judging','complete','archived')),
  max_team_size int not null default 5,
  pairwise_threshold int not null default 60,
  pairwise_blend numeric(4,3) not null default 0.500
    check (pairwise_blend between 0 and 1),
  cup_score_threshold numeric(6,2),
  working_demo_required boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.event_roles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants,
  event_id uuid not null references public.events on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  role text not null check (role in ('participant','judge','organizer','recruiter','admin')),
  created_at timestamptz not null default now(),
  unique (event_id, user_id, role)
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants,
  event_id uuid not null references public.events on delete cascade,
  name text not null,
  invite_code text unique not null default encode(gen_random_bytes(4), 'hex'),
  project_name text,
  description text,
  repo_url text,
  repo_created_at timestamptz,
  video_url text,
  bracket text not null default 'unassigned'
    check (bracket in ('cup','plate','unassigned','disqualified')),
  submitted_at timestamptz,
  submission_idempotency_key text,
  proxy_token text unique not null default ('motf_' || encode(gen_random_bytes(16), 'hex')),
  created_at timestamptz not null default now(),
  unique (event_id, name),
  unique (event_id, submission_idempotency_key)
);

create table public.team_members (
  tenant_id uuid references public.tenants,
  team_id uuid not null references public.teams on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  role text not null default 'member' check (role in ('captain','member')),
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

-- ---------------------------------------------------------------------------
-- 2.2 Process signal
-- ---------------------------------------------------------------------------

create table public.milestones (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants,
  event_id uuid not null references public.events on delete cascade,
  key text not null,
  label text not null,
  due_at timestamptz not null,
  required boolean not null default true,
  penalty text not null default 'flag'
    check (penalty in ('none','flag','plate_cap','disqualify')),
  sort_order int not null,
  unique (event_id, key)
);

create table public.check_ins (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants,
  team_id uuid not null references public.teams on delete cascade,
  author_id uuid not null references public.profiles on delete cascade,
  milestone_id uuid references public.milestones on delete set null,
  body text not null check (char_length(body) between 1 and 4000),
  link_url text,
  blockers text,
  created_at timestamptz not null default now()
);
create index check_ins_team_created_idx on public.check_ins (team_id, created_at desc);

create table public.milestone_status (
  tenant_id uuid references public.tenants,
  team_id uuid not null references public.teams on delete cascade,
  milestone_id uuid not null references public.milestones on delete cascade,
  status text not null check (status in ('hit','late','missed')),
  satisfied_at timestamptz,
  check_in_id uuid references public.check_ins on delete set null,
  primary key (team_id, milestone_id)
);

create table public.commits (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants,
  team_id uuid not null references public.teams on delete cascade,
  sha text not null,
  message text,
  author_login text,
  authored_at timestamptz not null,
  additions int,
  deletions int,
  files_changed int,
  unique (team_id, sha)
);
create index commits_team_authored_idx on public.commits (team_id, authored_at);

create table public.api_calls (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants,
  team_id uuid not null references public.teams on delete cascade,
  user_id uuid references public.profiles on delete set null,
  provider text not null,
  model text,
  request_tokens int,
  response_tokens int,
  latency_ms int,
  status_code int,
  created_at timestamptz not null default now()
);
create index api_calls_team_created_idx on public.api_calls (team_id, created_at);

-- ---------------------------------------------------------------------------
-- 2.3 Judging
-- ---------------------------------------------------------------------------

create table public.rubric_criteria (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants,
  event_id uuid not null references public.events on delete cascade,
  key text not null,
  label text not null,
  description text not null,
  weight int not null,
  scale_max int not null default 5,
  sort_order int not null,
  unique (event_id, key)
);

create table public.judge_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants,
  event_id uuid not null references public.events on delete cascade,
  judge_id uuid not null references public.profiles on delete cascade,
  team_id uuid not null references public.teams on delete cascade,
  status text not null default 'pending'
    check (status in ('pending','in_progress','complete','recused')),
  assigned_at timestamptz not null default now(),
  unique (judge_id, team_id)
);

create table public.judge_conflicts (
  tenant_id uuid references public.tenants,
  judge_id uuid not null references public.profiles on delete cascade,
  team_id uuid not null references public.teams on delete cascade,
  reason text,
  declared_at timestamptz not null default now(),
  primary key (judge_id, team_id)
);

create table public.scores (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants,
  team_id uuid not null references public.teams on delete cascade,
  judge_id uuid not null references public.profiles on delete cascade,
  criterion_id uuid not null references public.rubric_criteria on delete cascade,
  phase text not null default 'prepanel' check (phase in ('prepanel','live')),
  value numeric(4,2) not null,
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, judge_id, criterion_id, phase)
);

create trigger scores_updated_at
  before update on public.scores
  for each row execute function public.set_updated_at();

create table public.calibration_samples (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants,
  event_id uuid not null references public.events on delete cascade,
  title text not null,
  content jsonb not null,
  reference_scores jsonb
);

create table public.calibration_results (
  tenant_id uuid references public.tenants,
  judge_id uuid not null references public.profiles on delete cascade,
  sample_id uuid not null references public.calibration_samples on delete cascade,
  scores jsonb not null,
  deviation numeric(5,2),
  completed_at timestamptz not null default now(),
  primary key (judge_id, sample_id)
);

create table public.pairwise_votes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants,
  event_id uuid not null references public.events on delete cascade,
  judge_id uuid not null references public.profiles on delete cascade,
  winner_id uuid not null references public.teams on delete cascade,
  loser_id uuid not null references public.teams on delete cascade,
  created_at timestamptz not null default now()
);

create table public.team_ratings (
  tenant_id uuid references public.tenants,
  team_id uuid primary key references public.teams on delete cascade,
  mu numeric(8,4) not null default 0,
  sigma_sq numeric(8,4) not null default 1,
  comparison_count int not null default 0,
  updated_at timestamptz not null default now()
);

create trigger team_ratings_updated_at
  before update on public.team_ratings
  for each row execute function public.set_updated_at();

create table public.ai_reviews (
  tenant_id uuid references public.tenants,
  team_id uuid primary key references public.teams on delete cascade,
  summary text not null,
  strengths text[] not null,
  improvements text[] not null,
  process_notes text,
  model text not null,
  generated_at timestamptz not null default now()
);

create table public.results (
  tenant_id uuid references public.tenants,
  team_id uuid primary key references public.teams on delete cascade,
  rubric_score numeric(6,2),
  pairwise_rank int,
  final_rank int,
  bracket text,
  published boolean not null default false
);

create table public.judge_reliability (
  tenant_id uuid references public.tenants,
  judge_id uuid not null references public.profiles on delete cascade,
  event_id uuid not null references public.events on delete cascade,
  alpha numeric(8,4) not null default 10,
  beta numeric(8,4) not null default 1,
  updated_at timestamptz not null default now(),
  primary key (judge_id, event_id)
);

create table public.discussion_flags (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants,
  event_id uuid not null references public.events on delete cascade,
  team_id uuid not null references public.teams on delete cascade,
  judge_id uuid not null references public.profiles on delete cascade,
  note text,
  created_at timestamptz not null default now(),
  unique (team_id, judge_id)
);

create table public.judge_notes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants,
  team_id uuid not null references public.teams on delete cascade,
  judge_id uuid not null references public.profiles on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, judge_id)
);

create trigger judge_notes_updated_at
  before update on public.judge_notes
  for each row execute function public.set_updated_at();

create table public.ai_review_feedback (
  tenant_id uuid references public.tenants,
  team_id uuid not null references public.teams on delete cascade,
  judge_id uuid not null references public.profiles on delete cascade,
  helpful boolean not null,
  created_at timestamptz not null default now(),
  primary key (team_id, judge_id)
);

-- ---------------------------------------------------------------------------
-- 2.4 Sponsors, schedule, comms
-- ---------------------------------------------------------------------------

create table public.sponsors (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants,
  event_id uuid not null references public.events on delete cascade,
  name text not null,
  logo_url text,
  tier text check (tier in ('headline','partner','supporter')),
  website_url text
);

create table public.challenge_tracks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants,
  event_id uuid not null references public.events on delete cascade,
  sponsor_id uuid references public.sponsors on delete set null,
  name text not null,
  brief text not null,
  prize_description text,
  judged_by_sponsor boolean not null default true
);

create table public.team_tracks (
  tenant_id uuid references public.tenants,
  team_id uuid not null references public.teams on delete cascade,
  track_id uuid not null references public.challenge_tracks on delete cascade,
  primary key (team_id, track_id)
);

create table public.schedule_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants,
  event_id uuid not null references public.events on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz,
  title text not null,
  location text,
  description text,
  kind text not null default 'session'
    check (kind in ('session','speaker','deadline','social','judging','ceremony'))
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants,
  event_id uuid not null references public.events on delete cascade,
  channel_type text not null check (channel_type in ('team','announcement')),
  team_id uuid references public.teams on delete cascade,
  sender_id uuid not null references public.profiles on delete cascade,
  body text not null,
  urgent boolean not null default false,
  created_at timestamptz not null default now(),
  check (
    (channel_type = 'announcement' and team_id is null)
    or (channel_type = 'team' and team_id is not null)
  )
);
create index messages_channel_idx on public.messages (channel_type, team_id, created_at desc);

create table public.announcement_reads (
  tenant_id uuid references public.tenants,
  message_id uuid not null references public.messages on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  read_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create table public.mentors (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants,
  event_id uuid not null references public.events on delete cascade,
  user_id uuid references public.profiles on delete set null,
  name text not null,
  expertise text[],
  bio text
);

create table public.mentor_slots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants,
  mentor_id uuid not null references public.mentors on delete cascade,
  starts_at timestamptz not null,
  duration_min int not null default 20,
  team_id uuid references public.teams on delete set null,
  booked_at timestamptz
);

-- ---------------------------------------------------------------------------
-- 2.5 Talent & alumni
-- ---------------------------------------------------------------------------

create table public.talent_profiles (
  tenant_id uuid references public.tenants,
  user_id uuid primary key references public.profiles on delete cascade,
  visibility text not null default 'private'
    check (visibility in ('private','alumni','recruiters')),
  headline text,
  open_to text[] not null default '{}',
  consent_given_at timestamptz,
  consent_expires_at timestamptz,
  consent_scopes jsonb,
  last_reviewed_at timestamptz
);

create table public.recruiter_orgs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants,
  name text not null,
  domain text,
  hiring_intent text not null,
  dpa_signed_at timestamptz,
  access_expires_at timestamptz
);

create table public.recruiter_access_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants,
  recruiter_id uuid not null references public.profiles on delete cascade,
  org_id uuid not null references public.recruiter_orgs on delete cascade,
  viewed_user_id uuid not null references public.profiles on delete cascade,
  viewed_at timestamptz not null default now()
);

create table public.alumni_posts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants,
  author_id uuid not null references public.profiles on delete cascade,
  kind text not null check (kind in ('ask','offer','update','intro_request')),
  title text not null,
  body text not null,
  tags text[],
  created_at timestamptz not null default now()
);

create table public.intro_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants,
  requester_id uuid not null references public.profiles on delete cascade,
  target_id uuid not null references public.profiles on delete cascade,
  context text not null,
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at timestamptz not null default now()
);

create table public.consent_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants,
  user_id uuid not null references public.profiles on delete cascade,
  action text not null check (action in ('granted','updated','withdrawn','expired')),
  scopes jsonb,
  ip_hash text,
  created_at timestamptz not null default now()
);

create table public.erasure_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants,
  user_id uuid not null references public.profiles on delete cascade,
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  scope text not null default 'full' check (scope in ('full','talent_only'))
);

-- ---------------------------------------------------------------------------
-- Auth helpers (security definer — must not recurse through RLS)
-- ---------------------------------------------------------------------------

create or replace function public.auth_has_event_role(p_event uuid, p_role text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.event_roles
    where event_id = p_event and user_id = auth.uid() and role = p_role
  );
$$;

create or replace function public.auth_is_staff(p_event uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.event_roles
    where event_id = p_event
      and user_id = auth.uid()
      and role in ('organizer', 'admin')
  );
$$;

create or replace function public.auth_team_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select team_id from public.team_members where user_id = auth.uid();
$$;

create or replace function public.auth_is_team_member(p_team uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.team_members
    where team_id = p_team and user_id = auth.uid()
  );
$$;

create or replace function public.auth_is_captain(p_team uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.team_members
    where team_id = p_team and user_id = auth.uid() and role = 'captain'
  );
$$;

create or replace function public.auth_is_assigned_judge(p_team uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.judge_assignments
    where team_id = p_team
      and judge_id = auth.uid()
      and status <> 'recused'
  );
$$;

create or replace function public.auth_event_id_for_team(p_team uuid)
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select event_id from public.teams where id = p_team;
$$;

create or replace function public.auth_is_alumnus()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.team_members tm
    join public.teams t on t.id = tm.team_id
    where tm.user_id = auth.uid()
      and t.submitted_at is not null
  );
$$;

create or replace function public.auth_recruiter_org_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select ro.id
  from public.recruiter_orgs ro
  where ro.dpa_signed_at is not null
    and (ro.access_expires_at is null or ro.access_expires_at > now())
    and exists (
      select 1 from public.event_roles er
      where er.user_id = auth.uid() and er.role = 'recruiter'
    )
  limit 1;
$$;

-- Talent profile detail: logs the view, then returns the row.
-- Recruiters must use this for a full profile read. Direct SELECT of
-- talent_profiles is limited to list-safe columns via RLS; this RPC is the
-- non-bypassable access log (Postgres has no SELECT trigger).
create or replace function public.view_talent_profile(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_row jsonb;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select jsonb_build_object(
    'user_id', tp.user_id,
    'headline', tp.headline,
    'open_to', tp.open_to,
    'visibility', tp.visibility,
    'consent_scopes', tp.consent_scopes,
    'profile', jsonb_build_object(
      'full_name', p.full_name,
      'university', p.university,
      'course', p.course,
      'grad_year', p.grad_year,
      'bio', p.bio,
      'skills', p.skills,
      'github_username', p.github_username,
      'avatar_url', p.avatar_url
    )
  )
  into v_row
  from public.talent_profiles tp
  join public.profiles p on p.id = tp.user_id
  where tp.user_id = p_user_id
    and tp.visibility = 'recruiters'
    and tp.consent_expires_at is not null
    and tp.consent_expires_at > now();

  if v_row is null then
    return null;
  end if;

  -- Owner may read without logging as a recruiter view.
  if p_user_id = auth.uid() then
    return v_row;
  end if;

  v_org := public.auth_recruiter_org_id();
  if v_org is null then
    raise exception 'recruiter access denied';
  end if;

  insert into public.recruiter_access_log (recruiter_id, org_id, viewed_user_id)
  values (auth.uid(), v_org, p_user_id);

  return v_row;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url, github_username)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      new.raw_user_meta_data->>'user_name'
    ),
    new.raw_user_meta_data->>'avatar_url',
    new.raw_user_meta_data->>'user_name'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.enforce_max_team_size()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_max int;
  v_count int;
begin
  select e.max_team_size into v_max
  from public.teams t
  join public.events e on e.id = t.event_id
  where t.id = new.team_id;

  select count(*) into v_count
  from public.team_members
  where team_id = new.team_id;

  if v_count >= v_max then
    raise exception 'team is full (max %)', v_max;
  end if;
  return new;
end;
$$;

create trigger team_members_max_size
  before insert on public.team_members
  for each row execute function public.enforce_max_team_size();

-- Recusal: declaring a conflict marks the assignment recused and deletes scores.
create or replace function public.on_judge_conflict()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.judge_assignments
     set status = 'recused'
   where judge_id = new.judge_id and team_id = new.team_id;

  delete from public.scores
   where judge_id = new.judge_id and team_id = new.team_id;

  return new;
end;
$$;

create trigger judge_conflicts_recuse
  after insert on public.judge_conflicts
  for each row execute function public.on_judge_conflict();

-- ---------------------------------------------------------------------------
-- RLS — enabled on every table before any feature code
-- ---------------------------------------------------------------------------

alter table public.tenants enable row level security;
alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.event_roles enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.milestones enable row level security;
alter table public.check_ins enable row level security;
alter table public.milestone_status enable row level security;
alter table public.commits enable row level security;
alter table public.api_calls enable row level security;
alter table public.rubric_criteria enable row level security;
alter table public.judge_assignments enable row level security;
alter table public.judge_conflicts enable row level security;
alter table public.scores enable row level security;
alter table public.calibration_samples enable row level security;
alter table public.calibration_results enable row level security;
alter table public.pairwise_votes enable row level security;
alter table public.team_ratings enable row level security;
alter table public.ai_reviews enable row level security;
alter table public.results enable row level security;
alter table public.judge_reliability enable row level security;
alter table public.discussion_flags enable row level security;
alter table public.judge_notes enable row level security;
alter table public.ai_review_feedback enable row level security;
alter table public.sponsors enable row level security;
alter table public.challenge_tracks enable row level security;
alter table public.team_tracks enable row level security;
alter table public.schedule_items enable row level security;
alter table public.messages enable row level security;
alter table public.announcement_reads enable row level security;
alter table public.mentors enable row level security;
alter table public.mentor_slots enable row level security;
alter table public.talent_profiles enable row level security;
alter table public.recruiter_orgs enable row level security;
alter table public.recruiter_access_log enable row level security;
alter table public.alumni_posts enable row level security;
alter table public.intro_requests enable row level security;
alter table public.consent_events enable row level security;
alter table public.erasure_requests enable row level security;

-- tenants
create policy "authenticated read tenants" on public.tenants for select
  to authenticated using (true);

-- profiles
create policy "read own profile" on public.profiles for select
  to authenticated using (id = auth.uid());
create policy "read teammate profiles" on public.profiles for select
  to authenticated using (
    exists (
      select 1 from public.team_members me
      join public.team_members them on them.team_id = me.team_id
      where me.user_id = auth.uid() and them.user_id = profiles.id
    )
  );
create policy "staff read event profiles" on public.profiles for select
  to authenticated using (
    exists (
      select 1 from public.event_roles er
      where er.user_id = profiles.id and public.auth_is_staff(er.event_id)
    )
  );
create policy "assigned judge read member profiles" on public.profiles for select
  to authenticated using (
    exists (
      select 1 from public.team_members tm
      where tm.user_id = profiles.id
        and public.auth_is_assigned_judge(tm.team_id)
    )
  );
create policy "update own profile" on public.profiles for update
  to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "insert own profile" on public.profiles for insert
  to authenticated with check (id = auth.uid());

-- events
create policy "role holders read event" on public.events for select
  to authenticated using (
    public.auth_has_event_role(id, 'participant')
    or public.auth_has_event_role(id, 'judge')
    or public.auth_has_event_role(id, 'organizer')
    or public.auth_has_event_role(id, 'recruiter')
    or public.auth_has_event_role(id, 'admin')
    or status in ('open', 'live', 'judging', 'complete')
  );
create policy "staff update event" on public.events for update
  to authenticated using (public.auth_is_staff(id)) with check (public.auth_is_staff(id));
-- Event rows are created with the service role (organizer bootstrap). No
-- authenticated INSERT — a brand-new event_id cannot yet have a staff role.

-- event_roles
create policy "read own roles" on public.event_roles for select
  to authenticated using (user_id = auth.uid());
create policy "staff read event roles" on public.event_roles for select
  to authenticated using (public.auth_is_staff(event_id));
create policy "staff write event roles" on public.event_roles for insert
  to authenticated with check (public.auth_is_staff(event_id));
create policy "staff update event roles" on public.event_roles for update
  to authenticated using (public.auth_is_staff(event_id));
create policy "staff delete event roles" on public.event_roles for delete
  to authenticated using (public.auth_is_staff(event_id));

-- teams (Part 3 representative set)
create policy "members read own team" on public.teams for select
  to authenticated using (id in (select public.auth_team_ids()));
create policy "organizers read all teams" on public.teams for select
  to authenticated using (public.auth_is_staff(event_id));
create policy "assigned judges read team" on public.teams for select
  to authenticated using (public.auth_is_assigned_judge(id));
create policy "role holders read teams in event" on public.teams for select
  to authenticated using (
    public.auth_has_event_role(event_id, 'participant')
    or public.auth_has_event_role(event_id, 'recruiter')
  );
create policy "participants create team" on public.teams for insert
  to authenticated with check (public.auth_has_event_role(event_id, 'participant'));
create policy "captain updates team" on public.teams for update
  to authenticated
  using (public.auth_is_captain(id))
  with check (submitted_at is null);
create policy "staff update team" on public.teams for update
  to authenticated using (public.auth_is_staff(event_id));

-- team_members
create policy "members read roster" on public.team_members for select
  to authenticated using (
    public.auth_is_team_member(team_id)
    or public.auth_is_staff(public.auth_event_id_for_team(team_id))
    or public.auth_is_assigned_judge(team_id)
  );
create policy "join team as self" on public.team_members for insert
  to authenticated with check (user_id = auth.uid());
create policy "captain add member" on public.team_members for insert
  to authenticated with check (public.auth_is_captain(team_id));
create policy "captain update member role" on public.team_members for update
  to authenticated using (public.auth_is_captain(team_id));
create policy "leave or captain remove" on public.team_members for delete
  to authenticated using (user_id = auth.uid() or public.auth_is_captain(team_id));
create policy "staff manage members" on public.team_members for all
  to authenticated using (public.auth_is_staff(public.auth_event_id_for_team(team_id)));

-- milestones
create policy "event members read milestones" on public.milestones for select
  to authenticated using (
    public.auth_has_event_role(event_id, 'participant')
    or public.auth_has_event_role(event_id, 'judge')
    or public.auth_is_staff(event_id)
  );
create policy "staff write milestones" on public.milestones for all
  to authenticated using (public.auth_is_staff(event_id))
  with check (public.auth_is_staff(event_id));

-- check_ins
create policy "team read check_ins" on public.check_ins for select
  to authenticated using (
    public.auth_is_team_member(team_id)
    or public.auth_is_staff(public.auth_event_id_for_team(team_id))
    or public.auth_is_assigned_judge(team_id)
  );
create policy "member insert check_in" on public.check_ins for insert
  to authenticated with check (
    author_id = auth.uid()
    and public.auth_is_team_member(team_id)
    and exists (select 1 from public.teams t where t.id = team_id and t.submitted_at is null)
  );
create policy "author update check_in" on public.check_ins for update
  to authenticated using (author_id = auth.uid());
create policy "author delete check_in" on public.check_ins for delete
  to authenticated using (author_id = auth.uid());

-- milestone_status
create policy "read milestone_status" on public.milestone_status for select
  to authenticated using (
    public.auth_is_team_member(team_id)
    or public.auth_is_staff(public.auth_event_id_for_team(team_id))
    or public.auth_is_assigned_judge(team_id)
  );
create policy "staff write milestone_status" on public.milestone_status for all
  to authenticated using (public.auth_is_staff(public.auth_event_id_for_team(team_id)));

-- commits (writes via service role / webhook)
create policy "read commits" on public.commits for select
  to authenticated using (
    public.auth_is_team_member(team_id)
    or public.auth_is_staff(public.auth_event_id_for_team(team_id))
    or public.auth_is_assigned_judge(team_id)
  );

-- api_calls: team, assigned judges, organizers. Never cross-team. Never bodies.
create policy "read api_calls" on public.api_calls for select
  to authenticated using (
    public.auth_is_team_member(team_id)
    or public.auth_is_staff(public.auth_event_id_for_team(team_id))
    or public.auth_is_assigned_judge(team_id)
  );

-- rubric_criteria
create policy "read rubric" on public.rubric_criteria for select
  to authenticated using (
    public.auth_has_event_role(event_id, 'participant')
    or public.auth_has_event_role(event_id, 'judge')
    or public.auth_is_staff(event_id)
  );
create policy "staff write rubric" on public.rubric_criteria for all
  to authenticated using (public.auth_is_staff(event_id))
  with check (public.auth_is_staff(event_id));

-- judge_assignments
create policy "judge read own assignments" on public.judge_assignments for select
  to authenticated using (judge_id = auth.uid() or public.auth_is_staff(event_id));
create policy "staff write assignments" on public.judge_assignments for all
  to authenticated using (public.auth_is_staff(event_id))
  with check (public.auth_is_staff(event_id));
create policy "judge update own assignment status" on public.judge_assignments for update
  to authenticated using (judge_id = auth.uid())
  with check (judge_id = auth.uid());

-- judge_conflicts
create policy "read conflicts" on public.judge_conflicts for select
  to authenticated using (
    judge_id = auth.uid()
    or public.auth_is_staff(public.auth_event_id_for_team(team_id))
  );
create policy "judge declare conflict" on public.judge_conflicts for insert
  to authenticated with check (judge_id = auth.uid());

-- scores: scoring judge + organizers. Never participants pre-publication.
create policy "judge read own scores" on public.scores for select
  to authenticated using (judge_id = auth.uid());
create policy "staff read scores" on public.scores for select
  to authenticated using (public.auth_is_staff(public.auth_event_id_for_team(team_id)));
create policy "team read scores after publish" on public.scores for select
  to authenticated using (
    public.auth_is_team_member(team_id)
    and exists (select 1 from public.results r where r.team_id = scores.team_id and r.published)
  );
create policy "judge upsert own scores" on public.scores for insert
  to authenticated with check (
    judge_id = auth.uid()
    and public.auth_is_assigned_judge(team_id)
    and exists (
      select 1 from public.calibration_results cr
      join public.calibration_samples cs on cs.id = cr.sample_id
      where cr.judge_id = auth.uid()
        and cs.event_id = public.auth_event_id_for_team(team_id)
    )
  );
create policy "judge update own scores" on public.scores for update
  to authenticated using (
    judge_id = auth.uid() and public.auth_is_assigned_judge(team_id)
  )
  with check (judge_id = auth.uid());
create policy "judge delete own scores" on public.scores for delete
  to authenticated using (judge_id = auth.uid());

-- calibration
create policy "judges read samples" on public.calibration_samples for select
  to authenticated using (
    public.auth_has_event_role(event_id, 'judge') or public.auth_is_staff(event_id)
  );
create policy "staff write samples" on public.calibration_samples for all
  to authenticated using (public.auth_is_staff(event_id))
  with check (public.auth_is_staff(event_id));

create policy "judge read own calibration" on public.calibration_results for select
  to authenticated using (
    judge_id = auth.uid()
    or exists (
      select 1 from public.calibration_samples cs
      where cs.id = sample_id and public.auth_is_staff(cs.event_id)
    )
  );
create policy "judge write own calibration" on public.calibration_results for insert
  to authenticated with check (judge_id = auth.uid());
create policy "judge update own calibration" on public.calibration_results for update
  to authenticated using (judge_id = auth.uid());

-- pairwise
create policy "judge read own votes" on public.pairwise_votes for select
  to authenticated using (judge_id = auth.uid() or public.auth_is_staff(event_id));
create policy "judge insert vote" on public.pairwise_votes for insert
  to authenticated with check (
    judge_id = auth.uid() and public.auth_has_event_role(event_id, 'judge')
  );

create policy "staff read ratings" on public.team_ratings for select
  to authenticated using (
    public.auth_is_staff(public.auth_event_id_for_team(team_id))
  );

-- ai_reviews: assigned judges + staff + own team (aid, never a score)
create policy "read ai_reviews" on public.ai_reviews for select
  to authenticated using (
    public.auth_is_team_member(team_id)
    or public.auth_is_staff(public.auth_event_id_for_team(team_id))
    or public.auth_is_assigned_judge(team_id)
  );

-- results
create policy "staff read results" on public.results for select
  to authenticated using (public.auth_is_staff(public.auth_event_id_for_team(team_id)));
create policy "team read published results" on public.results for select
  to authenticated using (published and public.auth_is_team_member(team_id));
create policy "staff write results" on public.results for all
  to authenticated using (public.auth_is_staff(public.auth_event_id_for_team(team_id)));

-- judge_reliability
create policy "staff read reliability" on public.judge_reliability for select
  to authenticated using (public.auth_is_staff(event_id));
create policy "judge read own reliability" on public.judge_reliability for select
  to authenticated using (judge_id = auth.uid());

-- discussion_flags
create policy "read discussion flags" on public.discussion_flags for select
  to authenticated using (judge_id = auth.uid() or public.auth_is_staff(event_id));
create policy "judge flag team" on public.discussion_flags for insert
  to authenticated with check (
    judge_id = auth.uid() and public.auth_is_assigned_judge(team_id)
  );
create policy "judge update own flag" on public.discussion_flags for update
  to authenticated using (judge_id = auth.uid());
create policy "judge delete own flag" on public.discussion_flags for delete
  to authenticated using (judge_id = auth.uid());

-- judge_notes (private to the judge + staff)
create policy "read own notes" on public.judge_notes for select
  to authenticated using (judge_id = auth.uid() or public.auth_is_staff(public.auth_event_id_for_team(team_id)));
create policy "write own notes" on public.judge_notes for insert
  to authenticated with check (judge_id = auth.uid() and public.auth_is_assigned_judge(team_id));
create policy "update own notes" on public.judge_notes for update
  to authenticated using (judge_id = auth.uid());
create policy "delete own notes" on public.judge_notes for delete
  to authenticated using (judge_id = auth.uid());

-- ai_review_feedback
create policy "read ai feedback" on public.ai_review_feedback for select
  to authenticated using (
    judge_id = auth.uid()
    or public.auth_is_staff(public.auth_event_id_for_team(team_id))
  );
create policy "judge write ai feedback" on public.ai_review_feedback for insert
  to authenticated with check (judge_id = auth.uid() and public.auth_is_assigned_judge(team_id));
create policy "judge update ai feedback" on public.ai_review_feedback for update
  to authenticated using (judge_id = auth.uid());

-- sponsors / tracks / schedule — event-visible, staff-writable
create policy "read sponsors" on public.sponsors for select
  to authenticated using (
    public.auth_has_event_role(event_id, 'participant')
    or public.auth_has_event_role(event_id, 'judge')
    or public.auth_is_staff(event_id)
  );
create policy "staff write sponsors" on public.sponsors for all
  to authenticated using (public.auth_is_staff(event_id))
  with check (public.auth_is_staff(event_id));

create policy "read tracks" on public.challenge_tracks for select
  to authenticated using (
    public.auth_has_event_role(event_id, 'participant')
    or public.auth_has_event_role(event_id, 'judge')
    or public.auth_is_staff(event_id)
  );
create policy "staff write tracks" on public.challenge_tracks for all
  to authenticated using (public.auth_is_staff(event_id))
  with check (public.auth_is_staff(event_id));

create policy "read team_tracks" on public.team_tracks for select
  to authenticated using (
    public.auth_is_team_member(team_id)
    or public.auth_is_staff(public.auth_event_id_for_team(team_id))
    or public.auth_is_assigned_judge(team_id)
  );
create policy "captain write team_tracks" on public.team_tracks for insert
  to authenticated with check (public.auth_is_captain(team_id));
create policy "captain delete team_tracks" on public.team_tracks for delete
  to authenticated using (public.auth_is_captain(team_id));
create policy "staff write team_tracks" on public.team_tracks for all
  to authenticated using (public.auth_is_staff(public.auth_event_id_for_team(team_id)));

create policy "read schedule" on public.schedule_items for select
  to authenticated using (
    public.auth_has_event_role(event_id, 'participant')
    or public.auth_has_event_role(event_id, 'judge')
    or public.auth_is_staff(event_id)
  );
create policy "staff write schedule" on public.schedule_items for all
  to authenticated using (public.auth_is_staff(event_id))
  with check (public.auth_is_staff(event_id));

-- messages
create policy "read team messages" on public.messages for select
  to authenticated using (
    (channel_type = 'team' and public.auth_is_team_member(team_id))
    or (channel_type = 'announcement' and (
      public.auth_has_event_role(event_id, 'participant')
      or public.auth_has_event_role(event_id, 'judge')
      or public.auth_is_staff(event_id)
    ))
    or public.auth_is_staff(event_id)
  );
create policy "member send team message" on public.messages for insert
  to authenticated with check (
    sender_id = auth.uid()
    and (
      (channel_type = 'team' and public.auth_is_team_member(team_id))
      or (channel_type = 'announcement' and public.auth_is_staff(event_id))
    )
  );

create policy "read own announcement receipts" on public.announcement_reads for select
  to authenticated using (user_id = auth.uid() or public.auth_is_staff(
    (select event_id from public.messages m where m.id = message_id)
  ));
create policy "insert own receipt" on public.announcement_reads for insert
  to authenticated with check (user_id = auth.uid());

-- mentors
create policy "read mentors" on public.mentors for select
  to authenticated using (
    public.auth_has_event_role(event_id, 'participant')
    or public.auth_is_staff(event_id)
  );
create policy "staff write mentors" on public.mentors for all
  to authenticated using (public.auth_is_staff(event_id))
  with check (public.auth_is_staff(event_id));

create policy "read mentor slots" on public.mentor_slots for select
  to authenticated using (
    exists (
      select 1 from public.mentors m
      where m.id = mentor_id and (
        public.auth_has_event_role(m.event_id, 'participant')
        or public.auth_is_staff(m.event_id)
      )
    )
  );
create policy "captain book slot" on public.mentor_slots for update
  to authenticated using (
    team_id is null and exists (
      select 1 from public.mentors m
      where m.id = mentor_id and public.auth_has_event_role(m.event_id, 'participant')
    )
  )
  with check (public.auth_is_captain(team_id) or team_id is null);
create policy "staff write slots" on public.mentor_slots for all
  to authenticated using (
    exists (select 1 from public.mentors m where m.id = mentor_id and public.auth_is_staff(m.event_id))
  );

-- talent_profiles: recruiters see only visibility=recruiters AND unexpired consent
create policy "own talent profile" on public.talent_profiles for select
  to authenticated using (user_id = auth.uid());
create policy "write own talent profile" on public.talent_profiles for insert
  to authenticated with check (user_id = auth.uid());
create policy "update own talent profile" on public.talent_profiles for update
  to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "delete own talent profile" on public.talent_profiles for delete
  to authenticated using (user_id = auth.uid());
create policy "alumni read alumni-visible" on public.talent_profiles for select
  to authenticated using (
    public.auth_is_alumnus()
    and visibility in ('alumni', 'recruiters')
    and consent_expires_at is not null
    and consent_expires_at > now()
  );
create policy "recruiters read consented" on public.talent_profiles for select
  to authenticated using (
    visibility = 'recruiters'
    and consent_expires_at is not null
    and consent_expires_at > now()
    and public.auth_recruiter_org_id() is not null
  );

-- recruiter_orgs: staff + members of that org (via recruiter role + matching access)
create policy "staff read recruiter orgs" on public.recruiter_orgs for select
  to authenticated using (
    exists (
      select 1 from public.event_roles er
      where er.user_id = auth.uid() and er.role in ('organizer', 'admin', 'recruiter')
    )
  );
create policy "staff write recruiter orgs" on public.recruiter_orgs for all
  to authenticated using (
    exists (
      select 1 from public.event_roles er
      where er.user_id = auth.uid() and er.role in ('organizer', 'admin')
    )
  );

-- access log: the viewed participant, the recruiter, staff
create policy "subject reads access log" on public.recruiter_access_log for select
  to authenticated using (viewed_user_id = auth.uid());
create policy "recruiter reads own log" on public.recruiter_access_log for select
  to authenticated using (recruiter_id = auth.uid());
create policy "staff read access log" on public.recruiter_access_log for select
  to authenticated using (
    exists (
      select 1 from public.event_roles er
      where er.user_id = auth.uid() and er.role in ('organizer', 'admin')
    )
  );
-- inserts only via view_talent_profile (security definer)

-- alumni
create policy "alumni read posts" on public.alumni_posts for select
  to authenticated using (public.auth_is_alumnus() or author_id = auth.uid());
create policy "alumnus write post" on public.alumni_posts for insert
  to authenticated with check (author_id = auth.uid() and public.auth_is_alumnus());
create policy "author update post" on public.alumni_posts for update
  to authenticated using (author_id = auth.uid());
create policy "author delete post" on public.alumni_posts for delete
  to authenticated using (author_id = auth.uid());

create policy "parties read intros" on public.intro_requests for select
  to authenticated using (requester_id = auth.uid() or target_id = auth.uid());
create policy "alumnus request intro" on public.intro_requests for insert
  to authenticated with check (requester_id = auth.uid() and public.auth_is_alumnus());
create policy "target update intro" on public.intro_requests for update
  to authenticated using (target_id = auth.uid() or requester_id = auth.uid());

-- consent + erasure: owner + staff
create policy "own consent events" on public.consent_events for select
  to authenticated using (user_id = auth.uid());
create policy "insert own consent event" on public.consent_events for insert
  to authenticated with check (user_id = auth.uid());
create policy "staff read consent events" on public.consent_events for select
  to authenticated using (
    exists (
      select 1 from public.event_roles er
      where er.user_id = auth.uid() and er.role in ('organizer', 'admin')
    )
  );

create policy "own erasure requests" on public.erasure_requests for select
  to authenticated using (user_id = auth.uid());
create policy "insert own erasure request" on public.erasure_requests for insert
  to authenticated with check (user_id = auth.uid());
create policy "staff read erasure" on public.erasure_requests for select
  to authenticated using (
    exists (
      select 1 from public.event_roles er
      where er.user_id = auth.uid() and er.role in ('organizer', 'admin')
    )
  );

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

grant usage on schema public to anon, authenticated, service_role;
grant select on all tables in schema public to authenticated;
grant insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant execute on all functions in schema public to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.announcement_reads;
alter publication supabase_realtime add table public.judge_assignments;
alter publication supabase_realtime add table public.scores;

-- ---------------------------------------------------------------------------
-- Storage buckets
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values
  ('avatars', 'avatars', true),
  ('sponsor-logos', 'sponsor-logos', true),
  ('exports', 'exports', false)
on conflict (id) do nothing;

alter table storage.objects enable row level security;

create policy "avatar public read" on storage.objects for select
  using (bucket_id = 'avatars');
create policy "avatar own write" on storage.objects for insert
  to authenticated with check (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "avatar own update" on storage.objects for update
  to authenticated using (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "avatar own delete" on storage.objects for delete
  to authenticated using (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "logos public read" on storage.objects for select
  using (bucket_id = 'sponsor-logos');
create policy "staff write logos" on storage.objects for insert
  to authenticated with check (bucket_id = 'sponsor-logos');

create policy "own or staff read exports" on storage.objects for select
  to authenticated using (
    bucket_id = 'exports' and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1 from public.event_roles er
        where er.user_id = auth.uid() and er.role in ('organizer', 'admin')
      )
    )
  );
create policy "staff write exports" on storage.objects for insert
  to authenticated with check (bucket_id = 'exports');
