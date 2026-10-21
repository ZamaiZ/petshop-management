begin;

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
    select coalesce((select ib.quantity from public.inventory_balances as ib
      where ib.store_id = p_store and ib.product_id = product_row.id), 0) into current_quantity;
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

commit;
