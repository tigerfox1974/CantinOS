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
