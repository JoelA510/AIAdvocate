
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
-   **AI:** Google's Gemini API for all summarization tasks and potentially for multilingual support.

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
```bash
git clone <your-repository-url>
cd AIAdvocate
```

### Step 2: Set Up the Supabase Backend

1.  **Log in to Supabase:**
    ```bash
    supabase login
    ```
2.  **Link the Project:** Link your local repository to your remote Supabase project. You will need your Project REF, which can be found in your Supabase project's URL (e.g., `https://supabase.com/dashboard/project/<project_ref>`).
    ```bash
    supabase link --project-ref <your-project_ref>
    ```
3.  **Push the Database Schema:** This command will execute the `schema.sql` file and create all necessary tables and functions in your remote database.
    ```bash
    supabase db push
    ```

### Step 3: Configure Environment Variables

This project uses two separate `.env` files for security and clarity.

1.  **Backend Secrets (`supabase/.env`):**
    *   Navigate to the `supabase/` directory.
    *   Create a copy of the example file: `cp .env.example .env`
    *   Open the new `.env` file and fill in the following secret keys:
        *   `SUPABASE_SERVICE_ROLE_KEY`: Found in your Supabase project's API settings.
        *   `LEGISCAN_API_KEY`: Your key from the LegiScan API.
        *   `GEMINI_API_KEY`: Your key from Google AI Studio.

2.  **Frontend Public Keys (`mobile-app/.env`):**
    *   Navigate to the `mobile-app/` directory.
    *   Create a `.env` file and add the following public keys:
    ```
    EXPO_PUBLIC_SUPABASE_URL=https://<your-project_ref>.supabase.co
    EXPO_PUBLIC_SUPABASE_ANON_KEY=<your_supabase_anon_key>
    EXPO_PUBLIC_OPENSTATES_API_KEY=<your_openstates_api_key>
    EXPO_PUBLIC_LOCATIONIQ_API_KEY=<your_locationiq_api_key>
    ```

### Step 4: Install Frontend Dependencies

1.  Navigate to the `mobile-app/` directory.
2.  Install all required packages using Yarn:
    ```bash
    yarn install
    ```
3.  **Important:** If you encounter dependency errors after upgrading packages in the future, the canonical fix is:
    ```bash
    npx expo install --fix
    ```

---

## Running the Application

1.  **Start the Supabase Backend:** For local development and function testing, start the Supabase services from the project root:
    ```bash
    supabase start
    ```
2.  **Start the Frontend App:** Navigate to the `mobile-app/` directory and run the start command:
    ```bash
    yarn start
    ```
    This will start the Metro bundler. You can then open the app on a web browser (`w`), an Android device/emulator (`a`), or an iOS device/simulator (`i`). Note that for mobile, you must have a compatible development build installed.

---

## Understanding the Data Pipeline

The application's data is populated through a multi-stage, serverless pipeline.

*   **Bill Data Pipeline:**
    1.  **Seeding (`bulk-import-dataset`):** A Supabase function that is run **manually one time** to seed the database with basic bill metadata from a LegiScan dataset.
    2.  **Enrichment (`sync-updated-bills`):** A Supabase function that runs on a daily cron job. It finds one unprocessed bill, fetches its full text, generates AI summaries with Gemini, and saves the results.
    3.  **Initial Backlog Processing:** After the initial seeding, the entire backlog of bills is enriched by running the local Python script from the project root: `python3 process_full_backlog.py`. This script is quota-aware and will pause and resume automatically.

*   **Representative Data Pipeline:**
    1.  **Geocoding:** The user's address is sent to the **LocationIQ API** to be converted into latitude and longitude.
    2.  **Lookup:** The coordinates are then sent to the **OpenStates API's** `/people.geo` endpoint to find a list of all relevant legislators and their contact details.

---

## Deployment Guide

#### Deploying the Native Mobile App (iOS & Android)

The native app is built and updated using EAS (Expo Application Services).

1.  **Initial Production Build:**
    *   To create a new app binary (`.aab` or `.ipa`) for the app stores, run the following from the `mobile-app` directory:
    ```bash
    eas build --platform all --profile production
    ```
    *   This binary must be submitted to the Google Play Console and Apple App Store Connect.

2.  **Over-the-Air (OTA) Updates:**
    *   After a production build is live in the stores, you can push JavaScript-only changes directly to users with an OTA update.
    ```bash
    eas update --branch production --message "Your update message"
    ```

3.  **Development Build:**
    *   If you add any new native dependencies, you must create and install a new development build on your test device:
    ```bash
    eas build --platform android --profile development
    ```

#### Deploying the Web App

The web app is deployed as a static site.

1.  **Build the Web App:**
    *   From the `mobile-app` directory, run the export command:
    ```bash
    yarn expo export
    ```
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
    -   [] Use the Gemini API for high-quality text translations.