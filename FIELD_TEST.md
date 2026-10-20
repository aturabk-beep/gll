# S23 saha kabulü — henüz yürütülmedi

Test sorumlusu: ___ Tarih: ___ Cihaz modeli: ___ Android / One UI: ___ APK SHA-256: ___
Uygulama sürümü: ___ Railway projesi / HTTPS adresi: ___ Personel / cihaz ID: ___
Gizli anahtar, PIN ve eşleştirme kodlarını bu dosyaya kaydetmeyin.

Ön koşul: Konum açık, hassas + her zaman konum izinleri ve bildirim açık; Samsung asla uyumayan/kısıtlanmamış ayarları tamamlanmış; otomatik tarih-saat açık; panelde son haberleşme ve son ölçüm ayrı görülebiliyor. Pilot 24 saat takibi ilgili personele açıklanmış olmalı.

| Senaryo | Uygulama | Beklenen / kaydedilecek kanıt | Sonuç |
|---|---|---|---|
| Açık alan yürüyüşü | 10 dakika yürüyün, başlangıç/bitiş UTC yazın | Gerçek noktalar, çoğunlukla ~30 s ölçüm ve ~60 s paketli gönderim hedefi; doğruluk ve gerçek teslim aralığı dağılımını CSV'den ölçün | Yapılmadı |
| Ahır içinde sabit | En az 15 dakika bekleyin | İyi ölçümlerde ~3 dk sonra 300 s düşük güç hedefi; kötü GPS'te doğruluk uyarısı, sahte bina içine oturtma yok | Yapılmadı |
| Yeniden hareket | Sabit moddan sonra yürüyün | Sensör veya sonraki güvenilir fix ile sık moda dönüş; gecikmeyi kaydedin | Yapılmadı |
| Ekran kilidi | En az 30 dk kilitli tutun, bir bölümünde yürüyün | Kalıcı bildirim; panelde yeni ölçüm zamanları; boşlukları ve OS güç ayarlarını kaydedin | Yapılmadı |
| Ağ kesintisi | Wi-Fi ve varsa mobil veriyi 5 dk kapatın; GPS açık kalsın | Yerel kuyruk artar, “Bağlantı bekleniyor”; geri gelince ACK sonrası boşalır, yinelenen UUID yok, eski ölçüm canlıyı geriletmez | Yapılmadı |
| Son uygulamalardan silme | Uygulamayı recents'tan kaydırın | Android foreground service devamı hedeflenir; panel UTC ve bildirim ile doğrulayın | Yapılmadı |
| Yeniden başlatma | Cihazı yeniden başlatıp kilidi açın; uygulamayı hemen açmayın | İzin/OS elverirse otomatik devam; başarısızsa açınca toparlanma. İlk kilit açma öncesi garanti yok | Yapılmadı |
| Force-stop | Ayarlar → Uygulamalar → Zorla durdur | Takip durabilir/durur; kendi kendine başlaması beklenmez. Panelde veri yok; uygulamayı yetkili açınca devam | Yapılmadı |
| İzin kaldırma | Konum iznini kaldırın, sonra yeniden verin | Takip devam ediyor iddiası olmamalı; kurulum gerekli. İzin verip açınca toparlanma | Yapılmadı |
| GPS kapatma | Konum anahtarını kapatın, 3 dk sonra açın | Son fix yaşlanır, heartbeat ayrıdır; yeni fix yokken timestamp yenilenmez | Yapılmadı |
| Çiftlik dışı düşük güç | Sınır dışında en az 20 dk kalın, sonra geri girin | 15 dk sonrası dışarı durumu sunucuya ulaşır ve saatlik düşük güç başlar; dönüş geofence ile normal takibi uyandırır. Gerçek OS gecikmesini kaydedin | Yapılmadı |
| Clock-in güncel konum | Uygulamayı açıp “Mesaiye başla” durumunu izleyin | Tek seferlik hassas fix alınır; 5 dakikadan eski konumla clock-in kabul edilmez | Yapılmadı |
| Güncelleme | Aynı imzalı artan versionCode APK'yı `adb install -r` ile kurun | Kimlik/kuyruk korunur; OS izin verdiğinde servis yeniden başlar; aksi halde açınca devam | Yapılmadı |
| Cihaz iptali | Panelden iptal edin | Sonraki sunucu bağlantısı reddedilir; cihaz toplaması durur; offline anında iptal garantisi yok | Yapılmadı |
| Yetki izolasyonu | Yönetici olmayan Auth hesabı ile paneli açın | Personel/konum görünmez; admin işlemi reddedilir | Yapılmadı |
| Kalıcı kod / yeniden kurulum | Uygulamayı kaldırıp yeniden kurun ve aynı personel kodunu girin | Aynı personele yeniden bağlanır; eski cihaz anahtarı veri gönderemez | Yapılmadı |

## Pil ölçümü — rakam uydurulmayacak

1–2 saat ekran kapalı test; hareketli ve sabit koşulları ayrı ölçün. Şarj kablosunu çıkarın. Aynı anda başka uygulama/telefon görüşmesi, sıcaklık, Wi-Fi sinyali, mobil veri ve GPS koşullarını kaydedin. Debug derleme ve üretim derlemesi aynı pil tüketimini temsil etmeyebilir.

| Başlangıç UTC | Bitiş UTC | Başlangıç % | Bitiş % | Süre | Hareket/ahır/açık alan | Ağ/ekran/güç ayarları | Ölçüm sayısı / boşluk |
|---|---|---|---|---|---|---|---|
| ___ | ___ | ___ | ___ | ___ | ___ | ___ | ___ |

Yüzde puan/saat = (başlangıç % − bitiş %) / gerçek saat. Küçük örnekten 24 saat pil garantisi çıkarmayın. 70 cihaz yaygınlaştırmadan önce farklı telefon modellerinde ve zayıf GPS alanlarında tekrarlayın.

## Kabul kaydı

- Son haberleşme UTC: ___ Son gerçek fix UTC: ___ En büyük kayıt boşluğu: ___
- İnternet kesintisi öncesi/sonrası kuyruk: ___ Kayıp ölçüm sayacı: ___
- Yürüyüşte medyan / p95 yatay doğruluk: ___ Sabitte medyan / p95: ___
- Medyan / p95 ölçüm aralığı: ___ Güzergâhta hayali birleşim var mı: ___
- 30 dk kilit testi: ___ Pil ölçümü: ___ Yeniden başlatma: ___
- Sonuç: BEKLİYOR / SINIRLI PİLOT / RED · Sorumlu: ___

Bu form fiziksel cihazda kanıt toplanmadan “başarılı” işaretlenmez.
