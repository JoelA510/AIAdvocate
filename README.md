# AI Advocate

AI Advocate is a privacy-first mobile application designed to make complex California legislative bills accessible and understandable for a general audience. With a special focus on the privacy and safety of vulnerable users, the app utilizes anonymous authentication to provide a secure, registration-free experience.

> **Project Status:** The application is feature-complete for its initial version (v1) and has undergone a full "polishing" phase. The application is stable, refined, and ready for future feature development.

## Core Features

-   ✅ **Browse & Search:** View a real-time list of legislative bills and use full-text search to find bills by title or description.
-   ✅ **AI-Powered Summaries:** Read simplified summaries of complex legal documents, broken down into simple, medium, and complex explanations (currently using mock data).
-   ✅ **User Interactions:** React to bills (👍, 👎, ❤️) and see aggregate counts update in real-time for all users.
-   ✅ **Private Bookmarks:** Save bills for later and view them in a dedicated "Saved" tab. Bookmarks are private to each user.
-   ✅ **Secure Anonymous Authentication:** All user actions are tied to a unique, anonymous identity created automatically on first app launch, verified by Firebase App Check. No sign-up or personal information is required.

## Tech Stack & Architecture

-   **Frontend:** React Native (Expo) with Expo Router for file-based navigation.
-   **UI Library:** React Native Paper for a modern, Material Design component system.
-   **Backend:** Supabase handles the entire backend, including:
    -   **Database:** Supabase Postgres for all data storage.
    -   **Authentication:** Supabase Auth for anonymous user sessions.
    -   **Serverless Functions:** Deno Edge Functions for data ingestion and security verification.
-   **Security:** Firebase App Check (with Play Integrity) to prevent abuse and ensure app authenticity.

## Getting Started

Follow these instructions to set up and run the project locally for development.

### 1. Prerequisites

-   Node.js (LTS version recommended)
-   Yarn Package Manager (`npm install -g yarn`)
-   A Supabase Account & Project
-   A Firebase Account & Project

### 2. Backend Setup

1.  **Supabase:**
    -   Set up a new project on [Supabase](https://supabase.com/).
    -   Run the entire contents of `supabase/schema.sql` in the SQL Editor.
    -   Set your `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_URL` secrets.
2.  **Firebase:**
    -   Create a new project on the [Firebase Console](https://console.firebase.google.com/).
    -   Register your Android app with the package name `com.JoelA510.AIAdvocateTest`.
    -   Download the `google-services.json` file and place it in the `mobile-app/` directory.
    -   Enable **App Check** with the **Play Integrity** provider.
    -   Enable the **Play Integrity API** in the Google Cloud Console for your Firebase project.
3.  **Secrets:**
    -   Generate a Firebase Admin SDK service account key and set its contents as a Supabase secret named `FIREBASE_SERVICE_ACCOUNT_KEY`.
    -   Set your Firebase Web Config object as a Supabase secret named `EXPO_PUBLIC_FIREBASE_WEB_CONFIG`.

### 3. Frontend Setup

1.  **Clone & Install:**
    ```bash
    git clone <your-repo-url>
    cd <repo-folder>/mobile-app
    yarn install
    ```
2.  **Build the Development Client:**
    *   Since this project uses custom native code (Firebase), you must use a development build.
    *   Run `npx expo prebuild --platform android` to generate the native code.
    *   Follow the debug fingerprint registration steps to sync your local debug signature with Firebase App Check.
    *   Run `eas build --profile development --platform android` to create the build.
    *   Install the resulting `.apk` on your emulator or physical device.
3.  **Run the App:**
    ```bash
    # Start the development server
    npm start
    
    # In a separate terminal, start your emulator
    /path/to/your/sdk/emulator/emulator -avd YOUR_AVD_NAME -gpu swiftshader_indirect
    
    # Open the "AI Advocate Test" app on the emulator
    ```

---

## Completed v1 Polish ✅

The application has been refined with the following improvements:

-   **Authentication & Security:**
    -   [x] Upgraded the project to Expo SDK 52.
    -   [x] Implemented a robust Firebase App Check flow to secure anonymous sign-ins in production.
    -   [x] Added conditional logic to bypass App Check during local development for a seamless workflow.
-   **Interaction Stability:**
    -   [x] Implemented full toggle logic for reactions and bookmarks.
    -   [x] The UI now correctly reflects the user's current interaction state.
-   **User Experience (UX) Overhaul:**
    -   [x] Replaced native alerts with non-intrusive toast notifications.
    -   [x] Replaced basic buttons and views with a modern component library (React Native Paper).
    -   [x] Implemented skeleton loading states for smoother perceived performance.
    -   [x] Designed and integrated custom empty-state components.
-   **Code Hygiene:**
    -   [x] Removed all unused boilerplate code from the Expo starter template.

## Future Roadmap

The following are potential next steps for the project.

### ✨ UI & UX Refinements

-   [ ] **Theming:** Create a unified dark/light mode theme to ensure all components, screens, and backgrounds are consistent.
-   [ ] **Deep Linking:** Allow users to open specific bill detail pages from external URLs.

### 🔐 Security & Hardening

-   [ ] **RLS Policy Review:** Perform a comprehensive review of all Row-Level Security policies.
-   [ ] **Input Validation:** Add stricter validation on Edge Function inputs.

### 🚀 New Features

-   [ ] **Push Notifications:** Notify users about status changes for their bookmarked bills.
-   [ ] **Accessibility (A11y) Pass:** Conduct an audit to improve screen reader support.
-   [...and more]