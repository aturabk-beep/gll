# Android izin akışı — 0.2.4+6

Hassas konum, bildirim, her zaman konum ve telefonun konum servisi ayrı gösterilir. İzin düğmesi sıradaki eksik adıma yönlendirir; tekrar sorulamayan izinler uygulama ayarından tamamlanır. Android APK derlemesi ve Flutter analyze başarılı; iki widget testi geçti (arka plan izni yönlendirmesi dahil). Bu sürümün fiziksel S23 testi yapılamadı: ADB bağlı cihaz göstermiyor. Önceki sürümlerin kurulum sonuçları aşağıdaki tarihsel kayıtlardır.
# Canlı yayın doğrulaması — 0.2.1+3

17 Eylül 2026: Railway Docker dağıtımı ve PostgreSQL 17 dağıtımı SUCCESS. https://guleltakip-production.up.railway.app/healthz HTTP 200; gerçek PostgreSQL bağlantısı sağlıklı. Panel HTML, yetkisiz erişim reddi, yönetici girişi, Secure/HttpOnly cookie, yetkili snapshot ve logout geçti. Flutter analyze ve widget testi geçti. Sabit adresli Android APK derlendi; S23 yerinde kurulum Success ve soğuk açılış Status: ok. Cihaz sürümü 0.2.1, versionCode 3. Yeni APK SHA-256: 7F736D50FD860BFA0EAFE3B5B4FCBF31D56EA8260C7D7F532D214A28D8B2961D. Gerçek telefon GPS aktarımı ve uzun süreli saha testi henüz yapılmadı.

Aşağıdaki 0.2.0 raporu önceki sürümün tarihsel kaydıdır; bulutun yayınlanmadığı ifadeleri yeni sürüm için geçerli değildir.

# Railway 0.2.0 doğrulama raporu

17 Eylül 2026, Windows. Yeni Railway projesi henüz oluşturulmadı; bağlı Railway oturumu bulunmadığı için dış deploy yapılmadı.

| Kontrol | Sonuç | Gerçek kapsam |
|---|---|---|
| Backend `npm test` | 14/14 GEÇTİ | Fastify gerçek route'ları + PGlite gerçek PostgreSQL; migration iki kez çağrıldı, yalnız bir kez uygulandı |
| Auth / CSRF | GEÇTİ | Yanlış şifre, farklı Origin, eksik CSRF, Secure/HttpOnly/Strict cookie, hash'lenmiş session, server-side logout, kalıcı rate limit |
| PostgreSQL yetkileri | GEÇTİ | Cihaz rolü staff/history/private auth okuyamaz; admin özel oturum tablosunu okuyamaz; kod üretme cihaz rolüne kapalı |
| Eşleştirme | GEÇTİ | 15 dakika/süre aşımı, tek kullanımlı kod, farklı token reddi, aynı token ile kayıp yanıt retry, rate limit |
| Konum | GEÇTİ | Kimlik sunucuda bağlanır, idempotency/değiştirilmiş tekrar, eski ölçüm canlıyı geriletmez, saat sapması, batch validasyonu ve atomiklik |
| Yönetim | GEÇTİ | Config sınırları, tarih aralığı/cursor validasyonu, cihaz iptali ve eski transport endpoint'i uyumluluğu |
| Retention | GEÇTİ | Eski tarihçe/son konum ve auth/limit temizleme fonksiyonları |
| Web `npm test` | 6/6 GEÇTİ | Güncellik, sabit mod, doğruluk, güzergâh boşlukları, CSV formül koruması |
| TypeScript / Vite | GEÇTİ | Production panel build; Supabase JS bağımlılığı kaldırıldı |
| Chrome gerçek HTTP E2E | GEÇTİ | Login → personel oluştur → kod üret → cihaz eşleştir → batch gönder → 10 s polling ile harita → geçmiş → gerçek CSV download → config → TR/EN → logout |
| Flutter analyze | GEÇTİ | No issues found |
| Flutter widget testi | 1/1 GEÇTİ | Offline ölçüm devam metni, günlük takip başlat/durdur olmaması |
| Android JVM/Robolectric | 5/5 GEÇTİ | Hareket politikası, kuyruk kapanıp açılma, duplicate/ACK, süre aşımı sayacı |
| Android APK | GEÇTİ | 0.2.0+2 universal debug APK üretildi |
| S23 yerinde güncelleme | GEÇTİ | Mevcut uygulamaya APK kurulumu Success; ana ekran soğuk açılışı Status: ok. Eşleştirme ve gerçek konum aktarımı bu kontrolde yapılmadı |
| iOS | DOĞRULANMADI | Railway endpoint/pending pairing Swift kodu güncellendi; Windows'ta Xcode derlemesi/cihaz testi yok |
| Railway Docker build/deploy | ÇALIŞTIRILMADI | Docker engine ve Railway hesap bağlantısı yok; Dockerfile/healthcheck/deploy yapılandırması teslim edildi |
| S23 gerçek GPS → Railway | ÇALIŞTIRILMADI | Cloud servis yok; fiziksel ekran-kilidi, reboot, kesinti ve pil saha testi bekliyor |

Toplam **26 otomatik test** + gerçek tarayıcı HTTP akışı geçti. E2E verileri sentetiktir; ekran görüntülerinde açıkça işaretlidir. Testler bulut, 70 cihaz yükü veya pil tüketimi garantisi değildir. PGlite PostgreSQL SQL ve yetki motorunu çalıştırır; üretimde Node `pg` ile Railway PostgreSQL bağlantısı ayrıca deploy sonrasında doğrulanmalıdır.

Yeni dosya: `artifacts/gulel-railway-debug.apk`

- Paket: `tr.com.gulel.gulel_personnel`
- Sürüm: `0.2.0`, versionCode `2`; minSdk 28 / targetSdk 36
- APK SHA-256: `58072E42D1EF04749B064E14063D3E33A581893D990E753F84234F4274DA15C0`
- Android debug sertifikası SHA-256: `2310f7ea5ceba6ab95c4e377843ea4fc6e7fcaa5fb932eb760d391439a0e4151`
- Eski 0.1 APK ile aynı imza, yerinde güncellenebilir; mağaza release'i değildir.

Loglar: `artifacts/railway-apk-build.log`, `artifacts/railway-android-tests.log`. Android HTML raporu: `mobile/build/app/reports/tests/testDebugUnitTest/index.html`. E2E görselleri: `artifacts/railway-panel-e2e.png`, `artifacts/railway-panel-mobile-e2e.png`.

Fastify 5'in request-log seçeneği ve Flutter/AGP/JDK native-access için deprecation uyarıları var; son derleme/testler başarılı. Fastify 6/Gradle 10'a yükseltme bu pilotta yapılmadı.
