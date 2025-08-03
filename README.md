# AI Advocate

AI Advocate is a privacy-first mobile application designed to Educate, Empower, and Employ. It makes complex legislative bills accessible and provides tools for users to engage directly with their representatives, with a special focus on survivors of domestic violence, human trafficking, and sexual assault.

> **Project Status:** Phase 1 and the foundational elements of Phase 2 are complete. The app has been restructured into a four-tab advocacy platform.

## Core Features

-   ✅ **Theme-Adaptive UI:** The application automatically adjusts its color scheme (light/dark) based on the user's device settings, including a theme-adaptive header banner.
-   ✅ **Comprehensive Bill Feed:** The main "Bills" tab displays a complete, searchable list of all legislation relevant to the app's mission.
-   ✅ **Intelligent Bill Search:** A powerful search bar that understands both keywords (like "human trafficking") and specific bill numbers (like "SB376") for precise filtering.
-   ✅ **Survivor Panel Reviews:** Displays direct feedback and recommendations from the LNF Survivor-led Advocate Panel on bill detail pages.
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
-   [x] Add `is_curated` boolean to the `bills` table for staff-led highlighting.
-   [x] Re-architect the UI to a four-tab layout: Bills, Saved, LNF, and Advocacy.
-   [x] "Bills" tab fetches and displays all relevant bills in the database.
-   [x] "LNF" tab displays static information.
-   [x] "Advocacy" tab contains the "Find Your Rep" feature.

### Phase 2: Advanced Features & Webpage Goals (In Progress)
-   [x] **Legislator & Voting Data:**
    -   [x] Create `legislators` and `votes` tables.
    -   [x] Add `is_lnf_ally` boolean to the `legislators` table.
    -   [x] Build the Edge Function to sync legislator and voting data.
-   [x] **"Take Action" Email Templates:**
    -   [x] Implement the feature to open a user's email client with a pre-filled template.
-   [x] **Survivor Panel Integration:**
    -   [x] Display the panel's feedback and recommendations prominently on bill detail pages.
-   [ ] **Multilingual Support:**
    -   [x] Integrate a localization library.
    -   [ ] Use the Gemini API for high-quality text translations.


---

## Developer Notes & Best Practices

This project has several key dependencies and configurations. The following are the established best practices for setting up and maintaining the application.

*   **Theme-Adaptive Components:** To create components that adapt to the device theme, use the `useTheme` hook from `react-native-paper` to access the current theme's colors and the `useColorScheme` hook from `react-native` to detect the current color scheme (light or dark). The `HeaderBanner.tsx` component is a good example of this.

*   **Package Management & Installation:** This project uses **Yarn** as its exclusive package manager. `npm` should not be used, as it has shown to cause irresolvable dependency issues in this environment.
    *   **First-Time Setup:** To install all dependencies correctly, navigate to the `mobile-app` directory and run `yarn install`.
    *   **Fixing Dependencies:** If you encounter dependency-related crashes after an upgrade, the canonical way to fix them is to use the Expo installer. Run `npx expo install --fix` from the `mobile-app` directory. This command will automatically align all packages to their correct, compatible versions.

*   **Environment Variables (Secrets):** The project uses a two-file system for managing environment variables.
    *   **`mobile-app/.env`**: This file contains **public-facing** keys for the client-side Expo app. All keys in this file must be prefixed with `EXPO_PUBLIC_`.
    *   **`supabase/.env`**: This file contains **private, secret** keys for the serverless backend, such as `SUPABASE_SERVICE_ROLE_KEY` and `GEMINI_API_KEY`. These keys are never exposed to the client.

*   **Emulator Environment:** The Android Emulator on the local development machine has shown instability with default GPU acceleration. The most reliable method for launching it is manually from the command line with software rendering enabled: `/path/to/emulator -avd <AVD_NAME> -gpu swiftshader_indirect`.

*   **Authentication Flow:** The core authentication and redirect logic is now handled by Expo Router's file-based system, which is more stable than the previous hook-based approach.
    *   `app/index.tsx` serves as the primary entry point. It is a dedicated redirect hub that checks the user's session status and navigates them to either the login screen or the main app.
    *   `app/_layout.tsx` is the top-level layout that wraps the entire application in the necessary providers (Auth, Paper, etc.).

*   **Native Project Regeneration:** If you encounter inexplicable build failures, especially after upgrading packages or changing native configurations in `app.json`, the native project files (`android` and `ios` directories) may be stale. The definitive solution is to delete the problematic directory (e.g., `rm -rf mobile-app/android`) and regenerate it from the `mobile-app` directory:
    ```bash
    npx expo prebuild --platform android --clean
    ```

*   **EAS Project Linking:** The application is linked to an Expo Application Services (EAS) project with the slug `ai-advocate` and the project ID `2815e517-2761-4f1b-a1d9-57dc978c3b0c`. The configuration in `app.json` must match this to ensure successful builds.

*   **Data Pipeline & Backlog Processing:** The data pipeline is a two-stage process.
    *   **`bulk-import-dataset` (Seeding):** This Supabase function performs a one-time import of bill *metadata* to seed the database. It is triggered manually.
    *   **`sync-updated-bills` (Enrichment):** This function processes one bill at a time, fetching its full text, generating AI summaries, and saving the results. It is triggered by a cron job for daily maintenance.
    *   **Initial Backlog:** To process the large initial backlog after seeding, run the local Python script from the project root: `python3 process_full_backlog.py`. This script will intelligently call the enrichment function until all bills are processed, automatically pausing on API quota errors.