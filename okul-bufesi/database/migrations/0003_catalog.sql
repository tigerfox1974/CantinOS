-- =====================================================================
-- OKUL BÜFESİ — 0003 Kategori, ürün ve teslim zamanları
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
