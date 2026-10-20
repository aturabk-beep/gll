export type PushRequest={id:string;status:string;error_code?:string|null;http_status?:number|null;push_environment?:string|null;device_error?:string|null};
const deviceExplanations:Record<string,[string,string]>={
 LocationTimedOut:['Süre içinde yeni konum ölçümü gelmedi.','No fresh location arrived within the time budget.'],
 StaleLocation:['Yalnızca eski veya cihaz saatiyle uyumsuz ölçüm geldi.','Only stale or clock-inconsistent locations were received.'],
 InsufficientAccuracy:['Ölçüm doğruluğu 35 metre sınırını karşılamadı.','Location accuracy did not meet the 35-metre threshold.'],
 LocationServicesDisabled:['iPhone konum servisleri kapalı.','iPhone location services are disabled.'],
 AuthorizationNotReady:['iOS konum yetkisi süre içinde hazır olmadı.','iOS location authorization was not ready in time.'],
 AlwaysPermissionRequired:['Konum izni Her Zaman olmalı.','Always location permission is required.'],
 PreciseLocationRequired:['Uygulamanın Hassas Konum iznini açın.','Enable Precise Location for this app.'],
 LocationDenied:['iOS konum erişimini reddetti; izinleri kontrol edin.','iOS denied location access; check permissions.'],
 LocationUnknown:['iOS tekrar denemelere rağmen konumu belirleyemedi.','iOS could not determine location despite retries.'],
 LocationServiceError:['iOS konum servisi hata verdi.','The iOS location service returned an error.'],
};
export function deviceFailureText(request:PushRequest,english=false){
 const code=request.device_error;
 if(!code)return english?'This app version did not report a detailed device error. Install the updated TestFlight build.':'Bu uygulama sürümü ayrıntılı cihaz hatası bildirmedi. Güncel TestFlight sürümünü yükleyin.';
 return code+': '+(deviceExplanations[code]?.[english?1:0]??(english?'Device location failed.':'Cihaz konumu alınamadı.'));
}
const explanations:Record<string,[string,string]>={
 InvalidProviderToken:['Apple sunucu kimliğini doğrulayamadı. APNs anahtarı, Key ID ve Team ID eşleşmesini kontrol edin.','Apple could not verify server credentials. Check the APNs key, Key ID and Team ID.'],
 ExpiredProviderToken:['Sunucu kimlik belirteci eskimiş. Sunucu saatini ve belirteç yenilemesini kontrol edin.','Server authentication token expired. Check server time and token renewal.'],
 MissingProviderToken:['Apple isteğinde sunucu kimlik bilgisi eksik.','Server authentication is missing from the Apple request.'],
 BadDeviceToken:['Cihaz kaydı veya sandbox/production ortamı uyuşmuyor. İmzalı uygulamanın ortamını kontrol edip uygulamadan paylaşımı yeniden etkinleştirin.','Invalid device registration or sandbox/production mismatch. Check the signed app environment and re-enable sharing in the app.'],
 DeviceTokenNotForTopic:['Cihaz kaydı uygulamanın konum topic değeriyle eşleşmiyor. Bundle ID ve imzalama takımını kontrol edin.','Device registration does not match the location topic. Check the bundle ID and signing team.'],
 TopicDisallowed:['Anahtar bu konum topic değerine yetkili değil. Anahtar kapsamını ve uygulamanın Location Push yetkisini kontrol edin.','The key is not allowed to send to this location topic. Check key scope and Location Push capability.'],
 BadTopic:['Konum topic değeri geçersiz. Sunucudaki bundle ID ayarını kontrol edin.','Invalid location topic. Check the server bundle ID setting.'],
 Unregistered:['Apple cihaz kaydını geçersiz sayıyor. Uygulamayı açıp paylaşımı yeniden etkinleştirin.','Apple reports an inactive device registration. Open the app and re-enable sharing.'],
 Forbidden:['Apple bu isteğe izin vermedi. Anahtar ve uygulama yetkilerini kontrol edin.','Apple denied this request. Check key and app permissions.'],
 TooManyRequests:['Apple istek sınırına ulaşıldı; bir süre bekleyin.','Apple request limit reached; wait before retrying.'],
 TooManyProviderTokenUpdates:['Sunucu kimlik belirteci çok sık yenileniyor.','Server authentication tokens are being renewed too frequently.'],
 NetworkError:['Sunucu ile Apple arasındaki bağlantı tamamlanamadı. Bu bir telefon bildirim izni hatası değildir.','The server could not complete its connection to Apple. This is not a phone notification permission error.'],
 RequestTimeout:['Sunucu Apple’dan zamanında yanıt alamadı; teslim durumu bilinmiyor.','Apple did not respond in time; delivery status is unknown.'],
};
export function pushFailureText(request:PushRequest,english=false){
 const code=request.error_code;
 if(!code)return english?'Older request: no error detail was recorded. Send a new request.':'Eski istek: hata ayrıntısı kaydedilmemiş. Yeni istek gönderin.';
 const env=request.push_environment==='development'?'sandbox':request.push_environment==='production'?'production':null;
 const environmentMismatch=['BadEnvironmentKeyIdInToken','BadEnvironmentKeyInToken','BadCertificateEnvironment'].includes(code);
 const message=environmentMismatch
  ?(english?'The Apple credential does not match the selected environment. Check production access for TestFlight.':'Apple kimlik bilgisi seçilen ortamla eşleşmiyor. TestFlight için production erişimini kontrol edin.')
  :(explanations[code]?.[english?1:0]??(english?'Apple rejected the request; review this error code.':'Apple isteği reddetti; bu hata kodunun incelenmesi gerekiyor.'));
 return [code,request.http_status?`HTTP ${request.http_status}`:null,env].filter(Boolean).join(' · ')+': '+message;
}
