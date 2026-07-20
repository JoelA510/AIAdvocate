// mobile-app/index.js
//
// Custom entry: install the splash failsafe BEFORE the router entry pulls in
// the application module graph. Import order is load-bearing — a module-scope
// throw anywhere in the app graph would otherwise leave the native splash up
// forever with no signal (see DEPLOYMENT_GUIDE.md, "Postmortem: the eas.json
// ${} placeholder incident").
import "./src/boot/splash-failsafe";
import "expo-router/entry";
