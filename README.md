# AI Advocate

AI Advocate is a privacy-first mobile application designed to make complex California legislative bills accessible and understandable for a general audience. With a special focus on the privacy and safety of vulnerable users, the app utilizes anonymous authentication to provide a secure, registration-free experience.

> **Project Status:** The core infrastructure is complete, including a real-time data pipeline from the LegiScan API. The project is now moving into a feature development phase focused on building a powerful advocacy tool for Love Never Fails.

## Core Features

-   ✅ **Browse & Search:** View a real-time list of legislative bills and use full-text search to find bills by title or description.
-   ✅ **Automated Data Pipeline:** A two-stage serverless backend automatically performs a bulk import of bills and keeps them updated daily.
-   ✅ **AI-Powered Summaries:** Reads the full text of bills and uses the Gemini API to generate summaries for Simple, Medium, and Complex reading levels.
-   ✅ **User Interactions:** React to bills (👍, 👎, ❤️) and see aggregate counts update in real-time for all users.
-   ✅ **Private Bookmarks:** Save bills for later and view them in a dedicated "Saved" tab.
-   ✅ **Secure Anonymous Authentication:** All user actions are tied to a unique, anonymous identity created automatically on first app launch, verified by Firebase App Check.

## Tech Stack & Architecture

-   **Frontend:** React Native (Expo) with Expo Router for file-based navigation.
-   **UI Library:** React Native Paper for a modern, Material Design component system.
-   **Backend:** Supabase handles the entire backend, including:
    -   **Database:** Supabase Postgres for all data storage.
    -   **Authentication:** Supabase Auth for anonymous user sessions.
    -   **Serverless Functions:** Deno Edge Functions for data ingestion and daily synchronization.
-   **Security:** Firebase App Check (with Play Integrity) to prevent abuse and ensure app authenticity.
-   **AI:** Google's Gemini API for summarization.

---

## Future Roadmap: The Advocacy Platform

With the core infrastructure complete, the future of the app is focused on building a powerful, mission-driven tool for advocacy.

### Phase 1: The Curated Experience (Immediate Priority)

The goal of this phase is to transform the app from a general bill browser into a focused tool for the Love Never Fails mission.

-   [x] **Backend "Highlight" Feature:** Add an `is_lnf_highlighted` boolean column to the `bills` table, allowing LNF staff to easily feature specific bills directly from the Supabase dashboard.
-   [x] **Redesigned Home Tab:** The main tab of the app will be reworked to exclusively show the list of LNF-highlighted bills.
-   [x] **New "All Bills" Tab:** A new tab will be added that provides the current functionality of a searchable, complete list of all imported legislation.

### Phase 2: Legislator Directory & Action Center

This phase is designed to empower users to take direct action and engage with their representatives.

-   [x] **New Data Models:** Create new `legislators` and `votes` tables in the database to store representative information and their voting history on key bills.
-   [x] **Legislator Data Pipeline:** Build a new Edge Function to fetch and sync legislator and voting data from the LegiScan API.
-   [x] **"Find Your Rep" Feature:** Integrate a service (like the Google Civic Information API) to allow users to find their specific representatives by address.
-   [x] **Legislator Profiles:** Design and build screens to display legislator information, their voting record on LNF-relevant bills, and a special designation for "LNF Allies" (controlled by staff via a boolean switch in the database).
-   [x] **"Take Action" Button:** Implement a feature that opens a user's email client with a pre-filled, customizable template to encourage them to contact their representatives about specific legislation.

### Phase 3: Long-Term Engagement & Polish

These features will be built upon the completed advocacy platform.

-   [x] **Context-Aware Push Notifications:** Notify users about critical events, such as when a highlighted bill has an upcoming vote or when their representative votes on an LNF-relevant bill.
-   [x] **Deep Linking:** Allow sharing of URLs that open directly to specific bills or legislator profiles within the app.
-   [x] **Full Accessibility Audit:** Performed a comprehensive review of the entire application to ensure it is fully accessible to users with disabilities.
-   [x] **Security Hardening:** Conducted a full review of all Row-Level Security policies and Edge Function inputs.