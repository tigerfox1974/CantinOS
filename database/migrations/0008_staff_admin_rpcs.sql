-- =====================================================================
-- CANTINOS — 0008 Yönetici tanım RPC'leri
-- =====================================================================

create or replace function public.staff_toggle_online_ordering(p_token text, p_enabled boolean)
returns boolean
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_staff public.staff_accounts := private.require_staff(p_token, array['MANAGER']);
begin
  insert into public.system_settings (key, value, updated_by_staff_id, updated_at)
  values ('online_ordering_enabled', case when coalesce(p_enabled, false) then 'true' else 'false' end, v_staff.id, now())
  on conflict (key) do update
    set value = excluded.value,
        updated_by_staff_id = excluded.updated_by_staff_id,
        updated_at = now();

  return coalesce(p_enabled, false);
end;
$$;

create or replace function public.staff_set_product_availability(
  p_token text,
  p_product_id uuid,
  p_status text,
  p_note text default null,
  p_note_public boolean default true
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_staff public.staff_accounts := private.require_staff(p_token, array['MANAGER']);
  v_status text := upper(coalesce(p_status, ''));
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_product public.products;
begin
  if v_status not in ('ACTIVE', 'CLOSED', 'ARCHIVED') then
    raise exception 'Geçersiz ürün durumu.';
  end if;

  select * into v_product from public.products where id = p_product_id for update;
  if v_product.id is null then
    raise exception 'Ürün bulunamadı.';
  end if;

  if v_status = 'CLOSED' and v_note is null then
    raise exception 'Ürünü kapatırken neden yazmak zorunludur.';
  end if;

  if v_note is not null and length(v_note) > 300 then
    raise exception 'Kapatma nedeni en fazla 300 karakter olabilir.';
  end if;

  update public.products
     set availability_status = v_status,
         availability_note = case when v_status = 'CLOSED' then v_note else null end,
         availability_note_public = case when v_status = 'CLOSED' then coalesce(p_note_public, true) else true end,
         availability_changed_at = now()
   where id = v_product.id;

  return true;
end;
$$;

create or replace function public.staff_save_product(p_token text, p_product jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_staff public.staff_accounts := private.require_staff(p_token, array['MANAGER']);
  v_id_text text := nullif(btrim(coalesce(p_product ->> 'id', '')), '');
  v_id uuid;
  v_name text := btrim(coalesce(p_product ->> 'name', ''));
  v_category_id uuid;
  v_price numeric;
  v_description text := nullif(btrim(coalesce(p_product ->> 'description', '')), '');
  v_image_url text := nullif(btrim(coalesce(p_product ->> 'imageUrl', '')), '');
  v_sort integer := coalesce((p_product ->> 'sortOrder')::integer, 0);
  v_status text := upper(coalesce(nullif(p_product ->> 'availabilityStatus', ''), 'ACTIVE'));
  v_note text := nullif(btrim(coalesce(p_product ->> 'availabilityNote', '')), '');
  v_note_public boolean := coalesce((p_product ->> 'availabilityNotePublic')::boolean, true);
  v_quick_modifiers text[] := coalesce((select array_agg(elem) from jsonb_array_elements_text(coalesce(p_product -> 'quickModifiers', '[]'::jsonb)) elem), '{}'::text[]);
  v_category public.categories;
begin
  if length(v_name) < 2 or length(v_name) > 120 then
    raise exception 'Ürün adı 2 ile 120 karakter arasında olmalıdır.';
  end if;

  if coalesce(p_product ->> 'categoryId', '') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    raise exception 'Kategori seçmelisiniz.';
  end if;
  v_category_id := (p_product ->> 'categoryId')::uuid;

  select * into v_category from public.categories where id = v_category_id;
  if v_category.id is null or v_category.is_archived then
    raise exception 'Seçilen kategori kullanılamıyor.';
  end if;

  begin
    v_price := round((p_product ->> 'price')::numeric, 2);
  exception when others then
    raise exception 'Ürün fiyatı geçersiz.';
  end;

  if v_price is null or v_price < 0 then
    raise exception 'Ürün fiyatı negatif olamaz.';
  end if;

  if v_description is not null and length(v_description) > 1000 then
    raise exception 'Ürün açıklaması en fazla 1000 karakter olabilir.';
  end if;

  if v_image_url is not null and length(v_image_url) > 1000 then
    raise exception 'Görsel adresi geçersiz.';
  end if;

  if v_status not in ('ACTIVE', 'CLOSED', 'ARCHIVED') then
    raise exception 'Geçersiz ürün durumu.';
  end if;

  if v_id_text is not null then
    if v_id_text !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
      raise exception 'Geçersiz ürün kimliği.';
    end if;
    v_id := v_id_text::uuid;

    if not exists (select 1 from public.products where id = v_id) then
      raise exception 'Ürün bulunamadı.';
    end if;

    if v_status = 'CLOSED' and v_note is null then
      v_note := (select availability_note from public.products where id = v_id);
    end if;
    if v_status = 'CLOSED' and v_note is null then
      raise exception 'Ürünü kapatırken neden yazmak zorunludur.';
    end if;

    update public.products
       set category_id = v_category_id,
           name = v_name,
           description = v_description,
           price = v_price,
           image_url = v_image_url,
           sort_order = v_sort,
           availability_status = v_status,
           quick_modifiers = case when p_product ? 'quickModifiers' then v_quick_modifiers else quick_modifiers end,
           availability_note = case when v_status = 'CLOSED' then v_note else null end,
           availability_note_public = case when v_status = 'CLOSED' then v_note_public else true end,
           availability_changed_at = case when availability_status <> v_status then now() else availability_changed_at end
     where id = v_id;

    return jsonb_build_object('id', v_id);
  end if;

  if v_status = 'CLOSED' and v_note is null then
    raise exception 'Ürünü kapatırken neden yazmak zorunludur.';
  end if;

  insert into public.products (
    category_id, name, description, price, image_url, sort_order,
    availability_status, availability_note, availability_note_public, availability_changed_at,
    quick_modifiers
  ) values (
    v_category_id, v_name, v_description, v_price, v_image_url, v_sort,
    v_status, case when v_status = 'CLOSED' then v_note else null end,
    case when v_status = 'CLOSED' then v_note_public else true end,
    now(),
    v_quick_modifiers
  )
  returning id into v_id;

  return jsonb_build_object('id', v_id);
end;
$$;

create or replace function public.staff_manage_category(
  p_token text,
  p_action text,
  p_category jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_staff public.staff_accounts := private.require_staff(p_token, array['MANAGER']);
  v_action text := upper(coalesce(p_action, ''));
  v_id_text text := nullif(btrim(coalesce(p_category ->> 'id', '')), '');
  v_id uuid;
  v_name text := btrim(coalesce(p_category ->> 'name', ''));
  v_icon text := nullif(btrim(coalesce(p_category ->> 'icon', '')), '');
  v_sort integer;
begin
  if v_action not in ('CREATE', 'UPDATE', 'ARCHIVE', 'REORDER') then
    raise exception 'Geçersiz kategori işlemi.';
  end if;

  if v_action = 'CREATE' then
    if length(v_name) < 2 or length(v_name) > 80 then
      raise exception 'Kategori adı 2 ile 80 karakter arasında olmalıdır.';
    end if;
    v_sort := coalesce((p_category ->> 'sortOrder')::integer, (select coalesce(max(sort_order), 0) + 10 from public.categories));

    insert into public.categories (name, sort_order, icon) values (v_name, v_sort, v_icon)
    returning id into v_id;

    return jsonb_build_object('id', v_id);
  end if;

  if v_id_text is null or v_id_text !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    raise exception 'Kategori seçmelisiniz.';
  end if;
  v_id := v_id_text::uuid;

  if not exists (select 1 from public.categories where id = v_id) then
    raise exception 'Kategori bulunamadı.';
  end if;

  if v_action = 'ARCHIVE' then
    update public.categories set is_archived = true where id = v_id;
    return jsonb_build_object('id', v_id);
  end if;

  if v_action = 'REORDER' then
    v_sort := (p_category ->> 'sortOrder')::integer;
    if v_sort is null then
      raise exception 'Sıra değeri gereklidir.';
    end if;
    update public.categories set sort_order = v_sort where id = v_id;
    return jsonb_build_object('id', v_id);
  end if;

  if length(v_name) < 2 or length(v_name) > 80 then
    raise exception 'Kategori adı 2 ile 80 karakter arasında olmalıdır.';
  end if;

  update public.categories
     set name = v_name,
         sort_order = coalesce((p_category ->> 'sortOrder')::integer, sort_order),
         icon = case when p_category ? 'icon' then v_icon else icon end
   where id = v_id;

  return jsonb_build_object('id', v_id);
end;
$$;

create or replace function public.staff_manage_delivery_slot(
  p_token text,
  p_action text,
  p_slot jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_staff public.staff_accounts := private.require_staff(p_token, array['MANAGER']);
  v_action text := upper(coalesce(p_action, ''));
  v_id_text text := nullif(btrim(coalesce(p_slot ->> 'id', '')), '');
  v_id uuid;
  v_label text := btrim(coalesce(p_slot ->> 'label', ''));
  v_time time;
  v_sort integer;
  v_active boolean := coalesce((p_slot ->> 'active')::boolean, true);
begin
  if v_action not in ('CREATE', 'UPDATE', 'TOGGLE', 'REORDER') then
    raise exception 'Geçersiz teslim zamanı işlemi.';
  end if;

  if v_action = 'CREATE' then
    if length(v_label) < 2 or length(v_label) > 60 then
      raise exception 'Teslim etiketi 2 ile 60 karakter arasında olmalıdır.';
    end if;
    begin
      v_time := (p_slot ->> 'targetTime')::time;
    exception when others then
      raise exception 'Teslim saati geçersiz.';
    end;
    v_sort := coalesce((p_slot ->> 'sortOrder')::integer, (select coalesce(max(sort_order), 0) + 10 from public.delivery_slots));

    insert into public.delivery_slots (label, target_time, sort_order, active)
    values (v_label, v_time, v_sort, v_active)
    returning id into v_id;

    return jsonb_build_object('id', v_id);
  end if;

  if v_id_text is null or v_id_text !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    raise exception 'Teslim zamanı seçmelisiniz.';
  end if;
  v_id := v_id_text::uuid;

  if not exists (select 1 from public.delivery_slots where id = v_id) then
    raise exception 'Teslim zamanı bulunamadı.';
  end if;

  if v_action = 'TOGGLE' then
    update public.delivery_slots set active = v_active where id = v_id;
    return jsonb_build_object('id', v_id);
  end if;

  if v_action = 'REORDER' then
    v_sort := (p_slot ->> 'sortOrder')::integer;
    if v_sort is null then
      raise exception 'Sıra değeri gereklidir.';
    end if;
    update public.delivery_slots set sort_order = v_sort where id = v_id;
    return jsonb_build_object('id', v_id);
  end if;

  if length(v_label) < 2 or length(v_label) > 60 then
    raise exception 'Teslim etiketi 2 ile 60 karakter arasında olmalıdır.';
  end if;
  begin
    v_time := (p_slot ->> 'targetTime')::time;
  exception when others then
    raise exception 'Teslim saati geçersiz.';
  end;

  update public.delivery_slots
     set label = v_label,
         target_time = v_time,
         sort_order = coalesce((p_slot ->> 'sortOrder')::integer, sort_order),
         active = v_active
   where id = v_id;

  return jsonb_build_object('id', v_id);
end;
$$;

create or replace function public.staff_get_settings(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_staff public.staff_accounts := private.require_staff(p_token);
  v_warning integer := 5;
  v_late integer := 10;
  v_online boolean := false;
begin
  select coalesce(max(case when key = 'kitchen_warning_minutes' then value::integer end), 5),
         coalesce(max(case when key = 'kitchen_late_minutes' then value::integer end), 10),
         coalesce(bool_or(case when key = 'online_ordering_enabled' then value = 'true' end), false)
    into v_warning, v_late, v_online
    from public.system_settings;

  return jsonb_build_object(
    'kitchenWarningMinutes', v_warning,
    'kitchenLateMinutes', v_late,
    'onlineOrderingEnabled', v_online
  );
end;
$$;

create or replace function public.staff_set_kitchen_thresholds(
  p_token text,
  p_warning_minutes integer,
  p_late_minutes integer
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_staff public.staff_accounts := private.require_staff(p_token, array['MANAGER']);
begin
  if p_warning_minutes is null or p_warning_minutes < 1 or p_warning_minutes > 60 then
    raise exception 'Dikkat eşiği 1 ile 60 dakika arasında olmalıdır.';
  end if;
  if p_late_minutes is null or p_late_minutes < 1 or p_late_minutes > 120 then
    raise exception 'Gecikme eşiği 1 ile 120 dakika arasında olmalıdır.';
  end if;
  if p_late_minutes <= p_warning_minutes then
    raise exception 'Gecikme eşiği dikkat eşiğinden büyük olmalıdır.';
  end if;

  insert into public.system_settings (key, value, updated_by_staff_id, updated_at)
  values ('kitchen_warning_minutes', p_warning_minutes::text, v_staff.id, now())
  on conflict (key) do update
    set value = excluded.value, updated_by_staff_id = excluded.updated_by_staff_id, updated_at = now();

  insert into public.system_settings (key, value, updated_by_staff_id, updated_at)
  values ('kitchen_late_minutes', p_late_minutes::text, v_staff.id, now())
  on conflict (key) do update
    set value = excluded.value, updated_by_staff_id = excluded.updated_by_staff_id, updated_at = now();

  return true;
end;
$$;

create or replace function public.staff_categories_admin(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_staff public.staff_accounts := private.require_staff(p_token, array['MANAGER']);
  v_result jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'name', c.name,
    'sortOrder', c.sort_order,
    'isArchived', c.is_archived,
    'productCount', (select count(*) from public.products p where p.category_id = c.id and p.availability_status <> 'ARCHIVED')
  ) order by c.sort_order, c.name), '[]'::jsonb)
  into v_result
  from public.categories c;

  return v_result;
end;
$$;

create or replace function public.staff_products_admin(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_staff public.staff_accounts := private.require_staff(p_token, array['MANAGER']);
  v_result jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'categoryId', p.category_id,
    'categoryName', c.name,
    'name', p.name,
    'description', p.description,
    'price', p.price,
    'imageUrl', p.image_url,
    'sortOrder', p.sort_order,
    'availabilityStatus', p.availability_status,
    'availabilityNote', p.availability_note,
    'availabilityNotePublic', p.availability_note_public
  ) order by c.sort_order, p.sort_order, p.name), '[]'::jsonb)
  into v_result
  from public.products p
  join public.categories c on c.id = p.category_id;

  return v_result;
end;
$$;

create or replace function public.staff_delivery_slots_admin(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_staff public.staff_accounts := private.require_staff(p_token, array['MANAGER']);
  v_result jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id,
    'label', s.label,
    'targetTime', to_char(s.target_time, 'HH24:MI'),
    'sortOrder', s.sort_order,
    'active', s.active
  ) order by s.sort_order, s.label), '[]'::jsonb)
  into v_result
  from public.delivery_slots s;

  return v_result;
end;
$$;
