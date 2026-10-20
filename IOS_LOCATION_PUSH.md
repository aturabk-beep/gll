# iPhone: yönetici tarafından tek seferlik konum isteği

Bu özellik sürekli takip veya uygulamayı zorla tekrar açma mekanizması değildir.
Yönetici personel detayındaki **iPhone konumunu yenile** düğmesine basar.
Apple'ın isteği kabul etmesi, telefondan konum geldiği anlamına gelmez.
Panel kabul/yanıt/alan dışı/başarısız/zaman aşımı durumlarını ayrı gösterir.
Başarısız gönderimlerde panel güvenli bir hata kodu (ör. InvalidProviderToken),
HTTP durumunu ve isteğin sandbox/production ortamını gösterir. Anahtar, cihaz
token'ı veya ham Apple yanıtı kaydedilmez/gösterilmez. Bu ayrıntılar yalnızca
bu güncellemeden sonraki isteklerde vardır; eski hatalar geriye dönük çözümlenemez.
Normal arka plan takibi ve Android davranışı değiştirilmez.

## Apple ve Railway kurulumu

1. Mac üzerinde güncel Xcode (iOS 18 SDK veya yenisi) ve Flutter ile
   `mobile/ios/Runner.xcworkspace` açılır. Repoda **LocationPush** uzantı
   hedefi, Runner hedef bağımlılığı ve Embed App Extensions aşaması eklenmiştir.
2. Runner bundle ID: `tr.com.gulel.gulelPersonnel`.
   Uzantı: `tr.com.gulel.gulelPersonnel.LocationPush`.
   İkisi APNs anahtarının ait olduğu `JDM3NZ7KYR` Apple Developer ekibiyle
   imzalanmalıdır; her iki hedefin Debug/Release/Profile ayarları bu takıma eşlendi.
   Mac geliştiricisinin bu takıma erişimi ve iki App ID için uygun provisioning
   profile'ları olmalıdır. Bundle ID'ler başka takıma aitse Apple tarafında
   sahiplik/transfer çözülmeden yalnızca takım ayarını değiştirmek yeterli değildir.
3. Runner için **Push Notifications** ve **Location Push Service Extension**
   capability'lerini, uzantı için **Location Push Service Extension**
   capability'sini kontrol edin. Apple Developer portalındaki App ID ve
   provisioning profile'ları bu entitlement'larla yenileyin. Hesabın
   capability erişimi/Apple'ın kullanım koşullarına uygunluk ayrıca doğrulanmalıdır.
4. Apple Developer hesabından APNs token-auth (.p8) anahtarı oluşturun/kullanın.
   Railway backend değişkenlerine `APNS_KEY_ID`, `APNS_TEAM_ID`,
   `APNS_PRIVATE_KEY` ve `APNS_BUNDLE_ID=tr.com.gulel.gulelPersonnel` ekleyin.
   Özel anahtarı repoya, mobil uygulamaya veya sohbet mesajına koymayın.
   Backend yeniden başlatılmalıdır. Eksik değişkenlerde düğme devre dışıdır.
5. Debug `APNS_ENVIRONMENT=development`; Release/Profile `production`.
   TestFlight production kullanır. Farklı imzalama/export yöntemi kullanılırsa
   bu değer ile **son imzalı uygulamanın** aps-environment entitlement'ı
   eşleşmelidir. Backend ortamı cihaz kaydından seçer.
6. Runner ve LocationPush Info.plist dosyalarında `LocationPushServerURL`
   aynı HTTPS origin olmalıdır. Mevcut Railway adresi ayarlıdır. Sunucu değişirse
   Flutter'ın `RAILWAY_ORIGIN` değeriyle birlikte ikisini de güncelleyin.
7. Mac'te `flutter pub get`, `flutter analyze`, `flutter test` ve
   `flutter build ipa --release` çalıştırın. Build sürümü 0.2.26+28.
   Uzantı sürümleri Flutter Generated.xcconfig üzerinden ana uygulamayla eşleşir.
   Archive içinde `Runner.app/PlugIns/LocationPush.appex` ve her iki hedefin
   imzalı entitlement'larını kontrol edin. Yeni IPA/TestFlight kurulumu gerekir;
   yalnızca backend deploy etmek eski iPhone uygulamasına bu özelliği eklemez.

## Çalışanın onayı

Konum izni **Her Zaman**, hassas konum açık olmalıdır. Ana ekranda ayrı paylaşım
düğmesi veya slider yoktur. Eşleştirme ve Always izni tamamlandıktan sonra,
uygulama ön plandayken tek seferlik açıklamalı onay penceresi gösterilir.
İzin ver / İzin verme seçimi kaydedilir; yeni onay otomatik verilmez.
Önceki sürümde verilmiş onay korunur. Yetkili şirket yöneticilerinin kimler
olduğu çalışana açıklanmalıdır. iPhone Ayarlar → uygulama → Konum bölümünde
**Her Zaman** izni kaldırılarak erişim durdurulabilir; bu, normal arka plan
mesai konumunu da durdurur. Sunucudaki kayıt bu işlemle silinmez; iOS izni
olmadan uzantı yeni konum alamaz. Gerçek cihazda bu davranışı doğrulayın.

### iOS Always izin adımı

İlk pencerede **Uygulamayı Kullanırken** seçilir. Kurulumdaki izin düğmesine
tekrar basıldığında ayrı **Her Zaman** yükseltmesi istenir. iOS aynı isteği
tekrar göstermezse **Uygulama ayarları** düğmesi doğrudan sistem ayarlarını açar.
Konum → Her Zaman ve Tam Konum seçenekleri buradan tamamlanır.
**Bir Kez İzin Ver**, o oturumda Always isteğinin yok sayılmasına neden olur.
Uygulama sistem iznini otomatik veremez veya iOS diyaloğunu zorlayamaz.
[Apple izin akışı](https://developer.apple.com/documentation/corelocation/cllocationmanager/requestalwaysauthorization()).

## Güvenlik ve sınırlar

- Yalnızca oturum açmış yöneticiler CSRF korumalı endpoint'i kullanabilir.
- Panelde 5 dakika (veya 1 dakika) bekleme sınırı yoktur. Tamamlanan/başarısız
  istekten sonra hemen yeni manuel istek gönderilebilir. Bir istek hâlâ yanıt
  bekliyorsa tekrar tıklama mevcut isteği döndürür; ikinci push göndermez.
  Apple'ın kendi teslim/kota sınırları devam eder; otomatik push döngüsü yoktur.
- İstek iki dakikada sona erer. Push içinde uzun ömürlü eşleştirme anahtarı yoktur.
  Yanıt anahtarı tek kullanımlık, cihazla bağlı ve sunucuda yalnızca hash olarak saklanır.
- Uzantı konum sorgulamadan önce onayın hâlâ açık olduğunu sunucuda kontrol eder.
  Cihaz iptali, paylaşımın kapatılması, süresi dolmuş veya tekrar kullanılmış
  istekler reddedilir. Sonuç endpoint'i de aynı kontrolleri tekrar yapar.
- En fazla 35 metre doğruluklu, yeni ölçüm kabul edilir. Mevcut backend sınırı
  uygulanır: şimdilik **ODTÜ test alanı**; çiftlik önizlemesi sınır değildir.
  Alan dışı koordinatlar kaydedilmez/gösterilmez; yalnızca alan dışı sonucu tutulur.
- Uzantı eski/hassasiyeti düşük ölçümde veya geçici locationUnknown hatasında
  hemen vazgeçmez; toplam 16 saniyelik ölçüm bütçesi içinde 1 saniye arayla yeniden
  tek seferlik ölçüm ister. Başarılı ölçümde durur. Sonucu göndermek için süre
  ayrılır; 24 saniyede kaynaklar temizlenir. iOS daha erken sonlandırabilir.
  Always/hassas konum/servis kapalı, eski ölçüm, düşük doğruluk ve geçici konum
  hatası ayrı güvenli kodlarla panelde görünür. Eski sürümlerde ayrıntı yoktur.
- HTTPS ile sunucuya aktarılır. Sunucu koordinatı işler; bu, yöneticinin cihazına
  kadar uçtan uca şifreli bir sistem değildir. Bu sürüm E2EE iddiasında bulunmaz.
- İstek geçmişi yedi gün saklanır. Personel silinince APNs kaydı, istekler ve
  kayıt hız sınırı izi de silinir. Token'lar admin snapshot'ına eklenmez.
- Uzantı yanıtı ana uygulamanın heartbeat'ini güncellemez. Tek konum gelmesi
  sürekli takibin tekrar başladığını kanıtlamaz; eski heartbeat nedeniyle
  personelin genel bağlantı durumu gecikmiş kalabilir.

## Gerçek cihaz kabul testi (henüz yapılmadı)

1. Güncel imzalı uygulamayı açın, eşleştirin, Always+hassas konum ve paylaşımı açın.
2. Ön planda, ekran kilitliyken, ana ekrandayken ve uygulama değiştiriciden
   kapattıktan sonra **ayrı ayrı**, önceki istek sonuçlandıktan sonra yönetici isteği deneyin.
   Özellikle sabit duran cihazda yeni ölçüm zamanını doğrulayın.
3. Telefon çevrimdışıyken iki dakika sonunda “yanıt gelmedi” görülmeli.
   Sonradan gelen eski isteğin koordinatı kabul edilmemeli.
4. Alan dışında denendiğinde harita koordinatı görünmemeli, DB'ye dış nokta yazılmamalı.
5. Paylaşımı kapatın / konum iznini kaldırın / cihazı iptal edin;
   yeni konum alınmamalı. Yeniden kurulum ve uygulama güncellemesinde tekrar sınayın.
6. Debug/sandbox ve TestFlight/production ortamlarını ayrı sınayın.
7. Temiz kurulumda When In Use → Always, Allow Once, reddetme ve Ayarlar'dan
   yükseltme yollarını sınayın. Onay penceresinde reddedince APNs kaydı
   oluşturulmamalı; tekrar açınca pencere tekrarlanmamalı. Önceki onay korunmalı.
   Always kaldırılınca normal konum ve location-push izleme durmalı.

Bu Windows ortamında Swift/Xcode derlemesi, Apple imzası, canlı APNs ve
force-quit sonrası fiziksel iPhone davranışı doğrulanmadı. Yanıt garantisi yoktur.
0.2.25+27 için RunnerTests içine ölçüm tazeliği/doğruluk testleri eklendi;
Mac'te Xcode Product → Test ile çalıştırın. Burada Flutter dosyası formatlandı,
ancak Dart analiz süreci Windows Application Control tarafından engellendi.
Mac'te Flutter analizini de tamamlayın.

Apple kaynakları:
[LPSE kurulumu ve sınırlamaları](https://developer.apple.com/documentation/corelocation/creating-a-location-push-service-extension),
[APNs isteği](https://developer.apple.com/documentation/usernotifications/sending-notification-requests-to-apns),
[entitlement](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.location.push).
