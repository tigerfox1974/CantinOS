# CantinOS — Ürün Kararları ve Geliştirme Kapsamı

Bu belge, proje geliştirme görüşmelerinde kesinleşen ürün kararlarını tek yerde toplar. Teknik uygulama planı bu kararları esas almalıdır.

## 1. Ürün amacı ve kullanım ortamı

- CantinOS, şimdilik **tek şubeli** bir kantin yönetim sistemidir.
- Müşteri menüsüne hem doğrudan bağlantıdan hem kantindeki QR koddan ulaşır.
- Müşteriler çoğunlukla kendi telefonlarını kullanır.
- Mutfak ve kasa tablet/bilgisayar kullanır; bekleme ekranı TV'de çalışır.
- Kasada QR/barkod okuyucu veya kamera bulunabilir.
- Saat dilimi `Asia/Nicosia` olarak kalacaktır.
- Arayüz ve operasyon dili Türkçedir.

## 2. Roller ve yetkiler

İlk gerçek kullanımta planlanan ekip:

- 2 mutfak çalışanı
- 2 kasiyer
- 2 yönetici

### Müşteri

- Misafir olarak, giriş yapmadan sipariş verebilir.
- İsterse müşteri hesabı oluşturabilir.
- Misafir siparişleri daha sonra bir müşteri hesabına aktarılmaz.
- Giriş yapılmış hesapla oluşturulan siparişler; geçmiş, puan ve favori özelliklerine dâhil olur.

### Mutfak

- Ortak sipariş kuyruğundan çalışır; siparişler belirli bir mutfak çalışanına atanmaz.
- Yalnızca sipariş numarası, hedef teslim saati, ürünler ve notları görür.
- Müşteri adı, telefon, ödeme ve fiyat verilerini görmez.
- Siparişi iptal etmez veya düzenlemez; yalnızca sorun bildirir.

### Kasiyer

- `NEW`, `PREPARING` ve `READY` durumundaki tüm aktif siparişleri görür.
- Siparişi yalnızca `READY` durumundayken teslim eder.
- Kayıtlı müşteriyi müşteri numarası, telefon, e-posta veya QR/barkod ile bulabilir.
- Müşterinin adı, puanı ve sipariş geçmişini görebilir.
- Yönetici yokken, mutfağın bildirdiği sorunları çözebilir ve ödeme öncesinde sipariş/ürün iptali yapabilir.
- Stok ekleme ve stok düzeltme yapabilir; tüm hareketler kayda geçer.

### Yönetici

- Ürün, kategori, teslim saati, stok ve online sipariş ayarlarını yönetir.
- Ürünü geçici olarak "tükendi" durumuna alma yetkisi yalnızca yöneticidedir.
- Sorunlu siparişlerde iptal veya kısmi devam kararını verir.
- Ayrıntılı raporlar, Excel dışa aktarma, müşteri listesi ve denetim kayıtları yalnızca yöneticilere açıktır.
- Gün sonu kasa kapanışını yapar.

## 3. Müşteri hesabı

Müşteri hesabı herkese açıktır; yalnızca belirli bir okulun öğrencileriyle sınırlı değildir.

### Kayıt bilgileri

- Zorunlu: ad-soyad, telefon, e-posta, şifre.
- İsteğe bağlı: okul numarası.
- Her kayıtlı müşteriye sistemin ürettiği, değişmeyen bir müşteri numarası verilir. Örnek: `C-10001`.
- Müşteri kendi ad-soyad, telefon ve e-posta bilgilerini sonradan güncelleyebilir.

### Hesap özellikleri

- Sipariş geçmişi yalnızca giriş yapılmış hesapla verilen siparişlerden oluşur.
- Kasadan müşterinin hesabına işlenen siparişler de müşterinin kendi geçmişinde görünür.
- Favoriler iki kaynakla oluşur:
  - müşterinin elle seçtiği favoriler;
  - sistemin sipariş geçmişinden çıkardığı sık alınan ürünler.
- Müşteri hesabı QR/barkod gösterir.
- Müşteri puanı, yalnızca kayıtlı müşterinin **teslim edilmiş** siparişi sonrasında kazanılır.
- Puan bakiyesi hesapta görünür.
- Puan harcama, indirim, kupon veya ücretsiz ürün kuralları daha sonraki sürümde kararlaştırılacaktır.

## 4. Sipariş ve teslim akışı

### Sipariş numarası

- Sipariş numarası sistem genelinde sürekli artan ve tekil kalır.
- Müşteri ve bekleme ekranında `#1048` biçiminde gösterilir.
- Günlük olarak yeniden `1`den başlamaz.

### Teslim zamanı

- Yalnızca gün içi sipariş alınır; ileri günler için ön sipariş yoktur.
- Yönetici teslim saatlerini ekler, düzenler, sıralar ve geçici olarak açıp kapatır.
- Müşteri aktif teslim saatlerinden birini seçebilir.
- Müşteri ayrıca gün içinde özel bir saat seçebilir.
- Özel saatler 5 dakikalık aralıklarla seçilir: `10:30`, `10:35`, `10:40` gibi.
- Teslim saatlerinde kapasite sınırı uygulanmaz; yoğunlukta da müşteri aynı saati seçebilir.

### Sıra ve tahmini süre

- Müşteriye, yalnızca seçtiği aynı teslim saati içindeki sırası gösterilir.
- Tahmin kesin dakika geri sayımı olarak verilmez.
- Uygun biçim: tahmini hazır olma zaman aralığı. Örnek: `Tahmini hazır olma: 10:28–10:32`.
- Yoğunluk/gecikme için ayrıca müşteri bildirimi gösterilmesi zorunlu değildir.

### Müşteri iptali

- Sipariş kendiliğinden iptal edilmez.
- Müşteri takip ekranındaki iptal düğmesine bilinçli olarak basar.
- İptal yalnızca ilk 30 saniye içinde ve sipariş `NEW`/beklemede iken mümkündür.
- Mutfak siparişi `PREPARING` durumuna aldığı anda müşteri iptali kapanır; 30 saniye dolmamış olsa da iptal edilemez.
- Müşteri siparişi düzenlemez; gerekiyorsa uygun süre içinde iptal eder ve yeni sipariş oluşturur.

### Ödeme ve iptal sınırı

- Online siparişlerde ödeme teslim sırasında nakit veya kartla alınır.
- Online kartla ödeme kapsam dışıdır.
- İptal veya ürün çıkarma yalnızca ödeme alınmadan önce yapılabilir.
- Ödeme alındıktan sonra hiçbir rol iade veya iptal yapamaz.
- Bu nedenle kasiyer ödeme almadan önce sipariş içeriğini kesinleştirir.

### Teslim alınmayan sipariş

- Seçilen teslim saatinden 15 dakika sonra sipariş için dikkat çekici uyarı görünür.
- Sistem siparişi otomatik olarak "teslim alınmadı" diye kapatmaz.
- Kasiyer veya yönetici siparişin gerçekten teslim alınmadığını manuel olarak kesinleştirir.
- Teslim alınmayan siparişte stok, ürün bazındaki geri ekleme kuralına göre güncellenir.

## 5. Kısmi sipariş sorunu ve iptali

Bir siparişte bazı ürünler hazırlanamazken diğerleri mevcut olabilir. Örnek: tost ekmeği yoktur, ayran stoktadır.

- Mutfak yalnızca sorunu bildirir.
- Yönetici normalde, yönetici yoksa kasiyer sorunu çözer.
- Sistem tüm siparişi otomatik iptal etmez.
- Mevcut ürünlerle sipariş devam eder.
- Müşteri takip ekranında hangi ürünün hazırlanamadığı açıkça görünür.
- Müşteri siparişini kasada gördüğünde, ödeme öncesinde:
  - yalnızca hazırlanamayan ürünü;
  - başka bir ürünü;
  - veya tüm siparişi iptal ettirebilir.
- Kasiyer işlem için iptal nedenini kaydeder.
- Sipariş tutarı kalan ürünlere göre otomatik yeniden hesaplanır.
- Müşteri takip ekranı güncel ürünleri ve iptal edilen kalemleri gösterir.

## 6. Ürün türleri ve mutfak akışı

### Hazırlama gerektirmeyen ürünler

Ayran, bisküvi vb. paketli ürünler için:

- Sipariş yalnızca bu ürünlerden oluşuyorsa mutfak adımı atlanır ve sipariş doğrudan `READY` olur.
- Siparişte hem tost hem ayran varsa sipariş, hazırlanacak ürün hazır olana kadar `PREPARING` kalır; ayran teslim için bekletilir.

### Ürün kapanması

- Tükenen veya geçici kapatılan ürün menüden gizlenmez.
- Müşteriye `Tükendi` durumuyla gösterilir ve sepete eklenemez.
- Ürünü manuel olarak `Tükendi` durumuna yalnızca yönetici alabilir.

### Hızlı seçenekler

- Örnek: `Domatessiz`, `Ketçapsız`, `Mayonezsiz`.
- İlk sürümde yalnızca mutfağa iletilen notlardır; fiyat değiştirmezler.
- Kategori ikonları ve ürün hızlı seçenekleri gerçek Supabase ortamında yönetim ekranından yeniden okunurken kaybolmayacak şekilde düzeltilmelidir.

## 7. Stok yönetimi

### Temel model

- İlk sürüm ürün bazlı sürekli stok sistemi kullanır.
- Önceki günün kalan stoğu sonraki güne taşınır.
- Yönetici veya kasiyer yeni teslimat geldikçe miktar ekler.
- Malzeme/reçete bazlı stok daha sonraki aşamadır.

Örnek:

```text
Ayran mevcut stok: 8
Yeni teslimat: +24
Yeni stok: 32
```

### Sipariş ve stok ilişkisi

- Stok sipariş oluşturulunca rezerve edilir; teslim anına kadar başka siparişe satılamaz.
- Sipariş iptal edilirse uygun ürünlerin stoğu geri açılır.
- Teslim edildiğinde rezervasyon kesin satışa dönüşür.
- Teslim alınmayan siparişler için stok, ürün kuralına göre geri açılır.

### Sipariş dışı hareketler

- Bozulma/zayi, ikram, personel tüketimi ve sayım farkı ayrı stok hareketi olarak kaydedilir.
- Her stok hareketinde kullanıcı, zaman, miktar ve neden bulunur.

### İptalde stoğa geri ekleme kuralı

Her ürün için yöneticinin seçtiği bir geri ekleme kuralı bulunur:

```text
Her zaman ekle
  Ayran, paketli bisküvi gibi yeniden satılabilir ürünler.

Hazırlık başladıysa ekleme
  Tost, sıcak yemek gibi hazırlanmış ürünler.

Yönetici karar versin
  Duruma göre değişen ürünler.
```

- Sipariş `NEW` durumundayken iptal edilirse tüm kalemler geri eklenir.
- `PREPARING` veya `READY` sonrası iptallerde ürünün geri ekleme kuralı kullanılır.

## 8. Raporlama, kasa ve denetim

### Yalnızca yöneticinin göreceği raporlar

- Günlük, haftalık ve aylık ciro.
- Nakit ve kart tahsilatları.
- İptal ve ödeme öncesi ürün çıkarma kayıtları.
- En çok ve en az satan ürünler.
- Stok durumu, stok hareketleri, tükenen ürünler ve kritik stoklar.
- Teslim saati yoğunluğu.
- Hazırlama süreleri.
- Teslim alınmayan siparişler.
- Personel bazlı işlem özetleri: kasiyer ödeme/iptal işlemleri, mutfak durum değişimleri.
- Excel dışa aktarma.

### Kasa kapanışı

- Gün sonunda yönetici gerçek nakit tutarını girer.
- Sistem beklenen nakitle gerçek nakdi karşılaştırır.
- Nakit-kart ayrımı görünür.
- Kasa farkı aynı gün incelenebilir.

### İşlem geçmişi

Yöneticiler şu değişikliklerin kimin tarafından, ne zaman ve gerekçeyle yapıldığını görebilir:

- ürün fiyatı ve ürün durumu değişiklikleri;
- kategori ve teslim saati değişiklikleri;
- stok hareketleri;
- sipariş ve ürün kalemi iptalleri;
- müşteri hesabına bağlı kasa işlemleri.

### Tarihsel veri kuralı

- Ürün fiyatı değişirse yalnızca yeni siparişleri etkiler.
- Eski siparişlerdeki ürün, fiyat ve ilgili rapor bilgileri değişmeden kalır.

## 9. Çevrimdışı davranış ve PWA

- CantinOS tüm roller için kurulabilir PWA olacaktır.
- Müşteri telefona; mutfak, kasa ve yönetim cihazlara uygulama gibi kurabilir.
- İnternet bağlantısı yokken hiçbir sipariş, stok, ödeme, teslim veya yönetim işlemi yapılmaz.
- Müşteri son görülen menüyü yalnızca inceleyebilir; sipariş veremez.
- Personel ekranlarında işlem düğmeleri kapanır ve bağlantı uyarısı görünür.
- Bağlantı gelince güncel veri yeniden yüklenir.
- Sepetin cihazda kısa süreli korunması isteğe bağlı kullanıcı deneyimi geliştirmesidir; sipariş tamamlanınca sepet temizlenir.

## 10. Kapsam dışı veya sonraya bırakılanlar

- Online kart ödemesi.
- Ödeme sonrası iade ve iptal.
- Kampanya, indirim ve saat bazlı dinamik fiyat.
- Çoklu şube/okul yönetimi.
- İleri günler için ön sipariş.
- Harici SMS, WhatsApp veya e-posta bildirimleri.
- Mutfak çalışanına sipariş atama.
- Vardiya giriş/çıkış takibi.
- Ürün alerjen/içerik bilgileri.
- Fiyatı değiştiren ürün seçenekleri.
- Otomatik fiziksel fiş yazdırma; mevcut manuel yazdırma yeterlidir.
- Malzeme/reçete bazlı stok.

## 11. Açık ama geliştirmeyi engellemeyen kararlar

Bu konular daha sonraki sürüm planında netleştirilebilir:

1. Puanın neye dönüştürüleceği: indirim, kupon, ücretsiz ürün veya başka ödül.
2. Puan kazanım oranı ve olası geçerlilik süresi.
3. Kritik stok eşiğinin ürün bazında tanımlanıp tanımlanmayacağı.
4. Sepetin cihazda ne kadar süre korunacağı.
5. Müşteri hesabı doğrulama, şifre yenileme ve hesap silme deneyiminin ayrıntıları.
6. Özel teslim saati için tahmini hazırlama aralığının kesin hesaplama yöntemi.

## 12. Mevcut projede düzeltilmesi gereken doğrulanmış noktalar

1. Yönetim ekranının gerçek Supabase yanıtı kategori `icon` bilgisini ve ürün `quickModifiers` bilgisini döndürmüyor. Sayfa yenilenip ürün/kategori tekrar kaydedildiğinde bu veriler kaybolabilir.
2. Kasiyer ekranında "Hazırlanıyor" sekmesi bulunmasına rağmen normal `NEW` ve `PREPARING` siparişleri arka uçta kasiyere gönderilmiyor. Kasiyer görünürlüğü `NEW`, `PREPARING`, `READY` olacak biçimde düzeltilmelidir.
3. Mevcut iade akışı, bu belgedeki "ödeme sonrasında iade/iptal yok" kararına göre kaldırılmalı veya devre dışı bırakılmalıdır.
4. Mevcut sipariş modeline müşteri hesabı, müşteri numarası, puan, favoriler, stok rezervasyonu, ürün bazlı stok iade kuralı, kısmi sorun çözümü ve teslim alınmama durumları eklenmelidir.

