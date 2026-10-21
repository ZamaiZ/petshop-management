begin;

create or replace function public.convert_to_bulk(
  p_store uuid,
  p_source_product uuid,
  p_target_product uuid,
  p_source_quantity numeric,
  p_target_per_source numeric,
  p_reason text,
  p_key uuid
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  idem jsonb; fingerprint text; source_row public.products%rowtype; target_row public.products%rowtype;
  source_lot public.inventory_lots%rowtype; target_lot public.inventory_lots%rowtype;
  remaining_source numeric; move_source numeric; move_target numeric; target_quantity numeric;
  source_available numeric; source_cost_cents bigint; target_cost_cents bigint;
  timezone_name text; local_today date;
begin
  perform private.assert_member(p_store);
  if p_source_product is null or p_target_product is null or p_source_product = p_target_product
    or p_source_quantity is null or p_source_quantity <= 0 or scale(p_source_quantity) > 3
    or p_target_per_source is null or p_target_per_source <= 0 or scale(p_target_per_source) > 3
    or p_key is null or coalesce(length(trim(p_reason)), 0) not between 1 and 500 then
    raise exception 'invalid_bulk_conversion';
  end if;
  fingerprint = encode(extensions.digest(convert_to(jsonb_build_object(
    'store', p_store, 'source_product', p_source_product, 'target_product', p_target_product,
    'source_quantity', p_source_quantity, 'target_per_source', p_target_per_source, 'reason', trim(p_reason)
  )::text, 'UTF8'), 'sha256'), 'hex');
  idem = private.begin_operation(p_store, 'convert_to_bulk', p_key, fingerprint);
  if idem is not null then return (idem->>'result_id')::uuid; end if;

  perform id from public.products where store_id = p_store and id in (p_source_product, p_target_product) order by id for update;
  select * into strict source_row from public.products where store_id = p_store and id = p_source_product and archived_at is null;
  select * into strict target_row from public.products where store_id = p_store and id = p_target_product and archived_at is null;
  if source_row.track_lots is distinct from target_row.track_lots then raise exception 'bulk_lot_tracking_mismatch'; end if;
  if round(p_source_quantity, source_row.unit_precision) <> p_source_quantity
    or round(p_target_per_source, target_row.unit_precision) <> p_target_per_source
    or round(p_source_quantity * p_target_per_source, target_row.unit_precision) <> p_source_quantity * p_target_per_source then
    raise exception 'invalid_quantity_precision';
  end if;

  select timezone into strict timezone_name from public.stores where id = p_store and archived_at is null;
  local_today = (now() at time zone timezone_name)::date;
  target_quantity = coalesce((select quantity from public.inventory_balances where store_id = p_store and product_id = p_target_product), 0);
  source_cost_cents = round(p_source_quantity * source_row.average_cost_cents);

  if source_row.track_lots then
    select coalesce(sum(quantity), 0) into source_available from public.inventory_lots
      where store_id = p_store and product_id = p_source_product and quantity > 0
        and (expires_on is null or expires_on >= local_today);
  else
    source_available = coalesce((select quantity from public.inventory_balances where store_id = p_store and product_id = p_source_product), 0);
  end if;
  if p_source_quantity > source_available then raise exception 'insufficient_stock'; end if;

  if source_row.track_lots then
    remaining_source = p_source_quantity;
    for source_lot in select * from public.inventory_lots
      where store_id = p_store and product_id = p_source_product and quantity > 0
        and (expires_on is null or expires_on >= local_today)
      order by expires_on nulls last, created_at, id for update
    loop
      move_source = least(source_lot.quantity, remaining_source);
      if move_source > 0 then
        insert into public.inventory_lots(store_id, product_id, code, expires_on)
        values (p_store, p_target_product, source_lot.code, source_lot.expires_on)
        on conflict (store_id, product_id, code) do nothing;
        select * into strict target_lot from public.inventory_lots
          where store_id = p_store and product_id = p_target_product and code = source_lot.code for update;
        if target_lot.expires_on is distinct from source_lot.expires_on then raise exception 'bulk_lot_expiration_mismatch'; end if;
        move_target = move_source * p_target_per_source;
        insert into public.inventory_movements(store_id, product_id, lot_id, quantity_delta, kind, reason, transfer_group, idempotency_key, payload_fingerprint)
        values (p_store, p_source_product, source_lot.id, -move_source, 'bulk_out', left(trim(p_reason), 500), p_key, extensions.gen_random_uuid(), fingerprint);
        insert into public.inventory_movements(store_id, product_id, lot_id, quantity_delta, kind, reason, transfer_group, idempotency_key, payload_fingerprint)
        values (p_store, p_target_product, target_lot.id, move_target, 'bulk_in', left(trim(p_reason), 500), p_key, extensions.gen_random_uuid(), fingerprint);
        remaining_source = remaining_source - move_source;
      end if;
      exit when remaining_source = 0;
    end loop;
    if remaining_source > 0 then raise exception 'insufficient_stock'; end if;
  else
    move_target = p_source_quantity * p_target_per_source;
    insert into public.inventory_movements(store_id, product_id, quantity_delta, kind, reason, transfer_group, idempotency_key, payload_fingerprint)
    values (p_store, p_source_product, -p_source_quantity, 'bulk_out', left(trim(p_reason), 500), p_key, extensions.gen_random_uuid(), fingerprint);
    insert into public.inventory_movements(store_id, product_id, quantity_delta, kind, reason, transfer_group, idempotency_key, payload_fingerprint)
    values (p_store, p_target_product, move_target, 'bulk_in', left(trim(p_reason), 500), p_key, extensions.gen_random_uuid(), fingerprint);
  end if;

  update public.products set average_cost_cents = case
    when target_quantity + (p_source_quantity * p_target_per_source) = 0 then average_cost_cents
    else round((target_quantity * average_cost_cents + source_cost_cents) / (target_quantity + (p_source_quantity * p_target_per_source)))::bigint
  end where store_id = p_store and id = p_target_product;
  insert into public.audit_logs(store_id, actor_user_id, action, entity_table, entity_id, details)
  values (p_store, auth.uid(), 'convert_to_bulk', 'inventory_movements', p_key,
    jsonb_build_object('source_product_id', p_source_product, 'target_product_id', p_target_product,
      'source_quantity', p_source_quantity, 'target_quantity', p_source_quantity * p_target_per_source,
      'reason', left(trim(p_reason), 500)));
  perform private.finish_operation(p_store, 'convert_to_bulk', p_key, p_key, null);
  return p_key;
end $$;

revoke all on function public.convert_to_bulk(uuid, uuid, uuid, numeric, numeric, text, uuid) from public, anon;
grant execute on function public.convert_to_bulk(uuid, uuid, uuid, numeric, numeric, text, uuid) to authenticated;

create or replace function public.archive_product(p_store uuid, p_product uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare product_row public.products%rowtype; current_quantity numeric;
begin
  perform private.assert_member(p_store);
  select * into strict product_row from public.products where store_id = p_store and id = p_product for update;
  if product_row.archived_at is not null then return p_product; end if;
  select coalesce((select quantity from public.inventory_balances where store_id = p_store and product_id = p_product), 0) into current_quantity;
  if current_quantity > 0 or exists(select 1 from public.inventory_lots where store_id = p_store and product_id = p_product and quantity > 0) then
    raise exception 'product_stock_not_empty';
  end if;
  update public.products set archived_at = now() where store_id = p_store and id = p_product;
  insert into public.audit_logs(store_id, actor_user_id, action, entity_table, entity_id)
  values (p_store, auth.uid(), 'archive_product', 'products', p_product);
  return p_product;
end $$;
revoke all on function public.archive_product(uuid, uuid) from public, anon;
grant execute on function public.archive_product(uuid, uuid) to authenticated;

commit;
