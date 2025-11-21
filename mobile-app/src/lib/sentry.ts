import * as Sentry from "@sentry/react-native";
import Constants from "expo-constants";

// Initialize Sentry
// NOTE: Replace 'YOUR_SENTRY_DSN' with your actual Sentry DSN from https://sentry.io
export const initSentry = () => {
    Sentry.init({
        dsn: process.env.EXPO_PUBLIC_SENTRY_DSN || Constants.expoConfig?.extra?.sentryDsn,

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

        // Release version
        release: Constants.expoConfig?.version,

        // Distribution (build number)
        dist: Constants.expoConfig?.ios?.buildNumber || Constants.expoConfig?.android?.versionCode?.toString(),

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
export const setUser = (user: { id: string;[key: string]: any } | null) => {
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
