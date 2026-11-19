-- =====================================================================
-- OKUL BÜFESİ — 0009 Rapor, gün sonu ve analitik RPC'leri
-- =====================================================================

create or replace function public.staff_daily_summary(p_token text, p_date date default null)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_staff public.staff_accounts := private.require_staff(p_token, array['MANAGER', 'CASHIER']);
  v_date date := coalesce(p_date, private.today_local());
  v_active integer := 0;
  v_preparing integer := 0;
  v_ready integer := 0;
  v_waiting integer := 0;
  v_collections numeric := 0;
  v_cash numeric := 0;
  v_card numeric := 0;
  v_refunds numeric := 0;
  v_revenue numeric := 0;
  v_avg numeric;
  v_open integer := 0;
  v_enabled boolean := false;
  v_closing public.cash_closings;
begin
  select
    count(*) filter (where order_status in ('NEW', 'PREPARING', 'READY')),
    count(*) filter (where order_status = 'PREPARING'),
    count(*) filter (where order_status = 'READY'),
    count(*) filter (where payment_status = 'WAITING' and order_status not in ('CANCELLED', 'DELIVERED'))
  into v_active, v_preparing, v_ready, v_waiting
  from public.orders;

  select
    coalesce(sum(case when p.payment_type = 'PAYMENT' then p.amount else -p.amount end), 0),
    coalesce(sum(case when p.payment_method = 'CASH' and p.payment_type = 'PAYMENT' then p.amount
                      when p.payment_method = 'CASH' and p.payment_type = 'REFUND' then -p.amount else 0 end), 0),
    coalesce(sum(case when p.payment_method = 'CARD' and p.payment_type = 'PAYMENT' then p.amount
                      when p.payment_method = 'CARD' and p.payment_type = 'REFUND' then -p.amount else 0 end), 0),
    coalesce(sum(case when p.payment_type = 'REFUND' then p.amount else 0 end), 0)
  into v_collections, v_cash, v_card, v_refunds
  from public.payments p
  where (p.created_at at time zone 'Asia/Nicosia')::date = v_date;

  select
    coalesce(sum(o.total_amount), 0),
    round(avg(extract(epoch from (o.delivered_at - o.created_at)) / 60)::numeric, 1)
  into v_revenue, v_avg
  from public.orders o
  where o.order_status = 'DELIVERED'
    and o.delivered_at is not null
    and (o.delivered_at at time zone 'Asia/Nicosia')::date = v_date;

  select count(*) into v_open
  from public.order_problems p
  where p.cleared_at is null;

  select coalesce(value = 'true', false) into v_enabled
  from public.system_settings where key = 'online_ordering_enabled';

  select * into v_closing
  from public.cash_closings
  where business_date = v_date
  order by closed_at desc
  limit 1;

  return jsonb_build_object(
    'businessDate', v_date,
    'activeOrders', v_active,
    'preparingOrders', v_preparing,
    'readyOrders', v_ready,
    'waitingPaymentOrders', v_waiting,
    'collections', v_collections,
    'revenue', v_revenue,
    'cashCollections', v_cash,
    'cardCollections', v_card,
    'refunds', v_refunds,
    'averagePrepMinutes', v_avg,
    'cashDifference', case when v_closing.id is null then null else v_closing.difference_amount end,
    'openProblems', v_open,
    'onlineOrderingEnabled', coalesce(v_enabled, false),
    'cashClosed', v_closing.id is not null,
    'cashClosedAt', v_closing.closed_at
  );
end;
$$;

create or replace function public.staff_close_cash_day(
  p_token text,
  p_date date,
  p_actual_cash numeric,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_staff public.staff_accounts := private.require_staff(p_token, array['MANAGER']);
  v_date date := coalesce(p_date, private.today_local());
  v_expected_cash numeric := 0;
  v_expected_card numeric := 0;
  v_delivered integer := 0;
  v_avg numeric;
  v_difference numeric;
  v_correction uuid;
  v_id uuid;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_closed_at timestamptz := now();
begin
  if p_actual_cash is null or p_actual_cash < 0 then
    raise exception 'Kasadaki gerçek nakit tutarı geçersiz.';
  end if;

  if v_note is not null and length(v_note) > 500 then
    raise exception 'Kasa kapanış notu en fazla 500 karakter olabilir.';
  end if;

  select
    coalesce(sum(case when p.payment_method = 'CASH' and p.payment_type = 'PAYMENT' then p.amount
                      when p.payment_method = 'CASH' and p.payment_type = 'REFUND' then -p.amount else 0 end), 0),
    coalesce(sum(case when p.payment_method = 'CARD' and p.payment_type = 'PAYMENT' then p.amount
                      when p.payment_method = 'CARD' and p.payment_type = 'REFUND' then -p.amount else 0 end), 0)
  into v_expected_cash, v_expected_card
  from public.payments p
  join public.orders o on o.id = p.order_id
  where o.order_status = 'DELIVERED'
    and o.delivered_at is not null
    and (o.delivered_at at time zone 'Asia/Nicosia')::date = v_date;

  select
    count(*),
    round(avg(extract(epoch from (o.delivered_at - o.created_at)) / 60)::numeric, 1)
  into v_delivered, v_avg
  from public.orders o
  where o.order_status = 'DELIVERED'
    and o.delivered_at is not null
    and (o.delivered_at at time zone 'Asia/Nicosia')::date = v_date;

  v_difference := round(p_actual_cash - v_expected_cash, 2);

  select id into v_correction
  from public.cash_closings
  where business_date = v_date
  order by closed_at desc
  limit 1;

  insert into public.cash_closings (
    business_date, expected_cash, expected_card, actual_cash,
    difference_amount, closed_by_staff_id, closed_at, note, correction_of
  ) values (
    v_date, v_expected_cash, v_expected_card, round(p_actual_cash, 2),
    v_difference, v_staff.id, v_closed_at, v_note, v_correction
  )
  returning id into v_id;

  return jsonb_build_object(
    'id', v_id,
    'businessDate', v_date,
    'expectedCash', v_expected_cash,
    'expectedCard', v_expected_card,
    'actualCash', round(p_actual_cash, 2),
    'differenceAmount', v_difference,
    'closedAt', v_closed_at,
    'closedByName', v_staff.display_name,
    'note', v_note,
    'deliveredOrders', v_delivered,
    'averagePrepMinutes', v_avg
  );
end;
$$;

create or replace function public.staff_list_cash_closings(p_token text, p_limit integer default 30)
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
    'businessDate', c.business_date,
    'expectedCash', c.expected_cash,
    'expectedCard', c.expected_card,
    'actualCash', c.actual_cash,
    'differenceAmount', c.difference_amount,
    'closedAt', c.closed_at,
    'closedByName', (select sa.display_name from public.staff_accounts sa where sa.id = c.closed_by_staff_id),
    'note', c.note,
    'deliveredOrders', (
      select count(*) from public.orders o
      where o.order_status = 'DELIVERED'
        and o.delivered_at is not null
        and (o.delivered_at at time zone 'Asia/Nicosia')::date = c.business_date
    ),
    'averagePrepMinutes', (
      select round(avg(extract(epoch from (o.delivered_at - o.created_at)) / 60)::numeric, 1)
      from public.orders o
      where o.order_status = 'DELIVERED'
        and o.delivered_at is not null
        and (o.delivered_at at time zone 'Asia/Nicosia')::date = c.business_date
    )
  ) order by c.business_date desc, c.closed_at desc), '[]'::jsonb)
  into v_result
  from (
    select * from public.cash_closings
    order by business_date desc, closed_at desc
    limit greatest(1, least(coalesce(p_limit, 30), 200))
  ) c;

  return v_result;
end;
$$;

create or replace function public.staff_analytics_report(p_token text, p_filters jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_staff public.staff_accounts := private.require_staff(p_token, array['MANAGER']);
  v_from date;
  v_to date;
  v_category uuid;
  v_source text;
  v_method text;
  v_top jsonb;
  v_categories jsonb;
  v_hourly jsonb;
  v_daily jsonb;
  v_monthly jsonb;
  v_collections numeric := 0;
  v_refunds numeric := 0;
  v_revenue numeric := 0;
  v_cash numeric := 0;
  v_card numeric := 0;
  v_orders jsonb;
  v_closings jsonb;
begin
  v_from := coalesce(nullif(p_filters ->> 'from', '')::date, private.today_local());
  v_to := coalesce(nullif(p_filters ->> 'to', '')::date, v_from);

  if v_to < v_from then
    raise exception 'Bitiş tarihi başlangıçtan önce olamaz.';
  end if;

  if v_to - v_from > 730 then
    raise exception 'Rapor aralığı en fazla iki yıl olabilir.';
  end if;

  if nullif(p_filters ->> 'categoryId', '') is not null then
    v_category := (p_filters ->> 'categoryId')::uuid;
  end if;

  v_source := nullif(upper(coalesce(p_filters ->> 'source', '')), '');
  if v_source is not null and v_source not in ('ONLINE', 'CASHIER') then
    raise exception 'Geçersiz sipariş kaynağı filtresi.';
  end if;

  v_method := nullif(upper(coalesce(p_filters ->> 'paymentMethod', '')), '');
  if v_method is not null and v_method not in ('CASH', 'CARD') then
    raise exception 'Geçersiz ödeme yöntemi filtresi.';
  end if;

  -- En çok satılan ürünler
  select coalesce(jsonb_agg(jsonb_build_object(
    'name', s.product_name,
    'quantity', s.quantity,
    'revenue', s.revenue
  ) order by s.revenue desc, s.quantity desc), '[]'::jsonb)
  into v_top
  from (
    select i.product_name_snapshot as product_name,
           sum(i.quantity)::int as quantity,
           round(sum(i.line_total), 2) as revenue
    from public.order_items i
    join public.orders o on o.id = i.order_id
    where (o.created_at at time zone 'Asia/Nicosia')::date between v_from and v_to
      and o.order_status <> 'CANCELLED'
      and (v_source is null or o.source = v_source)
      and (v_category is null or exists (
        select 1 from public.products p3
        where p3.id = i.product_id and p3.category_id = v_category
      ))
    group by i.product_name_snapshot
    order by revenue desc, quantity desc
    limit 20
  ) s;

  -- Kategori dağılımı
  select coalesce(jsonb_agg(jsonb_build_object(
    'name', s.category_name,
    'quantity', s.quantity,
    'revenue', s.revenue
  ) order by s.revenue desc), '[]'::jsonb)
  into v_categories
  from (
    select i.category_name_snapshot as category_name,
           sum(i.quantity)::int as quantity,
           round(sum(i.line_total), 2) as revenue
    from public.order_items i
    join public.orders o on o.id = i.order_id
    where (o.created_at at time zone 'Asia/Nicosia')::date between v_from and v_to
      and o.order_status <> 'CANCELLED'
      and (v_source is null or o.source = v_source)
      and (v_category is null or exists (
        select 1 from public.products p3
        where p3.id = i.product_id and p3.category_id = v_category
      ))
    group by i.category_name_snapshot
    order by revenue desc
  ) s;

  -- Yoğun saatler
  select jsonb_agg(jsonb_build_object(
    'hour', h.hour,
    'orders', coalesce(x.order_count, 0),
    'revenue', coalesce(x.revenue, 0)
  ) order by h.hour)
  into v_hourly
  from generate_series(0, 23) as h(hour)
  left join (
    select extract(hour from (o.created_at at time zone 'Asia/Nicosia'))::int as hour,
           count(distinct o.id)::int as order_count,
           round(sum(i.line_total), 2) as revenue
    from public.orders o
    join public.order_items i on i.order_id = o.id
    where (o.created_at at time zone 'Asia/Nicosia')::date between v_from and v_to
      and o.order_status <> 'CANCELLED'
      and (v_source is null or o.source = v_source)
      and (v_category is null or exists (
        select 1 from public.products p3
        where p3.id = i.product_id and p3.category_id = v_category
      ))
    group by 1
  ) x on x.hour = h.hour;

  -- Günlük ciro
  select coalesce(jsonb_agg(jsonb_build_object(
    'date', s.d,
    'orders', s.order_count,
    'revenue', s.revenue
  ) order by s.d), '[]'::jsonb)
  into v_daily
  from (
    select (o.delivered_at at time zone 'Asia/Nicosia')::date as d,
           count(*)::int as order_count,
           round(sum(o.total_amount), 2) as revenue
    from public.orders o
    where o.order_status = 'DELIVERED'
      and o.delivered_at is not null
      and (o.delivered_at at time zone 'Asia/Nicosia')::date between v_from and v_to
      and (v_source is null or o.source = v_source)
    group by 1
    order by 1
  ) s;

  -- Aylık ciro
  select coalesce(jsonb_agg(jsonb_build_object(
    'month', s.m,
    'orders', s.order_count,
    'revenue', s.revenue
  ) order by s.m), '[]'::jsonb)
  into v_monthly
  from (
    select to_char(o.delivered_at at time zone 'Asia/Nicosia', 'YYYY-MM') as m,
           count(*)::int as order_count,
           round(sum(o.total_amount), 2) as revenue
    from public.orders o
    where o.order_status = 'DELIVERED'
      and o.delivered_at is not null
      and (o.delivered_at at time zone 'Asia/Nicosia')::date between v_from and v_to
      and (v_source is null or o.source = v_source)
    group by 1
    order by 1
  ) s;

  -- Tahsilat / iade özeti
  select
    coalesce(sum(case when p.payment_type = 'PAYMENT' then p.amount else -p.amount end), 0),
    coalesce(sum(case when p.payment_type = 'REFUND' then p.amount else 0 end), 0),
    coalesce(sum(case when p.payment_method = 'CASH' and p.payment_type = 'PAYMENT' then p.amount
                      when p.payment_method = 'CASH' and p.payment_type = 'REFUND' then -p.amount else 0 end), 0),
    coalesce(sum(case when p.payment_method = 'CARD' and p.payment_type = 'PAYMENT' then p.amount
                      when p.payment_method = 'CARD' and p.payment_type = 'REFUND' then -p.amount else 0 end), 0)
  into v_collections, v_refunds, v_cash, v_card
  from public.payments p
  join public.orders o on o.id = p.order_id
  where (p.created_at at time zone 'Asia/Nicosia')::date between v_from and v_to
    and (v_source is null or o.source = v_source)
    and (v_method is null or p.payment_method = v_method)
    and (v_category is null or exists (
      select 1 from public.order_items i2
      join public.products p2 on p2.id = i2.product_id
      where i2.order_id = o.id and p2.category_id = v_category
    ));

  select coalesce(sum(o.total_amount), 0)
  into v_revenue
  from public.orders o
  where o.order_status = 'DELIVERED'
    and o.delivered_at is not null
    and (o.delivered_at at time zone 'Asia/Nicosia')::date between v_from and v_to
    and (v_source is null or o.source = v_source)
    and (v_category is null or exists (
      select 1 from public.order_items i2
      join public.products p2 on p2.id = i2.product_id
      where i2.order_id = o.id and p2.category_id = v_category
    ));

  -- Sipariş listesi
  select coalesce(jsonb_agg(jsonb_build_object(
    'orderNumber', s.order_number,
    'createdAt', s.created_at,
    'deliveredAt', s.delivered_at,
    'source', s.source,
    'status', s.order_status,
    'paymentStatus', s.payment_status,
    'totalAmount', s.total_amount,
    'customerName', s.customer_name
  ) order by s.created_at desc), '[]'::jsonb)
  into v_orders
  from (
    select o.order_number, o.created_at, o.delivered_at, o.source, o.order_status,
           o.payment_status, o.total_amount, o.customer_name
    from public.orders o
    where (o.created_at at time zone 'Asia/Nicosia')::date between v_from and v_to
      and (v_source is null or o.source = v_source)
      and (v_category is null or exists (
        select 1 from public.order_items i2
        join public.products p2 on p2.id = i2.product_id
        where i2.order_id = o.id and p2.category_id = v_category
      ))
      and (v_method is null or exists (
        select 1 from public.payments p2
        where p2.order_id = o.id and p2.payment_method = v_method
      ))
    order by o.created_at desc
    limit 500
  ) s;

  -- Kasa kapanış listesi
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'businessDate', c.business_date,
    'expectedCash', c.expected_cash,
    'expectedCard', c.expected_card,
    'actualCash', c.actual_cash,
    'differenceAmount', c.difference_amount,
    'closedAt', c.closed_at,
    'closedByName', (select sa.display_name from public.staff_accounts sa where sa.id = c.closed_by_staff_id),
    'note', c.note,
    'deliveredOrders', (
      select count(*) from public.orders o
      where o.order_status = 'DELIVERED'
        and o.delivered_at is not null
        and (o.delivered_at at time zone 'Asia/Nicosia')::date = c.business_date
    ),
    'averagePrepMinutes', (
      select round(avg(extract(epoch from (o.delivered_at - o.created_at)) / 60)::numeric, 1)
      from public.orders o
      where o.order_status = 'DELIVERED'
        and o.delivered_at is not null
        and (o.delivered_at at time zone 'Asia/Nicosia')::date = c.business_date
    )
  ) order by c.business_date desc, c.closed_at desc), '[]'::jsonb)
  into v_closings
  from public.cash_closings c
  where c.business_date between v_from and v_to;

  return jsonb_build_object(
    'topProducts', v_top,
    'categoryDistribution', v_categories,
    'hourly', coalesce(v_hourly, '[]'::jsonb),
    'dailyRevenue', v_daily,
    'monthlyRevenue', v_monthly,
    'paymentSummary', jsonb_build_object(
      'collections', v_collections,
      'revenue', v_revenue,
      'refunds', v_refunds,
      'cash', v_cash,
      'card', v_card
    ),
    'orders', v_orders,
    'cashClosings', v_closings
  );
end;
$$;
