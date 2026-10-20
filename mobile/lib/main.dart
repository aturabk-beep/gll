import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

const railwayOrigin = String.fromEnvironment(
  'RAILWAY_ORIGIN',
  defaultValue: 'https://guleltakip-production.up.railway.app',
);

void main() => runApp(const PilotApp());

class PilotApp extends StatefulWidget {
  const PilotApp({super.key});
  @override
  State<PilotApp> createState() => _PilotAppState();
}

class _PilotAppState extends State<PilotApp> with WidgetsBindingObserver {
  static const native = MethodChannel('gulel/personnel');
  Map<String, dynamic> status = {}, attendance = {};
  bool english = false, busy = false;
  String error = '';
  final code = TextEditingController();
  Timer? statusTimer, attendanceTimer, clockInRefreshTimer;

  String tr(String a, String b) => english ? b : a;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    refresh().then((_) async {
      await prepareClockIn();
      await refreshAttendance();
    });
    statusTimer = Timer.periodic(const Duration(seconds: 5), (_) => refresh());
    attendanceTimer = Timer.periodic(
      const Duration(minutes: 1),
      (_) => refreshAttendance(),
    );
  }

  @override
  void dispose() {
    statusTimer?.cancel();
    attendanceTimer?.cancel();
    clockInRefreshTimer?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    code.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      invoke('resume');
      prepareClockIn().then((_) => refreshAttendance());
    }
  }

  Future<void> prepareClockIn() async {
    if (status['paired'] != true || status['ready'] != true) return;
    try {
      await native.invokeMethod('prepareClockIn');
      if (mounted) {
        clockInRefreshTimer?.cancel();
        clockInRefreshTimer = Timer(
          const Duration(seconds: 4),
          refreshAttendance,
        );
      }
    } catch (_) {
      // Normal background tracking continues if a one-off fix is unavailable.
    }
  }

  Future<void> refresh() async {
    try {
      final value = await native.invokeMapMethod<String, dynamic>('status');
      if (mounted) setState(() => status = value ?? {});
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    }
  }

  Future<void> refreshAttendance() async {
    if (status['paired'] != true) return;
    try {
      final raw = await native.invokeMethod<String>('attendance');
      if (raw != null && mounted) {
        setState(() => attendance = jsonDecode(raw) as Map<String, dynamic>);
      }
    } catch (_) {
      // Çevrimdışıyken ana ekran kullanılmaya devam eder.
    }
  }

  Future<void> invoke(String name, [Map<String, dynamic>? args]) async {
    if (busy) return;
    setState(() {
      busy = true;
      error = '';
    });
    try {
      await native.invokeMethod(name, args);
      await refresh();
      await refreshAttendance();
    } catch (e) {
      if (mounted) {
        setState(
          () => error = e is PlatformException
              ? (e.message ?? e.code)
              : e.toString(),
        );
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  String timeOf(dynamic value) {
    if (value is! String || value.isEmpty) return '—';
    final valueTime = DateTime.tryParse(value)?.toLocal();
    if (valueTime == null) return '—';
    return '${valueTime.hour.toString().padLeft(2, '0')}:${valueTime.minute.toString().padLeft(2, '0')}';
  }

  String durationOf(dynamic value) {
    final seconds = value is num ? value.round() : 0;
    final hours = seconds ~/ 3600;
    final minutes = (seconds % 3600) ~/ 60;
    return hours > 0
        ? '$hours sa ${minutes.toString().padLeft(2, '0')} dk'
        : '$minutes dk';
  }

  Widget attendanceCard() {
    final atFarm = attendance['at_farm'] == true;
    final clockedIn = attendance['clocked_in'] == true;
    return Card(
      margin: const EdgeInsets.only(top: 18),
      child: Padding(
        padding: const EdgeInsets.all(22),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Icon(
                  atFarm ? Icons.location_on : Icons.location_off_outlined,
                  color: atFarm
                      ? const Color(0xff2f7552)
                      : Colors.orange.shade800,
                ),
                const SizedBox(width: 8),
                Text(
                  atFarm
                      ? tr('Mesai içinde', 'On site')
                      : tr('Mesai dışı', 'Off site'),
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 20),
            SizedBox(
              height: 68,
              child: FilledButton.icon(
                key: const Key('clock-in-button'),
                onPressed: busy || !atFarm || clockedIn
                    ? null
                    : () => invoke('timeClock', {'action': 'clock_in'}),
                icon: const Icon(Icons.login, size: 28),
                label: Text(
                  tr('Mesaiye Başla', 'Clock In'),
                  style: const TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ),
            const SizedBox(height: 12),
            SizedBox(
              height: 60,
              child: FilledButton.icon(
                key: const Key('clock-out-button'),
                style: FilledButton.styleFrom(
                  backgroundColor: const Color(0xff9d4037),
                  disabledBackgroundColor: const Color(0xffd9d9d4),
                ),
                onPressed: busy || !clockedIn
                    ? null
                    : () => invoke('timeClock', {'action': 'clock_out'}),
                icon: const Icon(Icons.logout, size: 25),
                label: Text(
                  tr('Mesaiyi Bitir', 'Clock Out'),
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ),
            if (!clockedIn && !atFarm) ...[
              const SizedBox(height: 12),
              Text(
                tr(
                  'Mesaiye başlamak için yerleşke sınırları içinde olmalısınız.',
                  'You must be inside the site boundary to clock in.',
                ),
                textAlign: TextAlign.center,
                style: TextStyle(color: Colors.orange.shade900),
              ),
            ],
            const Divider(height: 32),
            Text(tr('Bugünkü mesai', "Today's work")),
            const SizedBox(height: 4),
            Text(
              durationOf(attendance['work_seconds']),
              style: const TextStyle(fontSize: 34, fontWeight: FontWeight.w600),
            ),
            const Divider(height: 28),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(tr('Mesai başlangıcı', 'Clock-in')),
                Text(timeOf(attendance['first_clock_in'])),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(tr('Mesai bitişi', 'Clock-out')),
                Text(timeOf(attendance['last_clock_out'])),
              ],
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final paired = status['paired'] == true;
    final ready = status['ready'] == true;
    final running = status['running'] == true;
    final waiting = status['waiting'] == true;
    final showSetup = !paired || !ready;
    return MaterialApp(
      title: 'Gülel Personnel',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xff285541)),
        useMaterial3: true,
        scaffoldBackgroundColor: const Color(0xfff5f6f1),
      ),
      home: Scaffold(
        appBar: AppBar(
          toolbarHeight: 80,
          title: Image.asset(
            'assets/logo.png',
            width: 156,
            height: 74,
            fit: BoxFit.contain,
            semanticLabel: 'Gülel Personnel',
          ),
          backgroundColor: Colors.transparent,
          actions: [
            TextButton(
              onPressed: () => setState(() => english = !english),
              child: Text(english ? 'TR' : 'EN'),
            ),
          ],
        ),
        body: SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(28),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                SizedBox(height: paired ? 8 : 40),
                if (!paired || !ready)
                  const Icon(
                    Icons.settings_suggest_outlined,
                    size: 112,
                    color: Colors.orange,
                  ),
                if (!paired || !ready) const SizedBox(height: 24),
                Text(
                  status['name'] ?? tr('Personel kurulumu', 'Staff setup'),
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    fontSize: 26,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                if (paired) attendanceCard(),
                const SizedBox(height: 12),
                Text(
                  !ready || !running
                      ? tr('Kurulum gerekli', 'Setup required')
                      : waiting
                      ? tr('Bağlantı bekleniyor', 'Waiting for connection')
                      : tr('Konum etkin', 'Location active'),
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 15,
                    color: !ready || !running
                        ? Colors.orange.shade900
                        : Colors.black54,
                  ),
                ),
                if (showSetup) ...[
                  const SizedBox(height: 36),
                  Text(
                    tr('YETKİLİ KURULUMU', 'AUTHORIZED SETUP'),
                    style: const TextStyle(fontWeight: FontWeight.bold),
                  ),
                  if (!paired) ...[
                    const SizedBox(height: 18),
                    Text(
                      tr(
                        'Bu uygulama geliş ve çıkış sürelerini hesaplamak için arka planda konum işler. Yerleşke içi konum kayıtları 7 gün saklanır; dış koordinatlar sunucuda kaydedilmez ve yöneticiye gösterilmez. Sınır dışında 15 dakika kalınca konum ve veri gönderimi yaklaşık saatte bire düşer.',
                        'This app processes background location to calculate arrival and departure times. On-farm location records are retained for 7 days; off-site coordinates are not stored on the server or shown to administrators. After 15 minutes outside, location and data transmission drop to approximately once per hour.',
                      ),
                    ),
                    const SizedBox(height: 18),
                    TextField(
                      controller: code,
                      keyboardType: TextInputType.number,
                      maxLength: 4,
                      inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                      autocorrect: false,
                      decoration: InputDecoration(
                        labelText: tr(
                          '4 haneli eşleştirme kodu',
                          '4-digit pairing code',
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),
                    FilledButton(
                      onPressed: busy || railwayOrigin.isEmpty
                          ? null
                          : () => invoke('pair', {
                              'url': railwayOrigin,
                              'code': code.text.trim(),
                            }),
                      child: Text(tr('Eşleştir', 'Pair device')),
                    ),
                    if (railwayOrigin.isEmpty)
                      Text(
                        tr(
                          'Bu derlemede sunucu ayarı eksik. Yetkiliye başvurun.',
                          'Server configuration is missing. Contact your administrator.',
                        ),
                      ),
                  ],
                  if (paired) ...[
                    const SizedBox(height: 20),
                    if (Platform.isIOS) ...[
                      Text(
                        tr(
                          'İlk izin penceresinde “Uygulamayı Kullanırken” seçin. Sonra aşağıdaki izin düğmesine tekrar basıp “Her Zaman” iznini isteyin. İkinci pencere açılmazsa Uygulama ayarları → Konum → Her Zaman yolunu kullanın ve Tam Konum’u açın. “Bir Kez İzin Ver” seçimi bu oturumda Her Zaman iznine yükseltilemez.',
                          'Choose “While Using the App” in the first prompt. Then tap the permission button again to request “Always”. If a second prompt does not appear, open App settings → Location → Always and enable Precise Location. “Allow Once” cannot be upgraded to Always during that session.',
                        ),
                      ),
                      const SizedBox(height: 12),
                    ],
                    if (!Platform.isIOS) ...[
                      for (final item in [
                        [
                          'fine_location',
                          tr('Hassas konum', 'Precise location'),
                        ],
                        ['notifications', tr('Bildirim izni', 'Notifications')],
                        [
                          'background_location',
                          tr(
                            'Konum: Her zaman izin ver',
                            'Location: Allow all the time',
                          ),
                        ],
                        [
                          'location_enabled',
                          tr(
                            'Telefonun konum servisi',
                            'Phone location service',
                          ),
                        ],
                      ])
                        Text(
                          '${status[item[0]] == true ? '✓' : '○'} ${item[1]}',
                        ),
                      const SizedBox(height: 12),
                    ],
                    FilledButton(
                      onPressed: busy ? null : () => invoke('permissions'),
                      child: Text(
                        Platform.isIOS
                            ? tr(
                                '1 · İzinleri tamamla',
                                '1 · Grant permissions',
                              )
                            : status['fine_location'] != true
                            ? tr(
                                'Hassas konuma izin ver',
                                'Allow precise location',
                              )
                            : status['notifications'] != true
                            ? tr('Bildirimlere izin ver', 'Allow notifications')
                            : status['background_location'] != true
                            ? tr(
                                'Konumu “Her zaman” yap',
                                'Allow location all the time',
                              )
                            : status['location_enabled'] != true
                            ? tr(
                                'Telefonun konumunu aç',
                                'Turn on phone location',
                              )
                            : tr('İzinleri kontrol et', 'Check permissions'),
                      ),
                    ),
                    OutlinedButton(
                      onPressed: busy ? null : () => invoke('settings'),
                      child: Text(
                        tr(
                          '2 · Her zaman konum / Uygulama ayarları',
                          '2 · Always location / App settings',
                        ),
                      ),
                    ),
                    if (!Platform.isIOS)
                      OutlinedButton(
                        onPressed: busy
                            ? null
                            : () => invoke('batterySettings'),
                        child: Text(
                          tr('3 · Pil ayarları', '3 · Battery settings'),
                        ),
                      ),
                  ],
                ],
                if (error.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 18),
                    child: Text(
                      error,
                      style: const TextStyle(color: Colors.red),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
