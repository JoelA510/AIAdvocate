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

Before you begin, ensure you have the following installed on your machine:
-   **Node.js (v20 LTS recommended):** It is highly recommended to manage Node versions with [NVM](https://github.com/nvm-sh/nvm).
-   **Yarn:** The project's required package manager. Install with `npm install -g yarn`.
-   **Supabase CLI:** Follow the [official installation guide](https://supabase.com/docs/guides/cli/getting-started).
-   **Git:** For version control.

### Step 1: Clone the Repository

Clone the project to your local machine:
`bash
git clone <your-repository-url>
cd AIAdvocate
`

### Step 2: Set Up the Supabase Backend

1.  **Log in to Supabase:**
    `bash
    supabase login
    `
2.  **Link the Project:** Link your local repository to your remote Supabase project. You will need your Project REF, which can be found in your Supabase project's URL (e.g., `https://supabase.com/dashboard/project/<project_ref>`).
    `bash
    supabase link --project-ref <your-project_ref>
    `
3.  **Push the Database Schema:** This command will execute the `schema.sql` file and create all necessary tables and functions in your remote database.
    `bash
    supabase db push
    `

### Step 3: Configure Environment Variables

This project uses two separate `.env` files for security and clarity.

1.  **Backend Secrets (`supabase/.env`):**
    *   Navigate to the `supabase/` directory.
    *   Create a copy of the example file: `cp .env.example .env`
    *   Open the new `.env` file and fill in your secret keys for Supabase, LegiScan, and Gemini.

2.  **Frontend Public Keys (`mobile-app/.env`):**
    *   Navigate to the `mobile-app/` directory.
    *   Create a `.env` file and add the following public keys:
    `
    EXPO_PUBLIC_SUPABASE_URL=https://<your-project_ref>.supabase.co
    EXPO_PUBLIC_SUPABASE_ANON_KEY=<your_supabase_anon_key>
    EXPO_PUBLIC_OPENSTATES_API_KEY=<your_openstates_api_key>
    EXPO_PUBLIC_LOCATIONIQ_API_KEY=<your_locationiq_api_key>
    `

3.  **Firebase Service Files:**
    *   From the `mobile-app/` directory, copy the provided example files:
    `
    cp google-services.json.example google-services.json
    cp GoogleService-Info.plist.example GoogleService-Info.plist
    `
    *   Replace the placeholder values in each file with your Firebase project settings.

### Step 4: Install Frontend Dependencies

1.  Navigate to the `mobile-app/` directory.
2.  Install all required packages using Yarn:
    `bash
    yarn install
    `
3.  **Important:** If you encounter dependency errors after upgrading packages in the future, the canonical fix is:
    `bash
    npx expo install --fix
    `

---

## Key Workflows & Architectural Decisions

*   **Authentication Flow:** The app uses a fully autonomous `AuthProvider` that silently creates an anonymous user on first launch. The app's entry point (`app/index.tsx`) is a theme-aware, animated splash screen that provides a seamless visual transition into the main `(tabs)` layout.

*   **Native vs. JavaScript Changes:** It is critical to understand the difference between a change that can be deployed instantly (JS-only) and a change that requires a new app store submission (native).
    *   **A new build (`eas build`) is required if you:**
        *   Add or update a package that has native code (e.g., `expo-clipboard`).
        *   Change any configuration in `app.json` under the `android` or `ios` keys (e.g., `displayName`, `edgeToEdge`, `package`).
        *   Change any native asset files, such as the app icon images.
    *   **An OTA update (`eas update`) is sufficient if you:**
        *   Only change your own JavaScript/TypeScript code in the `app/` or `src/` directories.

*   **Native Project Regeneration:** If the native project files (`android` and `ios`) become out of sync with `app.json`, the definitive solution is to delete the problematic directory and regenerate it:
    `bash
    # From the mobile-app directory
    npx expo prebuild --platform android --clean
    `

*   **Data Pipeline (Representatives):** The "Find Your Rep" feature uses a three-stage API pipeline:
    1.  **Geocoding:** The user's address is sent to the **LocationIQ API** to get coordinates.
    2.  **Search:** The coordinates are sent to the **OpenStates API's** `/people.geo` endpoint to get a list of basic legislator objects.
    3.  **Enrichment:** The app then makes individual API calls for each state-level legislator to the `/people/{ocd-id}` endpoint to fetch their full, detailed profile, including contact information.

---

## Deployment Guide

#### Deploying the Native Mobile App (iOS & Android)

The native app is built and updated using EAS (Expo Application Services).

1.  **Initial Production Build:**
    *   To create a new app binary (`.aab` or `.ipa`) for the app stores, run the following from the `mobile-app` directory:
    `bash
    eas build --platform all --profile production
    `
    *   This binary must be submitted to the Google Play Console and Apple App Store Connect.

2.  **Over-the-Air (OTA) Updates:**
    *   After a production build is live in the stores, you can push JavaScript-only changes directly to users with an OTA update.
    `bash
    eas update --branch production --message "Your update message"
    `

3.  **Development Build:**
    *   If you add any new native dependencies, you must create and install a new development build on your test device:
    `bash
    eas build --platform android --profile development
    `

#### Deploying the Web App

The web app is deployed as a static site.

1.  **Build the Web App:**
    *   From the `mobile-app` directory, run the export command:
    `bash
    yarn expo export
    `
    *   This will generate a `dist` folder containing the complete, standalone web application.

2.  **Deploy the `dist` Folder:**
    *   Deploy the contents of the `dist` folder to any static web hosting provider.
    *   The recommended method is to use a service like **Netlify** or **Vercel**, which often feature a simple drag-and-drop interface for deployment.

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
    -   [] Integrate a localization library.
    -   [ ] Choose a specific AI API for high-quality text translations.