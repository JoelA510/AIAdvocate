```markdown
# AI Advocate

AI Advocate is a privacy-first mobile application designed to Educate, Empower, and Employ. It makes complex legislative bills accessible and provides tools for users to engage directly with their representatives, with a special focus on survivors of domestic violence, human trafficking, and sexual assault.

> **Project Status:** **V1 Complete & Stable.** The core feature set has been fully implemented. The application is production-ready and built on a robust, scalable, and efficient serverless architecture.

## Core Features

-   ✅ **On-Demand Multilingual Support:** The app automatically detects the user's device language and provides on-demand, AI-powered translations for all bill content. An intelligent caching layer ensures translations are only generated once per language, minimizing API costs and providing instant delivery for subsequent requests.

-   ✅ **AI-Powered Bill Discovery:** A "Related Bills" feature uses AI-generated vector embeddings and semantic search (`pgvector`) to help users discover other legislation that is contextually similar to the bill they are currently viewing.

-   ✅ **Comprehensive Bill Feed:** The main "Bills" tab displays a complete, searchable list of all legislation relevant to the app's mission, with a dedicated "Highlighted" feed for curated content.

-   ✅ **Multi-Level AI Summaries:** Bills can be viewed in four formats (Simple, Medium, Complex, and Original Text) using a sleek summary slider, ensuring the content is accessible to all reading levels.

-   ✅ **Text-to-Speech Accessibility:** A "Speak" button provides an audio read-out of the currently selected bill summary, enhancing accessibility for all users.

-   ✅ **Full Advocacy Workflow:**
    -   Find state legislators by address using a multi-stage API pipeline (LocationIQ & OpenStates).
    -   View legislator contact details and generate pre-filled email templates for a selected bill.

-   ✅ **Push Notifications for Saved Bills:** Users can subscribe to updates on specific bills simply by bookmarking them. The foundation is in place to notify users of important status changes or upcoming votes.

-   ✅ **User Reactions & Bookmarks:** Users can express their sentiment on bills with upvote/downvote reactions and save bills to a private list for later reference.

-   ✅ **Secure & Private by Design:** All user actions are tied to a unique, anonymous identity created automatically on first launch, with no personal information ever required.

## Technical Architecture

-   **Frontend:** React Native (Expo) with Expo Router for file-based navigation.
-   **UI Library:** React Native Paper for a modern, Material Design component system.
-   **Internationalization:** `i18next` with `expo-localization` for automatic language detection.
-   **Backend:** A fully serverless backend powered by Supabase:
    -   **Database:** Supabase Postgres with the `pgvector` extension for semantic search.
    -   **Authentication:** Supabase Auth for seamless anonymous user sessions.
    -   **Serverless Functions:** Deno Edge Functions manage the entire data pipeline.
-   **AI:** Google's Gemini API:
    -   `gemini-1.5-flash` for all summarization and on-demand translation tasks.
    -   `embedding-001` for generating vector embeddings for bill discovery.
-   **Testing & CI:** Jest with React Testing Library for component testing, and GitHub Actions for continuous integration.

---

## Key Architectural Decisions

*   **Efficient AI Pipeline:** The core data ingestion function (`sync-updated-bills`) has been highly optimized. It now uses a single API call to generate all three summary tiers and the vector embedding simultaneously, significantly reducing cost and processing time.

*   **On-Demand Caching:** To provide multilingual support affordably and at scale, the system uses an on-demand caching strategy. The `translate-bill` function first checks the `bill_translations` table. If a translation exists, it's served instantly. If not, the function generates it via the Gemini API and immediately saves the result, ensuring any future request for that specific translation is a cache hit.

*   **Atomic Transactions:** User actions that affect multiple database tables (e.g., bookmarking a bill and subscribing to its notifications) are handled by single, atomic RPC functions (`toggle_bookmark_and_subscription`) to ensure data consistency.

*   **Client-Side Resilience:** All critical API calls from the mobile app are wrapped in a `safeFetch` utility that provides automatic retries with exponential backoff, making the app more resilient to transient network errors or API rate limiting.

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
    *   Open the new `.env` file and fill in your secret keys for Supabase, LegiScan, and Gemini.

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

## Developer Workflows & Project Structure

*   **Authentication Flow:** The app uses a fully autonomous `AuthProvider` that silently creates an anonymous user on first launch. The app's entry point (`app/index.tsx`) is a theme-aware, animated splash screen that provides a seamless visual transition into the main `(tabs)` layout.

*   **Native vs. JavaScript Changes:** It is critical to understand the difference between a change that can be deployed instantly (JS-only) and a change that requires a new app store submission (native).
    *   **A new build (`eas build`) is required if you:**
        *   Add or update a package that has native code (e.g., `expo-clipboard`).
        *   Change any configuration in `app.json` under the `android` or `ios` keys (e.g., `displayName`, `edgeToEdge`, `package`).
        *   Change any native asset files, such as the app icon images.
    *   **An OTA update (`eas update`) is sufficient if you:**
        *   Only change your own JavaScript/TypeScript code in the `app/` or `src/` directories.

*   **Native Project Regeneration:** If the native project files (`android` and `ios`) become out of sync with `app.json`, the definitive solution is to delete the problematic directory and regenerate it:
    ```bash
    # From the mobile-app directory
    npx expo prebuild --platform android --clean
    ```

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

## V1 Complete: The Road Ahead

The application is now in a stable, feature-complete state. Future development can focus on iterative improvements, maintenance, and the implementation of new, high-value features. The foundation has been laid for:

-   `[ ]` **Expanded Test Coverage:** Write comprehensive unit and integration tests for all major components and user flows.
-   `[ ]` **Notification Dispatch:** Build the final Edge Function to read from the `subscriptions` table and dispatch push notifications via Expo's push API.
-   `[ ]` **Private Encrypted Notes:** Implement the ability for users to add private, client-side encrypted notes to their saved bills using the `encryption.ts` utility.
-   `[ ]` **Expanded Analytics:** Integrate additional `trackEvent` calls to gather anonymous data on feature usage, such as shares, saves, and advocacy actions.
-   `[ ]` **Additional Languages:** Add new `[lang].json` files and potentially fine-tune AI prompts to support a wider range of languages.
```markdown
---