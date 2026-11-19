-- =====================================================================
-- CANTINOS — DEMO SEED
-- YALNIZ geliştirme/demo ortamı içindir. Üretimde çalıştırmayın.
-- Demo personel:
--   kasa@cantinos.demo / Kasa123!
--   mutfak@cantinos.demo / Mutfak123!
--   yonetici@cantinos.demo / Yonetici123!
-- =====================================================================

set search_path = public, extensions;

insert into public.staff_accounts (email, display_name, role, password_hash)
select 'kasa@cantinos.demo', 'Demo Kasa', 'CASHIER', crypt('Kasa123!', gen_salt('bf', 10))
where not exists (select 1 from public.staff_accounts where lower(email) = 'kasa@cantinos.demo');

insert into public.staff_accounts (email, display_name, role, password_hash)
select 'mutfak@cantinos.demo', 'Demo Mutfak', 'KITCHEN', crypt('Mutfak123!', gen_salt('bf', 10))
where not exists (select 1 from public.staff_accounts where lower(email) = 'mutfak@cantinos.demo');

insert into public.staff_accounts (email, display_name, role, password_hash)
select 'yonetici@cantinos.demo', 'Demo Yönetici', 'MANAGER', crypt('Yonetici123!', gen_salt('bf', 10))
where not exists (select 1 from public.staff_accounts where lower(email) = 'yonetici@cantinos.demo');

insert into public.categories (name, sort_order)
select * from (values
  ('Tost & Sandviç', 10),
  ('İçecekler', 20),
  ('Atıştırmalık', 30),
  ('Tatlı', 40)
) as v(name, sort_order)
where not exists (select 1 from public.categories);

insert into public.products (category_id, name, description, price, sort_order)
select c.id, v.name, v.description, v.price, v.sort_order
from (values
  ('Tost & Sandviç', 'Kaşarlı Tost', 'Taze kaşar, tam buğday ekmeği', 45.00, 10),
  ('Tost & Sandviç', 'Karışık Tost', 'Kaşar, sucuk, domates', 55.00, 20),
  ('Tost & Sandviç', 'Ton Balıklı Sandviç', 'Ton balığı, mısır, mayonez', 60.00, 30),
  ('İçecekler', 'Ayran', '300 ml', 15.00, 10),
  ('İçecekler', 'Meyve Suyu', '200 ml kutu', 20.00, 20),
  ('İçecekler', 'Su', '500 ml', 10.00, 30),
  ('Atıştırmalık', 'Simit', 'Günlük taze', 12.00, 10),
  ('Atıştırmalık', 'Poğaça', 'Peynirli', 18.00, 20),
  ('Tatlı', 'Kek', 'Kakaolu dilim kek', 25.00, 10),
  ('Tatlı', 'Bisküvi', 'Çikolatalı paket', 15.00, 20)
) as v(category_name, name, description, price, sort_order)
join public.categories c on c.name = v.category_name
where not exists (select 1 from public.products);
