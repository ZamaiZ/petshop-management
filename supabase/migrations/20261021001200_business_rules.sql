begin;

-- Reject legacy fractional quantities for units that become integer-only.
-- This keeps historical stock and ledger data intact instead of rounding it.
do $body$
declare invalid_products text;
begin
  select string_agg(format('%s (%s)', candidate.name, candidate.id), ', ')
    into invalid_products
  from (
    select p.name, p.id
    from public.products p
    where (
      p.unit not in ('kg', 'L')
      and (
        p.minimum_stock <> trunc(p.minimum_stock)
        or exists (select 1 from public.product_packagings x where x.store_id = p.store_id and x.product_id = p.id and x.base_quantity <> trunc(x.base_quantity))
        or exists (select 1 from public.inventory_balances x where x.store_id = p.store_id and x.product_id = p.id and x.quantity <> trunc(x.quantity))
        or exists (select 1 from public.inventory_lots x where x.store_id = p.store_id and x.product_id = p.id and x.quantity <> trunc(x.quantity))
        or exists (select 1 from public.inventory_movements x where x.store_id = p.store_id and x.product_id = p.id and x.quantity_delta <> trunc(x.quantity_delta))
        or exists (select 1 from public.sale_items x where x.store_id = p.store_id and x.product_id = p.id and x.quantity <> trunc(x.quantity))
        or exists (select 1 from public.sale_return_items x join public.sale_items si on si.store_id = x.store_id and si.id = x.sale_item_id where x.store_id = p.store_id and si.product_id = p.id and x.quantity <> trunc(x.quantity))
        or exists (select 1 from public.goods_receipt_items x where x.store_id = p.store_id and x.product_id = p.id and (x.conversion_factor <> trunc(x.conversion_factor) or x.base_quantity <> trunc(x.base_quantity)))
        or exists (select 1 from public.inventory_count_items x where x.store_id = p.store_id and x.product_id = p.id and (x.expected_quantity <> trunc(x.expected_quantity) or x.counted_quantity <> trunc(x.counted_quantity)))
      )
    ) or exists (select 1 from public.goods_receipt_items x where x.store_id = p.store_id and x.product_id = p.id and x.packages <> trunc(x.packages))
    order by p.name
    limit 20
  ) candidate;

  if invalid_products is not null then
    raise exception 'legacy_unit_precision_requires_review: %', invalid_products using errcode = '23514';
  end if;
end
$body$;

create or replace function private.quantity_precision(p_unit text)
returns smallint
language sql
immutable
set search_path = ''
as $$
  select case when p_unit in ('kg', 'L') then 3::smallint else 0::smallint end
$$;
revoke all on function private.quantity_precision(text) from public, anon, authenticated;

create or replace function private.protect_product_unit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.unit_precision := private.quantity_precision(new.unit);
  if round(new.minimum_stock, new.unit_precision) <> new.minimum_stock then
    raise exception 'invalid_quantity_precision' using errcode = '23514';
  end if;
  if exists (select 1 from public.product_packagings where store_id = new.store_id and product_id = new.id and round(base_quantity, new.unit_precision) <> base_quantity) then
    raise exception 'invalid_quantity_precision' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE'
    and new.unit is distinct from old.unit
    and exists (select 1 from public.inventory_movements where store_id = old.store_id and product_id = old.id)
  then
    raise exception 'unit_has_movements' using errcode = '23514';
  end if;
  return new;
end
$$;
revoke all on function private.protect_product_unit() from public, anon, authenticated;
drop trigger if exists protect_product_unit on public.products;
create trigger protect_product_unit before insert or update on public.products for each row execute function private.protect_product_unit();

create or replace function private.protect_packaging_precision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare precision_digits smallint;
begin
  select p.unit_precision into strict precision_digits
  from public.products p
  where p.store_id = new.store_id and p.id = new.product_id;
  if round(new.base_quantity, precision_digits) <> new.base_quantity then
    raise exception 'invalid_quantity_precision' using errcode = '23514';
  end if;
  return new;
end
$$;
revoke all on function private.protect_packaging_precision() from public, anon, authenticated;
drop trigger if exists protect_packaging_precision on public.product_packagings;
create trigger protect_packaging_precision before insert or update on public.product_packagings for each row execute function private.protect_packaging_precision();

create or replace function private.protect_receipt_precision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare precision_digits smallint;
begin
  select p.unit_precision into strict precision_digits
  from public.products p
  where p.store_id = new.store_id and p.id = new.product_id;
  if new.packages <> trunc(new.packages)
    or round(new.conversion_factor, precision_digits) <> new.conversion_factor
    or round(new.base_quantity, precision_digits) <> new.base_quantity
  then
    raise exception 'invalid_quantity_precision' using errcode = '23514';
  end if;
  return new;
end
$$;
revoke all on function private.protect_receipt_precision() from public, anon, authenticated;
drop trigger if exists protect_receipt_precision on public.goods_receipt_items;
create trigger protect_receipt_precision before insert or update on public.goods_receipt_items for each row execute function private.protect_receipt_precision();

update public.products
set unit_precision = private.quantity_precision(unit)
where unit_precision is distinct from private.quantity_precision(unit);

create or replace function private.force_store_timezone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.timezone := 'America/Sao_Paulo';
  return new;
end
$$;
revoke all on function private.force_store_timezone() from public, anon, authenticated;
drop trigger if exists force_store_timezone on public.stores;
create trigger force_store_timezone before insert or update on public.stores for each row execute function private.force_store_timezone();

update public.stores
set timezone = 'America/Sao_Paulo'
where timezone is distinct from 'America/Sao_Paulo';

commit;
