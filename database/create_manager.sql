-- =====================================================================
-- CANTINOS — İlk gerçek yönetici hesabı
-- Kullanım: parolayı değiştirin, SQL Editor'de bir kez çalıştırın.
-- Parola düz metin olarak saklanmaz; bcrypt ile hash'lenir.
-- =====================================================================

-- Parolayı burada değiştirin:
-- (Bu dosyayı çalıştırdıktan sonra parolayı kimseyle paylaşmayın.)

set search_path = public, extensions;

insert into public.staff_accounts (email, display_name, role, password_hash)
select 'yonetici@cantinos.com', 'CantinOS Yöneticisi', 'MANAGER',
       crypt('GucluBirParola!2026', gen_salt('bf', 10))
where not exists (
  select 1 from public.staff_accounts where lower(email) = 'yonetici@cantinos.com'
);
