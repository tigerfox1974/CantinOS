-- =====================================================================
-- CANTINOS — SQL KABUL SENARYOLARI
-- Supabase SQL Editor'de veya psql ile çalıştırın.
-- Tüm işlemler tek transaction içindedir ve sonunda ROLLBACK yapar;
-- kalıcı veri bırakmaz. Demo seed gerekmez.
-- =====================================================================

set search_path = public, extensions;

begin;

do $$
declare
  v_cat uuid;
  v_p1 uuid;
  v_p2 uuid;
  v_manager text;
  v_kitchen text;
  v_cashier text;
  v_menu jsonb;
  v_order jsonb;
  v_order_id uuid;
  v_order_no bigint;
  v_total numeric;
  v_track jsonb;
  v_list jsonb;
  v_text text;
  v_before numeric;
  v_after numeric;
  v_pay jsonb;
  v_cash jsonb;
  v_summary jsonb;
  v_close jsonb;
  v_row record;
begin
  ------------------------------------------------------------------
  -- 1) Personel hesapları ve giriş
  ------------------------------------------------------------------
  insert into public.staff_accounts (email, display_name, role, password_hash) values
    ('acc-manager@test.local', 'Test Yönetici', 'MANAGER', crypt('Test123!', gen_salt('bf', 6))),
    ('acc-kitchen@test.local', 'Test Mutfak', 'KITCHEN', crypt('Test123!', gen_salt('bf', 6))),
    ('acc-cashier@test.local', 'Test Kasa', 'CASHIER', crypt('Test123!', gen_salt('bf', 6)));

  v_manager := (public.staff_login('acc-manager@test.local', 'Test123!')) ->> 'token';
  v_kitchen := (public.staff_login('acc-kitchen@test.local', 'Test123!')) ->> 'token';
  v_cashier := (public.staff_login('acc-cashier@test.local', 'Test123!')) ->> 'token';

  if v_manager is null or v_kitchen is null or v_cashier is null then
    raise exception 'KABUL BAŞARISIZ: personel girişi token üretmedi.';
  end if;

  begin
    perform public.staff_login('acc-manager@test.local', 'yanlis-parola');
    raise exception 'KABUL BAŞARISIZ: yanlış parola kabul edildi.';
  exception
    when others then
      if sqlerrm like 'KABUL BAŞARISIZ%' then
        raise;
      end if;
  end;

  ------------------------------------------------------------------
  -- 2) Katalog ve ürün kapatma
  ------------------------------------------------------------------
  perform public.staff_manage_category(v_manager, 'CREATE',
    jsonb_build_object('name', 'Kabul Kategorisi', 'sortOrder', 900));
  select id into v_cat from public.categories where name = 'Kabul Kategorisi';

  perform public.staff_save_product(v_manager, jsonb_build_object(
    'categoryId', v_cat, 'name', 'Kabul Tost', 'description', 'Test ürünü',
    'price', 40, 'sortOrder', 10));
  perform public.staff_save_product(v_manager, jsonb_build_object(
    'categoryId', v_cat, 'name', 'Kabul Ayran', 'price', 15, 'sortOrder', 20));

  select id into v_p1 from public.products where name = 'Kabul Tost';
  select id into v_p2 from public.products where name = 'Kabul Ayran';

  perform public.staff_toggle_online_ordering(v_manager, true);

  v_menu := public.get_public_menu();
  if not exists (
    select 1 from jsonb_array_elements(v_menu -> 'categories') c,
                  jsonb_array_elements(c -> 'products') p
     where p ->> 'id' = v_p1::text
  ) then
    raise exception 'KABUL BAŞARISIZ: ürün müşteri menüsünde görünmüyor.';
  end if;

  ------------------------------------------------------------------
  -- 3) Online sipariş, takip güvenliği ve toplam hesabı
  ------------------------------------------------------------------
  v_order := public.create_online_order(
    'Kabul Müşteri', '05550000000', jsonb_build_object('type', 'NOW'), 'Az kaşar',
    jsonb_build_array(
      jsonb_build_object('productId', v_p1, 'quantity', 2, 'lineNote', 'İyi kızarsın'),
      jsonb_build_object('productId', v_p2, 'quantity', 1)
    )
  );

  v_order_id := (v_order ->> 'orderId')::uuid;
  v_order_no := (v_order ->> 'orderNumber')::bigint;
  v_total := (v_order ->> 'totalAmount')::numeric;

  if v_order_no < 1001 then
    raise exception 'KABUL BAŞARISIZ: sipariş numarası 1001 altında (%).', v_order_no;
  end if;

  if v_total <> 95 then
    raise exception 'KABUL BAŞARISIZ: sunucu toplamı yanlış (%).', v_total;
  end if;

  v_track := public.track_order(v_order_no, repeat('a', 48));
  if v_track is not null then
    raise exception 'KABUL BAŞARISIZ: yanlış takip anahtarı veri döndürdü.';
  end if;

  v_track := public.track_order(v_order_no, v_order ->> 'trackingToken');
  if v_track is null or (v_track ->> 'expired')::boolean then
    raise exception 'KABUL BAŞARISIZ: doğru takip anahtarı siparişi açmadı.';
  end if;

  if (v_track::text) like '%customerName%' or (v_track::text) like '%customerPhone%' then
    raise exception 'KABUL BAŞARISIZ: takip ekranı müşteri bilgisi içeriyor.';
  end if;

  ------------------------------------------------------------------
  -- 4) Mutfak görünürlüğü ve yetki sınırı
  ------------------------------------------------------------------
  v_list := public.staff_orders(v_kitchen);
  v_text := v_list::text;

  if v_text not like '%' || v_order_no::text || '%' then
    raise exception 'KABUL BAŞARISIZ: mutfak siparişi görmüyor.';
  end if;

  if v_text like '%customerName%' or v_text like '%customerPhone%'
     or v_text like '%unitPrice%' or v_text like '%paymentStatus%' then
    raise exception 'KABUL BAŞARISIZ: mutfak müşteri/fiyat/ödeme bilgisi görüyor.';
  end if;

  begin
    perform public.staff_cancel_order(v_kitchen, v_order_id, 'Mutfak denemesi');
    raise exception 'KABUL BAŞARISIZ: mutfak siparişi iptal edebildi.';
  exception
    when others then
      if sqlerrm like 'KABUL BAŞARISIZ%' then
        raise;
      end if;
  end;

  ------------------------------------------------------------------
  -- 5) Ödeme olmadan teslim engeli, ödeme ve teslim
  ------------------------------------------------------------------
  perform public.staff_set_order_status(v_kitchen, v_order_id, 'PREPARING');
  perform public.staff_set_order_status(v_kitchen, v_order_id, 'READY');

  begin
    perform public.staff_set_order_status(v_cashier, v_order_id, 'DELIVERED');
    raise exception 'KABUL BAŞARISIZ: ödemesiz online sipariş teslim edildi.';
  exception
    when others then
      if sqlerrm like 'KABUL BAŞARISIZ%' then
        raise;
      end if;
  end;

  v_pay := public.staff_take_payment(v_cashier, v_order_id, 'CASH', v_total + 5, null);
  if (v_pay ->> 'changeAmount')::numeric <> 5 then
    raise exception 'KABUL BAŞARISIZ: nakit para üstü yanlış.';
  end if;

  perform public.staff_set_order_status(v_cashier, v_order_id, 'DELIVERED');

  v_list := public.staff_orders(v_cashier);
  if (v_list::text) like '%' || v_order_no::text || '%' then
    raise exception 'KABUL BAŞARISIZ: kasa teslim edilmiş siparişi görüyor.';
  end if;

  v_list := public.staff_orders(v_manager, 'ALL');
  if (v_list::text) not like '%' || v_order_no::text || '%' then
    raise exception 'KABUL BAŞARISIZ: yönetici sipariş geçmişini göremiyor.';
  end if;

  ------------------------------------------------------------------
  -- 6) Ürün fiyatı değişse de sipariş satırı değişmez
  ------------------------------------------------------------------
  select unit_price_snapshot into v_before
    from public.order_items where order_id = v_order_id limit 1;

  perform public.staff_save_product(v_manager, jsonb_build_object(
    'id', v_p1, 'categoryId', v_cat, 'name', 'Kabul Tost',
    'description', 'Test ürünü', 'price', 55, 'sortOrder', 10));

  select unit_price_snapshot into v_after
    from public.order_items where order_id = v_order_id limit 1;

  if v_before <> v_after then
    raise exception 'KABUL BAŞARISIZ: ürün fiyatı değişince eski sipariş satırı değişti.';
  end if;

  ------------------------------------------------------------------
  -- 7) Kasadan sipariş, iptal ve iade akışı
  ------------------------------------------------------------------
  v_cash := public.staff_create_cashier_order(
    v_cashier, jsonb_build_array(jsonb_build_object('productId', v_p2, 'quantity', 2)),
    'CASH', 100, 'Kasa Müşteri', null);

  if (v_cash ->> 'changeAmount')::numeric <> 70 then
    raise exception 'KABUL BAŞARISIZ: kasa siparişi para üstü yanlış (%).', v_cash ->> 'changeAmount';
  end if;

  select id into v_order_id from public.orders where order_number = (v_cash ->> 'orderNumber')::bigint;

  select * into v_row from public.orders where id = v_order_id;
  if v_row.payment_status <> 'PAID' or v_row.order_status <> 'NEW' then
    raise exception 'KABUL BAŞARISIZ: kasa siparişi PAID/NEW oluşmadı.';
  end if;

  perform public.staff_cancel_order(v_manager, v_order_id, 'Müşteri vazgeçti');
  select * into v_row from public.orders where id = v_order_id;
  if v_row.order_status <> 'CANCELLED' or v_row.payment_status <> 'REFUND_PENDING' then
    raise exception 'KABUL BAŞARISIZ: ödenmiş iptal iade beklenmiyor.';
  end if;

  perform public.staff_refund_order(
    v_manager, v_order_id, 'CASH', (v_cash ->> 'totalAmount')::numeric, 'İade tamamlandı');
  select * into v_row from public.orders where id = v_order_id;
  if v_row.payment_status <> 'REFUNDED' then
    raise exception 'KABUL BAŞARISIZ: tam iade sonrası REFUNDED olmadı.';
  end if;

  ------------------------------------------------------------------
  -- 8) Ürün geçici kapatma ve müşteriye görünürlük
  ------------------------------------------------------------------
  perform public.staff_set_product_availability(v_manager, v_p2, 'CLOSED', 'Fırın arızalı', false);
  if not exists (
    select 1
      from jsonb_array_elements(public.get_public_menu() -> 'categories') c,
           jsonb_array_elements(c -> 'products') p
     where p ->> 'id' = v_p2::text
       and p ->> 'availabilityStatus' = 'CLOSED'
       and p ->> 'availabilityNote' is null
  ) then
    raise exception 'KABUL BAŞARISIZ: gizli kapatma nedeni müşteriye sızdı veya ürün kapanmadı.';
  end if;

  perform public.staff_set_product_availability(v_manager, v_p2, 'ACTIVE', null, true);

  ------------------------------------------------------------------
  -- 9) Günlük özet ve kasa kapanışı
  ------------------------------------------------------------------
  v_summary := public.staff_daily_summary(v_manager, current_date);

  v_close := public.staff_close_cash_day(v_manager, current_date, 0, 'Kabul testi');

  if (v_close ->> 'differenceAmount')::numeric <> -(v_close ->> 'expectedCash')::numeric then
    raise exception 'KABUL BAŞARISIZ: kasa farkı yanlış (%).', v_close ->> 'differenceAmount';
  end if;

  v_close := public.staff_close_cash_day(
    v_manager, current_date, (v_close ->> 'expectedCash')::numeric + 10, 'Kabul düzeltmesi');

  if (v_close ->> 'differenceAmount')::numeric <> 10 then
    raise exception 'KABUL BAŞARISIZ: düzeltme kapanışı farkı yanlış (%).', v_close ->> 'differenceAmount';
  end if;

  begin
    update public.cash_closings set note = 'değiştirildi' where id = (v_close ->> 'id')::uuid;
    raise exception 'KABUL BAŞARISIZ: kasa kapanışı değiştirilebildi.';
  exception
    when others then
      if sqlerrm like 'KABUL BAŞARISIZ%' then
        raise;
      end if;
  end;

  ------------------------------------------------------------------
  -- 10) Takip bağlantısının süresi
  ------------------------------------------------------------------
  update public.orders set tracking_expires_at = now() - interval '1 minute'
   where order_number = v_order_no;

  v_track := public.track_order(v_order_no, v_order ->> 'trackingToken');
  if v_track is null or not (v_track ->> 'expired')::boolean then
    raise exception 'KABUL BAŞARISIZ: süresi dolan takip bağlantısı kapanmadı.';
  end if;

  raise notice 'TÜM SQL KABUL SENARYOLARI GEÇTİ.';
end $$;

rollback;
