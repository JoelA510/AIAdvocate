// mobile-app/src/boot/splash-failsafe.js
//
// Imported FIRST from the app entry (index.js), before expo-router/entry
// evaluates the application module graph. Runs at module scope on purpose:
// if any module throws during initial evaluation (the failure mode that
// shipped v1.6–1.7 as an eternal native splash on Android and a launch
// crash on iOS), React never mounts, so no component-level code can save
// us — but this timer still fires and lifts the native splash so the
// failure becomes visible instead of an infinite hang.
//
// require() inside try/catch so nothing here can itself break boot, and the
// callback body is guarded too — the outer try only covers scheduling. The
// timer is skipped under Jest so an incidental import can't hold the process
// open for 8 seconds.
/* global setTimeout */
try {
  const SplashScreen = require("expo-splash-screen");
  const canHide = SplashScreen && typeof SplashScreen.hideAsync === "function";
  if (canHide && process.env.NODE_ENV !== "test") {
    setTimeout(() => {
      try {
        SplashScreen.hideAsync().catch(() => {});
      } catch {
        // never let the failsafe itself throw
      }
    }, 8000);
  }
} catch {
  // expo-splash-screen unavailable (e.g. web static export) — nothing to do.
}
