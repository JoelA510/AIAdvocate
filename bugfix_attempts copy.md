
## Additional Context for Future Developers

If you are taking over this project, please be aware of the following key points, especially regarding the persistent Expo Router initial route issue:

*   **Expo Router Version Sensitivity:** The project uses `expo-router@~4.0.21`. Be mindful that Expo Router is under active development, and breaking changes can occur between minor versions. If upgrading, carefully review the release notes for any migration steps, especially concerning routing and layout conventions.
*   **Metro Bundler Caching:** The Metro bundler has shown extremely aggressive caching behavior throughout the debugging process. Standard cache clearing (`expo start --clear`, `rm -rf node_modules/.cache/metro`) often proved insufficient. System-level cache clearing (`rm -rf $TMPDIR/metro-*`) was sometimes necessary. If you encounter inexplicable bundling or routing issues, assume a caching problem and try the most aggressive cache clearing methods available.
*   **File-System Based Routing Nuances:** Expo Router's file-system based routing can be sensitive to file naming, directory structures (especially group syntax like `(tabs)`), and the presence/absence of `_layout.tsx` and `index.tsx` files within directories. Even minor deviations from expected patterns can lead to routing failures.
*   **Environment Variables (`.env` and `react-native-dotenv`):** The project relies on `react-native-dotenv` for environment variable management. Ensure that:
    *   A `.env` file exists in `mobile-app/` and is correctly populated with all necessary API keys and secrets (refer to `mobile-app/env.d.ts` for the expected variables).
    *   The `module:react-native-dotenv` plugin is correctly configured in `mobile-app/babel.config.js`.
*   **Native Project Regeneration (`npx expo prebuild`):** If you encounter issues that seem related to native modules, permissions, or deep configuration, `npx expo prebuild` is a powerful tool to regenerate the native Android and iOS project files. This command should be used when other solutions fail, as it can sometimes resolve subtle inconsistencies.
*   **Authentication Flow:** The authentication logic is handled in `mobile-app/app/RootLayoutNav.tsx` and integrated into `mobile-app/app/_layout.tsx`. This setup controls redirection based on user session status. If routing issues arise, temporarily commenting out or simplifying this logic in `app/_layout.tsx` can help isolate whether the authentication flow is interfering with initial navigation.
*   **Debugging Strategy:** When faced with persistent routing issues, a systematic approach is crucial:
    1.  **Simplify:** Reduce the routing structure to its absolute minimum (e.g., a single `index.tsx` and `_layout.tsx` at the root) to confirm basic rendering.
    2.  **Isolate:** Gradually reintroduce complexity (e.g., the `(tabs)` group, then individual tab screens, then custom components) to pinpoint where the routing breaks.
    3.  **Verify:** After each change, clear caches and restart the bundler to ensure the changes are fully applied.
    4.  **Consult Expo Router Documentation:** Given its rapid development, always refer to the latest official Expo Router documentation for best practices and troubleshooting guides.

This persistent routing issue has been the primary blocker. While the project files are now in a consistent state, the root cause of the initial route not loading correctly remains elusive. Further debugging will likely require deep dives into Metro bundler logs, Expo Router's internal workings, or potentially a fresh project comparison.
