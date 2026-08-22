-- Session 9: pairwise comparison needs a judge to browse arbitrary submitted
-- teams in their event, but `teams` SELECT policies only grant a judge read
-- access to teams they're individually assigned to (judge_assignments). That
-- is correct for scoring (assignment-scoped) but too narrow for pairwise
-- voting, whose own RLS ("judge insert vote") is deliberately event-scoped,
-- not assignment-scoped.
--
-- Same shape as the existing view_talent_profile RPC: a narrow, auditable,
-- security-definer read for a case the blanket table policies don't cover,
-- rather than reaching for the service role from application code. Returns
-- only what a comparison screen needs (id, name, project_name) — never
-- description, repo_url, video_url, or anything else.
--
-- Also folds in team_ratings, for the same reason: that table's only SELECT
-- policy is staff-only, but choosing the next informative pair needs the
-- current mu/sigma/comparison_count of every candidate. A team with no
-- team_ratings row yet (yes, it exists once the pair-selection UI reaches it)
-- gets the schema's own column defaults (mu=0, sigma_sq=1, comparison_count=0)
-- via coalesce, so a never-compared team behaves exactly as if its row already
-- existed with fresh defaults.
create or replace function public.list_pairwise_candidates(p_event_id uuid)
returns table (
  id uuid,
  name text,
  project_name text,
  mu numeric,
  sigma_sq numeric,
  comparison_count int
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not public.auth_has_event_role(p_event_id, 'judge') then
    raise exception 'not a judge on this event';
  end if;

  return query
    select
      t.id,
      t.name,
      t.project_name,
      coalesce(tr.mu, 0),
      coalesce(tr.sigma_sq, 1),
      coalesce(tr.comparison_count, 0)
    from public.teams t
    left join public.team_ratings tr on tr.team_id = t.id
    where t.event_id = p_event_id
      and t.submitted_at is not null;
end;
$$;

revoke all on function public.list_pairwise_candidates(uuid) from public;
revoke all on function public.list_pairwise_candidates(uuid) from anon;
grant execute on function public.list_pairwise_candidates(uuid) to authenticated;
