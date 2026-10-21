begin;

alter table public.cash_sessions add column if not exists open_idempotency_key uuid;
alter table public.cash_sessions add column if not exists open_fingerprint text;
create unique index if not exists cash_sessions_open_idempotency_key
  on public.cash_sessions(store_id, open_idempotency_key) where open_idempotency_key is not null;

create or replace function public.open_cash(p_store uuid, p_opening bigint, p_counts jsonb, p_key uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare result uuid; denomination jsonb; counted bigint; fingerprint text; idem jsonb;
begin
  perform private.assert_member(p_store);
  if p_opening < 0 or p_key is null or jsonb_typeof(coalesce(p_counts, '[]'::jsonb)) <> 'array'
    or jsonb_array_length(coalesce(p_counts, '[]'::jsonb)) > 12 then raise exception 'invalid_amount'; end if;
  fingerprint = encode(extensions.digest(convert_to(jsonb_build_object('store', p_store, 'opening', p_opening,
    'counts', coalesce(p_counts, '[]'::jsonb))::text, 'UTF8'), 'sha256'), 'hex');
  idem = private.begin_operation(p_store, 'open_cash', p_key, fingerprint);
  if idem is not null then return (idem->>'result_id')::uuid; end if;
  select id, open_fingerprint into result, fingerprint from public.cash_sessions where store_id = p_store and open_idempotency_key = p_key;
  if found then
    if fingerprint is distinct from encode(extensions.digest(convert_to(jsonb_build_object('store', p_store, 'opening', p_opening,
      'counts', coalesce(p_counts, '[]'::jsonb))::text, 'UTF8'), 'sha256'), 'hex') then raise exception 'idempotency_payload_mismatch'; end if;
    perform private.finish_operation(p_store, 'open_cash', p_key, result, null);
    return result;
  end if;
  perform 1 from public.stores where id = p_store for update;
  if exists(select 1 from public.cash_sessions where store_id = p_store and status = 'open') then raise exception 'cash_already_open'; end if;
  if jsonb_array_length(coalesce(p_counts, '[]'::jsonb)) > 0 then
    select coalesce(sum((value->>'denomination_cents')::bigint * (value->>'quantity')::bigint), 0) into counted
    from jsonb_array_elements(p_counts);
    if counted <> p_opening then raise exception 'count_mismatch'; end if;
  end if;
  insert into public.cash_sessions(store_id, opened_by, opening_cents, open_idempotency_key, open_fingerprint)
  values (p_store, auth.uid(), p_opening, p_key, fingerprint) returning id into result;
  for denomination in select value from jsonb_array_elements(coalesce(p_counts, '[]'::jsonb)) loop
    insert into public.cash_counts(store_id, cash_session_id, phase, denomination_cents, quantity)
    values (p_store, result, 'opening', (denomination->>'denomination_cents')::int, (denomination->>'quantity')::int);
  end loop;
  insert into public.audit_logs(store_id, actor_user_id, action, entity_table, entity_id)
  values (p_store, auth.uid(), 'open_cash', 'cash_sessions', result);
  perform private.finish_operation(p_store, 'open_cash', p_key, result, null);
  return result;
end $$;

create or replace function public.move_cash(p_store uuid, p_session uuid, p_kind text, p_amount bigint, p_reason text, p_key uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare result uuid; expected bigint; fingerprint text; existing_fingerprint text; idem jsonb;
begin
  perform private.assert_member(p_store);
  if p_kind not in ('reinforcement', 'withdrawal') or p_amount is null or p_amount <= 0
    or coalesce(length(trim(p_reason)), 0) not between 1 and 500 then raise exception 'invalid_movement'; end if;
  fingerprint = encode(extensions.digest(convert_to(jsonb_build_object('store', p_store, 'session', p_session, 'kind', p_kind,
    'amount', p_amount, 'reason', trim(p_reason))::text, 'UTF8'), 'sha256'), 'hex');
  idem = private.begin_operation(p_store, 'move_cash', p_key, fingerprint);
  if idem is not null then return (idem->>'result_id')::uuid; end if;
  select id, payload_fingerprint into result, existing_fingerprint from public.cash_movements where store_id = p_store and idempotency_key = p_key;
  if found then
    if existing_fingerprint is distinct from fingerprint then raise exception 'idempotency_payload_mismatch'; end if;
    perform private.finish_operation(p_store, 'move_cash', p_key, result, null);
    return result;
  end if;
  perform private.lock_open_cash(p_store, p_session);
  select cs.opening_cents + coalesce(sum(cm.amount_cents), 0) into strict expected
  from public.cash_sessions cs left join public.cash_movements cm on cm.store_id = cs.store_id and cm.cash_session_id = cs.id
  where cs.store_id = p_store and cs.id = p_session and cs.status = 'open' group by cs.opening_cents;
  if p_kind = 'withdrawal' and p_amount > expected then raise exception 'insufficient_cash'; end if;
  insert into public.cash_movements(store_id, cash_session_id, kind, amount_cents, reason, idempotency_key, payload_fingerprint)
  values (p_store, p_session, p_kind, case when p_kind = 'withdrawal' then -p_amount else p_amount end,
    left(trim(p_reason), 500), p_key, fingerprint) returning id into result;
  insert into public.audit_logs(store_id, actor_user_id, action, entity_table, entity_id)
  values (p_store, auth.uid(), 'move_cash', 'cash_movements', result);
  perform private.finish_operation(p_store, 'move_cash', p_key, result, null);
  return result;
end $$;

create or replace function public.pay_payable(p_store uuid, p_payable uuid, p_amount bigint, p_method text, p_session uuid, p_key uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare bill public.payables%rowtype; result uuid; expected bigint; fingerprint text; existing_fingerprint text; idem jsonb;
begin
  perform private.assert_member(p_store);
  if p_amount is null or p_amount <= 0 or p_method is null or p_method not in ('cash', 'pix', 'debit_card', 'credit_card', 'transfer') then raise exception 'invalid_amount'; end if;
  fingerprint = encode(extensions.digest(convert_to(jsonb_build_object('store', p_store, 'payable', p_payable, 'amount', p_amount,
    'method', p_method, 'session', p_session)::text, 'UTF8'), 'sha256'), 'hex');
  idem = private.begin_operation(p_store, 'pay_payable', p_key, fingerprint);
  if idem is not null then return (idem->>'result_id')::uuid; end if;
  select id, payload_fingerprint into result, existing_fingerprint from public.payable_payments where store_id = p_store and idempotency_key = p_key;
  if found then
    if existing_fingerprint is distinct from fingerprint then raise exception 'idempotency_payload_mismatch'; end if;
    perform private.finish_operation(p_store, 'pay_payable', p_key, result, null);
    return result;
  end if;
  if p_method = 'cash' then
    perform private.lock_open_cash(p_store, p_session);
    select cs.opening_cents + coalesce(sum(cm.amount_cents), 0) into strict expected
    from public.cash_sessions cs left join public.cash_movements cm on cm.store_id = cs.store_id and cm.cash_session_id = cs.id
    where cs.store_id = p_store and cs.id = p_session and cs.status = 'open' group by cs.opening_cents;
  end if;
  select * into strict bill from public.payables where store_id = p_store and id = p_payable and status = 'open' for update;
  if p_amount > bill.remaining_cents then raise exception 'invalid_amount'; end if;
  if p_method = 'cash' and p_amount > expected then raise exception 'insufficient_cash'; end if;
  insert into public.payable_payments(store_id, payable_id, amount_cents, method, cash_session_id, idempotency_key, payload_fingerprint)
  values (p_store, p_payable, p_amount, p_method, case when p_method = 'cash' then p_session end, p_key, fingerprint)
  returning id into result;
  if p_method = 'cash' then
    insert into public.cash_movements(store_id, cash_session_id, kind, amount_cents, payable_payment_id, reason, idempotency_key, payload_fingerprint)
    values (p_store, p_session, 'expense', -p_amount, result, bill.description, p_key, fingerprint);
  end if;
  update public.payables set remaining_cents = remaining_cents - p_amount,
    status = case when remaining_cents = p_amount then 'paid' else 'open' end where store_id = p_store and id = p_payable;
  insert into public.audit_logs(store_id, actor_user_id, action, entity_table, entity_id)
  values (p_store, auth.uid(), 'pay_payable', 'payables', p_payable);
  perform private.finish_operation(p_store, 'pay_payable', p_key, result, null);
  return result;
end $$;

create or replace function public.create_expense(
  p_store uuid, p_description text, p_category uuid, p_amount bigint, p_due date, p_key uuid,
  p_pay_now boolean default false, p_method text default 'pix', p_session uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare result uuid; fingerprint text; existing_fingerprint text; idem jsonb;
begin
  perform private.assert_member(p_store);
  if p_amount is null or p_amount <= 0 or coalesce(length(trim(p_description)), 0) not between 1 and 500 or p_due is null then
    raise exception 'invalid_expense';
  end if;
  if p_pay_now and (p_method is null or p_method not in ('cash', 'pix', 'debit_card', 'credit_card', 'transfer')) then raise exception 'invalid_payment_method'; end if;
  fingerprint = encode(extensions.digest(convert_to(jsonb_build_object('store', p_store, 'description', trim(p_description),
    'category', p_category, 'amount', p_amount, 'due', p_due, 'pay_now', p_pay_now, 'method', p_method, 'session', p_session)::text, 'UTF8'), 'sha256'), 'hex');
  idem = private.begin_operation(p_store, 'create_expense', p_key, fingerprint);
  if idem is not null then return (idem->>'result_id')::uuid; end if;
  select id, payload_fingerprint into result, existing_fingerprint from public.payables where store_id = p_store and id = p_key;
  if found then
    if existing_fingerprint is distinct from fingerprint then raise exception 'idempotency_payload_mismatch'; end if;
    perform private.finish_operation(p_store, 'create_expense', p_key, result, null);
    return result;
  end if;
  if p_pay_now and p_method = 'cash' then perform private.lock_open_cash(p_store, p_session); end if;
  perform 1 from public.stores where id = p_store for update;
  insert into public.payables(id, store_id, description, category_id, original_cents, remaining_cents, due_on, payload_fingerprint)
  values (p_key, p_store, left(trim(p_description), 500), p_category, p_amount, p_amount, p_due, fingerprint)
  returning id into result;
  if p_pay_now then perform public.pay_payable(p_store, result, p_amount, p_method, p_session, p_key); end if;
  insert into public.audit_logs(store_id, actor_user_id, action, entity_table, entity_id)
  values (p_store, auth.uid(), 'create_expense', 'payables', result);
  perform private.finish_operation(p_store, 'create_expense', p_key, result, null);
  return result;
end $$;

create or replace function public.receive_goods(
  p_store uuid, p_supplier uuid, p_items jsonb, p_key uuid, p_due date,
  p_pay_now boolean default false, p_method text default 'pix', p_session uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  result uuid; item jsonb; product_row public.products%rowtype; lot_row public.inventory_lots%rowtype;
  quantity numeric; current_quantity numeric; total bigint := 0; cost bigint; item_id uuid; lot_id uuid; payable_id uuid;
  fingerprint text; existing_fingerprint text; idem jsonb;
begin
  perform private.assert_member(p_store);
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 200 or p_key is null then
    raise exception 'invalid_receipt';
  end if;
  if p_pay_now and (p_method is null or p_method not in ('cash', 'pix', 'debit_card', 'credit_card', 'transfer')) then raise exception 'invalid_payment_method'; end if;
  fingerprint = encode(extensions.digest(convert_to(jsonb_build_object('store', p_store, 'supplier', p_supplier, 'items', p_items,
    'due', p_due, 'pay_now', p_pay_now, 'method', p_method, 'session', p_session)::text, 'UTF8'), 'sha256'), 'hex');
  idem = private.begin_operation(p_store, 'receive_goods', p_key, fingerprint);
  if idem is not null then return (idem->>'result_id')::uuid; end if;
  select id, payload_fingerprint into result, existing_fingerprint from public.goods_receipts where store_id = p_store and idempotency_key = p_key;
  if found then
    if existing_fingerprint is distinct from fingerprint then raise exception 'idempotency_payload_mismatch'; end if;
    perform private.finish_operation(p_store, 'receive_goods', p_key, result, null);
    return result;
  end if;
  if p_pay_now and p_method = 'cash' then perform private.lock_open_cash(p_store, p_session); end if;
  perform 1 from public.stores where id = p_store for update;
  perform id from public.products where store_id = p_store
    and id in (select (value->>'product_id')::uuid from jsonb_array_elements(p_items)) order by id for update;
  insert into public.goods_receipts(store_id, supplier_id, total_cents, idempotency_key, payload_fingerprint)
  values (p_store, p_supplier, 0, p_key, fingerprint) returning id into result;
  for item in select value from jsonb_array_elements(p_items) loop
    select * into strict product_row from public.products
    where store_id = p_store and id = (item->>'product_id')::uuid and archived_at is null;
    quantity = (item->>'packages')::numeric * (item->>'conversion_factor')::numeric;
    cost = (item->>'total_cost_cents')::bigint;
    if quantity is null or quantity <= 0 or round(quantity, product_row.unit_precision) <> quantity
      or cost is null or cost < 0 then raise exception 'invalid_receipt_item'; end if;
    lot_id = null;
    if product_row.track_lots then
      if coalesce(length(trim(item->>'lot_code')), 0) not between 1 and 120 then raise exception 'lot_required'; end if;
      insert into public.inventory_lots(store_id, product_id, code, expires_on)
      values (p_store, product_row.id, trim(item->>'lot_code'), (item->>'expires_on')::date)
      on conflict (store_id, product_id, code) do nothing;
      select * into strict lot_row from public.inventory_lots where store_id = p_store and product_id = product_row.id and code = trim(item->>'lot_code') for update;
      if lot_row.expires_on is distinct from (item->>'expires_on')::date then raise exception 'lot_expiration_mismatch'; end if;
      lot_id = lot_row.id;
    end if;
    select coalesce((select quantity from public.inventory_balances where store_id = p_store and product_id = product_row.id), 0) into current_quantity;
    update public.products set average_cost_cents = case when current_quantity + quantity = 0 then average_cost_cents
      else round((current_quantity * average_cost_cents + cost) / (current_quantity + quantity)) end
      where store_id = p_store and id = product_row.id;
    insert into public.goods_receipt_items(store_id, receipt_id, product_id, lot_id, packages, conversion_factor, base_quantity, total_cost_cents)
    values (p_store, result, product_row.id, lot_id, (item->>'packages')::numeric, (item->>'conversion_factor')::numeric, quantity, cost)
    returning id into item_id;
    insert into public.inventory_movements(store_id, product_id, lot_id, quantity_delta, kind, reason, receipt_item_id,
      idempotency_key, payload_fingerprint)
    values (p_store, product_row.id, lot_id, quantity, 'receipt', 'Recebimento de mercadoria', item_id, extensions.gen_random_uuid(), fingerprint);
    total = total + cost;
  end loop;
  if total > 0 then
    if p_due is null then raise exception 'due_date_required'; end if;
    insert into public.payables(store_id, supplier_id, receipt_id, description, original_cents, remaining_cents, due_on, payload_fingerprint)
    values (p_store, p_supplier, result, 'Recebimento de mercadoria', total, total, p_due, fingerprint) returning id into payable_id;
    if p_pay_now then perform public.pay_payable(p_store, payable_id, total, p_method, p_session, p_key); end if;
  end if;
  update public.goods_receipts set total_cents = total where store_id = p_store and id = result;
  insert into public.audit_logs(store_id, actor_user_id, action, entity_table, entity_id)
  values (p_store, auth.uid(), 'receive_goods', 'goods_receipts', result);
  perform private.finish_operation(p_store, 'receive_goods', p_key, result, null);
  return result;
end $$;

revoke all on function public.open_cash(uuid, bigint, jsonb),
  public.open_cash(uuid, bigint, jsonb, uuid), public.move_cash(uuid, uuid, text, bigint, text, uuid),
  public.pay_payable(uuid, uuid, bigint, text, uuid, uuid),
  public.create_expense(uuid, text, uuid, bigint, date, uuid, boolean, text, uuid),
  public.receive_goods(uuid, uuid, jsonb, uuid, date, boolean, text, uuid) from public, anon;
revoke all on function public.open_cash(uuid, bigint, jsonb) from authenticated;
grant execute on function public.open_cash(uuid, bigint, jsonb, uuid), public.move_cash(uuid, uuid, text, bigint, text, uuid),
  public.pay_payable(uuid, uuid, bigint, text, uuid, uuid),
  public.create_expense(uuid, text, uuid, bigint, date, uuid, boolean, text, uuid),
  public.receive_goods(uuid, uuid, jsonb, uuid, date, boolean, text, uuid) to authenticated;

commit;
