-- Secure invite-link system. There was previously no way to grant the
-- 'participant' role at all (only a service-role fixture script did it) and
-- judges/recruiters could only be added by email-lookup against an
-- already-existing profiles row (inviteJudge/inviteRecruiter). This is
-- additive: those two flows stay as-is; this adds a real self-service path.
--
-- The existing teams.invite_code is NOT a security precedent to follow here:
-- it's only 32 bits of entropy and works only because the caller already has
-- an unrelated RLS grant to read every team in the event (it filters an
-- already-wide-open read, it isn't the access boundary). A brand-new visitor
-- accepting an invite has no equivalent ambient grant, so this uses real
-- security-definer RPCs — same shape as list_pairwise_candidates (0003) and
-- view_alumni_profile (0004) — as the actual boundary, not RLS filtering.

create table public.event_invites (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants,
  event_id uuid not null references public.events on delete cascade,
  role text not null check (role in ('participant', 'judge', 'recruiter')),
  -- 160-bit — above teams.proxy_token's 128-bit precedent (0001_init.sql),
  -- since this token IS the authorization boundary, not a UX convenience code.
  token text unique not null default encode(gen_random_bytes(20), 'hex'),
  email text,
  max_uses integer not null default 1 check (max_uses >= 1),
  use_count integer not null default 0 check (use_count <= max_uses),
  expires_at timestamptz not null default (now() + interval '14 days'),
  revoked_at timestamptz,
  created_by uuid not null references public.profiles,
  created_at timestamptz not null default now()
);
create index event_invites_event_idx on public.event_invites (event_id);

alter table public.event_invites enable row level security;

-- Only staff manage invites directly. No policy grants anon/authenticated
-- visitors any read on this table — that access goes entirely through the
-- two RPCs below, which return only what's needed and never the row itself.
create policy "staff read invites" on public.event_invites for select
  to authenticated using (public.auth_is_staff(event_id));
create policy "staff create invites" on public.event_invites for insert
  to authenticated with check (public.auth_is_staff(event_id) and created_by = auth.uid());
create policy "staff revoke invites" on public.event_invites for update
  to authenticated using (public.auth_is_staff(event_id));

-- Callable by anyone (including signed-out visitors) so /invite/[token] can
-- show "you're invited to X as a judge" before prompting sign-in. Returns
-- only display info — never the email lock or any other invite metadata, so
-- there's no enumeration surface even if the RPC name/shape leaks.
create or replace function public.preview_invite(p_token text)
returns table (
  valid boolean,
  reason text,
  event_name text,
  role text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  inv record;
begin
  select i.event_id, i.role, i.revoked_at, i.expires_at, i.use_count, i.max_uses
    into inv
    from public.event_invites i
    where i.token = p_token;

  if inv is null then
    return query select false, 'not_found', null::text, null::text;
    return;
  end if;
  if inv.revoked_at is not null then
    return query select false, 'revoked', null::text, null::text;
    return;
  end if;
  if inv.expires_at < now() then
    return query select false, 'expired', null::text, null::text;
    return;
  end if;
  if inv.use_count >= inv.max_uses then
    return query select false, 'used_up', null::text, null::text;
    return;
  end if;

  return query
    select true, 'ok', e.name, inv.role
    from public.events e
    where e.id = inv.event_id;
end;
$$;

revoke all on function public.preview_invite(text) from public;
grant execute on function public.preview_invite(text) to anon, authenticated;

-- Callable only by a signed-in user. This is the actual write boundary that
-- works around event_roles having no INSERT policy for non-staff — same
-- reasoning as the read-side RPCs, applied to a write.
-- Output columns are prefixed (out_event_id/out_role) rather than named
-- event_id/role: those bare names collide with the real event_roles columns
-- referenced in the ON CONFLICT target below, which PL/pgSQL resolves
-- against the function's OUT-parameter namespace too — Postgres raised
-- "column reference event_id is ambiguous" until this was renamed.
create or replace function public.accept_invite(p_token text)
returns table (
  granted boolean,
  reason text,
  out_event_id uuid,
  out_role text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.event_invites%rowtype;
  caller_email text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select * into inv from public.event_invites where token = p_token for update;

  if inv is null then
    return query select false, 'not_found', null::uuid, null::text;
    return;
  end if;
  if inv.revoked_at is not null then
    return query select false, 'revoked', null::uuid, null::text;
    return;
  end if;
  if inv.expires_at < now() then
    return query select false, 'expired', null::uuid, null::text;
    return;
  end if;
  if inv.use_count >= inv.max_uses then
    return query select false, 'used_up', null::uuid, null::text;
    return;
  end if;

  if inv.email is not null then
    select p.email into caller_email from public.profiles p where p.id = auth.uid();
    if caller_email is null or lower(caller_email) <> lower(inv.email) then
      return query select false, 'wrong_email', null::uuid, null::text;
      return;
    end if;
  end if;

  insert into public.event_roles (event_id, user_id, role, tenant_id)
    values (inv.event_id, auth.uid(), inv.role, inv.tenant_id)
    on conflict (event_id, user_id, role) do nothing;

  update public.event_invites set use_count = use_count + 1 where id = inv.id;

  return query select true, 'ok', inv.event_id, inv.role;
end;
$$;

revoke all on function public.accept_invite(text) from public;
revoke all on function public.accept_invite(text) from anon;
grant execute on function public.accept_invite(text) to authenticated;
