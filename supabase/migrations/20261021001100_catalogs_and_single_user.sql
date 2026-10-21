begin;

alter table public.suppliers
  add column cnpj text,
  add constraint suppliers_cnpj_format check (cnpj is null or cnpj ~ '^[A-Z0-9]{12}[0-9]{2}$');
create unique index suppliers_store_cnpj_unique on public.suppliers(store_id, cnpj) where cnpj is not null;

alter table public.appointments add column service_name_snapshot text;
update public.appointments a
set service_name_snapshot = s.name
from public.services s
where s.store_id = a.store_id and s.id = a.service_id;
alter table public.appointments alter column service_name_snapshot set not null;

create or replace function private.snapshot_appointment_service_name()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    select s.name into new.service_name_snapshot
    from public.services s
    where s.store_id = new.store_id and s.id = new.service_id;
  elsif new.service_id is distinct from old.service_id or new.service_name_snapshot is null then
    select s.name into new.service_name_snapshot
    from public.services s
    where s.store_id = new.store_id and s.id = new.service_id;
  elsif new.service_name_snapshot is distinct from old.service_name_snapshot then
    new.service_name_snapshot := old.service_name_snapshot;
  end if;
  if new.service_name_snapshot is null then
    raise exception 'service_not_found' using errcode = '23503';
  end if;
  return new;
end $$;
revoke all on function private.snapshot_appointment_service_name() from public, anon, authenticated, service_role;
create trigger appointment_service_name_snapshot
before insert or update on public.appointments
for each row execute function private.snapshot_appointment_service_name();

drop policy if exists stores_update on public.stores;
create policy stores_update on public.stores for update to authenticated
  using (private.is_store_member(id)) with check (private.is_store_member(id));

drop policy if exists petshop_assets_insert on storage.objects;
drop policy if exists petshop_assets_delete on storage.objects;
create policy petshop_assets_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'store-assets' and (storage.foldername(name))[2] = 'logos'
    and exists (select 1 from public.store_memberships m where m.user_id = (select auth.uid())
      and m.active and m.store_id::text = (storage.foldername(name))[1]));
create policy petshop_assets_delete on storage.objects for delete to authenticated
  using (bucket_id = 'store-assets'
    and exists (select 1 from public.store_memberships m where m.user_id = (select auth.uid())
      and m.active and m.store_id::text = (storage.foldername(name))[1]));

create or replace function private.provision_store() returns trigger
language plpgsql security definer set search_path = '' as $$
declare tenant uuid;
begin
  insert into public.stores(name)
  values (new.raw_app_meta_data->>'registration_store_name')
  returning id into tenant;
  insert into public.store_memberships(store_id, user_id) values (tenant, new.id);
  insert into public.user_preferences(user_id) values (new.id);
  insert into public.expense_categories(store_id, name)
  values (tenant, 'Despesas da loja'), (tenant, 'Compra de mercadoria'), (tenant, 'Despesas fixas');
  return new;
end $$;
revoke all on function private.provision_store() from public, anon, authenticated, service_role;

drop function private.is_store_owner(uuid);
alter table public.store_memberships drop column role;
alter table public.stores drop column owner_user_id;

commit;
