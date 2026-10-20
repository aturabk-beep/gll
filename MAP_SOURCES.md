# Temporary ODTU Silicon Block test area

Verified 25 September 2026.

> **TEMPORARY TEST CONFIGURATION:** This boundary is only for the office trial.
> Revert the dedicated `Temporary ODTU Silicon Block test site` commit before
> distributing the app to farm personnel.

- Test site: ODTU Technopolis Silicon Block, Universiteler, Cankaya, Ankara.
- Waze place pin: latitude **39.900053**, longitude **32.7743356**. Source:
  https://www.waze.com/live-map/directions/tr/ankara/metu-technopolis-silicone-block?to=place.ChIJG7BtbDBG0xQR9dOzmd8Kto0
- Independent coordinate listing: **39° 53' 58.5924" N, 32° 46' 26.1336" E**
  (decimal **39.899609**, **32.773926**). Source:
  https://www.haritamap.com/yer/teknokent-silikon-bloklar-cankaya
- The building footprint and entrances were cross-checked with Esri World
  Imagery. The temporary rectangle includes an approximately 50 m GPS margin:
  south **39.89885**, west **32.77261**, north **39.90107**, east
  **32.77481**. It covers the building, its entrance and nearby parking.
- The configurable 0–1000 m buffer still expands all four sides. The final live
  test deployment was verified with a **100 m** additional buffer: south
  **39.8979507**, west **32.7714377**, north **39.9019693**, east
  **32.7759823**. The setting remains adjustable from the admin panel.
- This is an operational test geofence, not a cadastral or surveyed boundary.
- Android/iOS receive a circumscribed circle only as a low-power return wake-up
  hint; server and app inside/outside decisions use the rectangle.
- Satellite service:
  https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer
- Attribution shown in the panel: Esri, Vantor, Earthstar Geographics, and the
  GIS User Community.
- The admin map has both **Test alanına git** and **Çiftliğe git** views. The
  farm view restores the original calibrated `ciftlik.png` overlay and shows a
  display-only farm rectangle with a 0–1000 m preview buffer. Switching views
  or editing that preview does **not** change live attendance, Clock-in or
  device geofences: these still use the temporary ODTU test rectangle.
- Before the farm rollout, restore the farm boundary in the backend and mobile
  logic as a separate change. The map preview alone is not a rollout switch.
