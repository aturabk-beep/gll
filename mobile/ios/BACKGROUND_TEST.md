# iOS background-location regression check (0.2.22+24)

Run on a physical iPhone with a release build installed from the Mac build,
without a debugger attached. This source change is not delivered by a web
deployment. Record iPhone model, iOS version, app build and battery level.

1. Enable Always location permission and Precise Location, pair the device,
   and obtain a reliable fix inside the active ODTU test rectangle.
2. Return to the Home Screen without swiping the app away. Remain stationary
   for at least 20 minutes. Then repeat with the screen locked for 20 minutes.
   Check both last communication and last valid location in the panel: fresh
   heartbeats alone do not pass this test. Confirm the location measurement
   timestamps advance while the app stays in the background.
3. Walk inside the test area with the screen locked. Confirm fresh movement
   fixes reach the panel. If fixes arrive but accuracy exceeds 35 m, the panel
   will retain its older reliable fix; record that separately from no uploads.
4. Leave the boundary for at least 15 minutes and check the off-site power
   profile. Return and confirm entry restores the on-site profile. Off-site
   automatic pauses remain allowed, so hourly delivery is not guaranteed by
   an iOS timer.
5. Separately swipe the app away. Test a region crossing/significant movement;
   do not interpret remaining stationary after force-quit as the Home Screen
   test. Event-based relaunch still has no periodic delivery guarantee.
6. Repeat the stationary run under comparable conditions to record battery
   consumption. On-site automatic pauses and distance filtering are disabled
   to keep fresh fixes available; collection may use more power even though
   sample/upload intervals are unchanged.

The optional blue background-location banner remains disabled. No timestamps
are fabricated, and cached measurements are not re-dated to appear current.

Mac validation: build the release IPA with the project's signing configuration
and run the steps above before distributing. Windows source inspection does
not establish that these physical-device checks pass.
