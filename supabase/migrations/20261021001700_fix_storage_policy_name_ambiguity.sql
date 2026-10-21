begin;

-- Qualify storage.objects.name: stores also has a "name" column, so the
-- unqualified reference inside EXISTS resolves to stores.name.
drop policy if exists petshop_assets_read on storage.objects;
drop policy if exists petshop_assets_insert on storage.objects;
drop policy if exists petshop_assets_delete on storage.objects;

create policy petshop_assets_read on storage.objects for select to authenticated
  using (
    bucket_id = 'store-assets'
    and exists (
      select 1 from public.store_memberships m
      join public.stores s on s.id = m.store_id
      where m.user_id = (select auth.uid()) and m.active
        and s.platform_active and s.archived_at is null
        and m.store_id::text = (storage.foldername(storage.objects.name))[1]
    )
  );

create policy petshop_assets_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'store-assets'
    and (storage.foldername(storage.objects.name))[2] = 'logos'
    and exists (
      select 1 from public.store_memberships m
      join public.stores s on s.id = m.store_id
      where m.user_id = (select auth.uid()) and m.active
        and s.platform_active and s.archived_at is null
        and m.store_id::text = (storage.foldername(storage.objects.name))[1]
    )
  );

create policy petshop_assets_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'store-assets'
    and exists (
      select 1 from public.store_memberships m
      join public.stores s on s.id = m.store_id
      where m.user_id = (select auth.uid()) and m.active
        and s.platform_active and s.archived_at is null
        and m.store_id::text = (storage.foldername(storage.objects.name))[1]
    )
  );

commit;
