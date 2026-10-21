begin;

-- Keep Auth provisioning and membership/store changes stable while preflight runs.
lock table auth.users in share row exclusive mode;
lock table public.stores in share row exclusive mode;
lock table public.store_memberships in share row exclusive mode;

-- Stop before changing ownership if the existing single-user data is ambiguous.
do $preflight$
declare
  v_bad_stores text;
  v_multi_store_users text;
begin
  select string_agg(
    format('%s (memberships=%s, active=%s)', q.store_id, q.membership_count, q.active_count),
    ', ' order by q.store_id
  )
  into v_bad_stores
  from (
    select s.id as store_id,
      count(m.id)::integer as membership_count,
      count(m.id) filter (where m.active)::integer as active_count
    from public.stores s
    left join public.store_memberships m on m.store_id = s.id
    group by s.id
    having count(m.id) <> 1 or count(m.id) filter (where m.active) <> 1
  ) q;

  if v_bad_stores is not null then
    raise exception 'platform_access_preflight_store_memberships: %', v_bad_stores
      using errcode = '23514';
  end if;

  select string_agg(format('%s (stores=%s)', q.user_id, q.store_count), ', ' order by q.user_id)
  into v_multi_store_users
  from (
    select m.user_id, count(distinct m.store_id)::integer as store_count
    from public.store_memberships m
    group by m.user_id
    having count(distinct m.store_id) > 1
  ) q;

  if v_multi_store_users is not null then
    raise exception 'platform_access_preflight_users_in_multiple_stores: %', v_multi_store_users
      using errcode = '23514';
  end if;

end
$preflight$;

alter table public.stores
  add column platform_active boolean not null default true,
  add column platform_active_changed_at timestamptz,
  add column platform_active_changed_by uuid references auth.users(id) on delete set null;

alter table public.store_memberships
  add column role text not null default 'owner',
  add constraint store_memberships_role_check check (role in ('owner', 'employee'));

create unique index store_memberships_user_unique on public.store_memberships(user_id);
create unique index store_memberships_one_active_owner_per_store
  on public.store_memberships(store_id) where role = 'owner' and active;

create table private.platform_admins (
  user_id uuid primary key references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  created_by_user_id uuid references auth.users(id) on delete set null
);

create table private.platform_admin_bootstrap_emails (
  email text primary key check (email = lower(trim(email))),
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table private.platform_invitations (
  id uuid primary key default gen_random_uuid(),
  invitation_type text not null check (invitation_type in ('store_owner', 'employee')),
  email_normalized text not null check (email_normalized = lower(trim(email_normalized))),
  store_id uuid references public.stores(id) on delete restrict,
  created_by_user_id uuid references auth.users(id) on delete set null,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  reservation_id uuid,
  reservation_expires_at timestamptz,
  accepted_user_id uuid unique references auth.users(id) on delete restrict,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint platform_invitations_scope_check check (
    (invitation_type = 'store_owner' and store_id is null)
    or (invitation_type = 'employee' and store_id is not null)
  ),
  constraint platform_invitations_reservation_check check (
    (reservation_id is null) = (reservation_expires_at is null)
  ),
  constraint platform_invitations_acceptance_check check (
    (accepted_at is null) = (accepted_user_id is null)
  ),
  constraint platform_invitations_terminal_state_check check (
    not (accepted_at is not null and revoked_at is not null)
  )
);

create unique index platform_invitations_one_pending_email
  on private.platform_invitations(email_normalized)
  where accepted_at is null and revoked_at is null;
create index platform_invitations_store_created_idx
  on private.platform_invitations(store_id, created_at desc);
create index platform_invitations_expiry_idx
  on private.platform_invitations(expires_at) where accepted_at is null and revoked_at is null;

create table private.pending_store_setup (
  user_id uuid primary key references auth.users(id) on delete cascade,
  invitation_id uuid not null unique references private.platform_invitations(id) on delete restrict,
  created_at timestamptz not null default now()
);

-- This short-lived row bridges the BEFORE and AFTER auth.users triggers in one transaction.
create table private.pending_auth_provisioning (
  auth_user_id uuid primary key,
  provisioning_type text not null check (provisioning_type in ('platform_admin', 'store_owner', 'employee')),
  invitation_id uuid,
  reservation_id uuid,
  store_id uuid,
  created_at timestamptz not null default now(),
  constraint pending_auth_provisioning_scope_check check (
    (provisioning_type = 'platform_admin' and invitation_id is null and reservation_id is null and store_id is null)
    or (provisioning_type = 'store_owner' and invitation_id is not null and reservation_id is not null and store_id is null)
    or (provisioning_type = 'employee' and invitation_id is not null and reservation_id is not null and store_id is not null)
  )
);

create table private.invitation_rate_limits (
  rate_key text primary key check (rate_key ~ '^[0-9a-f]{64}$'),
  window_start timestamptz not null,
  attempts integer not null check (attempts >= 0)
);
create index invitation_rate_limits_window_idx
  on private.invitation_rate_limits(window_start);

alter table private.platform_admins enable row level security;
alter table private.platform_admin_bootstrap_emails enable row level security;
alter table private.platform_invitations enable row level security;
alter table private.pending_store_setup enable row level security;
alter table private.pending_auth_provisioning enable row level security;
alter table private.invitation_rate_limits enable row level security;
revoke all on table private.platform_admins, private.platform_admin_bootstrap_emails,
  private.platform_invitations, private.pending_store_setup, private.pending_auth_provisioning,
  private.invitation_rate_limits from public, anon, authenticated, service_role;

create or replace function private.is_platform_admin(p_user_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists(select 1 from private.platform_admins a where a.user_id = p_user_id)
$$;
revoke all on function private.is_platform_admin(uuid) from public, anon, authenticated, service_role;

create or replace function private.guard_store_platform_status()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.platform_active is distinct from old.platform_active
    or new.platform_active_changed_at is distinct from old.platform_active_changed_at
    or new.platform_active_changed_by is distinct from old.platform_active_changed_by then
    if auth.uid() is null or not private.is_platform_admin(auth.uid()) then
      raise exception 'not_authorized' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
revoke all on function private.guard_store_platform_status() from public, anon, authenticated, service_role;
create trigger stores_platform_status_admin_only
  before update of platform_active, platform_active_changed_at, platform_active_changed_by
  on public.stores
  for each row execute function private.guard_store_platform_status();

create or replace function private.enforce_active_store_owner()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_store_ids uuid[];
  v_store_id uuid;
  v_owner_count integer;
begin
  if tg_table_name = 'stores' then
    if tg_op = 'DELETE' then
      v_store_ids := array[old.id];
    else
      v_store_ids := array[new.id];
    end if;
  elsif tg_op = 'DELETE' then
    v_store_ids := array[old.store_id];
  elsif tg_op = 'UPDATE' then
    v_store_ids := array[old.store_id, new.store_id];
  else
    v_store_ids := array[new.store_id];
  end if;

  foreach v_store_id in array v_store_ids loop
    if exists (
      select 1 from public.stores s
      where s.id = v_store_id and s.platform_active and s.archived_at is null
    ) then
      select count(*)::integer into v_owner_count
      from public.store_memberships m
      where m.store_id = v_store_id and m.role = 'owner' and m.active;

      if v_owner_count <> 1 then
        raise exception 'active_store_must_have_one_owner' using errcode = '23514';
      end if;
    end if;
  end loop;

  return null;
end $$;
revoke all on function private.enforce_active_store_owner() from public, anon, authenticated, service_role;
create constraint trigger stores_active_owner_invariant
  after insert or update or delete on public.stores
  deferrable initially deferred
  for each row execute function private.enforce_active_store_owner();
create constraint trigger store_memberships_active_owner_invariant
  after insert or update or delete on public.store_memberships
  deferrable initially deferred
  for each row execute function private.enforce_active_store_owner();

create or replace function private.is_store_member(p_store_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.store_memberships m
    join public.stores s on s.id = m.store_id
    where m.store_id = p_store_id
      and m.user_id = (select auth.uid())
      and m.active
      and s.platform_active
      and s.archived_at is null
  )
$$;
revoke all on function private.is_store_member(uuid) from public, anon;
grant execute on function private.is_store_member(uuid) to authenticated;

create or replace function private.is_store_owner(p_store_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.store_memberships m
    join public.stores s on s.id = m.store_id
    where m.store_id = p_store_id
      and m.user_id = (select auth.uid())
      and m.active
      and m.role = 'owner'
      and s.platform_active
      and s.archived_at is null
  )
$$;
revoke all on function private.is_store_owner(uuid) from public, anon;
grant execute on function private.is_store_owner(uuid) to authenticated;

create or replace function private.assert_member(p_store uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.is_store_member(p_store) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
end $$;
revoke all on function private.assert_member(uuid) from public, anon, authenticated, service_role;

create or replace function private.assert_owner(p_store uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.is_store_owner(p_store) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
end $$;
revoke all on function private.assert_owner(uuid) from public, anon, authenticated, service_role;

create or replace function public.current_access_context()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_is_platform_admin boolean := false;
  v_pending_setup boolean := false;
  v_has_store boolean := false;
  v_store record;
  v_store_json jsonb;
begin
  if v_user_id is null then
    return null;
  end if;

  v_is_platform_admin := private.is_platform_admin(v_user_id);
  select exists(select 1 from private.pending_store_setup p where p.user_id = v_user_id)
    into v_pending_setup;

  select m.store_id, m.role, m.active as membership_active,
    s.name, s.phone, s.email, s.address, s.timezone, s.logo_path,
    s.platform_active, s.archived_at
  into v_store
  from public.store_memberships m
  join public.stores s on s.id = m.store_id
  where m.user_id = v_user_id;
  v_has_store := found;

  if v_has_store then
    v_store_json := jsonb_build_object(
      'id', v_store.store_id,
      'role', v_store.role,
      'membership_active', v_store.membership_active,
      'name', v_store.name,
      'phone', v_store.phone,
      'email', v_store.email,
      'address', v_store.address,
      'timezone', v_store.timezone,
      'logo_path', v_store.logo_path,
      'platform_active', v_store.platform_active,
      'archived', v_store.archived_at is not null,
      'active', v_store.membership_active and v_store.platform_active and v_store.archived_at is null
    );
  end if;

  return jsonb_build_object(
    'is_platform_admin', v_is_platform_admin,
    'pending_store_setup', v_pending_setup,
    'store', v_store_json
  );
end $$;
revoke all on function public.current_access_context() from public, anon;
grant execute on function public.current_access_context() to authenticated;

create or replace function public.create_platform_invitation(
  p_invitation_type text,
  p_email text,
  p_store_id uuid,
  p_token_hash text
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_email text := lower(trim(coalesce(p_email, '')));
  v_invitation_id uuid;
  v_expires_at timestamptz := now() + interval '7 days';
begin
  if v_actor is null then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_invitation_type is null
    or p_invitation_type not in ('store_owner', 'employee')
    or length(v_email) > 254
    or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or p_token_hash is null
    or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_invitation' using errcode = '22023';
  end if;

  if p_invitation_type = 'store_owner' then
    if p_store_id is not null or not private.is_platform_admin(v_actor) then
      raise exception 'not_authorized' using errcode = '42501';
    end if;
  else
    if p_store_id is null or not private.is_store_owner(p_store_id) then
      raise exception 'not_authorized' using errcode = '42501';
    end if;
  end if;

  if p_invitation_type = 'employee' and not exists (
    select 1 from public.stores s where s.id = p_store_id and s.platform_active and s.archived_at is null
  ) then
    raise exception 'store_unavailable' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext('platform_invitation:' || v_email), hashtext('email'));

  if (p_invitation_type = 'store_owner' and not private.is_platform_admin(v_actor))
    or (p_invitation_type = 'employee' and not private.is_store_owner(p_store_id)) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_invitation_type = 'employee' and not exists (
    select 1 from public.stores s where s.id = p_store_id and s.platform_active and s.archived_at is null
  ) then
    raise exception 'store_unavailable' using errcode = '42501';
  end if;

  update private.platform_invitations i
  set revoked_at = now(), reservation_id = null, reservation_expires_at = null
  where i.email_normalized = v_email
    and i.accepted_at is null
    and i.revoked_at is null
    and i.expires_at <= now();

  if exists(select 1 from auth.users u where lower(trim(u.email)) = v_email) then
    raise exception 'invitation_email_unavailable' using errcode = '23505';
  end if;

  if exists (
    select 1 from private.platform_invitations i
    where i.email_normalized = v_email
      and i.accepted_at is null
      and i.revoked_at is null
      and (i.invitation_type <> p_invitation_type or i.store_id is distinct from p_store_id)
  ) then
    raise exception 'invitation_email_pending' using errcode = '23505';
  end if;

  update private.platform_invitations i
  set revoked_at = now(), reservation_id = null, reservation_expires_at = null
  where i.invitation_type = p_invitation_type
    and i.email_normalized = v_email
    and i.accepted_at is null
    and i.revoked_at is null
    and ((p_store_id is null and i.store_id is null) or i.store_id = p_store_id);

  insert into private.platform_invitations (
    invitation_type, email_normalized, store_id, created_by_user_id, token_hash, expires_at
  ) values (
    p_invitation_type, v_email, p_store_id, v_actor, p_token_hash, v_expires_at
  ) returning id into v_invitation_id;

  return jsonb_build_object('invitation_id', v_invitation_id, 'expires_at', v_expires_at);
end $$;
revoke all on function public.create_platform_invitation(text, text, uuid, text) from public, anon;
grant execute on function public.create_platform_invitation(text, text, uuid, text) to authenticated;

create or replace function public.platform_admin_list_stores()
returns table (
  store_id uuid,
  store_name text,
  platform_active boolean,
  platform_active_changed_at timestamptz,
  created_at timestamptz,
  owner_user_id uuid,
  owner_email text
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not private.is_platform_admin(auth.uid()) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  return query
    select s.id, s.name, s.platform_active, s.platform_active_changed_at, s.created_at,
      m.user_id, u.email::text
    from public.stores s
    left join public.store_memberships m on m.store_id = s.id and m.role = 'owner'
    left join auth.users u on u.id = m.user_id
    order by s.created_at desc, s.id;
end $$;
revoke all on function public.platform_admin_list_stores() from public, anon;
grant execute on function public.platform_admin_list_stores() to authenticated;

create or replace function public.platform_admin_set_store_active(p_store_id uuid, p_active boolean)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_updated integer;
begin
  if v_actor is null or not private.is_platform_admin(v_actor) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_active is null then
    raise exception 'invalid_store_status' using errcode = '22023';
  end if;

  update public.stores s
  set platform_active = p_active,
      platform_active_changed_at = now(),
      platform_active_changed_by = v_actor
  where s.id = p_store_id
    and s.platform_active is distinct from p_active;
  get diagnostics v_updated = row_count;
  return v_updated > 0;
end $$;
revoke all on function public.platform_admin_set_store_active(uuid, boolean) from public, anon;
grant execute on function public.platform_admin_set_store_active(uuid, boolean) to authenticated;

create or replace function public.platform_admin_list_invitations()
returns table (
  invitation_id uuid,
  email_normalized text,
  created_at timestamptz,
  expires_at timestamptz,
  accepted_at timestamptz,
  revoked_at timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not private.is_platform_admin(auth.uid()) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  return query
    select i.id, i.email_normalized, i.created_at, i.expires_at, i.accepted_at, i.revoked_at
    from private.platform_invitations i
    where i.invitation_type = 'store_owner'
    order by i.created_at desc
    limit 500;
end $$;
revoke all on function public.platform_admin_list_invitations() from public, anon;
grant execute on function public.platform_admin_list_invitations() to authenticated;

create or replace function public.owner_list_employee_invitations(p_store_id uuid)
returns table (
  invitation_id uuid,
  email_normalized text,
  created_at timestamptz,
  expires_at timestamptz,
  accepted_at timestamptz,
  revoked_at timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform private.assert_owner(p_store_id);
  return query
    select i.id, i.email_normalized, i.created_at, i.expires_at, i.accepted_at, i.revoked_at
    from private.platform_invitations i
    where i.invitation_type = 'employee' and i.store_id = p_store_id
    order by i.created_at desc
    limit 200;
end $$;
revoke all on function public.owner_list_employee_invitations(uuid) from public, anon;
grant execute on function public.owner_list_employee_invitations(uuid) to authenticated;

create or replace function public.owner_list_store_members(p_store_id uuid)
returns table (
  user_id uuid,
  email text,
  role text,
  active boolean,
  joined_at timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform private.assert_owner(p_store_id);
  return query
    select m.user_id, u.email::text, m.role, m.active, m.created_at
    from public.store_memberships m
    join auth.users u on u.id = m.user_id
    where m.store_id = p_store_id
    order by case when m.role = 'owner' then 0 else 1 end, m.created_at, m.user_id;
end $$;
revoke all on function public.owner_list_store_members(uuid) from public, anon;
grant execute on function public.owner_list_store_members(uuid) to authenticated;

create or replace function public.revoke_platform_invitation(p_invitation_id uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_invitation private.platform_invitations%rowtype;
begin
  if v_actor is null then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  select * into v_invitation
  from private.platform_invitations i
  where i.id = p_invitation_id
  for update;
  if not found then
    return false;
  end if;

  if (v_invitation.invitation_type = 'store_owner' and not private.is_platform_admin(v_actor))
    or (v_invitation.invitation_type = 'employee' and not private.is_store_owner(v_invitation.store_id)) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if v_invitation.accepted_at is not null then
    return false;
  end if;

  update private.platform_invitations
  set revoked_at = now(), reservation_id = null, reservation_expires_at = null
  where id = p_invitation_id and revoked_at is null;
  return found;
end $$;
revoke all on function public.revoke_platform_invitation(uuid) from public, anon;
grant execute on function public.revoke_platform_invitation(uuid) to authenticated;

create or replace function public.reserve_platform_invitation(
  p_token_hash text,
  p_email text,
  p_rate_key text
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_invitation private.platform_invitations%rowtype;
  v_rate private.invitation_rate_limits%rowtype;
  v_reservation_id uuid;
begin
  if p_rate_key is null or p_rate_key !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('status', 'invalid');
  end if;

  delete from private.invitation_rate_limits
  where window_start < now() - interval '15 minutes';

  insert into private.invitation_rate_limits(rate_key, window_start, attempts)
  values (p_rate_key, now(), 0)
  on conflict (rate_key) do nothing;
  select * into v_rate
  from private.invitation_rate_limits r
  where r.rate_key = p_rate_key
  for update;

  if v_rate.window_start < now() - interval '15 minutes' then
    update private.invitation_rate_limits
    set window_start = now(), attempts = 1
    where rate_key = p_rate_key;
  elsif v_rate.attempts >= 5 then
    return jsonb_build_object('status', 'invalid');
  else
    update private.invitation_rate_limits set attempts = attempts + 1 where rate_key = p_rate_key;
  end if;

  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('status', 'invalid');
  end if;

  select * into v_invitation
  from private.platform_invitations i
  where i.token_hash = p_token_hash
  for update;
  if not found or v_invitation.email_normalized <> v_email or v_invitation.revoked_at is not null
    or v_invitation.expires_at <= now() then
    return jsonb_build_object('status', 'invalid');
  end if;
  if v_invitation.accepted_at is not null then
    return jsonb_build_object('status', 'accepted', 'user_id', v_invitation.accepted_user_id);
  end if;
  if v_invitation.reservation_id is not null and v_invitation.reservation_expires_at > now() then
    return jsonb_build_object('status', 'busy');
  end if;
  if exists(select 1 from auth.users u where lower(trim(u.email)) = v_email) then
    return jsonb_build_object('status', 'invalid');
  end if;
  if v_invitation.invitation_type = 'employee' and not exists (
    select 1 from public.stores s
    where s.id = v_invitation.store_id and s.platform_active and s.archived_at is null
  ) then
    return jsonb_build_object('status', 'invalid');
  end if;

  v_reservation_id := gen_random_uuid();
  update private.platform_invitations
  set reservation_id = v_reservation_id,
      reservation_expires_at = now() + interval '5 minutes'
  where id = v_invitation.id;

  return jsonb_build_object(
    'status', 'reserved',
    'invitation_id', v_invitation.id,
    'invitation_type', v_invitation.invitation_type,
    'store_id', v_invitation.store_id,
    'reservation_id', v_reservation_id
  );
end $$;
revoke all on function public.reserve_platform_invitation(text, text, text) from public, anon, authenticated;
grant execute on function public.reserve_platform_invitation(text, text, text) to service_role;

create or replace function public.release_platform_invitation_reservation(p_invitation_id uuid, p_reservation_id uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  update private.platform_invitations
  set reservation_id = null, reservation_expires_at = null
  where id = p_invitation_id
    and reservation_id = p_reservation_id
    and accepted_at is null
    and revoked_at is null;
  return found;
end $$;
revoke all on function public.release_platform_invitation_reservation(uuid, uuid) from public, anon, authenticated;
grant execute on function public.release_platform_invitation_reservation(uuid, uuid) to service_role;

create or replace function public.resolve_platform_invitation_acceptance(p_token_hash text, p_email text)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_invitation private.platform_invitations%rowtype;
begin
  select * into v_invitation
  from private.platform_invitations i
  where i.token_hash = p_token_hash
    and i.email_normalized = lower(trim(coalesce(p_email, '')));
  if not found then
    return jsonb_build_object('status', 'invalid');
  end if;
  if v_invitation.accepted_at is not null then
    return jsonb_build_object('status', 'accepted', 'user_id', v_invitation.accepted_user_id);
  end if;
  return jsonb_build_object('status', 'pending');
end $$;
revoke all on function public.resolve_platform_invitation_acceptance(text, text) from public, anon, authenticated;
grant execute on function public.resolve_platform_invitation_acceptance(text, text) to service_role;

create or replace function public.complete_store_setup(
  p_name text,
  p_phone text,
  p_email text,
  p_address jsonb
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_name text := trim(coalesce(p_name, ''));
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_postal_code text := regexp_replace(coalesce(p_address->>'postal_code', ''), '[^0-9]', '', 'g');
  v_street text := trim(coalesce(p_address->>'street', ''));
  v_number text := trim(coalesce(p_address->>'number', ''));
  v_complement text := nullif(trim(coalesce(p_address->>'complement', '')), '');
  v_district text := trim(coalesce(p_address->>'district', ''));
  v_city text := trim(coalesce(p_address->>'city', ''));
  v_state text := upper(trim(coalesce(p_address->>'state', '')));
  v_reference text := nullif(trim(coalesce(p_address->>'reference', '')), '');
  v_store_id uuid;
begin
  if v_user_id is null then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if length(v_name) not between 2 and 120
    or v_postal_code !~ '^[0-9]{8}$'
    or length(v_street) not between 1 and 200
    or length(v_number) not between 1 and 40
    or length(v_district) not between 1 and 120
    or length(v_city) not between 1 and 100
    or v_state !~ '^[A-Z]{2}$'
    or length(coalesce(v_phone, '')) > 40
    or (v_email is not null and (length(v_email) > 254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'))
    or length(coalesce(v_complement, '')) > 120
    or length(coalesce(v_reference, '')) > 200 then
    raise exception 'invalid_store_setup' using errcode = '22023';
  end if;

  perform 1 from private.pending_store_setup p where p.user_id = v_user_id for update;
  if not found or exists(select 1 from public.store_memberships m where m.user_id = v_user_id) then
    raise exception 'store_setup_not_available' using errcode = '42501';
  end if;

  insert into public.stores(name, phone, email, address, timezone)
  values (
    v_name,
    v_phone,
    v_email,
    jsonb_build_object(
      'postal_code', v_postal_code,
      'street', v_street,
      'number', v_number,
      'complement', v_complement,
      'district', v_district,
      'city', v_city,
      'state', v_state,
      'reference', v_reference
    ),
    'America/Sao_Paulo'
  ) returning id into v_store_id;

  insert into public.store_memberships(store_id, user_id, role, active)
  values (v_store_id, v_user_id, 'owner', true);

  insert into public.expense_categories(store_id, name)
  values (v_store_id, 'Despesas da loja'), (v_store_id, 'Compra de mercadoria'), (v_store_id, 'Despesas fixas');

  delete from private.pending_store_setup where user_id = v_user_id;
  return v_store_id;
end $$;
revoke all on function public.complete_store_setup(text, text, text, jsonb) from public, anon;
grant execute on function public.complete_store_setup(text, text, text, jsonb) to authenticated;

create or replace function private.authorize_auth_user_creation()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_email text := lower(trim(coalesce(new.email, '')));
  v_bootstrap private.platform_admin_bootstrap_emails%rowtype;
  v_bootstrap_token text;
  v_invitation_id uuid;
  v_reservation_id uuid;
  v_invitation private.platform_invitations%rowtype;
begin
  if v_email = '' or length(v_email) > 254 then
    raise exception 'registration_not_authorized' using errcode = '42501';
  end if;

  -- Serialize invitation issuance and Auth user creation for this email. This
  -- closes the gap between reserving an invite and the Auth insert transaction.
  perform pg_advisory_xact_lock(hashtext('platform_invitation:' || v_email), hashtext('email'));

  select * into v_bootstrap
  from private.platform_admin_bootstrap_emails b
  where b.email = v_email
  for update;

  if found and v_bootstrap.expires_at <= now() then
    delete from private.platform_admin_bootstrap_emails where email = v_email;
    v_bootstrap.email := null;
  end if;

  if v_bootstrap.email is not null then
    v_bootstrap_token := new.raw_user_meta_data->>'platform_admin_bootstrap_token';
    if v_bootstrap_token is null
      or v_bootstrap_token !~ '^[0-9a-f]{64}$'
      or encode(extensions.digest(convert_to(v_bootstrap_token, 'UTF8'), 'sha256'), 'hex') <> v_bootstrap.token_hash then
      raise exception 'registration_not_authorized' using errcode = '42501';
    end if;
    delete from private.platform_admin_bootstrap_emails where email = v_email;
    update private.platform_invitations
    set revoked_at = now(), reservation_id = null, reservation_expires_at = null
    where email_normalized = v_email and accepted_at is null and revoked_at is null;
    insert into private.pending_auth_provisioning(auth_user_id, provisioning_type)
    values (new.id, 'platform_admin');
    new.raw_user_meta_data := coalesce(new.raw_user_meta_data, '{}'::jsonb)
      - 'platform_admin_bootstrap_token'
      - 'platform_invitation_id'
      - 'platform_reservation_id'
      - 'registration_ticket';
    return new;
  end if;

  if coalesce(new.raw_user_meta_data->>'platform_invitation_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or coalesce(new.raw_user_meta_data->>'platform_reservation_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'registration_not_authorized' using errcode = '42501';
  end if;
  v_invitation_id := (new.raw_user_meta_data->>'platform_invitation_id')::uuid;
  v_reservation_id := (new.raw_user_meta_data->>'platform_reservation_id')::uuid;

  select * into v_invitation
  from private.platform_invitations i
  where i.id = v_invitation_id
  for update;
  if not found
    or v_invitation.email_normalized <> v_email
    or v_invitation.reservation_id is distinct from v_reservation_id
    or v_invitation.reservation_expires_at is null
    or v_invitation.reservation_expires_at <= now()
    or v_invitation.expires_at <= now()
    or v_invitation.accepted_at is not null
    or v_invitation.revoked_at is not null then
    raise exception 'registration_not_authorized' using errcode = '42501';
  end if;
  if v_invitation.invitation_type = 'employee' then
    perform 1 from public.stores s
    where s.id = v_invitation.store_id and s.platform_active and s.archived_at is null
    for update;
    if not found then
      raise exception 'registration_not_authorized' using errcode = '42501';
    end if;
  end if;

  insert into private.pending_auth_provisioning(
    auth_user_id, provisioning_type, invitation_id, reservation_id, store_id
  ) values (
    new.id,
    case when v_invitation.invitation_type = 'store_owner' then 'store_owner' else 'employee' end,
    v_invitation.id,
    v_reservation_id,
    v_invitation.store_id
  );
  new.raw_user_meta_data := coalesce(new.raw_user_meta_data, '{}'::jsonb)
    - 'platform_invitation_id'
    - 'platform_reservation_id'
    - 'platform_admin_bootstrap_token'
    - 'registration_ticket';
  return new;
end $$;
revoke all on function private.authorize_auth_user_creation() from public, anon, authenticated, service_role;

create or replace function private.apply_auth_user_provisioning()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_provision private.pending_auth_provisioning%rowtype;
  v_invitation private.platform_invitations%rowtype;
begin
  select * into v_provision
  from private.pending_auth_provisioning p
  where p.auth_user_id = new.id
  for update;
  if not found then
    raise exception 'registration_not_authorized' using errcode = '42501';
  end if;

  if v_provision.provisioning_type = 'platform_admin' then
    insert into private.platform_admins(user_id) values (new.id);
  else
    select * into v_invitation
    from private.platform_invitations i
    where i.id = v_provision.invitation_id
      and i.reservation_id = v_provision.reservation_id
      and i.email_normalized = lower(trim(new.email))
      and i.expires_at > now()
      and i.reservation_expires_at > now()
      and i.accepted_at is null
      and i.revoked_at is null
    for update;
    if not found then
      raise exception 'registration_not_authorized' using errcode = '42501';
    end if;

    if v_provision.provisioning_type = 'store_owner' then
      insert into private.pending_store_setup(user_id, invitation_id)
      values (new.id, v_invitation.id);
    elsif v_provision.provisioning_type = 'employee' then
      if not exists (
        select 1 from public.stores s
        where s.id = v_provision.store_id and s.platform_active and s.archived_at is null
      ) then
        raise exception 'registration_not_authorized' using errcode = '42501';
      end if;
      insert into public.store_memberships(store_id, user_id, role, active)
      values (v_provision.store_id, new.id, 'employee', true);
    else
      raise exception 'registration_not_authorized' using errcode = '42501';
    end if;

    update private.platform_invitations
    set accepted_user_id = new.id,
        accepted_at = now(),
        reservation_id = null,
        reservation_expires_at = null
    where id = v_invitation.id
      and reservation_id = v_provision.reservation_id
      and accepted_at is null
      and revoked_at is null;
    if not found then
      raise exception 'registration_not_authorized' using errcode = '42501';
    end if;
  end if;

  delete from private.pending_auth_provisioning where auth_user_id = new.id;
  return new;
end $$;
revoke all on function private.apply_auth_user_provisioning() from public, anon, authenticated, service_role;

drop trigger if exists petshop_require_registration_ticket on auth.users;
drop trigger if exists petshop_provision_store on auth.users;
drop trigger if exists petshop_authorize_auth_user_creation on auth.users;
drop trigger if exists petshop_apply_auth_user_provisioning on auth.users;
create trigger petshop_authorize_auth_user_creation
  before insert on auth.users
  for each row execute function private.authorize_auth_user_creation();
create trigger petshop_apply_auth_user_provisioning
  after insert on auth.users
  for each row execute function private.apply_auth_user_provisioning();

drop function if exists private.require_registration_ticket();
drop function if exists private.provision_store();
drop function if exists private.set_signup_password(text);
drop function if exists public.issue_registration_ticket(text, text, text, text);
drop table if exists private.registration_tickets;
drop table if exists private.signup_authorization;
drop table if exists private.signup_rate_limits;

drop policy if exists petshop_assets_read on storage.objects;
drop policy if exists petshop_assets_insert on storage.objects;
drop policy if exists petshop_assets_delete on storage.objects;
create policy petshop_assets_read on storage.objects for select to authenticated
  using (
    bucket_id = 'store-assets'
    and exists (
      select 1 from public.store_memberships m
      join public.stores s on s.id = m.store_id
      where m.user_id = (select auth.uid()) and m.active
        and s.platform_active and s.archived_at is null
        and m.store_id::text = (storage.foldername(name))[1]
    )
  );
create policy petshop_assets_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'store-assets' and (storage.foldername(name))[2] = 'logos'
    and exists (
      select 1 from public.store_memberships m
      join public.stores s on s.id = m.store_id
      where m.user_id = (select auth.uid()) and m.active
        and s.platform_active and s.archived_at is null
        and m.store_id::text = (storage.foldername(name))[1]
    )
  );
create policy petshop_assets_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'store-assets'
    and exists (
      select 1 from public.store_memberships m
      join public.stores s on s.id = m.store_id
      where m.user_id = (select auth.uid()) and m.active
        and s.platform_active and s.archived_at is null
        and m.store_id::text = (storage.foldername(name))[1]
    )
  );

commit;
