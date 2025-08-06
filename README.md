# AI Advocate

AI Advocate is a privacy-first mobile application designed to Educate, Empower, and Employ. It makes complex legislative bills accessible and provides tools for users to engage directly with their representatives, with a special focus on survivors of domestic violence, human trafficking, and sexual assault.

> **Project Status:** Phase 1 and the foundational elements of Phase 2 are complete. The app has been restructured into a four-tab advocacy platform with a robust, interactive feature set.

## Core Features

-   ✅ **Animated Splash Screen:** A theme-aware, animated splash screen provides a polished and professional entry into the app.
-   ✅ **Theme-Adaptive UI:** The application automatically adjusts its color scheme (light/dark) based on the user's device settings.
-   ✅ **Comprehensive Bill Feed:** The main "Bills" tab displays a complete, searchable list of all legislation relevant to the app's mission.
-   ✅ **AI-Powered Summaries:** Bills can be viewed in four formats (Simple, Medium, Complex, and Original Text) using a sleek summary slider.
-   ✅ **Interactive Advocacy Workflow:**
    -   Find state legislators by address using a multi-stage API pipeline (LocationIQ & OpenStates).
    -   View legislator contact details (email and phone) directly in the app.
    -   Generate pre-filled email templates for a selected bill.
    -   Integrated on both the main "Advocacy" tab and individual bill pages for a seamless user experience.
-   ✅ **Private Bookmarks & Reactions:** Users can save bills for later and react to legislation, with all interactions tied to their secure, anonymous identity.
-   ✅ **Secure Anonymous Authentication:** All user actions are tied to a unique identity created automatically and silently in the background on first app launch.

## Technical Architecture

-   **Frontend:** React Native (Expo) with Expo Router for file-based navigation.
-   **UI Library:** React Native Paper for a modern, Material Design component system.
-   **Backend:** A fully serverless backend powered by Supabase:
    -   **Database:** Supabase Postgres, managed via a single source-of-truth `schema.sql`.
    -   **Authentication:** Supabase Auth for seamless anonymous user sessions.
    -   **Serverless Functions:** Deno Edge Functions manage the data pipeline for automated bill ingestion and AI enrichment.
-   **AI:** Google's Gemini API for all summarization and translation tasks.

---

## Getting Started: A Guide for New Developers

This guide will walk you through setting up the entire project, from the backend infrastructure to the local development environment.

### Prerequisites

-   **Node.js (v20 LTS recommended):** Manage Node versions with [NVM](https://github.com/nvm-sh/nvm).
-   **Yarn:** The project's required package manager. Install with `npm install -g yarn`.
-   **Supabase CLI:** Follow the [official installation guide](https://supabase.com/docs/guides/cli/getting-started).
-   **Git:** For version control.

### Step 1: Clone & Configure Backend

1.  **Clone the Repository:** `git clone <your-repository-url>` and `cd` into the project.
2.  **Link Supabase Project:** Navigate to the `supabase/` directory and link it to your remote Supabase project: `supabase link --project-ref <your-project_ref>`.
3.  **Configure Backend Secrets:** In the `supabase/` directory, copy the example environment file (`cp .env.example .env`) and fill in your secret keys for Supabase, LegiScan, and Gemini.
4.  **Push the Database Schema:** Run `supabase db push`. This executes the `schema.sql` file, which is the single source of truth for all tables and required database functions (`handle_reaction`, `get_bill_details_for_user`, etc.).

### Step 2: Configure & Run Frontend

1.  **Configure Frontend Keys:** Navigate to the `mobile-app/` directory. Create a `.env` file and fill in all the public-facing keys (prefixed with `EXPO_PUBLIC_`) for Supabase, OpenStates, and LocationIQ.
2.  **Install Dependencies:** Run `yarn install`. If you encounter dependency issues, the canonical fix is `npx expo install --fix`.
3.  **Run the App:** Run `yarn start` to launch the Metro development server. To run on a mobile device, you must first have a development build installed.

---

## Key Architectural Decisions & Workflows

*   **Authentication Flow:** The app uses a fully autonomous `AuthProvider`. On first launch, it silently creates an anonymous user. The entry point at `app/index.tsx` is a theme-aware, animated splash screen that provides a seamless visual transition into the main `(tabs)` layout.

*   **Data Pipeline (Bills):**
    1.  **Seeding (`bulk-import-dataset`):** A manual, one-time Supabase function to seed the database with basic bill metadata.
    2.  **Enrichment (`sync-updated-bills`):** A daily cron-job function that processes one bill at a time, fetching text and generating AI summaries.
    3.  **Backlog Processing:** The initial data enrichment is handled by the `python3 process_full_backlog.py` script, which is quota-aware and can be run locally.

*   **Data Pipeline (Representatives):** The "Find Your Rep" feature uses a three-stage API pipeline:
    1.  **Geocoding:** The user's address is sent to **LocationIQ** to get coordinates.
    2.  **Search:** The coordinates are sent to the **OpenStates API's** `/people.geo` endpoint to get a list of basic legislator objects.
    3.  **Enrichment:** The app then makes individual API calls for each state-level legislator to the `/people/{ocd-id}` endpoint to fetch their full, detailed profile, including contact information.

*   **Native Builds & Deployment:** The project uses EAS for all builds and deployments.
    *   **Native Dependencies:** If you add a package with native code (like `expo-clipboard`), you **must** create a new development build (`eas build --profile development`) and a new production build (`eas build --profile production`).
    *   **OTA Updates:** JavaScript-only changes can be deployed instantly to production users via `eas update --branch production`.
    *   **Web App:** The web version is a static build created with `yarn expo export` and can be deployed to any static hosting service like Netlify.

---

## Official Roadmap

*(This section remains the same)*

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