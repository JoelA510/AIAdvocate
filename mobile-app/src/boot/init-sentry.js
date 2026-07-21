// mobile-app/src/boot/init-sentry.js
//
// Initializes Sentry BEFORE the application module graph evaluates (imported
// from index.js, after the splash failsafe and before expo-router/entry).
// This way a module-scope throw during startup is captured and reported —
// the v1.6–1.7 incident produced zero Sentry sessions for weeks precisely
// because Sentry.init lived inside the module graph that was dying.
//
// require() inside try/catch so a Sentry problem can never block boot.
try {
  const { initSentry } = require("../lib/sentry");
  initSentry();
} catch {
  // Sentry unavailable — boot continues without crash reporting.
}
