begin;

-- Mutations keep a server-computed fingerprint beside the request UUID.
alter table public.sales add column if not exists payload_fingerprint text;
alter table public.goods_receipts add column if not exists payload_fingerprint text;
alter table public.inventory_movements add column if not exists payload_fingerprint text;
alter table public.cash_movements add column if not exists payload_fingerprint text;
alter table public.payables add column if not exists payload_fingerprint text;
alter table public.payable_payments add column if not exists payload_fingerprint text;
alter table public.payments add column if not exists payload_fingerprint text;
alter table public.sale_returns add column if not exists payload_fingerprint text;
alter table public.sale_returns add column if not exists credit_applied_cents bigint not null default 0 check (credit_applied_cents >= 0);
alter table public.sale_returns add column if not exists delivery_fee_refunded_cents bigint not null default 0 check (delivery_fee_refunded_cents >= 0);
alter table public.cash_sessions add column if not exists close_idempotency_key uuid;
alter table public.cash_sessions add column if not exists close_fingerprint text;
alter table public.inventory_counts add column if not exists apply_idempotency_key uuid;
alter table public.inventory_counts add column if not exists apply_fingerprint text;
create unique index if not exists inventory_count_apply_key
  on public.inventory_counts(store_id, apply_idempotency_key) where apply_idempotency_key is not null;

-- Inventory counts preserve lot-level snapshots while comparing one product balance version.
alter table public.inventory_count_items drop constraint if exists inventory_count_items_store_id_count_id_product_id_key;
alter table public.inventory_count_items add column if not exists lot_id uuid;
alter table public.inventory_count_items
  add constraint inventory_count_items_lot_fk
  foreign key (store_id, product_id, lot_id)
  references public.inventory_lots(store_id, product_id, id);
create unique index if not exists inventory_count_items_scope_key
  on public.inventory_count_items(store_id, count_id, product_id, coalesce(lot_id, '00000000-0000-0000-0000-000000000000'::uuid));

alter table public.sale_items add column if not exists appointment_id uuid;
alter table public.sale_items
  add constraint sale_items_appointment_fk
  foreign key (store_id, appointment_id) references public.appointments(store_id, id);
create unique index if not exists sale_items_appointment_unique
  on public.sale_items(store_id, appointment_id) where appointment_id is not null;

-- One registry enforces barcode uniqueness across products and their package variants.
create table private.product_barcodes (
  store_id uuid not null references public.stores(id) on delete cascade,
  barcode text not null check (length(trim(barcode)) between 1 and 128),
  product_id uuid,
  packaging_id uuid,
  primary key (store_id, barcode),
  check ((product_id is not null)::int + (packaging_id is not null)::int = 1),
  foreign key (store_id, product_id) references public.products(store_id, id) on delete cascade,
  foreign key (store_id, packaging_id) references public.product_packagings(store_id, id) on delete cascade
);
alter table private.product_barcodes enable row level security;
revoke all on private.product_barcodes from public, anon, authenticated, service_role;
insert into private.product_barcodes(store_id, barcode, product_id)
select store_id, barcode, id from public.products where barcode is not null and barcode <> '';
insert into private.product_barcodes(store_id, barcode, packaging_id)
select store_id, barcode, id from public.product_packagings where barcode is not null and barcode <> '';

create or replace function private.sync_product_barcode() returns trigger
language plpgsql security definer set search_path = '' as $$
declare changed integer;
begin
  if tg_op = 'DELETE' then
    delete from private.product_barcodes where store_id = old.store_id and product_id = old.id;
    return old;
  end if;
  if tg_op = 'UPDATE' and old.barcode is not distinct from new.barcode then return new; end if;
  if tg_op = 'UPDATE' then
    delete from private.product_barcodes where store_id = old.store_id and product_id = old.id;
  end if;
  if new.barcode is not null and new.barcode <> '' then
    insert into private.product_barcodes(store_id, barcode, product_id)
    values (new.store_id, new.barcode, new.id) on conflict do nothing;
    get diagnostics changed = row_count;
    if changed = 0 then raise exception 'barcode_already_exists' using errcode = '23505'; end if;
  end if;
  return new;
end $$;

create or replace function private.sync_packaging_barcode() returns trigger
language plpgsql security definer set search_path = '' as $$
declare changed integer;
begin
  if tg_op = 'DELETE' then
    delete from private.product_barcodes where store_id = old.store_id and packaging_id = old.id;
    return old;
  end if;
  if tg_op = 'UPDATE' and old.barcode is not distinct from new.barcode then return new; end if;
  if tg_op = 'UPDATE' then
    delete from private.product_barcodes where store_id = old.store_id and packaging_id = old.id;
  end if;
  if new.barcode is not null and new.barcode <> '' then
    insert into private.product_barcodes(store_id, barcode, packaging_id)
    values (new.store_id, new.barcode, new.id) on conflict do nothing;
    get diagnostics changed = row_count;
    if changed = 0 then raise exception 'barcode_already_exists' using errcode = '23505'; end if;
  end if;
  return new;
end $$;
revoke all on function private.sync_product_barcode(), private.sync_packaging_barcode() from public, anon, authenticated, service_role;
create trigger products_barcode_registry after insert or update of barcode or delete on public.products for each row execute function private.sync_product_barcode();
create trigger packaging_barcode_registry after insert or update of barcode or delete on public.product_packagings for each row execute function private.sync_packaging_barcode();

-- Refunded value and per-line allocations are append-only business events.
create table public.sale_refunds (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id),
  sale_id uuid not null,
  return_id uuid not null,
  amount_cents bigint not null check (amount_cents > 0),
  method text not null check (method in ('cash', 'pix', 'debit_card', 'credit_card', 'store_credit')),
  reason text not null check (length(trim(reason)) between 1 and 500),
  idempotency_key uuid not null,
  payload_fingerprint text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, id),
  unique (store_id, idempotency_key),
  foreign key (store_id, sale_id) references public.sales(store_id, id),
  foreign key (store_id, return_id) references public.sale_returns(store_id, id)
);
create table public.sale_refund_allocations (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id),
  return_id uuid not null,
  sale_item_id uuid not null,
  amount_cents bigint not null check (amount_cents >= 0),
  credit_applied_cents bigint not null default 0 check (credit_applied_cents >= 0 and credit_applied_cents <= amount_cents),
  quantity numeric(15,3) not null check (quantity > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, id),
  foreign key (store_id, return_id) references public.sale_returns(store_id, id),
  foreign key (store_id, sale_item_id) references public.sale_items(store_id, id)
);

do $body$
declare t text;
begin
  foreach t in array array['sale_refunds', 'sale_refund_allocations'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant select on table public.%I to authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
    execute format('create policy tenant_read on public.%I for select to authenticated using (private.is_store_member(store_id))', t);
    execute format('create index %I on public.%I(store_id)', t || '_tenant_idx', t);
    execute format('create trigger touch_updated_at before update on public.%I for each row execute function private.touch_updated_at()', t);
  end loop;
end $body$;
do $body$
begin
  if exists(select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.sale_refunds;
    alter publication supabase_realtime add table public.sale_refund_allocations;
  end if;
end $body$;
create index sale_refunds_sale_idx on public.sale_refunds(store_id, sale_id, created_at desc);

-- Appointment occupancy is exclusive per store. Starts are accepted only on half-hour boundaries.
create extension if not exists btree_gist with schema extensions;
set local search_path = public, extensions;
alter table public.appointments add constraint appointments_no_overlap
  exclude using gist (
    store_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status in ('scheduled', 'arrived', 'in_progress', 'ready'));

create or replace function public.save_appointment(
  p_store uuid,
  p_customer uuid,
  p_pet uuid,
  p_service uuid,
  p_start timestamptz,
  p_notes text default ''
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare result uuid; service_row public.services%rowtype; store_timezone text; expected_end timestamptz; local_start timestamp;
begin
  perform private.assert_member(p_store);
  select timezone into strict store_timezone from public.stores where id = p_store and archived_at is null;
  select * into strict service_row from public.services where store_id = p_store and id = p_service and archived_at is null;
  perform 1 from public.customers where store_id = p_store and id = p_customer and archived_at is null;
  if not found then raise exception 'customer_not_found'; end if;
  perform 1 from public.pets where store_id = p_store and customer_id = p_customer and id = p_pet and archived_at is null;
  if not found then raise exception 'pet_not_found'; end if;
  local_start = p_start at time zone store_timezone;
  if p_start <= now() or extract(second from local_start) <> 0 or extract(minute from local_start)::int % 30 <> 0 then
    raise exception 'invalid_appointment_slot';
  end if;
  expected_end = p_start + make_interval(mins => service_row.duration_minutes);
  insert into public.appointments(store_id, customer_id, pet_id, service_id, starts_at, ends_at, price_cents, notes)
  values (p_store, p_customer, p_pet, p_service, p_start, expected_end, service_row.price_cents, left(coalesce(p_notes, ''), 2000))
  returning id into result;
  insert into public.audit_logs(store_id, actor_user_id, action, entity_table, entity_id)
  values (p_store, auth.uid(), 'create_appointment', 'appointments', result);
  return result;
end $$;

create or replace function public.reschedule_appointment(
  p_store uuid, p_appointment uuid, p_service uuid, p_start timestamptz, p_expected_version bigint, p_reason text
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare appointment_row public.appointments%rowtype; service_row public.services%rowtype; store_timezone text; local_start timestamp; expected_end timestamptz;
begin
  perform private.assert_member(p_store);
  select * into strict appointment_row from public.appointments where store_id = p_store and id = p_appointment for update;
  if appointment_row.version <> p_expected_version then raise exception 'version_conflict' using errcode = '40001'; end if;
  if appointment_row.status not in ('scheduled', 'arrived') then raise exception 'appointment_not_reschedulable'; end if;
  if length(trim(coalesce(p_reason, ''))) not between 1 and 500 then raise exception 'reason_required'; end if;
  select timezone into strict store_timezone from public.stores where id = p_store;
  select * into strict service_row from public.services where store_id = p_store and id = p_service and archived_at is null;
  local_start = p_start at time zone store_timezone;
  if p_start <= now() or extract(second from local_start) <> 0 or extract(minute from local_start)::int % 30 <> 0 then raise exception 'invalid_appointment_slot'; end if;
  expected_end = p_start + make_interval(mins => service_row.duration_minutes);
  update public.appointments set service_id = p_service, starts_at = p_start, ends_at = expected_end,
    price_cents = service_row.price_cents, version = version + 1 where store_id = p_store and id = p_appointment;
  insert into public.audit_logs(store_id, actor_user_id, action, entity_table, entity_id, details)
  values (p_store, auth.uid(), 'reschedule_appointment', 'appointments', p_appointment, jsonb_build_object('reason', left(trim(p_reason), 500)));
  return appointment_row.version + 1;
end $$;

create or replace function public.set_appointment_status(
  p_store uuid, p_appointment uuid, p_status text, p_expected_version bigint, p_reason text default null
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare appointment_row public.appointments%rowtype; allowed boolean := false;
begin
  perform private.assert_member(p_store);
  select * into strict appointment_row from public.appointments where store_id = p_store and id = p_appointment for update;
  if appointment_row.version <> p_expected_version then raise exception 'version_conflict' using errcode = '40001'; end if;
  allowed = case appointment_row.status
    when 'scheduled' then p_status in ('arrived', 'cancelled', 'no_show')
    when 'arrived' then p_status in ('in_progress', 'cancelled', 'no_show')
    when 'in_progress' then p_status in ('ready', 'cancelled')
    when 'ready' then p_status = 'delivered'
    else false
  end;
  if not allowed then raise exception 'invalid_appointment_transition'; end if;
  if p_status in ('cancelled', 'no_show') and length(trim(coalesce(p_reason, ''))) not between 1 and 500 then raise exception 'reason_required'; end if;
  update public.appointments set status = p_status, version = version + 1 where store_id = p_store and id = p_appointment;
  insert into public.audit_logs(store_id, actor_user_id, action, entity_table, entity_id, details)
  values (p_store, auth.uid(), 'set_appointment_status', 'appointments', p_appointment,
    jsonb_build_object('from', appointment_row.status, 'to', p_status, 'reason', left(coalesce(p_reason, ''), 500)));
  return appointment_row.version + 1;
end $$;

-- A service line can be linked to exactly one appointment and is recorded in the sale transaction.
create or replace function public.link_appointment_to_sale(
  p_store uuid, p_appointment uuid, p_sale uuid, p_sale_item uuid, p_expected_version bigint
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare appointment_row public.appointments%rowtype; sale_row public.sales%rowtype; item_row public.sale_items%rowtype;
begin
  perform private.assert_member(p_store);
  select * into strict sale_row from public.sales where store_id = p_store and id = p_sale for update;
  select * into strict appointment_row from public.appointments where store_id = p_store and id = p_appointment for update;
  select * into strict item_row from public.sale_items where store_id = p_store and sale_id = p_sale and id = p_sale_item for update;
  if appointment_row.version <> p_expected_version then raise exception 'version_conflict' using errcode = '40001'; end if;
  if sale_row.status not in ('completed', 'partially_refunded') or item_row.service_id <> appointment_row.service_id then raise exception 'appointment_sale_mismatch'; end if;
  if appointment_row.sale_id is not null or item_row.appointment_id is not null then raise exception 'appointment_already_billed'; end if;
  if appointment_row.status not in ('ready', 'delivered') then raise exception 'appointment_not_ready'; end if;
  update public.sale_items set appointment_id = p_appointment where store_id = p_store and id = p_sale_item;
  update public.appointments set sale_id = p_sale, status = 'delivered', version = version + 1 where store_id = p_store and id = p_appointment;
  insert into public.audit_logs(store_id, actor_user_id, action, entity_table, entity_id)
  values (p_store, auth.uid(), 'link_appointment_to_sale', 'appointments', p_appointment);
  return appointment_row.version + 1;
end $$;

-- Preserve a confirmed close when the caller retries with the same key and exact payload.
create or replace function public.close_cash(
  p_store uuid, p_session uuid, p_counted bigint, p_notes text, p_counts jsonb, p_key uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare session_row public.cash_sessions%rowtype; expected bigint; counted bigint; denomination jsonb; fingerprint text; result jsonb;
begin
  perform private.assert_member(p_store);
  if p_key is null or p_counted < 0 or jsonb_typeof(coalesce(p_counts, '[]'::jsonb)) <> 'array' then raise exception 'invalid_close'; end if;
  fingerprint = encode(extensions.digest(convert_to(jsonb_build_object('store', p_store, 'session', p_session, 'counted', p_counted, 'notes', coalesce(p_notes, ''), 'counts', coalesce(p_counts, '[]'::jsonb))::text, 'UTF8'), 'sha256'), 'hex');
  select * into strict session_row from public.cash_sessions where store_id = p_store and id = p_session for update;
  if session_row.status = 'closed' then
    if session_row.close_idempotency_key = p_key and session_row.close_fingerprint = fingerprint then
      return jsonb_build_object('expected_cents', session_row.expected_cents, 'counted_cents', session_row.counted_cents, 'difference_cents', session_row.difference_cents);
    end if;
    raise exception 'cash_session_closed';
  end if;
  select session_row.opening_cents + coalesce(sum(amount_cents), 0) into expected
  from public.cash_movements where store_id = p_store and cash_session_id = p_session;
  if jsonb_array_length(coalesce(p_counts, '[]'::jsonb)) > 0 then
    select coalesce(sum((value->>'denomination_cents')::bigint * (value->>'quantity')::bigint), 0) into counted
    from jsonb_array_elements(p_counts);
    if counted <> p_counted then raise exception 'count_mismatch'; end if;
  end if;
  if p_counted <> expected and coalesce(length(trim(p_notes)), 0) = 0 then raise exception 'cash_close_note_required'; end if;
  for denomination in select value from jsonb_array_elements(coalesce(p_counts, '[]'::jsonb)) loop
    insert into public.cash_counts(store_id, cash_session_id, phase, denomination_cents, quantity)
    values (p_store, p_session, 'closing', (denomination->>'denomination_cents')::int, (denomination->>'quantity')::int);
  end loop;
  update public.cash_sessions set status = 'closed', closed_by = auth.uid(), closed_at = now(), counted_cents = p_counted,
    expected_cents = expected, difference_cents = p_counted - expected, notes = left(coalesce(p_notes, ''), 2000),
    close_idempotency_key = p_key, close_fingerprint = fingerprint
  where store_id = p_store and id = p_session;
  result = jsonb_build_object('expected_cents', expected, 'counted_cents', p_counted, 'difference_cents', p_counted - expected);
  insert into public.audit_logs(store_id, actor_user_id, action, entity_table, entity_id, details)
  values (p_store, auth.uid(), 'close_cash', 'cash_sessions', p_session, result);
  return result;
end $$;

-- The old close overload has no retry key and is removed from the user API.
revoke all on function public.close_cash(uuid, uuid, bigint, text, jsonb) from public, anon, authenticated;
grant execute on function public.close_cash(uuid, uuid, bigint, text, jsonb, uuid) to authenticated;
revoke all on function public.save_appointment(uuid, uuid, uuid, uuid, timestamptz, timestamptz, bigint, text) from public, anon, authenticated;
revoke all on function public.set_appointment_status(uuid, uuid, text, bigint) from public, anon, authenticated;
revoke all on function public.save_appointment(uuid, uuid, uuid, uuid, timestamptz, text),
  public.reschedule_appointment(uuid, uuid, uuid, timestamptz, bigint, text),
  public.set_appointment_status(uuid, uuid, text, bigint, text),
  public.link_appointment_to_sale(uuid, uuid, uuid, uuid, bigint)
from public, anon;
grant execute on function public.save_appointment(uuid, uuid, uuid, uuid, timestamptz, text),
  public.reschedule_appointment(uuid, uuid, uuid, timestamptz, bigint, text),
  public.set_appointment_status(uuid, uuid, text, bigint, text),
  public.link_appointment_to_sale(uuid, uuid, uuid, uuid, bigint)
to authenticated;

-- Dashboard aggregates in the database. The caller can only read its active tenant.
create or replace function private.sale_net_total_cents(p_store uuid, p_sale uuid) returns bigint
language sql stable set search_path = '' as $$
  select greatest(s.total_cents - coalesce((
    select sum(r.refund_cents)::bigint from public.sale_returns r
    where r.store_id = s.store_id and r.sale_id = s.id
  ), 0), 0)
  from public.sales s where s.store_id = p_store and s.id = p_sale
$$;
revoke all on function private.sale_net_total_cents(uuid, uuid) from public, anon, authenticated, service_role;

create or replace function public.dashboard_overview(p_store uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare store_timezone text; local_today date; today_start timestamptz; tomorrow_start timestamptz;
  today_sales bigint; today_count bigint; receivable_total bigint; low_count bigint; appointments_count bigint;
  week_total bigint; previous_total bigint; cash_is_open boolean; chart_data jsonb; attention_data jsonb := '[]'::jsonb;
  recent_data jsonb; delivery_count bigint; payable_count bigint; appointment_data jsonb; appointment_customer text;
  appointment_pet text; appointment_service text; appointment_start timestamptz;
begin
  perform private.assert_member(p_store);
  select timezone into strict store_timezone from public.stores where id = p_store and archived_at is null;
  local_today = (now() at time zone store_timezone)::date;
  today_start = (local_today::timestamp at time zone store_timezone);
  tomorrow_start = ((local_today + 1)::timestamp at time zone store_timezone);

  select coalesce(sum(private.sale_net_total_cents(p_store, s.id)), 0), count(*) into today_sales, today_count
  from public.sales s where s.store_id = p_store and s.status in ('completed', 'partially_refunded', 'refunded')
    and s.completed_at >= today_start and s.completed_at < tomorrow_start;
  select coalesce(sum(remaining_cents), 0) into receivable_total from public.receivables
    where store_id = p_store and status = 'open';
  select count(*) into low_count from public.products p
    left join public.inventory_balances b on b.store_id = p.store_id and b.product_id = p.id
    where p.store_id = p_store and p.archived_at is null and p.minimum_stock > 0
      and coalesce(b.quantity, 0) <= p.minimum_stock;
  select count(*) into appointments_count from public.appointments
    where store_id = p_store and starts_at >= today_start and starts_at < tomorrow_start
      and status in ('scheduled', 'arrived', 'in_progress', 'ready');
  select exists(select 1 from public.cash_sessions where store_id = p_store and status = 'open') into cash_is_open;
  select coalesce(sum(private.sale_net_total_cents(p_store, s.id)), 0) into week_total from public.sales s
    where s.store_id = p_store and s.status in ('completed', 'partially_refunded', 'refunded')
      and s.completed_at >= ((local_today - 6)::timestamp at time zone store_timezone) and s.completed_at < tomorrow_start;
  select coalesce(sum(private.sale_net_total_cents(p_store, s.id)), 0) into previous_total from public.sales s
    where s.store_id = p_store and s.status in ('completed', 'partially_refunded', 'refunded')
      and s.completed_at >= ((local_today - 13)::timestamp at time zone store_timezone)
      and s.completed_at < ((local_today - 6)::timestamp at time zone store_timezone);

  select coalesce(jsonb_agg(jsonb_build_object(
    'date', days.day::date::text,
    'current_cents', coalesce(current_day.total_cents, 0),
    'previous_cents', coalesce(previous_day.total_cents, 0)
  ) order by days.day), '[]'::jsonb) into chart_data
  from generate_series(local_today - 6, local_today, interval '1 day') as days(day)
  left join lateral (
    select sum(private.sale_net_total_cents(p_store, s.id))::bigint as total_cents from public.sales s
    where s.store_id = p_store and s.status in ('completed', 'partially_refunded', 'refunded')
      and s.completed_at >= (days.day::timestamp at time zone store_timezone)
      and s.completed_at < ((days.day + 1)::timestamp at time zone store_timezone)
  ) current_day on true
  left join lateral (
    select sum(private.sale_net_total_cents(p_store, s.id))::bigint as total_cents from public.sales s
    where s.store_id = p_store and s.status in ('completed', 'partially_refunded', 'refunded')
      and s.completed_at >= ((days.day - 7)::timestamp at time zone store_timezone)
      and s.completed_at < ((days.day - 6)::timestamp at time zone store_timezone)
  ) previous_day on true;

  if low_count > 0 then attention_data = attention_data || jsonb_build_array(jsonb_build_object(
    'kind', 'stock', 'title', low_count || case when low_count = 1 then ' produto com estoque baixo' else ' produtos com estoque baixo' end,
    'description', 'Confira os itens e planeje a reposição.', 'href', '/estoque'));
  end if;
  select count(*) into delivery_count from public.deliveries where store_id = p_store
    and status in ('preparing', 'ready', 'out_for_delivery');
  if delivery_count > 0 then attention_data = attention_data || jsonb_build_array(jsonb_build_object(
    'kind', 'delivery', 'title', delivery_count || case when delivery_count = 1 then ' entrega em andamento' else ' entregas em andamento' end,
    'description', 'Acompanhe a preparação e a saída.', 'href', '/entregas'));
  end if;
  select a.starts_at, c.name, p.name, s.name into appointment_start, appointment_customer, appointment_pet, appointment_service
  from public.appointments a
  join public.customers c on c.store_id = a.store_id and c.id = a.customer_id
  join public.pets p on p.store_id = a.store_id and p.id = a.pet_id
  join public.services s on s.store_id = a.store_id and s.id = a.service_id
  where a.store_id = p_store and a.starts_at >= now() and a.starts_at < tomorrow_start
    and a.status in ('scheduled', 'arrived', 'in_progress', 'ready')
  order by a.starts_at limit 1;
  if appointment_start is not null then attention_data = attention_data || jsonb_build_array(jsonb_build_object(
    'kind', 'appointment', 'title', appointment_pet || ' tem atendimento hoje',
    'description', appointment_service || ' · ' || appointment_customer, 'href', '/agenda'));
  end if;
  select count(*) into payable_count from public.payables where store_id = p_store and status = 'open'
    and due_on between local_today and local_today + 7;
  if payable_count > 0 then attention_data = attention_data || jsonb_build_array(jsonb_build_object(
    'kind', 'payable', 'title', payable_count || case when payable_count = 1 then ' conta próxima do vencimento' else ' contas próximas do vencimento' end,
    'description', 'Organize os próximos pagamentos.', 'href', '/financeiro'));
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', recent.id, 'number', recent.number, 'customer', recent.customer, 'items', recent.items,
    'payment', recent.payment, 'status', recent.status, 'total_cents', recent.total_cents,
    'completed_at', recent.completed_at
  ) order by recent.completed_at desc), '[]'::jsonb) into recent_data
  from (
    select s.id, s.number, coalesce(c.name, 'Cliente avulso') as customer,
      coalesce((select string_agg(si.description || ' · ' || trim(to_char(si.quantity, 'FM999999990D999')), ', ' order by si.created_at)
        from public.sale_items si where si.store_id = s.store_id and si.sale_id = s.id), 'Venda sem itens') as items,
      coalesce((select pm.method from public.payments pm where pm.store_id = s.store_id and pm.sale_id = s.id order by pm.received_at desc limit 1),
        case when exists(select 1 from public.receivables r where r.store_id = s.store_id and r.sale_id = s.id) then 'credit' else 'pix' end) as payment,
      case when exists(select 1 from public.receivables r where r.store_id = s.store_id and r.sale_id = s.id and r.remaining_cents > 0) then 'receivable' else s.status end as status,
      s.total_cents, s.completed_at
    from public.sales s left join public.customers c on c.store_id = s.store_id and c.id = s.customer_id
    where s.store_id = p_store and s.status <> 'draft' and s.completed_at is not null
    order by s.completed_at desc limit 6
  ) recent;

  return jsonb_build_object(
    'today_sales_cents', today_sales, 'today_sales_count', today_count, 'receivables_cents', receivable_total,
    'low_stock_count', low_count, 'appointments_today_count', appointments_count, 'cash_open', cash_is_open,
    'week_total_cents', week_total, 'previous_week_total_cents', previous_total,
    'chart', chart_data, 'attention', attention_data, 'recent_sales', recent_data
  );
end $$;

-- Create a lot-aware count snapshot and apply its deltas only if no stock movement changed a balance.
create or replace function public.start_inventory_count(p_store uuid, p_notes text default '') returns uuid
language plpgsql security definer set search_path = '' as $$
declare result uuid;
begin
  perform private.assert_member(p_store);
  insert into public.inventory_counts(store_id, notes) values (p_store, left(coalesce(p_notes, ''), 1000)) returning id into result;
  insert into public.inventory_count_items(store_id, count_id, product_id, lot_id, expected_quantity, counted_quantity, balance_version)
  select p.store_id, result, p.id, null, coalesce(b.quantity, 0), coalesce(b.quantity, 0), coalesce(b.version, 0)
  from public.products p left join public.inventory_balances b on b.store_id = p.store_id and b.product_id = p.id
  where p.store_id = p_store and p.archived_at is null and not p.track_lots;
  insert into public.inventory_count_items(store_id, count_id, product_id, lot_id, expected_quantity, counted_quantity, balance_version)
  select p.store_id, result, p.id, l.id, l.quantity, l.quantity, coalesce(b.version, 0)
  from public.products p join public.inventory_lots l on l.store_id = p.store_id and l.product_id = p.id
  left join public.inventory_balances b on b.store_id = p.store_id and b.product_id = p.id
  where p.store_id = p_store and p.archived_at is null and p.track_lots;
  insert into public.inventory_count_items(store_id, count_id, product_id, lot_id, expected_quantity, counted_quantity, balance_version)
  select p.store_id, result, p.id, null, 0, 0, coalesce(b.version, 0)
  from public.products p left join public.inventory_balances b on b.store_id = p.store_id and b.product_id = p.id
  where p.store_id = p_store and p.archived_at is null and p.track_lots
    and not exists(select 1 from public.inventory_lots l where l.store_id = p.store_id and l.product_id = p.id);
  return result;
end $$;

create or replace function public.save_inventory_count(p_store uuid, p_count uuid, p_lines jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare line jsonb; item_id uuid; counted numeric; precision_digits integer;
begin
  perform private.assert_member(p_store);
  perform 1 from public.inventory_counts where store_id = p_store and id = p_count and status = 'draft' for update;
  if not found or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) > 5000 then raise exception 'invalid_inventory_count'; end if;
  for line in select value from jsonb_array_elements(p_lines) loop
    item_id = (line->>'item_id')::uuid;
    counted = (line->>'counted_quantity')::numeric;
    select p.unit_precision into strict precision_digits from public.inventory_count_items ci
      join public.products p on p.store_id = ci.store_id and p.id = ci.product_id
      where ci.store_id = p_store and ci.count_id = p_count and ci.id = item_id;
    if counted < 0 or round(counted, precision_digits) <> counted then raise exception 'invalid_count_quantity'; end if;
    update public.inventory_count_items set counted_quantity = counted
      where store_id = p_store and count_id = p_count and id = item_id;
    if not found then raise exception 'inventory_count_item_not_found'; end if;
  end loop;
end $$;

create or replace function public.apply_inventory_count(p_store uuid, p_count uuid, p_key uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare count_row public.inventory_counts%rowtype; item_row public.inventory_count_items%rowtype;
  product_row public.products%rowtype; balance_version bigint; result uuid; fingerprint text;
begin
  perform private.assert_member(p_store);
  if p_key is null then raise exception 'idempotency_key_required'; end if;
  fingerprint = encode(extensions.digest(convert_to(jsonb_build_object('store', p_store, 'count', p_count)::text, 'UTF8'), 'sha256'), 'hex');
  select * into strict count_row from public.inventory_counts where store_id = p_store and id = p_count for update;
  if count_row.status = 'applied' then
    if count_row.apply_idempotency_key = p_key and count_row.apply_fingerprint = fingerprint then return p_count; end if;
    raise exception 'inventory_count_already_applied';
  end if;
  if count_row.status <> 'draft' then raise exception 'inventory_count_not_draft'; end if;
  insert into public.inventory_balances(store_id, product_id, quantity)
  select distinct store_id, product_id, 0 from public.inventory_count_items where store_id = p_store and count_id = p_count
  on conflict(store_id, product_id) do nothing;
  perform b.product_id from public.inventory_balances b
    where b.store_id = p_store and b.product_id in (select product_id from public.inventory_count_items where store_id = p_store and count_id = p_count)
    order by b.product_id for update;
  for item_row in select * from public.inventory_count_items where store_id = p_store and count_id = p_count order by product_id, lot_id nulls first loop
    select * into strict product_row from public.products where store_id = p_store and id = item_row.product_id;
    select version into strict balance_version from public.inventory_balances where store_id = p_store and product_id = item_row.product_id;
    if balance_version <> item_row.balance_version then raise exception 'inventory_changed_during_count' using errcode = '40001'; end if;
    if round(item_row.counted_quantity, product_row.unit_precision) <> item_row.counted_quantity then raise exception 'invalid_count_quantity'; end if;
    if product_row.track_lots and item_row.lot_id is null and item_row.counted_quantity <> 0 then raise exception 'lot_required'; end if;
  end loop;
  for item_row in select * from public.inventory_count_items where store_id = p_store and count_id = p_count order by product_id, lot_id nulls first loop
    if item_row.counted_quantity <> item_row.expected_quantity then
      insert into public.inventory_movements(store_id, product_id, lot_id, quantity_delta, kind, reason, count_item_id, idempotency_key)
      values (p_store, item_row.product_id, item_row.lot_id, item_row.counted_quantity - item_row.expected_quantity,
        'count', 'Contagem de estoque', item_row.id, extensions.gen_random_uuid());
    end if;
  end loop;
  update public.inventory_counts set status = 'applied', applied_at = now(), apply_idempotency_key = p_key, apply_fingerprint = fingerprint
    where store_id = p_store and id = p_count;
  insert into public.audit_logs(store_id, actor_user_id, action, entity_table, entity_id)
  values (p_store, auth.uid(), 'apply_inventory_count', 'inventory_counts', p_count);
  result = p_count;
  return result;
end $$;

-- Delivery movements are versioned and only follow the board's allowed state transitions.
create or replace function public.move_delivery(
  p_store uuid, p_delivery uuid, p_status text, p_position numeric, p_expected_version bigint, p_reason text default null
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare delivery_row public.deliveries%rowtype; allowed boolean := false;
begin
  perform private.assert_member(p_store);
  select * into strict delivery_row from public.deliveries where store_id = p_store and id = p_delivery for update;
  if delivery_row.version <> p_expected_version then raise exception 'version_conflict' using errcode = '40001'; end if;
  allowed = case delivery_row.status
    when 'preparing' then p_status in ('ready', 'cancelled')
    when 'ready' then p_status in ('preparing', 'out_for_delivery', 'cancelled')
    when 'out_for_delivery' then p_status in ('ready', 'delivered', 'cancelled')
    else false
  end;
  if not allowed then raise exception 'invalid_delivery_transition'; end if;
  if p_status <> 'cancelled' and exists(
    select 1 from public.sales where store_id = p_store and id = delivery_row.sale_id and status = 'cancelled'
  ) then raise exception 'cancelled_sale_delivery'; end if;
  if p_position < 0 then raise exception 'invalid_delivery_position'; end if;
  if p_status = 'cancelled' and length(trim(coalesce(p_reason, ''))) not between 1 and 500 then raise exception 'reason_required'; end if;
  update public.deliveries set status = p_status, position = p_position, version = version + 1,
    delivered_at = case when p_status = 'delivered' then coalesce(delivered_at, now()) else null end
    where store_id = p_store and id = p_delivery;
  insert into public.delivery_events(store_id, delivery_id, from_status, to_status, reason)
  values (p_store, p_delivery, delivery_row.status, p_status, left(coalesce(p_reason, ''), 500));
  insert into public.audit_logs(store_id, actor_user_id, action, entity_table, entity_id)
  values (p_store, auth.uid(), 'move_delivery', 'deliveries', p_delivery);
  return delivery_row.version + 1;
end $$;

revoke all on function public.dashboard_overview(uuid), public.start_inventory_count(uuid, text),
  public.save_inventory_count(uuid, uuid, jsonb), public.apply_inventory_count(uuid, uuid, uuid),
  public.move_delivery(uuid, uuid, text, numeric, bigint, text) from public, anon;
grant execute on function public.dashboard_overview(uuid), public.start_inventory_count(uuid, text),
  public.save_inventory_count(uuid, uuid, jsonb), public.apply_inventory_count(uuid, uuid, uuid),
  public.move_delivery(uuid, uuid, text, numeric, bigint, text) to authenticated;

commit;
