begin;
create or replace function private.is_store_member(p_store_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.store_memberships m where m.store_id=p_store_id and m.user_id=(select auth.uid()) and m.active) $$;
create or replace function private.is_store_owner(p_store_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.store_memberships m where m.store_id=p_store_id and m.user_id=(select auth.uid()) and m.active and m.role='owner') $$;
revoke all on function private.is_store_member(uuid),private.is_store_owner(uuid) from public,anon;
grant usage on schema private to authenticated;
grant execute on function private.is_store_member(uuid),private.is_store_owner(uuid) to authenticated;
create or replace function private.touch_updated_at() returns trigger language plpgsql set search_path='' as $$ begin new.updated_at=now(); return new; end $$;
revoke all on function private.touch_updated_at() from public,anon,authenticated;
-- Only explicitly listed application tables are affected; never managed Auth/Storage tables.
do $body$
declare t text; exposed_tables text[] := array[
 'stores','store_memberships','user_preferences','categories','suppliers','customers','customer_addresses','pets','products','product_packagings','inventory_balances','inventory_lots','services','cash_sessions','sales','sale_items','payments','receivables','receivable_payments','expense_categories','goods_receipts','goods_receipt_items','payables','payable_payments','cash_movements','cash_counts','inventory_counts','inventory_count_items','sale_returns','sale_return_items','inventory_movements','appointments','deliveries','delivery_events','audit_logs'];
begin
 foreach t in array exposed_tables loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on table public.%I from public,anon,authenticated',t);
  execute format('grant select on table public.%I to authenticated',t);
  execute format('grant all on table public.%I to service_role',t);
  execute format('create trigger touch_updated_at before update on public.%I for each row execute function private.touch_updated_at()',t);
  if t not in ('stores','user_preferences') then
   execute format('create policy tenant_read on public.%I for select to authenticated using (private.is_store_member(store_id))',t);
   execute format('create index %I on public.%I(store_id)',t||'_tenant_idx',t);
  end if;
  if not exists(select 1 from pg_publication where pubname='supabase_realtime') then
   create publication supabase_realtime;
  end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
   execute format('alter publication supabase_realtime add table public.%I',t);
  end if;
 end loop;
end $body$;
create policy stores_read on public.stores for select to authenticated using(private.is_store_member(id));
create policy stores_update on public.stores for update to authenticated using(private.is_store_owner(id)) with check(private.is_store_owner(id));
-- A user must never reassign a tenant owner or change immutable identifiers.
grant update(name,phone,email,address,timezone,logo_path) on public.stores to authenticated;
create policy preferences_self_read on public.user_preferences for select to authenticated using(user_id=(select auth.uid()));
create policy preferences_self_insert on public.user_preferences for insert to authenticated with check(user_id=(select auth.uid()));
create policy preferences_self_update on public.user_preferences for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
grant insert(user_id,theme,sidebar_collapsed),update(theme,sidebar_collapsed) on public.user_preferences to authenticated;
-- Catalog changes only. Ledger, balances, payments, sales and statuses are RPC-only.
do $body$ declare t text; begin
 foreach t in array array['categories','suppliers','customers','customer_addresses','pets','products','product_packagings','services','expense_categories'] loop
  execute format('create policy tenant_insert on public.%I for insert to authenticated with check(private.is_store_member(store_id))',t);
  execute format('create policy tenant_update on public.%I for update to authenticated using(private.is_store_member(store_id)) with check(private.is_store_member(store_id))',t);
  execute format('grant insert,update on public.%I to authenticated',t);
 end loop;
end $body$;
-- Forbid tenant or PK reassignment even when a user belongs to two stores.
create or replace function private.immutable_tenant() returns trigger language plpgsql set search_path='' as $$
begin if new.store_id<>old.store_id or new.id<>old.id then raise exception 'immutable_identity' using errcode='23514'; end if; return new; end $$;
revoke all on function private.immutable_tenant() from public,anon,authenticated;
do $body$ declare t text; begin foreach t in array array['categories','suppliers','customers','customer_addresses','pets','products','product_packagings','services','expense_categories'] loop
 execute format('create trigger immutable_tenant before update on public.%I for each row execute function private.immutable_tenant()',t);
end loop; end $body$;
-- Prevent changing the unit once inventory has been posted.
create or replace function private.protect_product_unit() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if (new.unit<>old.unit or new.unit_precision<>old.unit_precision) and exists(select 1 from public.inventory_movements where store_id=old.store_id and product_id=old.id) then raise exception 'unit_has_movements'; end if;
 return new;
end $$;
revoke all on function private.protect_product_unit() from public,anon,authenticated;
create trigger protect_product_unit before update on public.products for each row execute function private.protect_product_unit();
-- Private Storage: only logo files. Supabase Auth manages its own internal tables.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('store-assets','store-assets',false,2097152,array['image/png','image/jpeg','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy petshop_assets_read on storage.objects for select to authenticated using(bucket_id='store-assets' and exists(select 1 from public.store_memberships m where m.user_id=(select auth.uid()) and m.active and m.store_id::text=(storage.foldername(name))[1]));
create policy petshop_assets_insert on storage.objects for insert to authenticated with check(bucket_id='store-assets' and (storage.foldername(name))[2]='logos' and exists(select 1 from public.store_memberships m where m.user_id=(select auth.uid()) and m.active and m.role='owner' and m.store_id::text=(storage.foldername(name))[1]));
create policy petshop_assets_delete on storage.objects for delete to authenticated using(bucket_id='store-assets' and exists(select 1 from public.store_memberships m where m.user_id=(select auth.uid()) and m.active and m.role='owner' and m.store_id::text=(storage.foldername(name))[1]));
-- Use immutable UUID filenames: upload new, update stores.logo_path, remove old.
-- NO public bucket or UPDATE/upsert policy; no SVG accepted.
commit;
