-- Theme and sidebar state now belong to the browser, not user_preferences.
begin;

create or replace function private.provision_store() returns trigger
language plpgsql security definer set search_path = '' as $$
declare tenant uuid;
begin
  insert into public.stores(name)
  values (new.raw_app_meta_data->>'registration_store_name')
  returning id into tenant;
  insert into public.store_memberships(store_id, user_id) values (tenant, new.id);
  insert into public.expense_categories(store_id, name)
  values (tenant, 'Despesas da loja'), (tenant, 'Compra de mercadoria'), (tenant, 'Despesas fixas');
  return new;
end $$;

revoke all on function private.provision_store() from public, anon, authenticated, service_role;

do $body$
begin
  if exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'user_preferences'
  ) then
    execute 'alter publication supabase_realtime drop table public.user_preferences';
  end if;
end $body$;

drop table public.user_preferences;

commit;
