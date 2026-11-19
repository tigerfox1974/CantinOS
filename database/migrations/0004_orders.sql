-- =====================================================================
-- OKUL BÜFESİ — 0004 Sipariş, ödeme, iptal, sorun, kapanış, olay
-- =====================================================================

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number bigint not null unique default nextval('public.order_number_seq'),
  source text not null check (source in ('ONLINE', 'CASHIER')),
  customer_name text,
  customer_phone text,
  delivery_label text not null,
  target_delivery_at timestamptz not null,
  general_note text,
  order_status text not null default 'NEW'
    check (order_status in ('NEW', 'PREPARING', 'READY', 'DELIVERED', 'CANCELLED')),
  payment_status text not null default 'WAITING'
    check (payment_status in ('WAITING', 'PAID', 'REFUND_PENDING', 'REFUNDED')),
  total_amount numeric(12, 2) not null default 0 check (total_amount >= 0),
  tracking_token text not null unique default encode(gen_random_bytes(24), 'hex'),
  delivered_at timestamptz,
  tracking_expires_at timestamptz,
  priority_override boolean not null default false,
  priority_override_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists orders_status_target_idx
  on public.orders (order_status, target_delivery_at);
create index if not exists orders_created_idx
  on public.orders (created_at desc);
create index if not exists orders_tracking_idx
  on public.orders (order_number, tracking_token);

drop trigger if exists trg_orders_updated_at on public.orders;
create trigger trg_orders_updated_at
  before update on public.orders
  for each row execute function private.set_updated_at();

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id),
  product_name_snapshot text not null,
  category_name_snapshot text not null,
  unit_price_snapshot numeric(12, 2) not null check (unit_price_snapshot >= 0),
  quantity integer not null check (quantity between 1 and 50),
  line_note text,
  line_total numeric(12, 2) not null check (line_total >= 0),
  created_at timestamptz not null default now()
);

create index if not exists order_items_order_idx
  on public.order_items (order_id, created_at);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  payment_type text not null check (payment_type in ('PAYMENT', 'REFUND')),
  payment_method text not null check (payment_method in ('CASH', 'CARD')),
  amount numeric(12, 2) not null check (amount > 0),
  received_amount numeric(12, 2) check (received_amount is null or received_amount >= 0),
  change_amount numeric(12, 2) check (change_amount is null or change_amount >= 0),
  created_by_staff_id uuid references public.staff_accounts(id),
  created_at timestamptz not null default now(),
  note text
);

create index if not exists payments_order_idx
  on public.payments (order_id, created_at);
create index if not exists payments_created_idx
  on public.payments (created_at);

drop trigger if exists trg_payments_immutable on public.payments;
create trigger trg_payments_immutable
  before update or delete on public.payments
  for each row execute function private.prevent_mutation();

create table if not exists public.order_cancellations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id),
  reason text not null,
  cancelled_by_staff_id uuid references public.staff_accounts(id),
  cancelled_at timestamptz not null default now()
);

drop trigger if exists trg_order_cancellations_immutable on public.order_cancellations;
create trigger trg_order_cancellations_immutable
  before update or delete on public.order_cancellations
  for each row execute function private.prevent_mutation();

create table if not exists public.order_problems (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  problem_type text not null check (problem_type in (
    'OUT_OF_STOCK', 'MISSING_INGREDIENT', 'NOTE_UNCLEAR',
    'EQUIPMENT_BUSY', 'WONT_MAKE_BREAK', 'OTHER'
  )),
  note text,
  reported_by_staff_id uuid references public.staff_accounts(id),
  reported_at timestamptz not null default now(),
  informed_at timestamptz,
  informed_by_staff_id uuid references public.staff_accounts(id),
  cleared_at timestamptz,
  cleared_by_staff_id uuid references public.staff_accounts(id)
);

create index if not exists order_problems_open_idx
  on public.order_problems (order_id)
  where cleared_at is null;

create table if not exists public.cash_closings (
  id uuid primary key default gen_random_uuid(),
  business_date date not null,
  expected_cash numeric(12, 2) not null default 0,
  expected_card numeric(12, 2) not null default 0,
  actual_cash numeric(12, 2) not null default 0,
  difference_amount numeric(12, 2) not null default 0,
  closed_by_staff_id uuid references public.staff_accounts(id),
  closed_at timestamptz not null default now(),
  note text,
  correction_of uuid references public.cash_closings(id)
);

create index if not exists cash_closings_date_idx
  on public.cash_closings (business_date desc);

drop trigger if exists trg_cash_closings_immutable on public.cash_closings;
create trigger trg_cash_closings_immutable
  before update or delete on public.cash_closings
  for each row execute function private.prevent_mutation();

create table if not exists public.order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  event_type text not null,
  old_value text,
  new_value text,
  actor_staff_id uuid references public.staff_accounts(id),
  created_at timestamptz not null default now()
);

create index if not exists order_events_order_idx
  on public.order_events (order_id, created_at desc);

-- ---------------------------------------------------------------------
-- Ortak hesaplama yardımcıları
-- ---------------------------------------------------------------------
create or replace function private.log_event(
  p_order_id uuid,
  p_event_type text,
  p_old_value text,
  p_new_value text,
  p_actor_staff_id uuid
)
returns void
language sql
security definer
set search_path = public, extensions, pg_temp
as $$
  insert into public.order_events (order_id, event_type, old_value, new_value, actor_staff_id)
  values (p_order_id, p_event_type, p_old_value, p_new_value, p_actor_staff_id);
$$;

create or replace function private.order_paid(p_order_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select coalesce(
    sum(case when payment_type = 'PAYMENT' then amount else -amount end),
    0
  )::numeric(12, 2)
  from public.payments
  where order_id = p_order_id;
$$;

create or replace function private.require_settled(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_total numeric;
  v_paid numeric;
begin
  select total_amount into v_total from public.orders where id = p_order_id;
  if v_total is null then
    raise exception 'Sipariş bulunamadı.';
  end if;

  v_paid := private.order_paid(p_order_id);

  if abs(v_paid - v_total) > 0.005 then
    if v_paid < v_total then
      raise exception 'Sipariş bakiyesi kapalı değil. Kalan tahsilat tamamlanmadan teslim edilemez.';
    else
      raise exception 'Siparişte fazla ödeme var. İade tamamlanmadan teslim edilemez.';
    end if;
  end if;
end;
$$;

create or replace function private.load_items(p_items jsonb)
returns table (
  product_id uuid,
  product_name text,
  category_name text,
  unit_price numeric,
  quantity integer,
  line_note text,
  line_total numeric
)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_item jsonb;
  v_id uuid;
  v_qty integer;
  v_product record;
  v_note text;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Sepetinizde en az bir ürün olmalıdır.';
  end if;

  if jsonb_array_length(p_items) > 100 then
    raise exception 'Sepette çok fazla ürün satırı var.';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    if coalesce(v_item ->> 'productId', '') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
      raise exception 'Geçersiz ürün seçimi.';
    end if;

    v_id := (v_item ->> 'productId')::uuid;
    v_qty := coalesce((v_item ->> 'quantity')::integer, 0);

    if v_qty < 1 or v_qty > 50 then
      raise exception 'Ürün adedi 1 ile 50 arasında olmalıdır.';
    end if;

    select p.*, c.name as category_name
      into v_product
      from public.products p
      join public.categories c on c.id = p.category_id
     where p.id = v_id
       and p.availability_status <> 'ARCHIVED'
       and c.is_archived = false;

    if v_product.id is null then
      raise exception 'Ürün bulunamadı veya satışta değil.';
    end if;

    if v_product.availability_status = 'CLOSED' then
      raise exception '% şu anda satışta değil.', v_product.name;
    end if;

    v_note := nullif(btrim(coalesce(v_item ->> 'lineNote', '')), '');
    if v_note is not null and length(v_note) > 200 then
      raise exception 'Ürün notu en fazla 200 karakter olabilir.';
    end if;

    product_id := v_id;
    product_name := v_product.name;
    category_name := v_product.category_name;
    unit_price := v_product.price;
    quantity := v_qty;
    line_note := v_note;
    line_total := round(v_product.price * v_qty, 2);
    return next;
  end loop;
end;
$$;

create or replace function private.resolve_delivery(p_delivery jsonb)
returns table (delivery_label text, target_at timestamptz)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_type text;
  v_date date;
  v_time time;
  v_at timestamptz;
  v_slot public.delivery_slots;
begin
  if p_delivery is null or jsonb_typeof(p_delivery) <> 'object' then
    raise exception 'Teslim zamanı seçmelisiniz.';
  end if;

  v_type := upper(coalesce(p_delivery ->> 'type', ''));
  v_date := private.today_local();

  if v_type = 'NOW' then
    delivery_label := 'Hemen';
    target_at := now();
    return next;
    return;
  end if;

  if v_type = 'SLOT' then
    if coalesce(p_delivery ->> 'slotId', '') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
      raise exception 'Geçersiz teslim zamanı seçimi.';
    end if;

    select * into v_slot from public.delivery_slots where id = (p_delivery ->> 'slotId')::uuid;
    if v_slot.id is null or v_slot.active = false then
      raise exception 'Seçilen teslim zamanı kullanılamıyor.';
    end if;

    v_at := (v_date + v_slot.target_time) at time zone 'Asia/Nicosia';
    if v_at <= now() then
      raise exception 'Seçilen teneffüs saati geçmişte kaldı. Lütfen başka bir zaman seçin.';
    end if;

    delivery_label := v_slot.label;
    target_at := v_at;
    return next;
    return;
  end if;

  if v_type = 'CUSTOM' then
    begin
      v_time := (p_delivery ->> 'time')::time;
    exception when others then
      raise exception 'Özel saat biçimi geçersiz.';
    end;

    v_at := (v_date + v_time) at time zone 'Asia/Nicosia';
    if v_at <= now() then
      raise exception 'Özel saat bugünün ileri bir saati olmalıdır.';
    end if;

    delivery_label := to_char(v_time, 'HH24:MI') || ' (Özel saat)';
    target_at := v_at;
    return next;
    return;
  end if;

  raise exception 'Geçersiz teslim zamanı seçimi.';
end;
$$;
