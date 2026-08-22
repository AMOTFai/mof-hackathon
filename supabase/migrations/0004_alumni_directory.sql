-- Session 12: the alumni directory has the same structural gap Session 11
-- hit with recruiter search — RLS lets an alumnus browse talent_profiles
-- rows (visibility in alumni/recruiters, unexpired consent) but there is no
-- policy letting them read another user's `profiles` row for the name,
-- school, bio, etc. that make a directory entry useful.
--
-- Unlike view_talent_profile, this does NOT write an access log: the schema
-- has no `alumni_access_log` table, meaning peer alumni browsing was never
-- designed to be tracked the way recruiter/employer viewing is. Same
-- consent gate (visibility + unexpired consent_expires_at) and same
-- security-definer narrow-read shape, deliberately without the log insert.
create or replace function public.view_alumni_profile(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not public.auth_is_alumnus() then
    raise exception 'alumni only';
  end if;

  select jsonb_build_object(
    'user_id', tp.user_id,
    'headline', tp.headline,
    'open_to', tp.open_to,
    'visibility', tp.visibility,
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
    and tp.visibility in ('alumni', 'recruiters')
    and tp.consent_expires_at is not null
    and tp.consent_expires_at > now();

  return v_row;
end;
$$;

revoke all on function public.view_alumni_profile(uuid) from public;
revoke all on function public.view_alumni_profile(uuid) from anon;
grant execute on function public.view_alumni_profile(uuid) to authenticated;
