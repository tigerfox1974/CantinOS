-- =====================================================================
-- CANTINOS — TAM ŞEMA (otomatik üretildi)
-- Kaynak: database/migrations/*.sql
-- Yeniden üretmek için: npm run schema:build
-- Hedef: Supabase PostgreSQL 15+ | Saat dilimi: Asia/Nicosia
-- =====================================================================

-- >>> 0001_foundation.sql

-- =====================================================================
-- CANTINOS — 0001 Temel yapı, yardımcı fonksiyonlar
-- Hedef: Supabase PostgreSQL 15+
-- Saat dilimi: Asia/Nicosia
-- =====================================================================

do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'extensions') then
    execute 'create extension if not exists pgcrypto with schema extensions';
  else
    execute 'create extension if not exists pgcrypto';
  end if;
end $$;

-- pgcrypto hem public hem extensions şemasında bulunabilir.
set search_path = public, extensions;

create schema if not exists private;

do $$
begin
  execute 'revoke all on schema private from public';
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on schema private from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on schema private from authenticated';
  end if;
end $$;

-- Sipariş numarası: 1001'den başlar, eşzamanlı çağrılarda çakışmaz.
create sequence if not exists public.order_number_seq
  as bigint
  start with 1001
  increment by 1
  no cycle;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public, extensions, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Ödeme, iptal ve kasa kapanışı kayıtları değiştirilemez.
create or replace function private.prevent_mutation()
returns trigger
language plpgsql
security invoker
set search_path = public, extensions, pg_temp
as $$
begin
  raise exception 'Bu kayıt değiştirilemez veya silinemez. Düzeltme için yeni kayıt oluşturun.';
end;
$$;

create or replace function private.today_local()
returns date
language sql
stable
security invoker
set search_path = public, extensions, pg_temp
as $$
  select (now() at time zone 'Asia/Nicosia')::date;
$$;

create or replace function private.require_reason(p_reason text, p_field text default 'Neden')
returns text
language plpgsql
immutable
security invoker
set search_path = public, extensions, pg_temp
as $$
declare
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if length(v_reason) < 3 then
    raise exception '% yazmak zorunludur (en az 3 karakter).', p_field;
  end if;
  if length(v_reason) > 500 then
    raise exception '% en fazla 500 karakter olabilir.', p_field;
  end if;
  return v_reason;
end;
$$;

-- >>> 0002_staff_and_settings.sql

-- =====================================================================
-- CANTINOS — 0002 Personel, oturum, ayarlar
-- =====================================================================

create table if not exists public.staff_accounts (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  display_name text not null,
  role text not null check (role in ('CASHIER', 'KITCHEN', 'MANAGER')),
  password_hash text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists staff_accounts_email_unique
  on public.staff_accounts (lower(email));

drop trigger if exists trg_staff_accounts_updated_at on public.staff_accounts;
create trigger trg_staff_accounts_updated_at
  before update on public.staff_accounts
  for each row execute function private.set_updated_at();

create table if not exists public.staff_sessions (
  id uuid primary key default gen_random_uuid(),
  staff_account_id uuid not null references public.staff_accounts(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_seen_at timestamptz
);

create index if not exists staff_sessions_account_idx
  on public.staff_sessions (staff_account_id);
create index if not exists staff_sessions_active_idx
  on public.staff_sessions (token_hash, expires_at)
  where revoked_at is null;

create table if not exists public.system_settings (
  key text primary key,
  value text not null,
  updated_by_staff_id uuid references public.staff_accounts(id),
  updated_at timestamptz not null default now()
);

insert into public.system_settings (key, value)
values
  ('online_ordering_enabled', 'true'),
  ('kitchen_warning_minutes', '5'),
  ('kitchen_late_minutes', '10'),
  ('business_timezone', 'Asia/Nicosia')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- Oturum doğrulama (tüm personel RPC'lerinin tek kapısı)
-- ---------------------------------------------------------------------
create or replace function private.require_staff(p_token text, p_roles text[] default null)
returns public.staff_accounts
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_staff public.staff_accounts;
  v_hash text;
begin
  if p_token is null or length(p_token) < 32 then
    raise exception 'Oturum bulunamadı. Lütfen yeniden giriş yapın.';
  end if;

  v_hash := encode(digest(p_token, 'sha256'), 'hex');

  select sa.*
    into v_staff
    from public.staff_sessions s
    join public.staff_accounts sa on sa.id = s.staff_account_id
   where s.token_hash = v_hash
     and s.revoked_at is null
     and s.expires_at > now()
     and sa.active = true
   limit 1;

  if v_staff.id is null then
    raise exception 'Oturumunuzun süresi dolmuş. Lütfen yeniden giriş yapın.';
  end if;

  if p_roles is not null and not (v_staff.role = any (p_roles)) then
    raise exception 'Bu işlem için yetkiniz yok.';
  end if;

  update public.staff_sessions
     set last_seen_at = now()
   where token_hash = v_hash;

  return v_staff;
end;
$$;

-- >>> 0003_catalog.sql

-- =====================================================================
-- CANTINOS — 0003 Kategori, ürün ve teslim zamanları
-- =====================================================================

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order integer not null default 0,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_categories_updated_at on public.categories;
create trigger trg_categories_updated_at
  before update on public.categories
  for each row execute function private.set_updated_at();

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories(id),
  name text not null,
  description text,
  price numeric(12, 2) not null check (price >= 0),
  image_url text,
  sort_order integer not null default 0,
  availability_status text not null default 'ACTIVE'
    check (availability_status in ('ACTIVE', 'CLOSED', 'ARCHIVED')),
  availability_note text,
  availability_note_public boolean not null default true,
  availability_changed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_closed_note_check
    check (availability_status <> 'CLOSED' or length(btrim(coalesce(availability_note, ''))) > 0)
);

create index if not exists products_category_idx
  on public.products (category_id, sort_order);
create index if not exists products_availability_idx
  on public.products (availability_status);

drop trigger if exists trg_products_updated_at on public.products;
create trigger trg_products_updated_at
  before update on public.products
  for each row execute function private.set_updated_at();

create table if not exists public.delivery_slots (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  target_time time not null,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_delivery_slots_updated_at on public.delivery_slots;
create trigger trg_delivery_slots_updated_at
  before update on public.delivery_slots
  for each row execute function private.set_updated_at();

insert into public.delivery_slots (label, target_time, sort_order)
select * from (values
  ('1. Teneffüs', '10:30'::time, 10),
  ('2. Teneffüs', '11:20'::time, 20),
  ('Öğle Arası', '12:20'::time, 30),
  ('3. Teneffüs', '13:40'::time, 40),
  ('4. Teneffüs', '14:30'::time, 50)
) as v(label, target_time, sort_order)
where not exists (select 1 from public.delivery_slots);

-- >>> 0004_orders.sql

-- =====================================================================
-- CANTINOS — 0004 Sipariş, ödeme, iptal, sorun, kapanış, olay
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

-- >>> 0005_public_rpcs.sql

-- =====================================================================
-- CANTINOS — 0005 Herkese açık RPC'ler
-- =====================================================================

create or replace function public.get_public_menu()
returns jsonb
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select jsonb_build_object(
    'onlineOrderingEnabled',
      coalesce((select value = 'true' from public.system_settings where key = 'online_ordering_enabled'), false),
    'categories',
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', c.id,
            'name', c.name,
            'sortOrder', c.sort_order,
            'products', coalesce((
              select jsonb_agg(
                jsonb_build_object(
                  'id', p.id,
                  'name', p.name,
                  'description', p.description,
                  'price', p.price,
                  'imageUrl', p.image_url,
                  'sortOrder', p.sort_order,
                  'availabilityStatus', p.availability_status,
                  'availabilityNote',
                    case
                      when p.availability_status = 'CLOSED' and p.availability_note_public then p.availability_note
                      else null
                    end
                )
                order by p.sort_order, p.name
              )
              from public.products p
              where p.category_id = c.id
                and p.availability_status <> 'ARCHIVED'
            ), '[]'::jsonb)
          )
          order by c.sort_order, c.name
        )
        from public.categories c
        where c.is_archived = false
          and exists (
            select 1 from public.products p
            where p.category_id = c.id and p.availability_status <> 'ARCHIVED'
          )
      ), '[]'::jsonb)
  );
$$;

create or replace function public.get_public_delivery_slots()
returns jsonb
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'label', s.label,
        'targetTime', to_char(s.target_time, 'HH24:MI'),
        'targetAt', ((private.today_local() + s.target_time) at time zone 'Asia/Nicosia'),
        'sortOrder', s.sort_order,
        'available', ((private.today_local() + s.target_time) at time zone 'Asia/Nicosia') > now()
      )
      order by s.sort_order, s.label
    ),
    '[]'::jsonb
  )
  from public.delivery_slots s
  where s.active = true;
$$;

create or replace function public.create_online_order(
  p_customer_name text,
  p_customer_phone text,
  p_delivery jsonb,
  p_note text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_enabled boolean;
  v_name text := btrim(coalesce(p_customer_name, ''));
  v_phone text := btrim(coalesce(p_customer_phone, ''));
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_order_id uuid := gen_random_uuid();
  v_number bigint;
  v_token text;
  v_label text;
  v_target timestamptz;
  v_total numeric(12, 2) := 0;
  v_line record;
begin
  select value = 'true' into v_enabled
    from public.system_settings where key = 'online_ordering_enabled';

  if coalesce(v_enabled, false) = false then
    raise exception 'Şu an online siparişe kapalıyız. Lütfen daha sonra tekrar deneyin.';
  end if;

  if length(v_name) < 2 then
    raise exception 'Ad Soyad en az 2 karakter olmalıdır.';
  end if;
  if length(v_name) > 80 then
    raise exception 'Ad Soyad en fazla 80 karakter olabilir.';
  end if;

  if length(v_phone) < 7 then
    raise exception 'Telefon en az 7 karakter olmalıdır.';
  end if;
  if length(v_phone) > 20 then
    raise exception 'Telefon en fazla 20 karakter olabilir.';
  end if;

  if v_note is not null and length(v_note) > 500 then
    raise exception 'Sipariş notu en fazla 500 karakter olabilir.';
  end if;

  select d.delivery_label, d.target_at into v_label, v_target
    from private.resolve_delivery(p_delivery) d;

  v_number := nextval('public.order_number_seq');
  v_token := encode(gen_random_bytes(24), 'hex');

  insert into public.orders (
    id, order_number, source, customer_name, customer_phone,
    delivery_label, target_delivery_at, general_note,
    order_status, payment_status, total_amount, tracking_token
  ) values (
    v_order_id, v_number, 'ONLINE', v_name, v_phone,
    v_label, v_target, v_note,
    'NEW', 'WAITING', 0, v_token
  );

  for v_line in select * from private.load_items(p_items)
  loop
    insert into public.order_items (
      order_id, product_id, product_name_snapshot, category_name_snapshot,
      unit_price_snapshot, quantity, line_note, line_total
    ) values (
      v_order_id, v_line.product_id, v_line.product_name, v_line.category_name,
      v_line.unit_price, v_line.quantity, v_line.line_note, v_line.line_total
    );
    v_total := v_total + v_line.line_total;
  end loop;

  update public.orders set total_amount = v_total where id = v_order_id;

  perform private.log_event(v_order_id, 'ORDER_CREATED', null, 'ONLINE', null);

  return jsonb_build_object(
    'orderId', v_order_id,
    'orderNumber', v_number,
    'trackingToken', v_token,
    'trackingPath', '/takip/' || v_number::text || '/' || v_token,
    'totalAmount', v_total,
    'targetDeliveryAt', v_target,
    'deliveryLabel', v_label,
    'createdAt', now()
  );
end;
$$;

create or replace function public.track_order(p_order_number bigint, p_tracking_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_order public.orders;
begin
  if p_order_number is null or p_tracking_token is null or length(btrim(p_tracking_token)) < 16 then
    return null;
  end if;

  select * into v_order
    from public.orders
   where order_number = p_order_number
     and tracking_token = btrim(p_tracking_token)
   limit 1;

  if v_order.id is null then
    return null;
  end if;

  if v_order.tracking_expires_at is not null and now() > v_order.tracking_expires_at then
    return jsonb_build_object('expired', true, 'order', null);
  end if;

  return jsonb_build_object(
    'expired', false,
    'order', jsonb_build_object(
      'orderNumber', v_order.order_number,
      'status', v_order.order_status,
      'paymentStatus', v_order.payment_status,
      'totalAmount', v_order.total_amount,
      'deliveryLabel', v_order.delivery_label,
      'targetDeliveryAt', v_order.target_delivery_at,
      'generalNote', v_order.general_note,
      'createdAt', v_order.created_at,
      'updatedAt', v_order.updated_at,
      'deliveredAt', v_order.delivered_at,
      'items', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'productName', i.product_name_snapshot,
            'quantity', i.quantity,
            'lineNote', i.line_note,
            'unitPrice', i.unit_price_snapshot,
            'lineTotal', i.line_total
          )
          order by i.created_at, i.product_name_snapshot
        )
        from public.order_items i
        where i.order_id = v_order.id
      ), '[]'::jsonb)
    )
  );
end;
$$;

create or replace function public.public_display_orders()
returns jsonb
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'orderNumber', o.order_number,
        'status', o.order_status,
        'updatedAt', o.updated_at
      )
      order by o.updated_at
    ),
    '[]'::jsonb
  )
  from public.orders o
  where o.order_status in ('PREPARING', 'READY');
$$;

-- >>> 0006_staff_auth.sql

-- =====================================================================
-- CANTINOS — 0006 Personel oturum RPC'leri
-- =====================================================================

create or replace function public.staff_login(p_email text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_staff public.staff_accounts;
  v_token text;
  v_expires timestamptz := now() + interval '12 hours';
begin
  if coalesce(btrim(p_email), '') = '' or coalesce(p_password, '') = '' then
    raise exception 'E-posta ve parola zorunludur.';
  end if;

  select * into v_staff
    from public.staff_accounts
   where lower(email) = lower(btrim(p_email))
     and active = true
   limit 1;

  if v_staff.id is null
     or v_staff.password_hash is null
     or crypt(p_password, v_staff.password_hash) is distinct from v_staff.password_hash then
    raise exception 'E-posta veya parola hatalı.';
  end if;

  v_token := encode(gen_random_bytes(32), 'hex');

  insert into public.staff_sessions (staff_account_id, token_hash, expires_at, last_seen_at)
  values (v_staff.id, encode(digest(v_token, 'sha256'), 'hex'), v_expires, now());

  -- Süresi dolmuş eski oturumları temizle (kayıt geçmişi değil, yalnız süresi geçmiş oturumlar).
  delete from public.staff_sessions
   where expires_at < now() - interval '7 days';

  return jsonb_build_object(
    'token', v_token,
    'expiresAt', v_expires,
    'staff', jsonb_build_object(
      'id', v_staff.id,
      'email', v_staff.email,
      'displayName', v_staff.display_name,
      'role', v_staff.role
    )
  );
end;
$$;

create or replace function public.staff_logout(p_token text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if p_token is null then
    return true;
  end if;

  update public.staff_sessions
     set revoked_at = now()
   where token_hash = encode(digest(p_token, 'sha256'), 'hex')
     and revoked_at is null;

  return true;
end;
$$;

create or replace function public.staff_me(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_staff public.staff_accounts := private.require_staff(p_token);
begin
  return jsonb_build_object(
    'id', v_staff.id,
    'email', v_staff.email,
    'displayName', v_staff.display_name,
    'role', v_staff.role
  );
end;
$$;

-- >>> 0007_staff_order_rpcs.sql

-- =====================================================================
-- CANTINOS — 0007 Personel sipariş RPC'leri
-- =====================================================================

create or replace function private.staff_order_items_json(p_order_id uuid, p_with_money boolean)
returns jsonb
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select coalesce(
    jsonb_agg(
      case
        when p_with_money then jsonb_build_object(
          'productId', i.product_id,
          'productName', i.product_name_snapshot,
          'categoryName', i.category_name_snapshot,
          'unitPrice', i.unit_price_snapshot,
          'quantity', i.quantity,
          'lineNote', i.line_note,
          'lineTotal', i.line_total
        )
        else jsonb_build_object(
          'productName', i.product_name_snapshot,
          'quantity', i.quantity,
          'lineNote', i.line_note
        )
      end
      order by i.created_at, i.product_name_snapshot
    ),
    '[]'::jsonb
  )
  from public.order_items i
  where i.order_id = p_order_id;
$$;

create or replace function private.staff_order_problems_json(p_order_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'problemType', p.problem_type,
        'note', p.note,
        'reportedAt', p.reported_at,
        'reportedByName', (select sa.display_name from public.staff_accounts sa where sa.id = p.reported_by_staff_id),
        'informedAt', p.informed_at,
        'informedByName', (select sa.display_name from public.staff_accounts sa where sa.id = p.informed_by_staff_id),
        'clearedAt', p.cleared_at,
        'clearedByName', (select sa.display_name from public.staff_accounts sa where sa.id = p.cleared_by_staff_id)
      )
      order by p.reported_at desc
    ),
    '[]'::jsonb
  )
  from public.order_problems p
  where p.order_id = p_order_id;
$$;

create or replace function private.staff_order_payments_json(p_order_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'paymentType', p.payment_type,
        'paymentMethod', p.payment_method,
        'amount', p.amount,
        'receivedAmount', p.received_amount,
        'changeAmount', p.change_amount,
        'createdAt', p.created_at,
        'createdByName', (select sa.display_name from public.staff_accounts sa where sa.id = p.created_by_staff_id),
        'note', p.note
      )
      order by p.created_at
    ),
    '[]'::jsonb
  )
  from public.payments p
  where p.order_id = p_order_id;
$$;

create or replace function private.staff_order_json(p_order public.orders, p_full boolean)
returns jsonb
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select case
    when p_full then jsonb_build_object(
      'id', p_order.id,
      'orderNumber', p_order.order_number,
      'source', p_order.source,
      'customerName', p_order.customer_name,
      'customerPhone', p_order.customer_phone,
      'deliveryLabel', p_order.delivery_label,
      'targetDeliveryAt', p_order.target_delivery_at,
      'generalNote', p_order.general_note,
      'status', p_order.order_status,
      'paymentStatus', p_order.payment_status,
      'totalAmount', p_order.total_amount,
      'paidAmount', private.order_paid(p_order.id),
      'priorityOverride', p_order.priority_override,
      'priorityOverrideReason', p_order.priority_override_reason,
      'createdAt', p_order.created_at,
      'updatedAt', p_order.updated_at,
      'deliveredAt', p_order.delivered_at,
      'items', private.staff_order_items_json(p_order.id, true),
      'problems', private.staff_order_problems_json(p_order.id),
      'payments', private.staff_order_payments_json(p_order.id),
      'cancellationReason', (select c.reason from public.order_cancellations c where c.order_id = p_order.id)
    )
    else jsonb_build_object(
      'id', p_order.id,
      'orderNumber', p_order.order_number,
      'source', p_order.source,
      'deliveryLabel', p_order.delivery_label,
      'targetDeliveryAt', p_order.target_delivery_at,
      'generalNote', p_order.general_note,
      'status', p_order.order_status,
      'priorityOverride', p_order.priority_override,
      'createdAt', p_order.created_at,
      'updatedAt', p_order.updated_at,
      'items', private.staff_order_items_json(p_order.id, false)
    )
  end;
$$;

create or replace function public.staff_orders(
  p_token text,
  p_mode text default 'ACTIVE',
  p_search text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_staff public.staff_accounts := private.require_staff(p_token);
  v_result jsonb;
  v_mode text := upper(coalesce(p_mode, 'ACTIVE'));
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
begin
  if v_staff.role = 'KITCHEN' then
    select coalesce(jsonb_agg(j order by prio desc, target_at asc, created_at asc), '[]'::jsonb)
      into v_result
      from (
        select o.priority_override as prio,
               o.target_delivery_at as target_at,
               o.created_at,
               private.staff_order_json(o, false) as j
          from public.orders o
         where o.order_status in ('NEW', 'PREPARING', 'READY')
      ) s;
    return v_result;
  end if;

  if v_staff.role = 'CASHIER' then
    select coalesce(jsonb_agg(j order by target_at asc, created_at asc), '[]'::jsonb)
      into v_result
      from (
        select o.target_delivery_at as target_at,
               o.created_at,
               private.staff_order_json(o, true) as j
          from public.orders o
         where o.order_status not in ('DELIVERED', 'CANCELLED')
           and (
             o.order_status = 'READY'
             or exists (
               select 1 from public.order_problems p
               where p.order_id = o.id and p.cleared_at is null
             )
           )
      ) s;
    return v_result;
  end if;

  select coalesce(jsonb_agg(j order by created_at desc), '[]'::jsonb)
    into v_result
    from (
      select o.created_at,
             private.staff_order_json(o, true) as j
        from public.orders o
       where (v_mode = 'ALL' or o.order_status not in ('DELIVERED', 'CANCELLED'))
         and (
           v_search is null
           or o.order_number::text ilike '%' || v_search || '%'
           or coalesce(o.customer_name, '') ilike '%' || v_search || '%'
           or coalesce(o.customer_phone, '') ilike '%' || v_search || '%'
         )
       order by o.created_at desc
       limit 300
    ) s;

  return v_result;
end;
$$;

create or replace function public.staff_create_cashier_order(
  p_token text,
  p_items jsonb,
  p_payment_method text,
  p_received_amount numeric default null,
  p_customer_name text default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_staff public.staff_accounts := private.require_staff(p_token, array['CASHIER', 'MANAGER']);
  v_method text := upper(coalesce(p_payment_method, ''));
  v_order_id uuid := gen_random_uuid();
  v_number bigint;
  v_total numeric(12, 2) := 0;
  v_received numeric(12, 2);
  v_change numeric(12, 2) := 0;
  v_line record;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_customer text := nullif(btrim(coalesce(p_customer_name, '')), '');
  v_created timestamptz := now();
begin
  if v_method not in ('CASH', 'CARD') then
    raise exception 'Ödeme yöntemi seçmelisiniz.';
  end if;

  if v_note is not null and length(v_note) > 500 then
    raise exception 'Sipariş notu en fazla 500 karakter olabilir.';
  end if;

  if v_customer is not null and length(v_customer) > 80 then
    raise exception 'Müşteri adı en fazla 80 karakter olabilir.';
  end if;

  for v_line in select * from private.load_items(p_items)
  loop
    v_total := v_total + v_line.line_total;
  end loop;

  if v_total <= 0 then
    raise exception 'Sipariş tutarı geçersiz.';
  end if;

  if v_method = 'CASH' then
    if p_received_amount is null or p_received_amount < v_total then
      raise exception 'Alınan para sipariş toplamından düşük olamaz.';
    end if;
    v_received := round(p_received_amount, 2);
    v_change := round(v_received - v_total, 2);
  else
    v_received := v_total;
    v_change := 0;
  end if;

  v_number := nextval('public.order_number_seq');

  insert into public.orders (
    id, order_number, source, customer_name, delivery_label,
    target_delivery_at, general_note, order_status, payment_status,
    total_amount, created_at
  ) values (
    v_order_id, v_number, 'CASHIER', v_customer, 'Hemen',
    v_created, v_note, 'NEW', 'PAID',
    v_total, v_created
  );

  for v_line in select * from private.load_items(p_items)
  loop
    insert into public.order_items (
      order_id, product_id, product_name_snapshot, category_name_snapshot,
      unit_price_snapshot, quantity, line_note, line_total
    ) values (
      v_order_id, v_line.product_id, v_line.product_name, v_line.category_name,
      v_line.unit_price, v_line.quantity, v_line.line_note, v_line.line_total
    );
  end loop;

  insert into public.payments (
    order_id, payment_type, payment_method, amount,
    received_amount, change_amount, created_by_staff_id, note
  ) values (
    v_order_id, 'PAYMENT', v_method, v_total,
    v_received, v_change, v_staff.id, 'Kasa siparişi'
  );

  perform private.log_event(v_order_id, 'ORDER_CREATED', null, 'CASHIER', v_staff.id);

  return jsonb_build_object(
    'orderId', v_order_id,
    'orderNumber', v_number,
    'createdAt', v_created,
    'totalAmount', v_total,
    'paymentMethod', v_method,
    'receivedAmount', v_received,
    'changeAmount', v_change,
    'cashierName', v_staff.display_name,
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'productName', i.product_name_snapshot,
          'quantity', i.quantity,
          'unitPrice', i.unit_price_snapshot,
          'lineTotal', i.line_total
        )
        order by i.created_at, i.product_name_snapshot
      )
      from public.order_items i where i.order_id = v_order_id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.staff_set_order_status(
  p_token text,
  p_order_id uuid,
  p_status text
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_staff public.staff_accounts := private.require_staff(p_token, array['KITCHEN', 'CASHIER', 'MANAGER']);
  v_order public.orders;
  v_status text := upper(coalesce(p_status, ''));
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then
    raise exception 'Sipariş bulunamadı.';
  end if;

  if v_status not in ('NEW', 'PREPARING', 'READY', 'DELIVERED') then
    raise exception 'Geçersiz sipariş durumu.';
  end if;

  if v_order.order_status in ('DELIVERED', 'CANCELLED') then
    raise exception 'Bu sipariş kapanmış; durumu değiştirilemez.';
  end if;

  if v_staff.role = 'KITCHEN' then
    if not (
      (v_order.order_status = 'NEW' and v_status = 'PREPARING')
      or (v_order.order_status = 'PREPARING' and v_status = 'READY')
      or (v_order.order_status = 'READY' and v_status = 'PREPARING')
    ) then
      raise exception 'Mutfak bu durum geçişini yapamaz.';
    end if;
  elsif v_staff.role = 'CASHIER' then
    if not (v_order.order_status = 'READY' and v_status = 'DELIVERED') then
      raise exception 'Kasa yalnız hazır siparişi teslim edebilir.';
    end if;
  end if;

  if v_status = 'DELIVERED' then
    if v_order.payment_status <> 'PAID' then
      raise exception 'Ödemesi alınmamış sipariş teslim edilemez.';
    end if;
    perform private.require_settled(v_order.id);

    update public.orders
       set order_status = 'DELIVERED',
           delivered_at = now(),
           tracking_expires_at = now() + interval '1 hour'
     where id = v_order.id;
  else
    update public.orders
       set order_status = v_status
     where id = v_order.id;
  end if;

  perform private.log_event(v_order.id, 'STATUS_CHANGED', v_order.order_status, v_status, v_staff.id);
  return true;
end;
$$;

create or replace function public.staff_take_payment(
  p_token text,
  p_order_id uuid,
  p_method text,
  p_received_amount numeric default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_staff public.staff_accounts := private.require_staff(p_token, array['CASHIER', 'MANAGER']);
  v_order public.orders;
  v_method text := upper(coalesce(p_method, ''));
  v_paid numeric;
  v_outstanding numeric;
  v_received numeric;
  v_change numeric := 0;
begin
  if v_method not in ('CASH', 'CARD') then
    raise exception 'Ödeme yöntemi seçmelisiniz.';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then
    raise exception 'Sipariş bulunamadı.';
  end if;

  if v_order.order_status in ('DELIVERED', 'CANCELLED') then
    raise exception 'Kapanmış siparişe ödeme alınamaz.';
  end if;

  v_paid := private.order_paid(v_order.id);
  v_outstanding := round(v_order.total_amount - v_paid, 2);

  if v_outstanding <= 0.005 then
    raise exception 'Bu sipariş için ödeme tamamlanmış.';
  end if;

  if v_method = 'CASH' then
    if p_received_amount is null or p_received_amount < v_outstanding then
      raise exception 'Alınan para kalan tutardan düşük olamaz.';
    end if;
    v_received := round(p_received_amount, 2);
    v_change := round(v_received - v_outstanding, 2);
  else
    v_received := v_outstanding;
    v_change := 0;
  end if;

  insert into public.payments (
    order_id, payment_type, payment_method, amount,
    received_amount, change_amount, created_by_staff_id, note
  ) values (
    v_order.id, 'PAYMENT', v_method, v_outstanding,
    v_received, v_change, v_staff.id, nullif(btrim(coalesce(p_note, '')), '')
  );

  update public.orders set payment_status = 'PAID' where id = v_order.id;

  perform private.log_event(
    v_order.id, 'PAYMENT_RECEIVED', v_order.payment_status, 'PAID', v_staff.id
  );

  return jsonb_build_object(
    'paidAmount', v_outstanding,
    'changeAmount', v_change,
    'paymentStatus', 'PAID'
  );
end;
$$;

create or replace function public.staff_refund_order(
  p_token text,
  p_order_id uuid,
  p_method text,
  p_amount numeric,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_staff public.staff_accounts := private.require_staff(p_token, array['MANAGER']);
  v_order public.orders;
  v_method text := upper(coalesce(p_method, ''));
  v_reason text := private.require_reason(p_reason, 'İade nedeni');
  v_paid numeric;
  v_remaining numeric;
begin
  if v_method not in ('CASH', 'CARD') then
    raise exception 'İade yöntemi seçmelisiniz.';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'İade tutarı sıfırdan büyük olmalıdır.';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then
    raise exception 'Sipariş bulunamadı.';
  end if;

  v_paid := private.order_paid(v_order.id);
  if p_amount > v_paid + 0.005 then
    raise exception 'İade tutarı alınan ödemeden büyük olamaz.';
  end if;

  insert into public.payments (
    order_id, payment_type, payment_method, amount,
    created_by_staff_id, note
  ) values (
    v_order.id, 'REFUND', v_method, round(p_amount, 2), v_staff.id, v_reason
  );

  v_remaining := round(v_paid - p_amount, 2);

  update public.orders
     set payment_status = case
       when v_order.order_status = 'CANCELLED' and v_remaining <= 0.005 then 'REFUNDED'
       when v_order.order_status = 'CANCELLED' then 'REFUND_PENDING'
       when v_remaining <= 0.005 then 'REFUNDED'
       when v_remaining >= v_order.total_amount - 0.005 then 'PAID'
       else 'REFUND_PENDING'
     end
   where id = v_order.id;

  perform private.log_event(
    v_order.id, 'REFUND_ISSUED', v_order.payment_status, v_remaining::text, v_staff.id
  );

  return true;
end;
$$;

create or replace function public.staff_cancel_order(
  p_token text,
  p_order_id uuid,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_staff public.staff_accounts := private.require_staff(p_token, array['MANAGER']);
  v_order public.orders;
  v_reason text := private.require_reason(p_reason, 'İptal nedeni');
  v_paid numeric;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then
    raise exception 'Sipariş bulunamadı.';
  end if;

  if v_order.order_status = 'DELIVERED' then
    raise exception 'Teslim edilmiş sipariş iptal edilemez.';
  end if;
  if v_order.order_status = 'CANCELLED' then
    raise exception 'Bu sipariş zaten iptal edilmiş.';
  end if;

  v_paid := private.order_paid(v_order.id);

  insert into public.order_cancellations (order_id, reason, cancelled_by_staff_id)
  values (v_order.id, v_reason, v_staff.id);

  update public.orders
     set order_status = 'CANCELLED',
         payment_status = case when v_paid > 0.005 then 'REFUND_PENDING' else payment_status end
   where id = v_order.id;

  perform private.log_event(v_order.id, 'ORDER_CANCELLED', v_order.order_status, v_reason, v_staff.id);
  return true;
end;
$$;

create or replace function public.staff_adjust_order(
  p_token text,
  p_order_id uuid,
  p_items jsonb,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_staff public.staff_accounts := private.require_staff(p_token, array['MANAGER']);
  v_order public.orders;
  v_reason text := private.require_reason(p_reason, 'Düzeltme nedeni');
  v_total numeric(12, 2) := 0;
  v_old_items jsonb;
  v_line record;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then
    raise exception 'Sipariş bulunamadı.';
  end if;

  if v_order.order_status in ('DELIVERED', 'CANCELLED') then
    raise exception 'Kapanmış sipariş düzeltilemez.';
  end if;

  v_old_items := private.staff_order_items_json(v_order.id, true);

  delete from public.order_items where order_id = v_order.id;

  for v_line in select * from private.load_items(p_items)
  loop
    insert into public.order_items (
      order_id, product_id, product_name_snapshot, category_name_snapshot,
      unit_price_snapshot, quantity, line_note, line_total
    ) values (
      v_order.id, v_line.product_id, v_line.product_name, v_line.category_name,
      v_line.unit_price, v_line.quantity, v_line.line_note, v_line.line_total
    );
    v_total := v_total + v_line.line_total;
  end loop;

  update public.orders set total_amount = v_total where id = v_order.id;

  perform private.log_event(
    v_order.id,
    'ORDER_ADJUSTED',
    v_old_items::text || ' | toplam: ' || v_order.total_amount::text,
    v_total::text || ' | neden: ' || v_reason,
    v_staff.id
  );

  return jsonb_build_object(
    'totalAmount', v_total,
    'paidAmount', private.order_paid(v_order.id),
    'reason', v_reason
  );
end;
$$;

create or replace function public.staff_report_problem(
  p_token text,
  p_order_id uuid,
  p_problem_type text,
  p_note text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_staff public.staff_accounts := private.require_staff(p_token, array['KITCHEN', 'CASHIER', 'MANAGER']);
  v_order public.orders;
  v_type text := upper(coalesce(p_problem_type, ''));
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if v_type not in ('OUT_OF_STOCK', 'MISSING_INGREDIENT', 'NOTE_UNCLEAR', 'EQUIPMENT_BUSY', 'WONT_MAKE_BREAK', 'OTHER') then
    raise exception 'Geçersiz sorun türü.';
  end if;
  if v_note is not null and length(v_note) > 500 then
    raise exception 'Sorun açıklaması en fazla 500 karakter olabilir.';
  end if;

  select * into v_order from public.orders where id = p_order_id;
  if v_order.id is null then
    raise exception 'Sipariş bulunamadı.';
  end if;
  if v_order.order_status in ('DELIVERED', 'CANCELLED') then
    raise exception 'Kapanmış siparişe sorun bildirilemez.';
  end if;

  insert into public.order_problems (order_id, problem_type, note, reported_by_staff_id)
  values (v_order.id, v_type, v_note, v_staff.id);

  perform private.log_event(v_order.id, 'PROBLEM_REPORTED', null, v_type, v_staff.id);
  return true;
end;
$$;

create or replace function public.staff_mark_informed(p_token text, p_problem_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_staff public.staff_accounts := private.require_staff(p_token, array['CASHIER', 'MANAGER']);
  v_problem public.order_problems;
begin
  select * into v_problem from public.order_problems where id = p_problem_id for update;
  if v_problem.id is null then
    raise exception 'Sorun kaydı bulunamadı.';
  end if;

  update public.order_problems
     set informed_at = coalesce(informed_at, now()),
         informed_by_staff_id = coalesce(informed_by_staff_id, v_staff.id)
   where id = v_problem.id;

  perform private.log_event(v_problem.order_id, 'PROBLEM_INFORMED', null, v_problem.problem_type, v_staff.id);
  return true;
end;
$$;

create or replace function public.staff_clear_problem(p_token text, p_problem_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_staff public.staff_accounts := private.require_staff(p_token, array['CASHIER', 'MANAGER']);
  v_problem public.order_problems;
begin
  select * into v_problem from public.order_problems where id = p_problem_id for update;
  if v_problem.id is null then
    raise exception 'Sorun kaydı bulunamadı.';
  end if;

  update public.order_problems
     set cleared_at = coalesce(cleared_at, now()),
         cleared_by_staff_id = coalesce(cleared_by_staff_id, v_staff.id)
   where id = v_problem.id;

  perform private.log_event(v_problem.order_id, 'PROBLEM_CLEARED', v_problem.problem_type, null, v_staff.id);
  return true;
end;
$$;

create or replace function public.staff_set_priority_override(
  p_token text,
  p_order_id uuid,
  p_priority boolean,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_staff public.staff_accounts := private.require_staff(p_token, array['MANAGER']);
  v_order public.orders;
  v_reason text;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then
    raise exception 'Sipariş bulunamadı.';
  end if;
  if v_order.order_status in ('DELIVERED', 'CANCELLED') then
    raise exception 'Kapanmış siparişe öncelik verilemez.';
  end if;

  if coalesce(p_priority, false) then
    v_reason := private.require_reason(p_reason, 'Öncelik nedeni');
  else
    v_reason := null;
  end if;

  update public.orders
     set priority_override = coalesce(p_priority, false),
         priority_override_reason = v_reason
   where id = v_order.id;

  perform private.log_event(
    v_order.id,
    'PRIORITY_CHANGED',
    v_order.priority_override::text,
    coalesce(p_priority, false)::text || coalesce(' | ' || v_reason, ''),
    v_staff.id
  );

  return true;
end;
$$;

-- >>> 0008_staff_admin_rpcs.sql

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
    availability_status, availability_note, availability_note_public, availability_changed_at
  ) values (
    v_category_id, v_name, v_description, v_price, v_image_url, v_sort,
    v_status, case when v_status = 'CLOSED' then v_note else null end,
    case when v_status = 'CLOSED' then v_note_public else true end,
    now()
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

    insert into public.categories (name, sort_order) values (v_name, v_sort)
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
         sort_order = coalesce((p_category ->> 'sortOrder')::integer, sort_order)
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

-- >>> 0009_reports.sql

-- =====================================================================
-- CANTINOS — 0009 Rapor, gün sonu ve analitik RPC'leri
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

-- >>> 0010_rls_and_grants.sql

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

-- >>> 0011_storage.sql

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
