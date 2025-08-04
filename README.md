# AI Advocate

AI Advocate is a privacy-first mobile application designed to Educate, Empower, and Employ. It makes complex legislative bills accessible and provides tools for users to engage directly with their representatives, with a special focus on survivors of domestic violence, human trafficking, and sexual assault.

> **Project Status:** Phase 1 and the foundational elements of Phase 2 are complete. The app has been restructured into a four-tab advocacy platform.

## Core Features

-   ✅ **Theme-Adaptive UI:** The application automatically adjusts its color scheme (light/dark) based on the user's device settings.
-   ✅ **Comprehensive Bill Feed:** The main "Bills" tab displays a complete, searchable list of all legislation relevant to the app's mission.
-   ✅ **Intelligent Bill Search:** A powerful search bar that understands both keywords and specific bill numbers for precise filtering.
-   ✅ **Survivor Panel Reviews:** Displays direct feedback and recommendations from the LNF Survivor-led Advocate Panel on bill detail pages.
-   ✅ **Take Action:** Allows users to find their state legislators by address. On the main advocacy screen, users can select a bill from a dropdown to generate a pre-filled email template. This feature is also integrated directly into each bill's detail page.
-   ✅ **AI-Powered Summaries:** Bills can be viewed in four formats (Simple, Medium, Complex, and Original Text) using a sleek summary slider.
-   ✅ **LNF Information:** A dedicated "LNF" tab provides information about Love Never Fails and the Survivor-led Advocate Panel.
-   ✅ **Private Bookmarks:** Save bills for later review in a dedicated "Saved" tab.
-   ✅ **Secure Anonymous Authentication:** All user actions are tied to a unique, anonymous identity created automatically on first app launch.
-   ✅ **Multilingual Foundation:** The app is built with a localization framework (i18next) to support multiple languages.

## Technical Architecture

-   **Frontend:** React Native (Expo) with Expo Router for file-based navigation.
-   **UI Library:** React Native Paper for a modern, Material Design component system.
-   **Backend:** A fully serverless backend powered by Supabase:
    -   **Database:** Supabase Postgres for all data storage.
    -   **Authentication:** Supabase Auth for anonymous user sessions.
    -   **Serverless Functions:** Deno Edge Functions manage a robust data pipeline for automated data ingestion and AI enrichment.
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

*   **Package Management & Installation:** This project uses **Yarn** as its exclusive package manager. `npm` should not be used.
    *   **First-Time Setup:** To install all dependencies correctly, navigate to the `mobile-app` directory and run `yarn install`.
    *   **Fixing Dependencies:** If you encounter dependency-related crashes after an upgrade, the canonical way to fix them is to use `npx expo install --fix` from the `mobile-app` directory.

*   **Environment Variables (Secrets):** The project uses a two-file system for secrets.
    *   **`mobile-app/.env`**: Contains **public-facing** keys for the client-side app, prefixed with `EXPO_PUBLIC_`.
    *   **`supabase/.env`**: Contains **private, secret** keys for the serverless backend.

*   **Authentication Flow:**
    *   `app/index.tsx` serves as the primary entry point and redirect hub.
    *   `app/_layout.tsx` is the top-level layout that wraps the application in the necessary providers.

*   **Native Project Regeneration:** If the native project files (`android` and `ios` directories) become stale or corrupted, delete the problematic directory and regenerate it from the `mobile-app` directory:
    ```bash
    npx expo prebuild --platform android --clean
    ```

*   **Data Pipeline (Bills):** The bill data pipeline is a two-stage process.
    *   **`bulk-import-dataset` (Seeding):** A manually-triggered Supabase function to seed the database with bill metadata.
    *   **`sync-updated-bills` (Enrichment):** A cron-job-triggered function that processes one bill at a time, fetching its text and generating AI summaries.
    *   **Initial Backlog:** The initial backlog is processed by running the local `python3 process_full_backlog.py` script.

*   **Data Pipeline (Representatives):** The "Find Your Rep" feature uses a two-stage API pipeline.
    *   **Step 1 (Geocoding):** The user's address is sent to the **LocationIQ API** to be converted into latitude and longitude.
    *   **Step 2 (Lookup):** The coordinates are then sent to the **OpenStates API's** `/people.geo` endpoint to find a list of all relevant legislators and their contact details.