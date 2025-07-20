# AI Advocate

AI Advocate is a privacy-first mobile application designed to make complex California legislative bills accessible and understandable for a general audience. With a special focus on the privacy and safety of vulnerable users, the app utilizes anonymous authentication to provide a secure, registration-free experience.

> **Project Status:** Version 1.0 is feature-complete, stable, and fully operational.

## Core Features

-   ✅ **Curated Bill Feed:** The home screen provides a focused feed of bills highlighted by Love Never Fails staff, ensuring users see the most relevant legislation first.
-   ✅ **Comprehensive Bill Search:** A dedicated "All Bills" tab allows for full-text search of all imported legislation by title, number, or keyword.
-   ✅ **AI-Powered Summaries:** Reads the full text of bills and uses the Gemini API to generate summaries for Simple, Medium, and Complex reading levels, plus the full original text.
-   ✅ **Legislator Directory:** A complete directory of legislators, allowing users to find their representatives and view contact information.
-   ✅ **User Interactions:** React to bills (👍, 👎, ❤️) and see aggregate counts update in real-time.
-   ✅ **Private Bookmarks:** Save bills for later review in a dedicated "Saved" tab.
-   ✅ **Secure Anonymous Authentication:** All user actions are tied to a unique, anonymous identity created automatically on first app launch, with no sign-up required.

## Technical Architecture

-   **Frontend:** React Native (Expo) with Expo Router for file-based navigation.
-   **UI Library:** React Native Paper for a modern, Material Design component system.
-   **Backend:** A fully serverless backend powered by Supabase:
    -   **Database:** Supabase Postgres for all data storage.
    -   **Authentication:** Supabase Auth for anonymous user sessions.
    -   **Serverless Functions:** Deno Edge Functions manage a robust, two-stage data pipeline for automated daily data ingestion and AI enrichment.
-   **AI:** Google's Gemini API for all summarization tasks.

---

## Potential Future Enhancements

With a stable foundation in place, AI Advocate is well-positioned for future growth. Potential next steps could include:

-   **"Take Action" Feature:** An enhancement for the legislator directory that would allow users to email their representatives with pre-filled templates, turning insight into advocacy.
-   **Context-Aware Push Notifications:** A system to notify users about critical events, such as when a highlighted bill has an upcoming vote or when their representative votes on an LNF-relevant bill.
-   **Voting Records:** Augmenting legislator profiles with their complete voting history on all LNF-relevant bills.
-   **Deep Linking:** Allowing the sharing of URLs that open directly to specific bills or legislator profiles within the app to increase engagement.
-   **Full Accessibility Audit:** A comprehensive review of the entire application to ensure it is fully accessible to users with disabilities, further aligning with the project's inclusive mission.

---

## Developer Notes & Best Practices

This project has several key dependencies and configurations. The following are best practices and important lessons learned during the initial development phase.

*   **Package Management:** The project is configured to use **Yarn** as its package manager. Due to potential caching and dependency resolution issues, `npm` should be avoided. The command `npx expo install --fix` is the correct tool for validating and fixing dependency versions.

*   **Environment Variables (Secrets):** The project uses Expo's modern `EXPO_PUBLIC_` prefix convention for managing environment variables. All secrets are stored in a `.env` file in the `mobile-app/` directory and are loaded automatically by the Expo build process. The `react-native-dotenv` plugin is **not** used.

*   **Emulator Environment:** The Android Emulator on the local development machine has shown instability with default GPU acceleration. The most reliable method for launching it is manually from the command line with software rendering enabled: `/path/to/emulator -avd <AVD_NAME> -gpu swiftshader_indirect`.

*   **Authentication Flow:** The core authentication logic is handled by a custom `AuthProvider`. The `app/_layout.tsx` file wraps the application in this provider, and the `RootLayoutNav.tsx` component handles the routing logic, redirecting users based on their session status. This is the central hub for managing the user's entry into the app.

*   **Native Project Regeneration:** If you encounter inexplicable build failures, especially after upgrading packages or changing native configurations in `app.json`, the native project files may be out of sync. The definitive solution is to regenerate them by running the following command from the `mobile-app` directory:
    ```bash
    npx expo prebuild --platform android --clean
    ```

*   **EAS Project Linking:** The application is linked to an Expo Application Services (EAS) project with the slug `ai-advocate`. The `slug` and `name` fields in `app.json` must match this to ensure successful builds.