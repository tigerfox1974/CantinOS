-- =====================================================================
-- OKUL BÜFESİ — 0001 Temel yapı, yardımcı fonksiyonlar
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
