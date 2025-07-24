# AI Advocate

AI Advocate is a privacy-first mobile application designed to Educate, Empower, and Employ. It makes complex legislative bills accessible and provides tools for users to engage directly with their representatives, with a special focus on survivors of domestic violence, human trafficking, and sexual assault.

> **Project Status:** Phase 1 and the foundational elements of Phase 2 are complete. The app has been restructured into a four-tab advocacy platform.

## Core Features

-   ✅ **Theme-Adaptive UI:** The application automatically adjusts its color scheme (light/dark) based on the user's device settings, including a theme-adaptive header banner.
-   ✅ **Curated Bill Feed:** The main "Bills" tab displays a focused feed of legislation curated by the LNF Survivor-led Advocate Panel.
-   ✅ **Take Action:** The "Advocacy" tab allows users to find their representatives by address and contact them with a pre-filled, customizable email template.
-   ✅ **AI-Powered Summaries:** Reads the full text of bills and uses the Gemini API to generate summaries for different reading levels.
-   ✅ **LNF Information:** A dedicated "LNF" tab provides information about Love Never Fails and the Survivor-led Advocate Panel.
-   ✅ **Private Bookmarks:** Save bills for later review in a dedicated "Saved" tab.
-   ✅ **Secure Anonymous Authentication:** All user actions are tied to a unique, anonymous identity created automatically on first app launch, with no sign-up required.
-   ✅ **Multilingual Foundation:** The app is built with a localization framework (i18next) to support multiple languages.

## Technical Architecture

-   **Frontend:** React Native (Expo) with Expo Router for file-based navigation.
-   **UI Library:** React Native Paper for a modern, Material Design component system.
-   **Backend:** A fully serverless backend powered by Supabase:
    -   **Database:** Supabase Postgres for all data storage.
    -   **Authentication:** Supabase Auth for anonymous user sessions.
    -   **Serverless Functions:** Deno Edge Functions manage a robust data pipeline for automated data ingestion, AI enrichment, and legislator syncing.
-   **AI:** Google's Gemini API for all summarization tasks.

---

## Official Roadmap

### Phase 1: The Core Advocacy Experience (Complete)
-   [x] Add `is_curated` boolean to the `bills` table.
-   [x] Re-architect the UI to a four-tab layout: Bills, Saved, LNF, and Advocacy.
-   [x] "Bills" tab fetches and displays only curated bills.
-   [x] "LNF" tab displays static information.
-   [x] "Advocacy" tab contains the "Find Your Rep" feature.

### Phase 2: Advanced Features & Webpage Goals (In Progress)
-   [x] **Legislator & Voting Data:**
    -   [x] Create `legislators` and `votes` tables.
    -   [x] Add `is_lnf_ally` boolean to the `legislators` table.
    -   [x] Build the Edge Function to sync legislator and voting data.
-   [x] **"Take Action" Email Templates:**
    -   [x] Implement the feature to open a user's email client with a pre-filled template.
-   [ ] **Multilingual Support:**
    -   [x] Integrate a localization library.
    -   [ ] Use the Gemini API for high-quality text translations.
-   [ ] **Survivor Panel Integration:**
    -   [ ] Design and build a system to store and display the panel's feedback on bills.

---

## Developer Notes & Best Practices

This project has several key dependencies and configurations. The following are best practices and important lessons learned during the initial development phase.

*   **Theme-Adaptive Components:** To create components that adapt to the device theme, use the `useTheme` hook from `react-native-paper` to access the current theme's colors and the `useColorScheme` hook from `react-native` to detect the current color scheme (light or dark). The `HeaderBanner.tsx` component is a good example of this.

*   **Package Management:** The project is configured to use **Yarn** as its package manager. Due to potential caching and dependency resolution issues, `npm` should be avoided. The command `npx expo install --fix` is the correct tool for validating and fixing dependency versions.

*   **Environment Variables (Secrets):** The project uses Expo's modern `EXPO_PUBLIC_` prefix convention for managing environment variables. All secrets are stored in a `.env` file in the `mobile-app/` directory and are loaded automatically by the Expo build process. The `react-native-dotenv` plugin is **not** used.

*   **Emulator Environment:** The Android Emulator on the local development machine has shown instability with default GPU acceleration. The most reliable method for launching it is manually from the command line with software rendering enabled: `/path/to/emulator -avd <AVD_NAME> -gpu swiftshader_indirect`.

*   **Authentication Flow:** The core authentication logic is handled by a custom `AuthProvider`. The `app/_layout.tsx` file wraps the application in this provider, and the `RootLayoutNav.tsx` component handles the routing logic, redirecting users based on their session status. This is the central hub for managing the user's entry into the app.

*   **Native Project Regeneration:** If you encounter inexplicable build failures, especially after upgrading packages or changing native configurations in `app.json`, the native project files may be out of sync. The definitive solution is to regenerate them by running the following command from the `mobile-app` directory:
    ```bash
    npx expo prebuild --platform android --clean
    ```

*   **EAS Project Linking:** The application is linked to an Expo Application Services (EAS) project with the slug `ai-advocate`. The `slug` and `name` fields in `app.json` must match this to ensure successful builds.