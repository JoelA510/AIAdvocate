// mobile-app/src/boot/splash-failsafe.js
//
// Imported FIRST from the app entry (index.js), before anything else pulls in
// the application module graph. If any module throws during initial require
// (the failure mode that shipped v1.6–1.7 as an eternal native splash on
// Android and a launch crash on iOS), React never mounts and no component-
// level code can help — this timer still fires and lifts the native splash so
// the failure becomes visible instead of an infinite hang.
//
// Order is load-bearing INSIDE this file too: the timer is armed BEFORE any
// require, so a broken module graph (even a broken expo package) cannot
// disarm it. All requires happen inside the callback, each behind its own
// guard; the expo-modules-core path keeps the graph this file can pull in to
// the bare native-module bridge. The timer is skipped under Jest so an
// incidental import can't hold the process open for 8 seconds.
/* global setTimeout */
try {
  if (process.env.NODE_ENV !== "test") {
    setTimeout(() => {
      try {
        const { requireOptionalNativeModule } = require("expo-modules-core");
        const native = requireOptionalNativeModule("ExpoSplashScreen");
        if (native && typeof native.hide === "function") {
          native.hide();
          return;
        }
      } catch {
        // fall through to the high-level module
      }
      try {
        const SplashScreen = require("expo-splash-screen");
        if (SplashScreen && typeof SplashScreen.hideAsync === "function") {
          SplashScreen.hideAsync().catch(() => {});
        }
      } catch {
        // splash module unavailable (e.g. web static export) — nothing to hide.
      }
    }, 8000);
  }
} catch {
  // Never let the failsafe itself break boot.
}
