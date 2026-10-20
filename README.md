# Canlı yayın — 0.2.1+3

Panel: https://guleltakip-production.up.railway.app

Railway üzerinde PostgreSQL 17 ve kalıcı disk kuruldu. HTTPS, veritabanı sağlık kontrolü, yönetici girişi, yetkili veri okuma ve çıkış gerçek yayında doğrulandı. Her iki serviste uyku kapalı. Telefon eşleştirmesi ve ekran kilitli GPS saha testi ayrıca tamamlanmalıdır.

# Gülel Personnel

**Backend artık Railway için hazırdır; Supabase hesabı/anahtarı gerekmez.** Flutter Android/iOS uygulaması, Node.js/Fastify API, PostgreSQL ve React/TypeScript/Leaflet panel. Panel ve API aynı HTTPS adresinde çalışır. Yeni kaynak sürümünde Railway HTTPS adresi derleme sırasında uygulamaya gömülür; telefon yalnız personele atanmış 4 haneli kalıcı eşleştirme kodunu ister. 0.2.1+3 APK adres sormaz; varsayılan adres https://guleltakip-production.up.railway.app olarak gömülüdür.

Railway projesi henüz açılmadığı ve hesap bağlantısı olmadığı için **buluta deploy yapılmadı**. Yeni APK derlendi. Gerçek GPS → Railway → panel ve ekran kilidi/pil saha kabulü bekliyor. Yerel HTTP/SQL/tarayıcı testleri gerçek konum veya bulut doğrulaması sayılmaz. Güncel kanıt: [TEST_RESULTS.md](TEST_RESULTS.md).

## Yeni Railway projesine kurulum

1. Railway Dashboard'da yeni bir **Empty Project** açın. Aynı projeye **PostgreSQL** ekleyin; servis adı `Postgres` olsun. Veritabanını özel ağda tutun; telefon veritabanına doğrudan bağlanmaz. PostgreSQL volume'unu ve yedekleme ayarlarını koruyun.
2. Aynı projeye uygulama için bir servis ekleyin (`gulel-takip`). Kaynak olarak **bu GPS klasörünü** içeren GitHub deposunu bağlayın veya aşağıdaki CLI yolunu kullanın. Monorepo kullanıyorsanız Railway Root Directory `/GPS` olmalı. Başka projelerin bulunduğu üst `Code` klasörünü göndermeyin.
3. Uygulama servisi → Networking → **Generate Domain** ile HTTPS adresi oluşturun. Uygulama servisine şu Variables değerlerini girin:

   | Değişken | Değer |
   |---|---|
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` — Railway değişken referansı |
   | `ADMIN_EMAIL` | Kullanacağınız yönetici e-postası |
   | `ADMIN_PASSWORD` | Size özel, en az 14 karakterli güçlü şifre |
   | `PUBLIC_ORIGIN` | Oluşturulan tam HTTPS adresi; sonunda `/` yok |
   | `NODE_ENV` | `production` |

   `PUBLIC_ORIGIN` verilmezse `RAILWAY_PUBLIC_DOMAIN` otomatik kullanılır. Henüz domain yoksa oluşturup redeploy edin. `PORT` Railway tarafından sağlanır; sunucu `0.0.0.0:$PORT` dinler. `DATABASE_URL` ve yönetici şifresi yalnız sunucu Variables alanında bulunur; telefona/panele/git'e eklenmez.
4. Deploy edin. Kökteki [Dockerfile](Dockerfile), paneli derler ve API ile aynı container'a koyar. [railway.json](railway.json) `/healthz` sağlık kontrolünü tanımlar. Sunucu ilk açılışta [migration](backend/migrations/001_railway.sql) dosyasını transaction + kilit ile bir kez uygular, yönetici hesabını oluşturur. Ayrı SQL Editor, Supabase Auth veya pg_cron kurulumu gerekmez.
5. `https://ADRESINIZ/healthz` yanıtı `{"ok":true,"version":"0.2.0"}` olmalı. Aynı adresin ana sayfasından yönetici e-posta/şifrenizle giriş yapın.
6. Pilot boyunca **Serverless / App Sleeping kapalı**, uygulama replica sayısı **1** olsun. Yedi günlük temizleme, çalışan sunucuda açılışta ve saatlik yapılır. Deployment healthcheck sürekli izleme yerine geçmez; Railway kullanım ve servis hatalarını takip edin.

CLI alternatifi (Railway hesabında kullanıcı oturumu gerektirir):

```powershell
cd C:\Users\msi-nb\Desktop\Code\GPS
npx @railway/cli login
npx @railway/cli link
npx @railway/cli up --service gulel-takip
```

`link` sırasında yeni proje/production ortamı/uygulama servisini seçin. Veritabanı servisine uygulama kodu yüklemeyin. `.railwayignore` SDK'ları, telefon projesini, sırları ve derleme çıktılarını yüklemeden dışlar. Sunucu migration'ı yeni, bu uygulamaya ayrılmış PostgreSQL veritabanı için hazırlanmıştır; mevcut Supabase veritabanını yerinde dönüştürmez.

## S23 ilk kurulum

1. `artifacts/gulel-railway-debug.apk` dosyasını kurun. Bu **debug imzalı pilot APK**'dır; mağaza release'i değildir. Önceki 0.1 sürümüyle paket ve debug imzası aynı, versionCode 2 olduğu için `adb install -r` ile veri korunarak güncellenir.
2. Panelde personel ekleyin. Sistem her personele rastgele, benzersiz ve kalıcı dört haneli bir **Eşleştirme kodu** atar ve personel detayında sürekli gösterir. Uygulama yeniden kurulursa aynı kod girilir; yeni cihaz anahtarı eskisini geçersiz kılar.
3. Gerçek yayın adresiyle derlenmiş uygulamada 4 haneli kodu girin. PIN gerekmez. Artık publishable/anon anahtarı alanı yoktur. 24 saat takip bilgilendirmesini okuyup eşleştirin.
4. Önce hassas konum/uygulamayı kullanırken izni, sonra bildirim izni; ayrı ayarlardan **Her zaman konum** izni. Telefonun Konum anahtarı açık olmalı. İzinler tamamlanınca takip otomatik başlar; günlük başlat/durdur veya personel girişi yoktur.
5. Samsung Pil → Arka plan kullanım sınırları → **Asla uyumayan uygulamalar** listesine ekleyin. Uygulama pili → **Kısıtlanmamış** seçin. Menü adı One UI sürümüne göre değişir; uygulama bu ayarları kendi başına değiştirmez. Kalıcı takip bildirimi görünür olmalı.
6. Açık alanda ilk gerçek konumu bekleyin. Panel 10 saniyede bir son konum tablosunu okur; yeni ölçüm olmadan konum zamanını yenilemez. Ardından [FIELD_TEST.md](FIELD_TEST.md) uygulayın.

Telefondaki `localhost` bilgisayarınız değildir. Uygulama yalnız HTTPS sunucu adresi kabul eder. Superbox port açma/yönlendirme gerekmez. Verilen uydu ekran görüntüsü coğrafi referans içermediği için haritaya uydurma koordinatla yerleştirilmedi.

## Güvenlik ve veri akışı

- Uygulama konuma göre `Mesai içinde` / `Mesai dışı` durumunu gösterir. `Mesaiye başla` yalnız sunucunun son 5 dakika içinde aldığı, en fazla 50 m doğruluklu ve çiftlik görseli boyutundaki dikdörtgen sınırın içindeki konumla kullanılabilir. `Mesaiyi bitir` çiftlik dışından da kullanılabilir. Giriş/çıkış saatlerini cihaz değil sunucu belirler; yinelenen giriş veya çıkış reddedilir.
- Yönetici şifresi scrypt (N=32768/r=8/p=1), rastgele salt ile saklanır. Kayıt olma endpoint'i yoktur; başlangıç yöneticisi server Variables ile oluşturulur. `ADMIN_PASSWORD` değiştirilip servis yeniden başlatıldığında parola güncellenir ve eski oturumlar iptal olur. E-posta değiştirmek eski yönetici hesabını silmez; devre dışı bırakmak için yetkili DB yönetimi gerekir.
- Yönetici oturumu 12 saatlik rastgele 256-bit anahtardır; PostgreSQL'de yalnız özeti bulunur. Tarayıcıda HttpOnly/Secure/SameSite=Strict cookie kullanılır, localStorage token yoktur. Yazma isteklerinde tam Origin eşleşmesi ve CSRF header gerekir. Çıkış sunucu oturumunu siler; süre bitince panel yeniden giriş ister. Bu günlük giriş zorunluluğu personel uygulamasına uygulanmaz.
- PostgreSQL `gulel_admin` ve `gulel_device` NOLOGIN rolleri + RLS/grants korunur. Backend başarılı admin oturumundan sonra admin rolüne transaction içinde geçer. Cihaz rolü tabloları okuyamaz/yazamaz, yalnız dar eşleştirme/ingest fonksiyonlarını çağırır. Personel ve cihaz kimliğini gönderilen JSON değil sunucu belirler. API veritabanı sahibi bağlantısını güvende tutmak zorundadır; bu sır mobil/web'e girmez.
- Kod: personele özel, rastgele oluşturulan, benzersiz, 4 rakam ve kalıcıdır. IP başına dakikada 5 eşleştirme denemesi uygulanır. Telefon 256-bit cihaz anahtarı üretir. Aynı kod yeniden kullanıldığında aktif cihaz kaydı korunur, anahtar atomik olarak yenilenir ve eski kurulumun erişimi hemen kesilir. Bu kullanım kolaylığı nedeniyle personel kodları gizli tutulmalıdır.
- Giriş, eşleştirme ve ingest rate limitleri PostgreSQL'de tutulur; server restart ile sıfırlanmaz. NAT arkasında ilk kurulum için eşleştirme sınırı IP başına 30/dakika, genel 300/dakikadır. Cihaz gönderimi anahtar başına 180/dakika ile sınırlıdır. HTTP erişim logları ve konum payload logları kapalıdır.
- Android Keystore AES-GCM / iOS Keychain; SQLite kuyruk. Önce diske yaz, 200'lük batch gönder, yalnız sunucu ACK ettiği UUID'leri sil. Geç gelen veri canlı konumu geriletmez; değiştirilmiş duplicate payload geçmişi/canlıyı değiştirmez. Ağ kesilince GPS motoru devam eder; retry backoff + jitter yaklaşık 5 dakika üst sınırına çıkar.
- 65.000 kayıt / 7 gün cihaz kuyruğu; en eski kayıtlar çıkarılır ve kalıcı kayıp sayacı panelde görünür. Uygulama kaldırılır veya verisi silinirse yerel kuyruk kaybolur. Android yedekleme kapalıdır. Sunucuda alınmış geçmiş uygulama kaldırılınca kendiliğinden silinmez.
- Ölçüm zamanı UTC, alınma zamanı server tarafından atanır. >5 dakika cihaz saati sapması cihazda/tarihçede işaretlenir; şüpheli ölçüm canlı konuma alınmaz. Geç gelen çevrimdışı veri tek başına saat sapması sayılmaz. Yedi günden eski ölçüm saklanmadan ACK edilir. Geçmiş ve son konum 7 gün varsayılanıyla saatlik temizlenir; temizlik çalışmadığında logda hata görünür.
- Pil dengeli profilinde hareketli/sabit/sabitleşme varsayılanı 30/300/180 saniye, boş sunucu kontrolü 600 saniyedir; admin sınırları 10–60 / 30–300 / 120–900 / 30–900. Hareketliyken ölçümler 60 saniyelik gönderimlerde paketlenir; sabitken konum ve gönderim hedefi 300 saniyedir. Android sabitken dengeli güç konumunu ve varsa significant-motion sensörünü; iOS otomatik duraklatma ile 20–50 m mesafe filtrelerini kullanır. Aralıklar OS teslim garantisi değildir.
- Yönetici anlık konum ve güzergâh API'leri yalnız çiftlik görseli boyutundaki dikdörtgen sınırın içindeki noktaları döndürür. 0–1000 m çevre payı dikdörtgenin dört kenarını genişletir. Dış koordinatlar sunucuda kalıcı olarak kaydedilmez; yalnız cihazın çiftlik dışında olduğu bilgisi tutulur. Bu durumda önceki iç konum da haritada gösterilmez.
- Telefon dikdörtgen sınırın dışında kesintisiz 15 dakika kaldığında Android ve iOS konum örnekleme/gönderim hedefini bir saate çıkarır ve düşük doğruluk/düşük güç ayarına geçer. Android geofence ve iOS region monitoring yalnız çiftliğe dönüşte hassas takibi uyandırmak için dikdörtgeni çevreleyen yardımcı bir çember kullanır; içeride/dışarıda kararı bu çembere göre verilmez. Uygulama/clock-in ekranı açıldığında güncel sınır doğrulaması için tek seferlik hassas konum istenir; mobil işletim sistemleri teslim zamanını kesin garanti etmez.

## Panel

Personel listesi, gerçek konumlar, doğruluk çemberi, son haberleşme/son geçerli fix ayrımı, pil/sürüm/kuyruk/kayıp/saat sapması, sorun filtresi, personel oluşturma/eşleştirme/iptal ve uzaktan aralık ayarı. Tarih filtresi **UTC** ve en fazla 7 gün; geçmiş keyset pagination ile alınır. >180 s boşluklar ve >100 m doğruluklu noktalar güzergâhta bağlanmaz. CSV ham zaman ve doğruluğu korur. Konum >50 m doğrulukta uyarılır. “Veri alınamıyor” internet kesintisi veya personelin ayrıldığına dair kesin hüküm değildir. Demo/personel verisi üretim uygulamasına eklenmedi.

## Kapasite ve maliyet

70 telefon × 8.640 ölçüm = **604.800/gün**, 7 günde **4.233.600 satır**. Satır+indeks için varsayımsal 300–600 byte ile ~1,27–2,54 GB; WAL/bloat/yedek hariç. Cihaz başına 7 günlük kuyruk için yaklaşık 30–60 MB alan planlayın. Bunlar ölçülmüş saha tüketimi değildir.

Railway maliyeti uygulama **ve PostgreSQL** RAM/CPU, kalıcı disk ve dış ağ tüketimine bağlıdır. Kontrol edilen resmi sayfada Hobby $5/ay (aynı tutarda kullanım dahil), Pro $20/ay (aynı tutarda kullanım dahil); aşan tüketim ayrıca ücretlenir. Örnek olarak toplam 1 GB sürekli RAM tek başına yaklaşık $10/ay kaynak tüketimidir; CPU/disk/egress ayrıca hesaplanır. Bu hesap kesin fatura tahmini değildir ve $5'in 70 cihaza yeteceği söylenmez. Ücretsiz/trial disk kotası bu üst senaryoyu karşılamayabilir. [Güncel Railway fiyatları](https://docs.railway.com/pricing/plans). PostgreSQL volume/backup kapasitesi, autovacuum ve büyümesini izleyin. Panel Realtime ücreti üretmez; son konumları 10 saniyede bir API'den okur.

## Platform ve güncelleme

| İşlev | Android | iOS |
|---|---|---|
| Ortak ekranlar | Flutter | Flutter |
| Arka plan motoru | Native Fused Location + location foreground service | Native Core Location + background location mode |
| Kimlik / offline | Keystore / SQLite | Keychain / SQLite |
| Ekran kilidi | İzin ve OS koşullarında uygulanmış; saha kabulü bekliyor | Uygulanmış, cihazda doğrulanmadı |
| 30/300 s | Hareketli/sabit hedef aralık, garanti yok | Olay bazlı hareketli/sabit hedef, garanti yok |
| Boot / güncelleme | İzin ve OS elverirse receiver ile devam | Otomatik boot devamı yok; uygulamayı açın |
| Force-stop / izin kaldırma | Yetkili yeniden açmalı/izni düzeltmeli | Aynı sınırlama; zorla kapatma takibi durdurabilir |
| Derleme | Debug APK üretildi | Windows ortamında derlenmedi/imzalanmadı |

Mobil uygulama kimliği Android'de `tr.com.gulel.gulel_personnel`, iOS'ta `tr.com.gulel.gulelPersonnel` değeridir. Eski `/rest/v1/rpc` wire endpoint'leri uyumluluk için kabul edilir. Önceden eşleştirilmiş gerçek Supabase cihaz kimlikleri kendiliğinden Railway DB'sine taşınmaz. Bu pilotta eski canlı Supabase kurulumu yapılmadığından taşınacak bulut verisi yoktu.

Mağaza için işletmeye ait release/upload anahtarı, Play App Signing ve artan versionCode gerekir. `mobile/android/key.properties.example` → yerel `key.properties`. Release'e debug imzası otomatik atanmaz. Başka üretim imzasına geçiş kaldırma/yeniden kurma ve eşleştirme gerektirebilir; önce kuyruğu boşaltın. Play arka plan konumu beyanı, belirgin açıklama/onay, gizlilik politikası ve inceleme videosu gerekir; onay garantisi yoktur. iOS için Mac/Xcode, Apple hesabı, signing ve TestFlight/App Store incelemesi gerekir. Gizli self-update, root/accessibility veya MDM yoktur; mağaza otomatik güncellemesi anında sessiz zorunlu kurulum değildir.

## Yerel geliştirme/test

Node 22.16+, Flutter 3.47.4/Dart 3.13.3, Android SDK 36. Kilit dosyaları depodadır.

```powershell
cd backend
npm ci
npm test
cd ../web
npm ci
npm test
npm run build
node tests/railway-browser.mjs
cd ../mobile
flutter analyze
flutter test
flutter build apk --debug --dart-define=RAILWAY_ORIGIN=https://guleltakip-production.up.railway.app
cd android
.\gradlew.bat :app:testDebugUnitTest
```

Backend'i normal yerel PostgreSQL ile açmak için kökte `.env.example` → `.env`; `DATABASE_URL` yerel DB, `PUBLIC_ORIGIN=http://127.0.0.1:3000`, `NODE_ENV=development`, `PORT=3000` olsun. Kökten `node --env-file=.env backend/src/server.mjs` çalıştırın; panel aynı 3000 portunda açılır. Vite geliştirme sunucusu kullanırsanız backend'in `PUBLIC_ORIGIN` değerini Vite adresiyle tam eşleştirin; `/api` proxy'si 3000'e gider.

Browser E2E yalnız yalıtılmış sentetik veriyle kendi geçici PostgreSQL motorunu ve HTTP sunucusunu açıp kapatır. Canlı Railway ve gerçek GPS doğrulaması değildir. Bu bilgisayardaki taşınabilir araçlar `.tools` içinde; kaynak ZIP/Docker/Railway yüklemesine girmez. Standalone statik `config.js` yöntemi kaldırıldı; panel backend ile birlikte yayınlanır.

## Sizde kalan işlemler

1. Yeni Railway projesinde PostgreSQL + uygulama servisini oluşturup Variables/domain/deploy adımlarını tamamlayın.
2. Yayın adresiyle panelde giriş yapın, S23'ü kodla eşleştirin ve izinleri verin.
3. [FIELD_TEST.md](FIELD_TEST.md) ile gerçek saha/ekran kilidi/pil testini uygulayın. Parola ve DB bağlantısını sohbet yerine Railway Variables'a girin.

Resmi kaynak ve lisanslar: [SOURCES.md](SOURCES.md).
