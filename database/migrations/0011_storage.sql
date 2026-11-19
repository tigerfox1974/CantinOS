-- =====================================================================
-- CANTINOS — 0011 Ürün görseli Storage bucket'ı
-- Supabase Storage yoksa (düz PostgreSQL) sessizce atlanır.
-- =====================================================================

do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values (
      'product-images',
      'product-images',
      true,
      3145728,
      array['image/png', 'image/jpeg']
    )
    on conflict (id) do update
      set public = true,
          file_size_limit = 3145728,
          allowed_mime_types = array['image/png', 'image/jpeg'];
  end if;

  if to_regclass('storage.objects') is not null then
    if not exists (
      select 1 from pg_policies
      where schemaname = 'storage' and tablename = 'objects'
        and policyname = 'product_images_public_read'
    ) then
      execute $policy$
        create policy product_images_public_read
          on storage.objects
          for select
          using (bucket_id = 'product-images')
      $policy$;
    end if;
  end if;
end $$;
