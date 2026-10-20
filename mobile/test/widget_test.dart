import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:gulel_personnel/main.dart';

void main() {
  testWidgets('Missing background permission has a visible next action', (
    tester,
  ) async {
    final calls = <String>[];
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
      const MethodChannel('gulel/personnel'),
      (call) async {
        calls.add(call.method);
        if (call.method == 'status') {
          return {
            'paired': true,
            'ready': false,
            'running': false,
            'fine_location': true,
            'notifications': true,
            'background_location': false,
            'location_enabled': true,
          };
        }
        return null;
      },
    );
    await tester.pumpWidget(const PilotApp());
    await tester.pump();
    expect(find.text('○ Konum: Her zaman izin ver'), findsOneWidget);
    final next = find.text('Konumu “Her zaman” yap');
    await tester.ensureVisible(next);
    await tester.tap(next);
    await tester.pump();
    expect(calls, contains('permissions'));
    await tester.pumpWidget(const SizedBox.shrink());
  });
  testWidgets('Offline tracking remains active without daily controls', (
    WidgetTester tester,
  ) async {
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
      const MethodChannel('gulel/personnel'),
      (call) async => call.method == 'status'
          ? {
              'paired': true,
              'ready': true,
              'running': true,
              'waiting': true,
              'name': 'Pilot Person',
            }
          : null,
    );
    await tester.pumpWidget(const PilotApp());
    await tester.pump();
    expect(find.text('Bağlantı bekleniyor'), findsOneWidget);
    expect(find.text('Takibi başlat'), findsNothing);
    expect(find.text('Durdur'), findsNothing);
    await tester.pumpWidget(const SizedBox.shrink());
  });
  testWidgets(
    'Daily farm time and arrival are visible without developer controls',
    (tester) async {
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        const MethodChannel('gulel/personnel'),
        (call) async => call.method == 'status'
            ? {
                'paired': true,
                'ready': true,
                'running': true,
                'waiting': false,
                'name': 'Pilot Person',
              }
            : call.method == 'attendance'
            ? '{"at_farm":true,"clocked_in":true,"first_clock_in":"2026-09-17T05:10:00.000Z","last_clock_out":null,"work_seconds":7500}'
            : null,
      );
      await tester.pumpWidget(const PilotApp());
      await tester.pumpAndSettle();
      expect(find.text('Mesai içinde'), findsOneWidget);
      expect(find.text('2 sa 05 dk'), findsOneWidget);
      expect(find.text('Mesaiye Başla'), findsOneWidget);
      expect(
        tester
            .widget<FilledButton>(find.byKey(const Key('clock-in-button')))
            .onPressed,
        isNull,
      );
      expect(
        tester
            .widget<FilledButton>(find.byKey(const Key('clock-out-button')))
            .onPressed,
        isNotNull,
      );
      expect(find.byIcon(Icons.admin_panel_settings_outlined), findsNothing);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
  testWidgets('Clock in is the primary action when staff is on site', (
    tester,
  ) async {
    final calls = <MethodCall>[];
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
      const MethodChannel('gulel/personnel'),
      (call) async {
        calls.add(call);
        if (call.method == 'status') {
          return {
            'paired': true,
            'ready': true,
            'running': true,
            'waiting': false,
            'name': 'Pilot Person',
          };
        }
        if (call.method == 'attendance') {
          return '{"at_farm":true,"clocked_in":false,"first_clock_in":null,"last_clock_out":null,"work_seconds":0}';
        }
        return null;
      },
    );
    await tester.pumpWidget(const PilotApp());
    await tester.pumpAndSettle();
    final clockIn = find.byKey(const Key('clock-in-button'));
    expect(tester.widget<FilledButton>(clockIn).onPressed, isNotNull);
    expect(
      tester
          .widget<FilledButton>(find.byKey(const Key('clock-out-button')))
          .onPressed,
      isNull,
    );
    await tester.tap(find.text('EN'));
    await tester.pump();
    expect(find.text('Clock In'), findsOneWidget);
    expect(find.text('Clock Out'), findsOneWidget);
    await tester.tap(clockIn);
    await tester.pumpAndSettle();
    expect(
      calls.any(
        (call) =>
            call.method == 'timeClock' &&
            (call.arguments as Map)['action'] == 'clock_in',
      ),
      isTrue,
    );
    await tester.pumpWidget(const SizedBox.shrink());
  });
}
