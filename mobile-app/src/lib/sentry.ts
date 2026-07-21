import * as Sentry from "@sentry/react-native";

// The DSN's only live source is Metro's build-time inlining of
// EXPO_PUBLIC_SENTRY_DSN (EAS production environment for store builds, .env
// for local dev). The old Constants.expoConfig fallback was dead code —
// app.config.ts never bakes extra.sentryDsn. Kept import-free on purpose:
// this module is required from the boot entry BEFORE the app graph, so it
// must not drag expo-constants (or anything else avoidable) into that window.
//
// An unexpanded "${...}" placeholder (eas.json env misconfiguration — same
// rule as isUnresolved() in ./config.ts, duplicated here to keep the boot
// graph lean) must not reach Sentry.init — pass undefined so the SDK
// disables cleanly instead of failing during boot.
function resolveDsn(): string | undefined {
  const raw = process.env.EXPO_PUBLIC_SENTRY_DSN;
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (trimmed && !trimmed.includes("${")) {
    return trimmed;
  }
  if (!__DEV__) {
    // Loud breadcrumb in logcat/console: a production binary without crash
    // reporting is the blind spot that hid the v1.6–1.7 incident for weeks.
    console.warn("Sentry disabled: EXPO_PUBLIC_SENTRY_DSN missing or unexpanded at build time.");
  }
  return undefined;
}

export const initSentry = () => {
  Sentry.init({
    dsn: resolveDsn(),

    // Set tracesSampleRate to 1.0 to capture 100% of transactions for performance monitoring
    // Reduce in production (e.g., 0.1 for 10% sampling)
    tracesSampleRate: __DEV__ ? 1.0 : 0.1,

    // Enable automatic session tracking
    enableAutoSessionTracking: true,

    // Sessions close after app is 10 seconds in the background
    sessionTrackingIntervalMillis: 10000,

    // Enable native crash tracking (iOS/Android)
    enableNative: true,

    // Enable automatic breadcrumbs
    enableAutoPerformanceTracing: true,

    // Environment
    environment: __DEV__ ? "development" : "production",

    // release/dist deliberately omitted: the SDK derives both from native
    // build info (bundleId@version+build), which stays correct across EAS
    // remote version bumps and OTA updates. expoConfig no longer carries
    // buildNumber/versionCode (EAS manages them remotely).

    // Before send - sanitize sensitive data
    beforeSend(event, hint) {
      // Remove sensitive data from event
      if (event.request) {
        delete event.request.cookies;

        // Sanitize headers
        if (event.request.headers) {
          delete event.request.headers.Authorization;
          delete event.request.headers.Cookie;
        }
      }

      // Sanitize user data if present
      if (event.user) {
        // Keep user ID but remove email/username
        event.user = {
          id: event.user.id,
        };
      }

      return event;
    },

    // Ignore certain errors
    ignoreErrors: [
      // Network errors
      "Network request failed",
      "Failed to fetch",

      // User navigation
      "Navigation cancelled",

      // Common React Native errors that aren't actionable
      "Reading from metro.config.js",
    ],
  });
};

// Helper to capture exceptions with context
export const captureException = (error: Error, context?: Record<string, any>) => {
  if (context) {
    Sentry.withScope((scope) => {
      Object.entries(context).forEach(([key, value]) => {
        scope.setContext(key, value);
      });
      Sentry.captureException(error);
    });
  } else {
    Sentry.captureException(error);
  }
};

// Helper to capture messages
export const captureMessage = (message: string, level: Sentry.SeverityLevel = "info") => {
  Sentry.captureMessage(message, level);
};

// Helper to set user context
export const setUser = (user: { id: string; [key: string]: any } | null) => {
  if (user) {
    Sentry.setUser({
      id: user.id,
      // Don't include email or other PII
    });
  } else {
    Sentry.setUser(null);
  }
};

// Helper to add breadcrumb
export const addBreadcrumb = (breadcrumb: Sentry.Breadcrumb) => {
  Sentry.addBreadcrumb(breadcrumb);
};

export { Sentry };
