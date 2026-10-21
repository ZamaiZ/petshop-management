begin;

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
        for lot_row in
          select lot.* from public.inventory_lots as lot
          where lot.store_id = p_store and lot.product_id = product_row.id and lot.quantity > 0
            and (lot.expires_on is null or lot.expires_on >= local_today)
          order by lot.expires_on nulls last, lot.created_at, lot.id for update
        loop
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

commit;
