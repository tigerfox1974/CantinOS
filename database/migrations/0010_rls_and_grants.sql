-- =====================================================================
-- CANTINOS — 0010 RLS, tablo yetkileri ve RPC grant'leri
-- İlke: tablolara doğrudan erişim YOK; yalnız doğrulanmış RPC'ler.
-- =====================================================================

do $$
declare
  t text;
  tables text[] := array[
    'products', 'categories', 'delivery_slots', 'orders', 'order_items',
    'payments', 'order_cancellations', 'order_problems', 'order_events',
    'staff_accounts', 'staff_sessions', 'cash_closings', 'system_settings'
  ];
begin
  foreach t in array tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public', t);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on table public.%I from anon', t);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke all on table public.%I from authenticated', t);
    end if;
  end loop;

  execute 'revoke all on all sequences in schema public from public';
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all sequences in schema public from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on all sequences in schema public from authenticated';
  end if;
end $$;

-- Tüm public fonksiyonlardan varsayılan EXECUTE yetkisini kaldır.
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
  loop
    execute format('revoke all on function %s from public', r.sig);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on function %s from anon', r.sig);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke all on function %s from authenticated', r.sig);
    end if;
  end loop;
end $$;

-- Yalnız uygulamanın ihtiyaç duyduğu RPC'ler anon rolüne açılır.
-- Personel RPC'leri kendi içinde private.require_staff ile oturum doğrular.
do $$
declare
  f text;
  sigs text[] := array[
    'public.get_public_menu()',
    'public.get_public_delivery_slots()',
    'public.create_online_order(text,text,jsonb,text,jsonb)',
    'public.track_order(bigint,text)',
    'public.public_display_orders()',
    'public.staff_login(text,text)',
    'public.staff_logout(text)',
    'public.staff_me(text)',
    'public.staff_orders(text,text,text)',
    'public.staff_create_cashier_order(text,jsonb,text,numeric,text,text)',
    'public.staff_set_order_status(text,uuid,text)',
    'public.staff_take_payment(text,uuid,text,numeric,text)',
    'public.staff_refund_order(text,uuid,text,numeric,text)',
    'public.staff_cancel_order(text,uuid,text)',
    'public.staff_adjust_order(text,uuid,jsonb,text)',
    'public.staff_report_problem(text,uuid,text,text)',
    'public.staff_mark_informed(text,uuid)',
    'public.staff_clear_problem(text,uuid)',
    'public.staff_set_priority_override(text,uuid,boolean,text)',
    'public.staff_toggle_online_ordering(text,boolean)',
    'public.staff_set_product_availability(text,uuid,text,text,boolean)',
    'public.staff_save_product(text,jsonb)',
    'public.staff_manage_category(text,text,jsonb)',
    'public.staff_manage_delivery_slot(text,text,jsonb)',
    'public.staff_daily_summary(text,date)',
    'public.staff_close_cash_day(text,date,numeric,text)',
    'public.staff_analytics_report(text,jsonb)',
    'public.staff_list_cash_closings(text,integer)',
    'public.staff_get_settings(text)',
    'public.staff_set_kitchen_thresholds(text,integer,integer)',
    'public.staff_categories_admin(text)',
    'public.staff_products_admin(text)',
    'public.staff_delivery_slots_admin(text)'
  ];
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    foreach f in array sigs loop
      execute format('grant execute on function %s to anon', f);
    end loop;
  end if;
end $$;

comment on schema private is 'Uygulama içi yardımcı fonksiyonlar; PostgREST tarafından yayınlanmaz.';
comment on table public.orders is 'Sipariş başlığı. tracking_token yalnız takip bağlantısıyla paylaşılır.';
comment on table public.order_items is 'Ürün adı, kategori adı ve birim fiyat sipariş anında kopyalanır.';
comment on table public.payments is 'Değiştirilemez ödeme ve iade kayıtları.';
comment on table public.cash_closings is 'Değiştirilemez gün sonu kasa kapanış kayıtları.';
