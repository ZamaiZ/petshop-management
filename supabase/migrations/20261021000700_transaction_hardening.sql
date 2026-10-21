begin;

create table private.mutation_requests (
  store_id uuid not null references public.stores(id) on delete cascade,
  operation text not null check (length(trim(operation)) between 1 and 80),
  idempotency_key uuid not null,
  payload_fingerprint text not null,
  result_id uuid,
  result_payload jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (store_id, operation, idempotency_key)
);
alter table private.mutation_requests enable row level security;
revoke all on private.mutation_requests from public, anon, authenticated, service_role;
alter table public.sales add column if not exists cancel_idempotency_key uuid;
alter table public.sales add column if not exists cancel_fingerprint text;

create or replace function private.begin_operation(p_store uuid, p_operation text, p_key uuid, p_fingerprint text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare existing private.mutation_requests%rowtype;
begin
  if p_store is null or p_key is null or p_fingerprint is null or length(trim(p_operation)) = 0 then
    raise exception 'invalid_idempotency_request';
  end if;
  insert into private.mutation_requests(store_id, operation, idempotency_key, payload_fingerprint)
  values (p_store, p_operation, p_key, p_fingerprint) on conflict do nothing;
  select * into strict existing from private.mutation_requests
  where store_id = p_store and operation = p_operation and idempotency_key = p_key for update;
  if existing.payload_fingerprint <> p_fingerprint then raise exception 'idempotency_payload_mismatch' using errcode = '23505'; end if;
  if existing.completed_at is not null then
    return jsonb_build_object('replayed', true, 'result_id', existing.result_id, 'result', existing.result_payload);
  end if;
  return null;
end $$;

create or replace function private.finish_operation(p_store uuid, p_operation text, p_key uuid, p_result uuid, p_payload jsonb default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update private.mutation_requests set result_id = p_result, result_payload = p_payload, completed_at = now()
  where store_id = p_store and operation = p_operation and idempotency_key = p_key and completed_at is null;
  if not found then raise exception 'idempotency_state_invalid'; end if;
end $$;
revoke all on function private.begin_operation(uuid, text, uuid, text), private.finish_operation(uuid, text, uuid, uuid, jsonb)
  from public, anon, authenticated, service_role;

-- Expiration is checked in the shop timezone, including at the day boundary.
create or replace function private.apply_inventory_movement() returns trigger
language plpgsql security definer set search_path = '' as $$
declare product public.products%rowtype; current_quantity numeric; lot_quantity numeric; shop_timezone text; local_today date;
begin
  select * into strict product from public.products where store_id = new.store_id and id = new.product_id for update;
  if round(abs(new.quantity_delta), product.unit_precision) <> abs(new.quantity_delta) then raise exception 'invalid_quantity_precision'; end if;
  if product.track_lots and new.lot_id is null then raise exception 'lot_required'; end if;
  insert into public.inventory_balances(store_id, product_id, quantity) values (new.store_id, new.product_id, 0)
    on conflict (store_id, product_id) do nothing;
  select quantity into strict current_quantity from public.inventory_balances
    where store_id = new.store_id and product_id = new.product_id for update;
  if current_quantity + new.quantity_delta < 0 then raise exception 'insufficient_stock'; end if;
  if new.lot_id is not null then
    select quantity into strict lot_quantity from public.inventory_lots
    where store_id = new.store_id and product_id = new.product_id and id = new.lot_id for update;
    if lot_quantity + new.quantity_delta < 0 then raise exception 'insufficient_lot_stock'; end if;
    if new.kind = 'sale' then
      select timezone into strict shop_timezone from public.stores where id = new.store_id;
      local_today = (now() at time zone shop_timezone)::date;
      if exists(select 1 from public.inventory_lots where store_id = new.store_id and id = new.lot_id and expires_on < local_today) then
        raise exception 'expired_lot';
      end if;
    end if;
    update public.inventory_lots set quantity = quantity + new.quantity_delta where store_id = new.store_id and id = new.lot_id;
  end if;
  update public.inventory_balances set quantity = quantity + new.quantity_delta, version = version + 1
  where store_id = new.store_id and product_id = new.product_id;
  return new;
end $$;
revoke all on function private.apply_inventory_movement() from public, anon, authenticated;

create or replace function public.complete_sale(
  p_store uuid,
  p_session uuid,
  p_customer uuid,
  p_items jsonb,
  p_payments jsonb,
  p_discount bigint,
  p_key uuid,
  p_due date default null,
  p_delivery_fee bigint default 0,
  p_delivery_address jsonb default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  result uuid; idem jsonb; fingerprint text; item jsonb; pay jsonb;
  product_row public.products%rowtype; service_row public.services%rowtype;
  packaging_row public.product_packagings%rowtype; appointment_row public.appointments%rowtype; lot_row public.inventory_lots%rowtype;
  quantity numeric; sale_quantity numeric; remaining_quantity numeric; allocated_quantity numeric;
  price bigint; line_total bigint; subtotal bigint := 0; total bigint; paid bigint := 0; pending bigint;
  item_id uuid; payment_id uuid; cash_tender bigint; payment_method text; has_cash boolean; cash_available bigint;
  shop_timezone text; local_today date; line_unit text; item_description text; appointment_id uuid;
begin
  perform private.assert_member(p_store);
  if p_key is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 200
    or jsonb_typeof(coalesce(p_payments, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_payments, '[]'::jsonb)) > 12
    or p_discount < 0 or p_delivery_fee < 0 then raise exception 'invalid_sale'; end if;
  if p_delivery_address is not null and (p_customer is null or jsonb_typeof(p_delivery_address) <> 'object'
    or pg_column_size(p_delivery_address) > 12000) then raise exception 'invalid_delivery'; end if;

  fingerprint = encode(extensions.digest(convert_to(jsonb_build_object(
    'store', p_store, 'session', p_session, 'customer', p_customer, 'items', p_items, 'payments', coalesce(p_payments, '[]'::jsonb),
    'discount', p_discount, 'due', p_due, 'delivery_fee', p_delivery_fee, 'delivery_address', p_delivery_address
  )::text, 'UTF8'), 'sha256'), 'hex');
  idem = private.begin_operation(p_store, 'complete_sale', p_key, fingerprint);
  if idem is not null then return (idem->>'result_id')::uuid; end if;
  select id, payload_fingerprint into result, item_description from public.sales where store_id = p_store and idempotency_key = p_key;
  if found then
    if item_description is distinct from fingerprint then raise exception 'idempotency_payload_mismatch'; end if;
    perform private.finish_operation(p_store, 'complete_sale', p_key, result, null);
    return result;
  end if;

  has_cash = exists(select 1 from jsonb_array_elements(coalesce(p_payments, '[]'::jsonb)) as entries(value) where entries.value->>'method' = 'cash');
  if has_cash then
    perform private.lock_open_cash(p_store, p_session);
    select cs.opening_cents + coalesce(sum(cm.amount_cents), 0) into strict cash_available
    from public.cash_sessions cs left join public.cash_movements cm on cm.store_id = cs.store_id and cm.cash_session_id = cs.id
    where cs.store_id = p_store and cs.id = p_session and cs.status = 'open' group by cs.opening_cents;
  end if;
  if p_customer is not null then
    perform 1 from public.customers where store_id = p_store and id = p_customer and archived_at is null;
    if not found then raise exception 'customer_not_found'; end if;
  end if;

  select timezone into strict shop_timezone from public.stores where id = p_store and archived_at is null;
  local_today = (now() at time zone shop_timezone)::date;
  perform id from public.products where store_id = p_store
    and id in (select (value->>'product_id')::uuid from jsonb_array_elements(p_items) where value->>'product_id' is not null)
    order by id for update;
  perform id from public.appointments where store_id = p_store
    and id in (select (value->>'appointment_id')::uuid from jsonb_array_elements(p_items) where value->>'appointment_id' is not null)
    order by id for update;

  insert into public.sales(store_id, customer_id, cash_session_id, idempotency_key, payload_fingerprint)
  values (p_store, p_customer, case when has_cash then p_session else null end, p_key, fingerprint) returning id into result;

  for item in select value from jsonb_array_elements(p_items) loop
    quantity = (item->>'quantity')::numeric;
    if quantity is null or quantity <= 0 or scale(quantity) > 3 then raise exception 'invalid_quantity'; end if;
    if ((item->>'product_id' is not null)::int + (item->>'service_id' is not null)::int) <> 1 then raise exception 'invalid_item'; end if;

    if item->>'product_id' is not null then
      select * into strict product_row from public.products
      where store_id = p_store and id = (item->>'product_id')::uuid and archived_at is null;
      if item->>'packaging_id' is not null then
        select * into strict packaging_row from public.product_packagings
        where store_id = p_store and product_id = product_row.id and id = (item->>'packaging_id')::uuid;
        if trunc(quantity) <> quantity then raise exception 'invalid_packaging_quantity'; end if;
        sale_quantity = quantity * packaging_row.base_quantity;
        line_unit = packaging_row.label;
        item_description = product_row.name || ' · ' || packaging_row.label;
      else
        sale_quantity = quantity;
        line_unit = product_row.unit;
        item_description = product_row.name;
      end if;
      if round(sale_quantity, product_row.unit_precision) <> sale_quantity then raise exception 'invalid_quantity_precision'; end if;
      price = product_row.sale_price_cents;
      line_total = round(sale_quantity * price);
      insert into public.sale_items(store_id, sale_id, product_id, description, unit, quantity, unit_price_cents, unit_cost_cents, line_total_cents)
      values (p_store, result, product_row.id, item_description, line_unit, sale_quantity, price, product_row.average_cost_cents, line_total)
      returning id into item_id;

      if product_row.track_lots then
        remaining_quantity = sale_quantity;
        for lot_row in select * from public.inventory_lots
          where store_id = p_store and product_id = product_row.id and quantity > 0
            and (expires_on is null or expires_on >= local_today)
          order by expires_on nulls last, created_at, id for update loop
          allocated_quantity = least(lot_row.quantity, remaining_quantity);
          if allocated_quantity > 0 then
            insert into public.inventory_movements(store_id, product_id, lot_id, quantity_delta, kind, reason, sale_item_id, idempotency_key, payload_fingerprint)
            values (p_store, product_row.id, lot_row.id, -allocated_quantity, 'sale', 'Venda', item_id, extensions.gen_random_uuid(), fingerprint);
            remaining_quantity = remaining_quantity - allocated_quantity;
          end if;
          exit when remaining_quantity = 0;
        end loop;
        if remaining_quantity > 0 then raise exception 'insufficient_stock'; end if;
      else
        insert into public.inventory_movements(store_id, product_id, quantity_delta, kind, reason, sale_item_id, idempotency_key, payload_fingerprint)
        values (p_store, product_row.id, -sale_quantity, 'sale', 'Venda', item_id, extensions.gen_random_uuid(), fingerprint);
      end if;
    else
      select * into strict service_row from public.services
      where store_id = p_store and id = (item->>'service_id')::uuid and archived_at is null;
      appointment_id = nullif(item->>'appointment_id', '')::uuid;
      if appointment_id is not null then
        select * into strict appointment_row from public.appointments
        where store_id = p_store and id = appointment_id for update;
        if appointment_row.service_id <> service_row.id or appointment_row.sale_id is not null
          or appointment_row.status not in ('ready', 'delivered') or p_customer is distinct from appointment_row.customer_id then
          raise exception 'appointment_sale_mismatch';
        end if;
        if quantity <> 1 then raise exception 'appointment_quantity_must_be_one'; end if;
        price = appointment_row.price_cents;
      else
        if trunc(quantity) <> quantity then raise exception 'invalid_service_quantity'; end if;
        price = service_row.price_cents;
      end if;
      sale_quantity = quantity;
      line_total = sale_quantity * price;
      insert into public.sale_items(store_id, sale_id, service_id, appointment_id, description, unit, quantity, unit_price_cents, line_total_cents)
      values (p_store, result, service_row.id, appointment_id, service_row.name, 'un', sale_quantity, price, line_total)
      returning id into item_id;
      if appointment_id is not null then
        update public.appointments set sale_id = result, status = 'delivered', version = version + 1
        where store_id = p_store and id = appointment_id and sale_id is null;
        if not found then raise exception 'appointment_already_billed'; end if;
      end if;
    end if;
    subtotal = subtotal + line_total;
  end loop;

  total = subtotal - p_discount + p_delivery_fee;
  if p_discount > subtotal or total < 0 then raise exception 'invalid_discount'; end if;
  for pay in select value from jsonb_array_elements(coalesce(p_payments, '[]'::jsonb)) loop
    payment_method = pay->>'method';
    line_total = (pay->>'amount_cents')::bigint;
    if payment_method is null or payment_method not in ('cash', 'pix', 'debit_card', 'credit_card') or line_total is null or line_total <= 0 then
      raise exception 'invalid_payment';
    end if;
    cash_tender = case when payment_method = 'cash' then (pay->>'tendered_cents')::bigint else null end;
    if payment_method = 'cash' then
      if cash_tender is null or cash_tender < line_total then raise exception 'invalid_tender'; end if;
      if cash_tender - line_total > cash_available then raise exception 'insufficient_change_fund'; end if;
    end if;
    insert into public.payments(store_id, sale_id, method, amount_cents, tendered_cents, change_cents, idempotency_key, payload_fingerprint)
    values (p_store, result, payment_method, line_total, cash_tender,
      case when payment_method = 'cash' then cash_tender - line_total end, extensions.gen_random_uuid(), fingerprint)
    returning id into payment_id;
    if payment_method = 'cash' then
      insert into public.cash_movements(store_id, cash_session_id, kind, amount_cents, payment_id, reason, idempotency_key, payload_fingerprint)
      values (p_store, p_session, 'sale', line_total, payment_id, 'Venda', extensions.gen_random_uuid(), fingerprint);
      cash_available = cash_available + line_total;
    end if;
    paid = paid + line_total;
  end loop;
  if paid > total then raise exception 'payment_above_total'; end if;
  pending = total - paid;
  if pending > 0 then
    if p_customer is null then raise exception 'customer_required_for_credit'; end if;
    insert into public.receivables(store_id, sale_id, customer_id, original_cents, remaining_cents, due_on)
    values (p_store, result, p_customer, pending, pending, p_due);
  end if;
  update public.sales set status = 'completed', subtotal_cents = subtotal, discount_cents = p_discount,
    delivery_fee_cents = p_delivery_fee, total_cents = total, completed_at = now(), payload_fingerprint = fingerprint
  where store_id = p_store and id = result;
  if p_delivery_address is not null then
    insert into public.deliveries(store_id, sale_id, customer_id, address_snapshot, fee_cents)
    values (p_store, result, p_customer, p_delivery_address, p_delivery_fee);
  end if;
  insert into public.audit_logs(store_id, actor_user_id, action, entity_table, entity_id)
  values (p_store, auth.uid(), 'complete_sale', 'sales', result);
  perform private.finish_operation(p_store, 'complete_sale', p_key, result, null);
  return result;
end $$;

create or replace function public.receive_receivable(
  p_store uuid, p_receivable uuid, p_amount bigint, p_method text, p_session uuid, p_key uuid, p_tendered bigint default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare receivable_row public.receivables%rowtype; result uuid; idem jsonb; fingerprint text; existing_fingerprint text; cash_available bigint; change_amount bigint;
begin
  perform private.assert_member(p_store);
  if p_amount is null or p_amount <= 0 or p_method is null or p_method not in ('cash', 'pix', 'debit_card', 'credit_card') then raise exception 'invalid_amount'; end if;
  fingerprint = encode(extensions.digest(convert_to(jsonb_build_object('store', p_store, 'receivable', p_receivable, 'amount', p_amount,
    'method', p_method, 'session', p_session, 'tendered', p_tendered)::text, 'UTF8'), 'sha256'), 'hex');
  idem = private.begin_operation(p_store, 'receive_receivable', p_key, fingerprint);
  if idem is not null then return (idem->>'result_id')::uuid; end if;
  select id, payload_fingerprint into result, existing_fingerprint from public.payments where store_id = p_store and idempotency_key = p_key;
  if found then
    if existing_fingerprint is distinct from encode(extensions.digest(convert_to(jsonb_build_object('store', p_store, 'receivable', p_receivable, 'amount', p_amount,
      'method', p_method, 'session', p_session, 'tendered', p_tendered)::text, 'UTF8'), 'sha256'), 'hex') then raise exception 'idempotency_payload_mismatch'; end if;
    perform private.finish_operation(p_store, 'receive_receivable', p_key, result, null);
    return result;
  end if;
  if p_method = 'cash' then
    perform private.lock_open_cash(p_store, p_session);
    select cs.opening_cents + coalesce(sum(cm.amount_cents), 0) into strict cash_available
    from public.cash_sessions cs left join public.cash_movements cm on cm.store_id = cs.store_id and cm.cash_session_id = cs.id
    where cs.store_id = p_store and cs.id = p_session and cs.status = 'open' group by cs.opening_cents;
  end if;
  select * into strict receivable_row from public.receivables where store_id = p_store and id = p_receivable and status = 'open' for update;
  if p_amount > receivable_row.remaining_cents then raise exception 'invalid_amount'; end if;
  if p_method = 'cash' then
    if p_tendered is null or p_tendered < p_amount then raise exception 'invalid_tender'; end if;
    change_amount = p_tendered - p_amount;
    if change_amount > cash_available then raise exception 'insufficient_change_fund'; end if;
  end if;
  insert into public.payments(store_id, sale_id, method, amount_cents, tendered_cents, change_cents, idempotency_key, payload_fingerprint)
  values (p_store, receivable_row.sale_id, p_method, p_amount, case when p_method = 'cash' then p_tendered end,
    case when p_method = 'cash' then change_amount end, p_key, encode(extensions.digest(convert_to(jsonb_build_object('store', p_store, 'receivable', p_receivable, 'amount', p_amount,
      'method', p_method, 'session', p_session, 'tendered', p_tendered)::text, 'UTF8'), 'sha256'), 'hex')) returning id into result;
  insert into public.receivable_payments(store_id, receivable_id, payment_id, amount_cents) values (p_store, p_receivable, result, p_amount);
  if p_method = 'cash' then
    insert into public.cash_movements(store_id, cash_session_id, kind, amount_cents, payment_id, reason, idempotency_key, payload_fingerprint)
    values (p_store, p_session, 'receivable', p_amount, result, 'Recebimento de saldo', p_key,
      encode(extensions.digest(convert_to(jsonb_build_object('store', p_store, 'receivable', p_receivable, 'amount', p_amount,
        'method', p_method, 'session', p_session, 'tendered', p_tendered)::text, 'UTF8'), 'sha256'), 'hex'));
  end if;
  update public.receivables set remaining_cents = remaining_cents - p_amount,
    status = case when remaining_cents = p_amount then 'paid' else 'open' end where store_id = p_store and id = p_receivable;
  perform private.finish_operation(p_store, 'receive_receivable', p_key, result, null);
  return result;
end $$;

create or replace function public.adjust_stock(
  p_store uuid, p_product uuid, p_counted numeric, p_reason text, p_key uuid, p_lot uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare current_quantity numeric; result uuid; precision_digits integer; fingerprint text; existing_fingerprint text; idem jsonb;
begin
  perform private.assert_member(p_store);
  if p_key is null or coalesce(length(trim(p_reason)), 0) not between 1 and 500 then raise exception 'invalid_adjustment'; end if;
  fingerprint = encode(extensions.digest(convert_to(jsonb_build_object('store', p_store, 'product', p_product, 'counted', p_counted,
    'reason', trim(p_reason), 'lot', p_lot)::text, 'UTF8'), 'sha256'), 'hex');
  idem = private.begin_operation(p_store, 'adjust_stock', p_key, fingerprint);
  if idem is not null then return (idem->>'result_id')::uuid; end if;
  select id, payload_fingerprint into result, existing_fingerprint from public.inventory_movements where store_id = p_store and idempotency_key = p_key;
  if found then
    if existing_fingerprint is distinct from fingerprint then raise exception 'idempotency_payload_mismatch'; end if;
    perform private.finish_operation(p_store, 'adjust_stock', p_key, result, null);
    return result;
  end if;
  select unit_precision into strict precision_digits from public.products where store_id = p_store and id = p_product and archived_at is null for update;
  if p_counted < 0 or round(p_counted, precision_digits) <> p_counted then raise exception 'invalid_adjustment'; end if;
  if p_lot is not null then
    select quantity into strict current_quantity from public.inventory_lots where store_id = p_store and product_id = p_product and id = p_lot for update;
  else
    select coalesce((select quantity from public.inventory_balances where store_id = p_store and product_id = p_product), 0) into current_quantity;
  end if;
  if p_counted = current_quantity then
    insert into public.audit_logs(store_id, actor_user_id, action, entity_table, details)
    values (p_store, auth.uid(), 'adjust_stock_noop', 'inventory_movements', jsonb_build_object('product_id', p_product, 'counted', p_counted, 'reason', trim(p_reason)));
    perform private.finish_operation(p_store, 'adjust_stock', p_key, null, jsonb_build_object('noop', true));
    return null;
  end if;
  insert into public.inventory_movements(store_id, product_id, lot_id, quantity_delta, kind, reason, idempotency_key, payload_fingerprint)
  values (p_store, p_product, p_lot, p_counted - current_quantity, 'correction', left(trim(p_reason), 500), p_key, fingerprint)
  returning id into result;
  insert into public.audit_logs(store_id, actor_user_id, action, entity_table, entity_id, details)
  values (p_store, auth.uid(), 'adjust_stock', 'inventory_movements', result, jsonb_build_object('previous', current_quantity, 'counted', p_counted));
  perform private.finish_operation(p_store, 'adjust_stock', p_key, result, null);
  return result;
end $$;

create or replace function private.sale_item_net_cents(p_store uuid, p_sale uuid, p_item uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  with sale_totals as (
    select discount_cents, subtotal_cents from public.sales where store_id = p_store and id = p_sale
  ), shares as (
    select si.id, si.line_total_cents,
      case when st.subtotal_cents = 0 then 0::bigint else floor(st.discount_cents::numeric * si.line_total_cents / st.subtotal_cents)::bigint end as base_share,
      case when st.subtotal_cents = 0 then 0::numeric else mod(st.discount_cents::numeric * si.line_total_cents, st.subtotal_cents::numeric) end as remainder,
      st.discount_cents
    from public.sale_items si cross join sale_totals st where si.store_id = p_store and si.sale_id = p_sale
  ), ranked as (
    select *, row_number() over (order by remainder desc, id) as position, sum(base_share) over () as allocated
    from shares
  )
  select (line_total_cents - base_share - case when position <= discount_cents - allocated then 1 else 0 end)::bigint
  from ranked where id = p_item
$$;
revoke all on function private.sale_item_net_cents(uuid, uuid, uuid) from public, anon, authenticated, service_role;

create or replace function public.return_sale_items(
  p_store uuid, p_sale uuid, p_lines jsonb, p_reason text, p_method text, p_session uuid, p_key uuid
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  sale_row public.sales%rowtype; v_return_id uuid; known_fingerprint text; fingerprint text; line jsonb;
  item_row public.sale_items%rowtype; product_row public.products%rowtype; lot_row record; receivable_row public.receivables%rowtype;
  allocation_row record;
  quantity numeric; already_quantity numeric; net_cents bigint; item_refund bigint; cumulative_refund bigint;
  refund_total bigint := 0; credit_applied bigint := 0; cash_refund bigint := 0; cash_available bigint;
  remaining_credit bigint; item_credit bigint; remaining_restock numeric; lot_available numeric; restock_quantity numeric;
  return_item_id uuid; all_returned boolean; delivery_refund bigint := 0; previous_delivery_refund bigint := 0;
begin
  perform private.assert_member(p_store);
  if p_key is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) < 1 or jsonb_array_length(p_lines) > 200
    or coalesce(length(trim(p_reason)), 0) not between 1 and 500 then raise exception 'invalid_return'; end if;
  if (select count(*) from jsonb_array_elements(p_lines)) <>
     (select count(distinct value->>'sale_item_id') from jsonb_array_elements(p_lines)) then raise exception 'duplicate_return_item'; end if;
  fingerprint = encode(extensions.digest(convert_to(jsonb_build_object('store', p_store, 'sale', p_sale, 'lines', p_lines,
    'reason', trim(p_reason), 'method', p_method, 'session', p_session)::text, 'UTF8'), 'sha256'), 'hex');
  select id, payload_fingerprint into v_return_id, known_fingerprint from public.sale_returns
  where store_id = p_store and idempotency_key = p_key;
  if found then
    if known_fingerprint is distinct from fingerprint then raise exception 'idempotency_payload_mismatch'; end if;
    return v_return_id;
  end if;
  if p_method is not null and p_method not in ('cash', 'pix', 'debit_card', 'credit_card') then raise exception 'invalid_refund_method'; end if;
  if p_method = 'cash' then perform private.lock_open_cash(p_store, p_session); end if;
  select * into strict sale_row from public.sales where store_id = p_store and id = p_sale for update;
  if sale_row.status not in ('completed', 'partially_refunded') then raise exception 'sale_not_returnable'; end if;
  perform p.id from public.products p where p.store_id = p_store and p.id in (
    select si.product_id from public.sale_items si join jsonb_array_elements(p_lines) j on si.id = (j.value->>'sale_item_id')::uuid
    where si.store_id = p_store and si.sale_id = p_sale and si.product_id is not null
  ) order by p.id for update;
  perform si.id from public.sale_items si where si.store_id = p_store and si.sale_id = p_sale
    and si.id in (select (value->>'sale_item_id')::uuid from jsonb_array_elements(p_lines)) order by si.id for update;
  insert into public.sale_returns(store_id, sale_id, reason, refund_cents, idempotency_key, payload_fingerprint)
  values (p_store, p_sale, left(trim(p_reason), 500), 0, p_key, fingerprint) returning id into v_return_id;

  for line in select value from jsonb_array_elements(p_lines) loop
    select * into strict item_row from public.sale_items
    where store_id = p_store and sale_id = p_sale and id = (line->>'sale_item_id')::uuid;
    quantity = (line->>'quantity')::numeric;
    if quantity is null or quantity <= 0 or scale(quantity) > 3 then raise exception 'invalid_return_quantity'; end if;
    if coalesce((line->>'restock')::boolean, false) and item_row.product_id is null then raise exception 'service_cannot_be_restocked'; end if;
    if item_row.product_id is not null then
      select * into strict product_row from public.products where store_id = p_store and id = item_row.product_id;
      if round(quantity, product_row.unit_precision) <> quantity then raise exception 'invalid_quantity_precision'; end if;
    elsif trunc(quantity) <> quantity then raise exception 'invalid_quantity_precision'; end if;
    select coalesce(sum(quantity), 0) into already_quantity from public.sale_return_items
    where store_id = p_store and sale_id = p_sale and sale_item_id = item_row.id;
    if quantity > item_row.quantity - already_quantity then raise exception 'return_exceeds_sold_quantity'; end if;
    net_cents = private.sale_item_net_cents(p_store, p_sale, item_row.id);
    cumulative_refund = round(net_cents::numeric * (already_quantity + quantity) / item_row.quantity)
      - round(net_cents::numeric * already_quantity / item_row.quantity);
    item_refund = cumulative_refund;
    insert into public.sale_return_items(store_id, return_id, sale_id, sale_item_id, quantity, restock)
    values (p_store, v_return_id, p_sale, item_row.id, quantity, coalesce((line->>'restock')::boolean, false))
    returning id into return_item_id;
    insert into public.sale_refund_allocations(store_id, return_id, sale_item_id, amount_cents, quantity)
    values (p_store, v_return_id, item_row.id, item_refund, quantity);
    refund_total = refund_total + item_refund;

    if coalesce((line->>'restock')::boolean, false) then
      remaining_restock = quantity;
      for lot_row in
        select sold.lot_id, sold.sold_quantity, coalesce(returned.returned_quantity, 0) as returned_quantity
        from (
          select im.lot_id, -sum(im.quantity_delta) as sold_quantity, min(im.occurred_at) as first_sold_at
          from public.inventory_movements im where im.store_id = p_store and im.product_id = item_row.product_id
            and im.sale_item_id = item_row.id and im.kind = 'sale' group by im.lot_id
        ) sold
        left join lateral (
          select sum(im.quantity_delta) as returned_quantity from public.inventory_movements im
          join public.sale_return_items ri on ri.store_id = im.store_id and ri.id = im.return_item_id
          where im.store_id = p_store and im.product_id = item_row.product_id and im.kind = 'return'
            and ri.sale_item_id = item_row.id and im.lot_id is not distinct from sold.lot_id
        ) returned on true
        order by sold.first_sold_at, sold.lot_id nulls first
      loop
        lot_available = lot_row.sold_quantity - lot_row.returned_quantity;
        restock_quantity = least(lot_available, remaining_restock);
        if restock_quantity > 0 then
          insert into public.inventory_movements(store_id, product_id, lot_id, quantity_delta, kind, reason, return_item_id, idempotency_key)
          values (p_store, item_row.product_id, lot_row.lot_id, restock_quantity, 'return', 'Devolução: ' || left(trim(p_reason), 450), return_item_id, extensions.gen_random_uuid());
          remaining_restock = remaining_restock - restock_quantity;
        end if;
        exit when remaining_restock = 0;
      end loop;
      if remaining_restock > 0 then raise exception 'return_lot_allocation_invalid'; end if;
    end if;
  end loop;

  select not exists (
    select 1 from public.sale_items si where si.store_id = p_store and si.sale_id = p_sale
      and si.quantity > coalesce((select sum(ri.quantity) from public.sale_return_items ri where ri.store_id = p_store and ri.sale_item_id = si.id), 0)
  ) into all_returned;
  select coalesce(sum(delivery_fee_refunded_cents), 0) into previous_delivery_refund from public.sale_returns
    where store_id = p_store and sale_id = p_sale and id <> v_return_id;
  if all_returned and previous_delivery_refund < sale_row.delivery_fee_cents and exists (
    select 1 from public.deliveries where store_id = p_store and sale_id = p_sale and status not in ('delivered', 'cancelled')
  ) then
    delivery_refund = sale_row.delivery_fee_cents - previous_delivery_refund;
    refund_total = refund_total + delivery_refund;
  end if;

  select * into receivable_row from public.receivables where store_id = p_store and sale_id = p_sale and status = 'open' for update;
  if found then
    credit_applied = least(refund_total, receivable_row.remaining_cents);
    update public.receivables set remaining_cents = remaining_cents - credit_applied,
      status = case when remaining_cents = credit_applied then 'cancelled' else 'open' end
      where store_id = p_store and id = receivable_row.id;
  end if;
  cash_refund = refund_total - credit_applied;
  remaining_credit = least(credit_applied, coalesce((select sum(a.amount_cents) from public.sale_refund_allocations a where a.store_id = p_store and a.return_id = v_return_id), 0));
  for allocation_row in select a.id, a.amount_cents from public.sale_refund_allocations a
    where a.store_id = p_store and a.return_id = v_return_id order by a.sale_item_id loop
    item_credit = least(allocation_row.amount_cents, remaining_credit);
    update public.sale_refund_allocations set credit_applied_cents = item_credit where store_id = p_store and id = allocation_row.id;
    remaining_credit = remaining_credit - item_credit;
  end loop;
  if cash_refund > 0 then
    if p_method is null then raise exception 'refund_method_required'; end if;
    if p_method = 'cash' then
      select cs.opening_cents + coalesce(sum(cm.amount_cents), 0) into strict cash_available
      from public.cash_sessions cs left join public.cash_movements cm on cm.store_id = cs.store_id and cm.cash_session_id = cs.id
      where cs.store_id = p_store and cs.id = p_session and cs.status = 'open' group by cs.opening_cents;
      if cash_refund > cash_available then raise exception 'insufficient_cash'; end if;
    end if;
    insert into public.sale_refunds(store_id, sale_id, return_id, amount_cents, method, reason, idempotency_key, payload_fingerprint)
    values (p_store, p_sale, v_return_id, cash_refund, p_method, left(trim(p_reason), 500), p_key, fingerprint);
    if p_method = 'cash' then
      insert into public.cash_movements(store_id, cash_session_id, kind, amount_cents, reason, idempotency_key, payload_fingerprint)
      values (p_store, p_session, 'refund', -cash_refund, 'Devolução: ' || left(trim(p_reason), 450), p_key, fingerprint);
    end if;
  end if;
  update public.sale_returns set refund_cents = refund_total, credit_applied_cents = credit_applied,
    delivery_fee_refunded_cents = delivery_refund where store_id = p_store and id = v_return_id;
  if all_returned and not exists(select 1 from public.receivables where store_id = p_store and sale_id = p_sale and status = 'open' and remaining_cents > 0) then
    update public.sales set status = 'refunded' where store_id = p_store and id = p_sale;
  else
    update public.sales set status = 'partially_refunded' where store_id = p_store and id = p_sale;
  end if;
  insert into public.audit_logs(store_id, actor_user_id, action, entity_table, entity_id, details)
  values (p_store, auth.uid(), 'return_sale_items', 'sale_returns', v_return_id,
    jsonb_build_object('sale_id', p_sale, 'refund_cents', refund_total, 'credit_applied_cents', credit_applied, 'reason', left(trim(p_reason), 500)));
  return v_return_id;
end $$;

create or replace function public.cancel_sale(
  p_store uuid, p_sale uuid, p_reason text, p_method text, p_session uuid, p_key uuid
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare sale_row public.sales%rowtype; lines jsonb; return_id uuid; fingerprint text;
begin
  perform private.assert_member(p_store);
  if p_key is null or coalesce(length(trim(p_reason)), 0) not between 1 and 500 then raise exception 'invalid_cancellation'; end if;
  fingerprint = encode(extensions.digest(convert_to(jsonb_build_object('store', p_store, 'sale', p_sale, 'reason', trim(p_reason),
    'method', p_method, 'session', p_session)::text, 'UTF8'), 'sha256'), 'hex');
  select * into strict sale_row from public.sales where store_id = p_store and id = p_sale;
  if sale_row.status = 'cancelled' then
    if sale_row.cancel_idempotency_key = p_key and sale_row.cancel_fingerprint = fingerprint then return p_sale; end if;
    raise exception 'sale_already_cancelled';
  end if;
  if p_method = 'cash' then perform private.lock_open_cash(p_store, p_session); end if;
  select * into strict sale_row from public.sales where store_id = p_store and id = p_sale for update;
  if sale_row.status = 'cancelled' then
    if sale_row.cancel_idempotency_key = p_key and sale_row.cancel_fingerprint = fingerprint then return p_sale; end if;
    raise exception 'sale_already_cancelled';
  end if;
  if sale_row.status not in ('completed', 'partially_refunded') then raise exception 'sale_not_cancellable'; end if;
  if exists(select 1 from public.deliveries where store_id = p_store and sale_id = p_sale and status = 'delivered') then
    raise exception 'delivered_sale_cannot_be_cancelled';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'sale_item_id', si.id,
    'quantity', si.quantity - coalesce(returned.quantity, 0),
    'restock', si.product_id is not null
  ) order by si.id), '[]'::jsonb) into lines
  from public.sale_items si
  left join lateral (select sum(ri.quantity) as quantity from public.sale_return_items ri where ri.store_id = si.store_id and ri.sale_item_id = si.id) returned on true
  where si.store_id = p_store and si.sale_id = p_sale and si.quantity > coalesce(returned.quantity, 0);
  if jsonb_array_length(lines) = 0 then raise exception 'sale_has_no_returnable_items'; end if;
  return_id = public.return_sale_items(p_store, p_sale, lines, p_reason, p_method, p_session, p_key);
  update public.sales set status = 'cancelled', cancelled_at = now(), cancellation_reason = left(trim(p_reason), 500),
    cancel_idempotency_key = p_key, cancel_fingerprint = fingerprint where store_id = p_store and id = p_sale;
  insert into public.audit_logs(store_id, actor_user_id, action, entity_table, entity_id, details)
  values (p_store, auth.uid(), 'cancel_sale', 'sales', p_sale, jsonb_build_object('reason', left(trim(p_reason), 500), 'return_id', return_id));
  return p_sale;
end $$;

revoke all on function public.complete_sale(uuid, uuid, uuid, jsonb, jsonb, bigint, uuid, date, bigint, jsonb),
  public.receive_receivable(uuid, uuid, bigint, text, uuid, uuid, bigint),
  public.adjust_stock(uuid, uuid, numeric, text, uuid, uuid),
  public.return_sale_items(uuid, uuid, jsonb, text, text, uuid, uuid),
  public.cancel_sale(uuid, uuid, text, text, uuid, uuid) from public, anon;
grant execute on function public.complete_sale(uuid, uuid, uuid, jsonb, jsonb, bigint, uuid, date, bigint, jsonb),
  public.receive_receivable(uuid, uuid, bigint, text, uuid, uuid, bigint),
  public.adjust_stock(uuid, uuid, numeric, text, uuid, uuid),
  public.return_sale_items(uuid, uuid, jsonb, text, text, uuid, uuid),
  public.cancel_sale(uuid, uuid, text, text, uuid, uuid) to authenticated;

commit;
