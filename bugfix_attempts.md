# Developer Handover & Project Status

## Current State of the Project

*   **High-level summary:** The mobile app is currently in a partially functional state. A significant effort has been made to refactor the navigation and implement a proper authentication flow. However, a persistent and difficult-to-diagnose issue with Expo Router's initial route loading prevents the app from launching correctly on a fresh start.
*   **The Core Problem:** The primary blocker is an issue where Expo Router fails to load the initial route (`/`) correctly, often resulting in a blank screen or an error related to route resolution. This appears to be linked to aggressive caching in the Metro bundler and potential sensitivities in Expo Router's file-based routing system.
*   **Authentication:** The authentication flow using Supabase and a custom `AuthProvider` has been implemented. The root layout (`app/_layout.tsx`) is designed to redirect users to the login screen or the main app based on their session status. This logic may be a contributing factor to the routing issue and is a key area for investigation.

## Recent Changes (Since Last Commit)

The following changes were made to address bugs and refactor the codebase:

*   **Navigation Refactoring:**
    *   The tab route `(tabs)/find-your-rep.tsx` was renamed to `(tabs)/find-your-representative.tsx` for clarity and consistency.
    *   The corresponding layout configuration in `app/(tabs)/_layout.tsx` was updated to reflect this change.
    *   Stale/unused route files (`app/find-your-rep.tsx`) were removed.

*   **Authentication Flow Implementation:**
    *   The root layout (`app/_layout.tsx`) was significantly updated to integrate with the `AuthProvider`. It now uses a `useSession()` hook to determine the user's authentication state and redirects them accordingly using `expo-router`'s `Redirect` component.

*   **Environment Variable Management:**
    *   The project was configured to use `react-native-dotenv` to manage environment variables (e.g., Supabase keys).
    *   `babel.config.js` was updated to include the `react-native-dotenv` plugin.
    *   A TypeScript definition file (`env.d.ts`) was added to provide type safety for environment variables.

*   **Dependency Updates:**
    *   Added `expo-notifications` for future push notification capabilities.
    *   Added `react-native-dotenv` for environment variable handling.
    *   `yarn.lock` was updated to reflect these new dependencies and their transitive versions.

## Bug Fix Attempts & Debugging Notes

*(This section incorporates and preserves the previous findings from this file)*

If you are taking over this project, please be aware of the following key points, especially regarding the persistent Expo Router initial route issue:

*   **Expo Router Version Sensitivity:** The project uses `expo-router@~4.0.21`. Be mindful that Expo Router is under active development, and breaking changes can occur between minor versions. If upgrading, carefully review the release notes for any migration steps, especially concerning routing and layout conventions.
*   **Metro Bundler Caching:** The Metro bundler has shown extremely aggressive caching behavior throughout the debugging process. Standard cache clearing (`expo start --clear`, `rm -rf node_modules/.cache/metro`) often proved insufficient. System-level cache clearing (`rm -rf $TMPDIR/metro-*`) was sometimes necessary. **If you encounter inexplicable bundling or routing issues, assume a caching problem and try the most aggressive cache clearing methods available.**
*   **File-System Based Routing Nuances:** Expo Router's file-system based routing can be sensitive to file naming, directory structures (especially group syntax like `(tabs)`), and the presence/absence of `_layout.tsx` and `index.tsx` files within directories. Even minor deviations from expected patterns can lead to routing failures.
*   **Environment Variables (`.env` and `react-native-dotenv`):** The project relies on `react-native-dotenv` for environment variable management. Ensure that:
    *   A `.env` file exists in `mobile-app/` and is correctly populated with all necessary API keys and secrets (refer to `mobile-app/env.d.ts` for the expected variables).
    *   The `module:react-native-dotenv` plugin is correctly configured in `mobile-app/babel.config.js`.
*   **Native Project Regeneration (`npx expo prebuild`):** If you encounter issues that seem related to native modules, permissions, or deep configuration, `npx expo prebuild` is a powerful tool to regenerate the native Android and iOS project files. This command should be used when other solutions fail, as it can sometimes resolve subtle inconsistencies.
*   **Authentication Flow:** The authentication logic is handled in `mobile-app/src/providers/AuthProvider.tsx` and integrated into `mobile-app/app/_layout.tsx`. This setup controls redirection based on user session status. If routing issues arise, **temporarily commenting out or simplifying this logic in `app/_layout.tsx` can help isolate whether the authentication flow is interfering with initial navigation.**

## Path Forward & Recommendations

1.  **Isolate the Routing Issue:** The absolute top priority is to solve the initial route loading problem.
    *   **Recommendation:** Start by creating a new, minimal Expo project (`npx create-expo-app`) with the same SDK version. Incrementally add back features from this project (Expo Router, the `(tabs)` layout, Supabase, the auth provider) one by one, testing at each step. This will help pinpoint the exact component or configuration causing the failure.
    *   **Alternative:** Systematically dismantle the current `app` directory. Start with just a root `_layout.tsx` and `index.tsx`. If that works, add the `(tabs)` group. Then add the auth provider logic. This is the reverse of the above but achieves the same goal of isolation.

2.  **Verify Environment Setup:** Double-check that the `.env` file in the `mobile-app` directory is correctly set up and that the variables are being loaded correctly. A `console.log` in `app/_layout.tsx` can confirm this.

3.  **Consult Expo Discord/Forums:** Given the difficulty of this bug, searching the official Expo Discord server or GitHub discussions for similar issues may provide a solution that has not been considered.

This persistent routing issue has been the primary blocker. While the project files are now in a more consistent state after the recent refactoring, the root cause of the initial route not loading correctly remains elusive. A systematic, isolation-based debugging approach is the most likely path to a solution.
