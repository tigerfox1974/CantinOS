# CantinOS — Canlı Sipariş ve İşletme Yönetim Sistemi

CantinOS için tek Vercel projesi, tek GitHub deposu ve tek Supabase projesiyle çalışan; müşteri, mutfak, kasa ve yönetici ekranlarının **aynı canlı veritabanı** üzerinden haberleştiği sipariş yönetim sistemi.

- Müşteri menüsü: `/`
- Gizli sipariş takibi: `/takip/:siparisNo/:trackingToken`
- TV / monitör bekleme ekranı: `/bekleme`
- Personel girişi: `/personel`
- Mutfak: `/personel/mutfak`
- Kasa: `/personel/kasa`
- Yönetim: `/personel/yonetim`

> Saat dilimi her yerde **Asia/Nicosia**'dır. Arayüz, hata, fiş ve rapor metinleri Türkçedir. Para birimi **TL** olarak yazılır (`₺` kullanılmaz).

---

## 1. Teknoloji

| Katman | Teknoloji |
|---|---|
| Ön yüz | React 18 + TypeScript |
| Kurulum / derleme | Vite |
| Yönlendirme | React Router |
| Tasarım | Bootstrap 5 + Bootswatch Spacelab |
| Veritabanı / iş kuralları | Supabase PostgreSQL + SQL RPC |
| Görsel yükleme | Supabase Edge Function (Deno/TypeScript) |
| Excel | xlsx-js-style (`.xlsx`) |
| Yayın | GitHub → Vercel |
| Dosya saklama | Supabase Storage (`product-images`) |

Ayrı bir Node.js sunucusu, PHP/Python/Rust backend veya ikinci bir Vercel projesi **yoktur**.

---

## 2. Klasör yapısı

```
src/
  app/                 # Rotalar ve uygulama kabuğu
  components/          # Ortak UI (modal, rozet, uyarı, kabuk)
  features/
    customer/          # Müşteri menüsü, sepet, sipariş, takip
    kitchen/           # Mutfak ekranı, sesli uyarı, sorun bildirimi
    cashier/           # Kasa, ödeme, teslim, termal fiş
    manager/           # Genel bakış, katalog, sipariş, rapor, kapanış
    waiting-display/   # TV bekleme ekranı
    staff-auth/        # Personel oturumu ve rol koruması
  hooks/               # (gerekirse) ek hook'lar
  lib/                 # Supabase, RPC, hata, format, canlı güncelleme
  styles/              # Uygulama ve yazdırma stilleri
  types/               # Alan tipleri
database/
  schema.sql           # Tüm şemayı kuran eksiksiz dosya
  seed.demo.sql        # Yalnız demo/geliştirme verisi
  create_manager.sql   # İlk gerçek yönetici hesabı örneği
  migrations/          # Tarih sıralı migration dosyaları
supabase/
  config.toml
  functions/
    upload-product-image/
tests/                 # Birim testleri ve SQL kabul senaryoları
scripts/
  build-schema.mjs     # schema.sql'i migration'lardan üretir
vercel.json
.env.example
```

`database/schema.sql` **otomatik üretilir**. Kaynak dosyalar `database/migrations/` altındadır:

```bash
npm run schema:build
```

---

## 3. Bilgisayarda projeyi açma

Gereksinimler:

- Node.js 20 veya üzeri
- npm 10 veya üzeri
- Git
- (İsteğe bağlı) Supabase CLI

```bash
cd C:\Users\Fevzi\Projects\CantinOS
npm install
```

---

## 4. Supabase projesi oluşturma

1. [supabase.com](https://supabase.com) üzerinden yeni bir proje oluşturun.
2. Proje ayarlarından **Project URL** ve **anon public** anahtarını kopyalayın.
3. `service_role` anahtarını **hiçbir zaman** tarayıcıya, Vite ortam değişkenlerine veya Vercel'e koymayın.

Proje kökünde `.env` oluşturun:

```env
VITE_SUPABASE_URL=https://<proje-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-public-key>
```

`.env` git'e eklenmez (`.gitignore` içindedir). Örnek dosya: `.env.example`.

---

## 5. Şemayı ve migration'ları uygulama

### Yol A — Supabase SQL Editor (önerilen, tek seferlik kurulum)

1. Supabase panelinde **SQL Editor** açın.
2. `database/schema.sql` dosyasının tamamını yapıştırıp çalıştırın.
3. Yalnız geliştirme/demo ortamı için `database/seed.demo.sql` dosyasını çalıştırın.

`database/schema.sql`, `database/migrations/0001…0011` dosyalarının birleşimidir; yeni projeyi baştan kurar.

### Yol B — Migration dosyalarını sırayla

SQL Editor'de `database/migrations/` altındaki dosyaları dosya adı sırasıyla çalıştırın:

```
0001_foundation.sql
0002_staff_and_settings.sql
0003_catalog.sql
0004_orders.sql
0005_public_rpcs.sql
0006_staff_auth.sql
0007_staff_order_rpcs.sql
0008_staff_admin_rpcs.sql
0009_reports.sql
0010_rls_and_grants.sql
0011_storage.sql
```

### Yol C — Supabase CLI

CLI `supabase/migrations` klasörünü bekler. Repodaki kaynak `database/migrations` olduğu için önce kopyalayın:

```bash
mkdir supabase\migrations
copy database\migrations\*.sql supabase\migrations\
npx supabase link --project-ref <proje-ref>
npx supabase db push
```

> Not: `supabase/migrations` kopyası `.gitignore` dışındadır; isterseniz sürüm kontrolüne eklemeyin, tek doğruluk kaynağı `database/migrations` olsun.

---

## 6. Storage bucket kurma

`0011_storage.sql` migration'ı `product-images` bucket'ını oluşturur:

- Public okuma açık (ürün görselleri menüde gösterilir).
- Yazma yalnız Edge Function'ın service role anahtarıyla yapılır.
- Yalnız PNG/JPEG, en fazla 3 MB.
- Bucket oluşmadıysa panelden **Storage → New bucket** ile `product-images` adında public bucket oluşturun ve boyut/MIME sınırlarını girin.

---

## 7. Edge Function gizli değişkenleri

`upload-product-image` fonksiyonu personel oturumunu doğrular, yalnız `MANAGER` rolüne izin verir, dosya imzasını kontrol eder ve görseli Storage'a yükler.

```bash
npx supabase functions deploy upload-product-image --project-ref <proje-ref> --no-verify-jwt
```

Supabase hosted fonksiyonlarda `SUPABASE_URL`, `SUPABASE_ANON_KEY` ve `SUPABASE_SERVICE_ROLE_KEY` otomatik sağlanır. Yine de kontrol etmek için:

```bash
npx supabase secrets list --project-ref <proje-ref>
```

Gerekirse:

```bash
npx supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<service-role-key> --project-ref <proje-ref>
```

> `SUPABASE_SERVICE_ROLE_KEY` yalnız Edge Function sunucu ortamında bulunur. Vite `.env` dosyasına veya Vercel ortam değişkenlerine **eklenmez**.

---

## 8. Demo hesaplar ve ilk gerçek yönetici

### Demo (yalnız geliştirme)

`database/seed.demo.sql` çalıştırıldıysa:

| Rol | E-posta | Parola |
|---|---|---|
| Kasa | `kasa@cantinos.demo` | `Kasa123!` |
| Mutfak | `mutfak@cantinos.demo` | `Mutfak123!` |
| Yönetici | `yonetici@cantinos.demo` | `Yonetici123!` |

Bu hesaplar üretimde otomatik oluşturulmaz. Üretimde seed dosyasını **çalıştırmayın**.

### İlk gerçek yönetici

1. `database/create_manager.sql` dosyasını açın.
2. E-posta, görünen ad ve parolayı değiştirin.
3. SQL Editor'de bir kez çalıştırın.
4. Parolayı kimseyle paylaşmayın; giriş yaptıktan sonra gerekiyorsa yeni bir parola hash'i üretin.

Parolalar `pgcrypto` + `crypt` + `gen_salt('bf')` ile bcrypt olarak saklanır; düz metin parola tutulmaz.

---

## 9. Yerelde çalıştırma

```bash
npm run dev
```

Vite varsayılan olarak `http://localhost:5173` adresini açar.

- Müşteri ekranı: `http://localhost:5173/`
- Bekleme ekranı: `http://localhost:5173/bekleme`
- Personel girişi: `http://localhost:5173/personel`

---

## 10. Test çalıştırma

```bash
npm run test        # Vitest (tek sefer)
npm run test:watch  # izleyerek
npm run build       # tsc -b + vite build
```

SQL kabul senaryoları: `tests/sql/acceptance.sql`. Supabase SQL Editor'de (veya `psql` ile) çalıştırılabilir; transaction sonunda `ROLLBACK` yapar, kalıcı veri bırakmaz.

---

## 11. GitHub'a gönderme

```bash
git init
git add .
git commit -m "feat: CantinOS siparis ve isletme yonetimi"
git branch -M main
git remote add origin https://github.com/<kullanici>/<repo>.git
git push -u origin main
```

`.env`, `node_modules`, `dist` ve `.vercel` git'e girmez.

---

## 12. Vercel'e bağlama

1. Vercel'de **Add New Project** → GitHub deposunu seçin.
2. Framework Preset: **Vite**.
3. Build Command: `npm run build`.
4. Output Directory: `dist`.
5. **Environment Variables**:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
6. Deploy.

`vercel.json` içinde SPA yönlendirmesi (`/(.*) → /index.html`) ve temel güvenlik başlıkları hazırdır.

> `service_role` anahtarını Vercel'e **eklemeyin**.

---

## 13. Yayın sonrası kontrol listesi

- [ ] `/` müşteri menüsü açılıyor; ürünler ve fiyatlar geliyor.
- [ ] Online sipariş kapalıyken menü görünüyor, sipariş formu devre dışı.
- [ ] Sipariş sonrası sipariş numarası ve gizli takip bağlantısı görünüyor.
- [ ] Takip bağlantısı yalnız kendi siparişini açıyor; yanlış token bilgi vermiyor.
- [ ] Teslimden 1 saat sonra takip bağlantısı süresi doluyor.
- [ ] `/bekleme` yalnız hazırlanan/hazır sipariş numaralarını gösteriyor.
- [ ] Personel girişi çalışıyor; her rol yalnız kendi ekranına giriyor.
- [ ] Mutfak müşteri adı, telefon, fiyat ve ödeme bilgisi görmüyor.
- [ ] Mutfak siparişi iptal edemiyor; sorun bildirimi kasa/yönetime düşüyor.
- [ ] Kasa ödeme almadan sipariş oluşturamıyor.
- [ ] Online sipariş ödeme alınmadan teslim edilemiyor.
- [ ] Nakit para üstü doğru hesaplanıyor.
- [ ] Kasa teslim edilmiş geçmiş siparişleri görmüyor.
- [ ] Ürün kapatma nedeni müşteriye göster/gizle seçimi çalışıyor.
- [ ] Teneffüs saati ve özel saat öncelik sırası doğru.
- [ ] Gün sonu kasa farkı doğru hesaplanıyor; kapanış kaydı değiştirilemiyor.
- [ ] Ödenmiş sipariş iptalinde iade kaydı zorunlu.
- [ ] Ürün adı/fiyatı değişince eski sipariş satırları değişmiyor.
- [ ] Excel raporu biçimli `.xlsx` olarak iniyor.
- [ ] `npm run build` hatasız tamamlanıyor.
- [ ] Edge Function yalnız yöneticiye görsel yükletiyor; 3 MB üstü ve sahte MIME reddediliyor.

---

## 14. Güvenlik modeli

- `anon` ve `authenticated` rollerinin hiçbir tabloya doğrudan `SELECT/INSERT/UPDATE/DELETE` yetkisi yoktur.
- Tüm tablolarda RLS açıktır; tablo yetkileri geri alınmıştır.
- Bütün işlemler `SECURITY DEFINER` RPC'lerden geçer; her personel RPC'si `private.require_staff(token, roller)` ile oturumu ve rolü doğrular.
- Oturum anahtarı 32 byte rastgele üretilir; veritabanında yalnız SHA-256 hash'i saklanır.
- Parolalar bcrypt (`crypt` + `gen_salt('bf')`) ile saklanır.
- Her `SECURITY DEFINER` fonksiyonda sabit `search_path = public, extensions, pg_temp` kullanılır.
- Fonksiyon `EXECUTE` yetkileri önce `PUBLIC/anon/authenticated` için kaldırılır; yalnız uygulamanın ihtiyaç duyduğu RPC'ler `anon` rolüne açılır.
- Müşteri takibi sipariş numarası **ve** gizli takip anahtarı ister. Numara tek başına bilgi vermez.
- Mutfak RPC'si müşteri adı, telefon, fiyat, toplam ve ödeme bilgisi döndürmez.
- Ödeme, iptal ve kasa kapanışı kayıtları trigger ile değiştirilemez/silinemez.
- Teknik veritabanı hataları kullanıcıya gösterilmez; Türkçe kullanıcı mesajı üretilir, ayrıntı yalnız geliştirme konsoluna yazılır.
- Ürün görseli yüklemesi tarayıcıdan doğrudan Storage'a yapılmaz; Edge Function personel oturumunu ve dosya imzasını doğrular.

---

## 15. İş kuralları özeti

- Sipariş numarası 1001'den başlar ve PostgreSQL sequence ile eşzamanlı güvenli üretilir.
- Online siparişler `WAITING` ödeme durumuyla oluşur; ödeme teslimde alınır.
- Kasa siparişi ödeme alınmadan oluşturulamaz; oluşturulunca `PAID` ve `NEW` olur.
- Ödemesi alınmamış veya bakiyesi kapanmamış sipariş `DELIVERED` yapılamaz.
- Ödenmiş sipariş iptalinde `REFUND_PENDING`; tam iade sonrası `REFUNDED` olur.
- Ürün adı, kategori adı ve birim fiyat sipariş anında kopyalanır; ürün sonradan değişse eski sipariş değişmez.
- Mutfak önceliği: yönetici geçici önceliği → en erken hedef teslim saati → en erken oluşturma zamanı.
- Teneffüs saati sonradan değişse bile mevcut siparişin kayıtlı hedef zamanı değişmez.
- "Hemen" seçeneği en yüksek teslim önceliğine sahiptir (hedef zaman = oluşturma anı).
- Kasa yalnız hazır ve açık sorunlu aktif siparişleri görür; teslim edilmiş geçmişi görmez.
- Mutfak siparişi iptal edemez veya silemez.
- Gün sonu kapanışı değiştirilemez; düzeltme yeni kayıt olarak oluşturulur.
- Kâr/maliyet, stok sayımı, müşteri hesabı, SMS/WhatsApp, online kart ödemesi, kurye, çoklu şube ve otomatik fiziksel yazdırma bu sürümün kapsamı dışındadır.

---

## 16. Termal fiş

Kasa ekranındaki fiş modalı 58 mm ve 80 mm düzen sunar. `Yazdır` tarayıcının yazdırma penceresini açar; `@media print` kuralları yalnız fişi yazdırır. Otomatik/sessiz fiziksel yazdırma bu sürüme dahil değildir.

---

## 17. Canlı güncelleme

Müşteri takip ekranı, sipariş başarı modalı, bekleme ekranı, mutfak, kasa ve yönetim ekranları yaklaşık **2,5 saniyede** bir sessizce güncellenir. Güncelleme sırasında:

- sayfa yenilenmez,
- form ve sepet sıfırlanmaz,
- açık modal kapanmaz,
- mutfak sütunlarının kaydırma konumu bozulmaz,
- kullanıcının yazdığı metin silinmez.

---

## 18. Sorun giderme

| Belirti | Çözüm |
|---|---|
| "Sistem yapılandırması eksik" | `.env` içinde `VITE_SUPABASE_URL` ve `VITE_SUPABASE_ANON_KEY` var mı? |
| Giriş "E-posta veya parola hatalı" | Demo seed çalıştırıldı mı? İlk yönetici oluşturuldu mu? |
| Menü boş | Kategori/ürün eklenmiş mi? Ürünler `ARCHIVED` değil mi? |
| Görsel yüklenmiyor | Edge Function deploy edildi mi? `product-images` bucket var mı? Dosya PNG/JPEG ve ≤3 MB mı? |
| Rapor boş | Seçilen tarih aralığında teslim edilmiş sipariş var mı? |
| 404 / sayfa yenileme | `vercel.json` rewrite kuralı deploy edilmiş mi? |

---

## 19. Lisans

Bu proje CantinOS olarak geliştirilmiştir.
