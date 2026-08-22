-- Judges-only chat channel, reusing the existing messages table. Adds a
-- third channel_type ('judge') alongside 'team' and 'announcement', scoped
-- by event_id with team_id null (same shape as 'announcement'), but read
-- and written only by judges/staff on that event — participants never see
-- it.

alter table public.messages
  drop constraint messages_channel_type_check;
alter table public.messages
  add constraint messages_channel_type_check
  check (channel_type in ('team', 'announcement', 'judge'));

alter table public.messages
  drop constraint messages_check;
alter table public.messages
  add constraint messages_check check (
    (channel_type = 'announcement' and team_id is null)
    or (channel_type = 'team' and team_id is not null)
    or (channel_type = 'judge' and team_id is null)
  );

create policy "read judge messages" on public.messages for select
  to authenticated using (
    channel_type = 'judge'
    and (public.auth_has_event_role(event_id, 'judge') or public.auth_is_staff(event_id))
  );

create policy "judge send judge message" on public.messages for insert
  to authenticated with check (
    sender_id = auth.uid()
    and channel_type = 'judge'
    and (public.auth_has_event_role(event_id, 'judge') or public.auth_is_staff(event_id))
  );
