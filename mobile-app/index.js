// mobile-app/index.js
//
// Custom entry. Import order is load-bearing:
//   1. splash-failsafe arms a require-free timer that lifts the native splash
//      even if everything below throws during module evaluation.
//   2. Sentry initializes before the app graph evaluates, so a module-scope
//      throw during startup is captured instead of vanishing.
//   3. expo-router/entry evaluates the application.
// (see DEPLOYMENT_GUIDE.md, "Postmortem: the eas.json ${} placeholder
// incident")
import "./src/boot/splash-failsafe";
import "./src/boot/init-sentry";
import "expo-router/entry";
