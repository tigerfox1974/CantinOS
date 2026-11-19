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


