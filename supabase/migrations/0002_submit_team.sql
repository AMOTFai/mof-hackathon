-- Session 6: final submission RPC.
-- Additive only. Do not touch 0001_init.sql.
--
-- Regular UPDATEs on teams are gated by RLS: "captain updates team" allows
-- update while submitted_at is null but its WITH CHECK forbids ever setting
-- submitted_at via a plain UPDATE (the new row would fail the check). That's
-- intentional: submission is a one-way transition and goes through this
-- function instead, which does its own authorization + validation and is
-- SECURITY DEFINER so it can flip submitted_at in one atomic, row-locked step.
create or replace function public.submit_team(p_team_id uuid, p_idempotency_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team record;
  v_deadline timestamptz;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if p_idempotency_key is null or length(trim(p_idempotency_key)) = 0 then
    raise exception 'missing idempotency key';
  end if;

  if not public.auth_is_captain(p_team_id) then
    raise exception 'only the captain can submit';
  end if;

  -- Row lock: two concurrent submit calls for the same team serialize here,
  -- so the second sees the first's committed submitted_at before deciding.
  select id, event_id, project_name, repo_url, video_url, submitted_at, submission_idempotency_key, bracket
  into v_team
  from public.teams
  where id = p_team_id
  for update;

  if v_team.id is null then
    raise exception 'team not found';
  end if;

  if v_team.submitted_at is not null then
    if v_team.submission_idempotency_key = p_idempotency_key then
      -- Idempotent replay: same request retried (double-click, network blip).
      return jsonb_build_object(
        'team_id', v_team.id,
        'submitted_at', v_team.submitted_at,
        'bracket', v_team.bracket,
        'replay', true
      );
    end if;
    raise exception 'team already submitted';
  end if;

  select submission_deadline into v_deadline from public.events where id = v_team.event_id;
  if v_deadline is null then
    raise exception 'event not found';
  end if;
  if now() > v_deadline then
    raise exception 'submission deadline has passed';
  end if;

  if v_team.project_name is null or length(trim(v_team.project_name)) = 0 then
    raise exception 'project name is required';
  end if;
  if v_team.repo_url is null or v_team.repo_url !~* '^https?://' then
    raise exception 'a valid repo URL is required';
  end if;
  if v_team.video_url is null or v_team.video_url !~* '^https?://' then
    raise exception 'a valid video URL is required';
  end if;

  update public.teams
  set submitted_at = now(),
      submission_idempotency_key = p_idempotency_key
  where id = p_team_id;

  return jsonb_build_object(
    'team_id', v_team.id,
    'submitted_at', now(),
    'bracket', v_team.bracket,
    'replay', false
  );
end;
$$;

-- Least privilege. The function already refuses when auth.uid() is null, but a
-- SECURITY DEFINER function should not be reachable by the anon role at all:
-- Supabase's default privileges grant EXECUTE to anon on creation, so revoke it
-- explicitly rather than relying on the in-function guard alone.
revoke all on function public.submit_team(uuid, text) from public;
revoke all on function public.submit_team(uuid, text) from anon;
grant execute on function public.submit_team(uuid, text) to authenticated;
