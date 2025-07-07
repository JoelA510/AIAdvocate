# AI Advocate

AI Advocate is a privacy-first mobile application designed to make complex California legislative bills accessible and understandable for a general audience. With a special focus on the privacy and safety of vulnerable users, the app utilizes anonymous authentication to provide a secure, registration-free experience.

> **Project Status:** The application is feature-complete for its initial version (v1) and is currently in a "polishing" phase to improve stability, user experience, and code quality.

## Core Features

-   ✅ **Browse & Search:** View a real-time list of legislative bills and use full-text search to find bills by title or description.
-   ✅ **AI-Powered Summaries:** Read simplified summaries of complex legal documents, broken down into simple, medium, and complex explanations (currently using mock data).
-   ✅ **User Interactions:** React to bills (👍, 👎, ❤️) and see aggregate counts update in real-time for all users.
-   ✅ **Private Bookmarks:** Save bills for later and view them in a dedicated "Saved" tab. Bookmarks are private to each user.
-   ✅ **Anonymous Authentication:** All user actions are tied to a unique, anonymous identity created automatically on first app launch. No sign-up or personal information is required.

## Tech Stack & Architecture

-   **Frontend:** React Native (Expo) with Expo Router for file-based navigation.
-   **Backend:** Supabase handles the entire backend, including:
    -   **Database:** Supabase Postgres for all data storage.
    -   **Authentication:** Supabase Auth for anonymous user sessions.
    -   **Real-time:** Supabase Realtime for live updates on bill reactions.
    -   **Serverless Functions:** A Deno Edge Function for data ingestion.
-   **Styling:** A custom UI component library built with platform-adaptive components.
-   **Linting:** ESLint with Prettier for code quality and consistency.

## Getting Started

Follow these instructions to set up and run the project locally for development.

### 1. Prerequisites

-   Node.js (LTS version recommended)
-   A Supabase account (free tier is sufficient)

### 2. Backend Setup

1.  **Set up the Supabase Project:**
    -   Create a new project on [Supabase](https://supabase.com/).
    -   Navigate to the **SQL Editor** and run the entire contents of `supabase/schema.sql` to create the necessary tables, functions, and security policies.
2.  **Get Environment Variables:**
    -   In your Supabase project, go to **Project Settings > API**.
    -   Find your **Project URL** and your **Project API keys** (you will need the `anon` `public` key).
3.  **Configure Local Environment:**
    -   In the `mobile-app/` directory, create a new file named `.env`.
    -   Add your Supabase credentials to this file like so:
        ```
        EXPO_PUBLIC_SUPABASE_URL=YOUR_SUPABASE_URL
        EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
        ```
    -   The `.env` file is included in `.gitignore` and will not be committed to the repository.

### 3. Frontend Setup

1.  **Clone the Repository:**
    ```bash
    git clone <your-repo-url>
    cd <repo-folder>/mobile-app
    ```
2.  **Install Dependencies:**
    ```bash
    npm install
    ```
3.  **Run the App:**
    ```bash
    npm start
    ```
    This will start the Metro bundler and provide you with options to open the app in an iOS Simulator, Android Emulator, or on a physical device via the Expo Go app.

## Roadmap & Next Steps

The following improvements are planned for the "polishing" phase of the project.

### ✅ UI/UX Refinement (Completed)

-   [x] **Toast Notifications:** Replaced all native `Alert` popups with non-intrusive toast notifications for a smoother user experience.
-   [x] **Loading Skeletons:** Replaced "Loading..." text with skeleton loaders for a better perceived performance.
-   [x] **Improved Empty States:** Implemented custom, engaging empty state screens for pages with no data (e.g., no saved bills, no search results).

### 🧹 Code Cleanup & Hygiene

-   [ ] **Remove Boilerplate:** Identify and safely remove unused boilerplate components that came with the Expo starter template (e.g., `HelloWave`, `ParallaxScrollView`, `Collapsible`) to simplify the codebase.

### 🔐 Security & Hardening

-   [ ] **RLS Policy Review:** Perform a comprehensive review of all Row-Level Security policies to ensure data is exposed correctly and securely.
-   [ ] **Input Validation:** Add stricter validation on Edge Function inputs and any data submitted by the client.

### ✨ Future Feature Ideas

-   [ ] **Push Notifications:** Notify users about status changes for their bookmarked bills.
-   [ ] **Accessibility (A11y) Pass:** Conduct an audit and implement improvements for screen readers (VoiceOver/TalkBack) and other accessibility features to better serve all users.
-   [...and more]