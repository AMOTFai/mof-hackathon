-- Mock event fixture. Users are created via Auth (handle_new_user fills profiles).
-- Apply after 0001_init.sql. Safe to re-run: uses fixed slugs.

insert into public.tenants (id, slug, name)
values ('00000000-0000-4000-8000-000000000001', 'mof', 'Minds of the Future')
on conflict (slug) do nothing;

insert into public.events (
  id, tenant_id, slug, name, tagline, venue,
  starts_at, ends_at, submission_deadline, status, max_team_size
)
values (
  '00000000-0000-4000-8000-000000000010',
  '00000000-0000-4000-8000-000000000001',
  'pilot',
  'Minds of the Future — Pilot',
  'The artifact and the journey.',
  'TBD',
  now() + interval '7 days',
  now() + interval '9 days',
  now() + interval '8 days 18 hours',
  'open',
  5
)
on conflict (slug) do nothing;

insert into public.milestones (event_id, key, label, due_at, required, penalty, sort_order)
select e.id, x.key, x.label, e.starts_at + x.due_offset, true, x.penalty, x.sort_order
from public.events e
join (values
  ('problem_statement', 'Problem statement', interval '6 hours', 'flag', 1),
  ('plan', 'Plan', interval '18 hours', 'flag', 2),
  ('v1_slice', 'V1 slice', interval '36 hours', 'plate_cap', 3),
  ('feature_complete', 'Feature complete', interval '48 hours', 'flag', 4),
  ('freeze', 'Feature freeze', interval '54 hours', 'flag', 5)
) as x(key, label, due_offset, penalty, sort_order) on true
where e.slug = 'pilot'
on conflict (event_id, key) do nothing;

insert into public.rubric_criteria (event_id, key, label, description, weight, scale_max, sort_order)
select e.id, x.key, x.label, x.description, x.weight, 5, x.sort_order
from public.events e
join (values
  ('technical', 'Technical execution', 'Works end to end; AI is load-bearing, not decorative.', 30, 1),
  ('originality', 'Originality & problem selection', 'A real problem, sharply framed, non-obvious approach.', 20, 2),
  ('business', 'Business viability / GTM', 'Credible customer, wedge, and path to first revenue.', 25, 3),
  ('pitch', 'Pitch & demo quality', 'Clear, honest, well-paced; demo does the talking.', 15, 4),
  ('execution', 'Execution under constraint', 'Steady iteration, milestones hit, sensible pivots.', 10, 5)
) as x(key, label, description, weight, sort_order) on true
where e.slug = 'pilot'
on conflict (event_id, key) do nothing;

-- Dedicated Session 3 size-enforcement event. Do not change pilot.max_team_size.
insert into public.events (
  id, tenant_id, slug, name, tagline, venue,
  starts_at, ends_at, submission_deadline, status, max_team_size
)
values (
  '00000000-0000-4000-8000-000000000020',
  '00000000-0000-4000-8000-000000000001',
  'session3-size',
  'Session 3 size test',
  'max_team_size = 2 for join enforcement',
  'TBD',
  now() + interval '7 days',
  now() + interval '9 days',
  now() + interval '8 days 18 hours',
  'open',
  2
)
on conflict (slug) do nothing;
