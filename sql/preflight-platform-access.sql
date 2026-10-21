-- Read-only inventory before the platform-access migration.
-- Run as a trusted database operator. This script does not change application data.
begin transaction read only;

-- A store can be backfilled as owner only when exactly one membership exists.
select
  s.id as store_id,
  s.name as store_name,
  s.archived_at,
  count(m.id)::integer as membership_count,
  count(m.id) filter (where m.active)::integer as active_membership_count,
  coalesce(
    string_agg(
      concat(m.user_id::text, ' (', coalesce(u.email, 'no email'), ', active=', m.active, ')'),
      E'\n' order by m.created_at, m.user_id
    ) filter (where m.id is not null),
    ''
  ) as membership_candidates
from public.stores s
left join public.store_memberships m on m.store_id = s.id
left join auth.users u on u.id = m.user_id
group by s.id, s.name, s.archived_at
order by s.created_at, s.id;

-- A user with multiple memberships conflicts with the one-shop-per-account rule.
select
  m.user_id,
  u.email,
  count(distinct m.store_id)::integer as store_count,
  string_agg(distinct concat(s.id::text, ' (', s.name, ')'), E'\n' order by concat(s.id::text, ' (', s.name, ')')) as stores
from public.store_memberships m
join public.stores s on s.id = m.store_id
left join auth.users u on u.id = m.user_id
group by m.user_id, u.email
having count(distinct m.store_id) > 1
order by m.user_id;

-- Auth users without a store are reported for review, never promoted to platform admin.
select u.id as user_id, u.email, u.created_at
from auth.users u
where not exists (
  select 1 from public.store_memberships m where m.user_id = u.id
)
order by u.created_at, u.id;

rollback;
