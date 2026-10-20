# Railway sürümü resmi kaynakları — 17 Eylül 2026

| Bileşen / konu | Lisans / uygulama | Resmi kaynak |
|---|---|---|
| Railway Docker build | Kökte Dockerfile; panel + API tek image | https://docs.railway.com/builds/dockerfiles |
| Railway config | railway.json; restart ve healthcheck | https://docs.railway.com/config-as-code/reference |
| Railway PostgreSQL | Ayrı, kalıcı volume'lu özel servis | https://docs.railway.com/databases/postgresql |
| Railway sağlık kontrolü | 0.0.0.0:$PORT, /healthz | https://docs.railway.com/deployments/healthchecks |
| Railway CLI yükleme | Proje klasörü, .railwayignore | https://docs.railway.com/cli/up |
| Railway fiyat/kota | Plan ve kaynak tüketimine bağlı | https://docs.railway.com/pricing/plans |
| Fastify / cookie / static | MIT; kilit dosyaları sürümleri sabitler | https://github.com/fastify/fastify ; https://github.com/fastify/fastify-cookie ; https://github.com/fastify/fastify-static |
| node-postgres | MIT | https://github.com/brianc/node-postgres |
| Node crypto | Yerleşik scrypt, randomBytes, timingSafeEqual | https://nodejs.org/api/crypto.html |
| PostgreSQL RLS | Rol ve satır politikaları | https://www.postgresql.org/docs/current/ddl-rowsecurity.html |
| PGlite (test) | Apache-2.0, WASM PostgreSQL | https://github.com/electric-sql/pglite |
| Flutter / Dart | BSD-3-Clause; 3.47.4 / 3.13.3 | https://github.com/flutter/flutter/blob/master/LICENSE |
| Android location FGS | Native servis/izin kuralları | https://developer.android.com/develop/background-work/services/fgs/service-types |
| Fused Location | Google SDK şartları; ücretli background tracking SDK yok | https://developers.google.com/android/guides/setup |
| Core Location | Apple SDK koşulları | https://developer.apple.com/documentation/corelocation/handling-location-updates-in-the-background |
| React / TypeScript / Vite | MIT / Apache-2.0 / MIT | https://github.com/facebook/react ; https://github.com/microsoft/TypeScript ; https://github.com/vitejs/vite |
| Leaflet | BSD-2-Clause; harita atıfları korunur | https://github.com/Leaflet/Leaflet/blob/main/FAQ.md |
| OSM karoları | Katkıcı atfı, Referer/cache; toplu/offline indirme yok, SLA yok | https://operations.osmfoundation.org/policies/tiles/ |
| SQLite | Public domain | https://sqlite.org/copyright.html |
| Play arka plan konumu | Beyan, belirgin açıklama/onay, gizlilik politikası ve inceleme | https://support.google.com/googleplay/android-developer/answer/9799150?hl=en |
| Apple dağıtım | Xcode, signing ve Developer Program | https://developer.apple.com/programs/ |

Supabase artık yeni sistemin backend/kimlik/Realtime bağımlılığı değildir. Eski cihaz kayıtlarında transport fallback ve eski HTTP yol alias'ları yalnız uyumluluk içindir.
