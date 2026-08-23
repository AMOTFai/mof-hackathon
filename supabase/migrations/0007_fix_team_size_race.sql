-- enforce_max_team_size did a plain SELECT COUNT(*) with no lock, so two
-- concurrent team_members inserts for the same team could both pass the
-- capacity check under READ COMMITTED and overrun max_team_size. Lock the
-- parent team row first so concurrent inserts on the same team serialize.
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
  perform 1 from public.teams where id = new.team_id for update;

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

-- auth_recruiter_org_id() checked "does this user hold a recruiter role on
-- ANY event" then granted access to whichever DPA-signed recruiter_orgs row
-- came first (LIMIT 1, no tenant filter). A recruiter invited to one
-- university's event could see another university's recruiter org data if
-- that org happened to sort first. Scope the match to orgs whose tenant
-- matches an event where this user actually holds the recruiter role.
create or replace function public.auth_recruiter_org_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select ro.id
  from public.recruiter_orgs ro
  join public.event_roles er on er.role = 'recruiter' and er.user_id = auth.uid()
  join public.events e on e.id = er.event_id and e.tenant_id = ro.tenant_id
  where ro.dpa_signed_at is not null
    and (ro.access_expires_at is null or ro.access_expires_at > now())
  limit 1;
$$;
