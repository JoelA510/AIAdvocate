- [X] **Milestone 1: Backend Foundation & Core Data Model**
    - [X] **PR #1: `Supabase: initialize project and define core schema`**
        - [X] `Commit: Create supabase project (See Schema Below)'
        - [X] 'Commit 'bills''
        - [X] 'Commit 'profiles''
        - [X] 'Commit 'reactions''
        - [X] 'Commit 'bookmarks''
        - [X] `Commit: enable row-level security and define initial access policies`
#
    - [X] **PR #2: `(functions): Create data intake and summarization features`**
        - [X] `Commit: scaffold ingest-and-summarize edge function`
            - Initialize the Supabase CLI and create the `ingest-and-summarize` function boilerplate.
        - [X] `Commit: build: implement legiscan and openai api clients`
            - Add logic to fetch bill data from the LegiScan API.
            - Add logic to call the OpenAI API for summarization.
            - Saved in a backup file for now, moved to mock data approach.
        - [X] `Commit: implement data persistence logic to upsert bills`
            - Add the final step to use the Supabase admin client to write data into the `bills` table.
            - Identify required secrets (`OPENAI_API_KEY`, etc.).
- [ ] **Milestone 2: Mobile App Core & First End-to-End Feature**
    - [ ] **PR #3: `(mobile version): scaffold expo app and configure supabase client`**
        - [ ] `Commit: feat: createe expo project with expo-router`
            - Run `create-expo-app` to create the project structure.
            - Set up basic tab-based navigation.
                - [ ] Commit: Create a _layout.js file
                - import Tabs from expo-router
        - [ ] `Commit: feat: install and configure supabase-js client`
            - Install `@supabase/supabase-js` and dependencies.
            - Create `src/lib/supabase.ts` for the client instance.
            - Set up the `.env` file for Supabase credentials.
                - Get from Settings menu of Supabase in API submenu.
                    - ADD ENV TO GITIGNORE!
    - [ ] **PR #4: `(mobile version): display list of bills from supabase`**
        - [ ] `Commit: feat: create bill list screen`
            - Reuse suitable UI elements and find improvements for the home screen to display a list of bills.
        - [ ] `Commit: feat: implement data fetching for bills on home screen`
            - Replace Hello World placeholder with a `useEffect` hook to call `supabase.from('bills').select()`.
            - Add basic loading and error messages and handling.
        - [ ] `Commit: refactor: create reusable Bill component`
            - Extract the bill display logic into `src/components/Bill.tsx`.
            - This will be the template that bills are rendered with rather than individually rendering each one.
    - [ ] **PR #5: `feat(mobile): create bill details screen`**
        - [ ] `Commit: feat: add details screen and define the navigation logic`
            - Create `app/(tabs)/details.tsx` and configure the router to navigate to it with a `billId`.
        - [ ] `Commit: feat: fetch and display single bill data`
            - On the details screen, use the `billId` from route params to fetch a single record from the `bills` table.
            - Display the title, description, and all three summary levels.
- [ ] **Milestone 3: User Interaction & Authentication**
- [ ] **PR #6: `feat(auth): implement anonymous user authentication`**
    - [ ] **Commit: `feat: implement anonymous sign-in on app launch`**
            - Create a global "Auth Provider" for the app.
            - In this provider, write a `useEffect` hook that checks if a user session already exists on the device.
            - If **no session exists** (i.e., it's a new user or they re-installed the app), automatically call `supabase.auth.signInAnonymously()`.
            - This ensures every user has a valid, anonymous identity the moment they open the app.
    - [ ] **Commit: `refactor: provide user session throughout the app`**
            - The Auth Provider's job is to make the user's session data (especially `user.id`) available to any component that needs it.
            - This allows the "Reactions" and "Bookmarks" components to easily get the current user's ID when they need to save an action to the database.
            - **Delete any and all login/signup UI files.** They are no longer needed.
    - [ ] **Commit: `docs: update auth flow in documentation`**
            - Briefly update the project's `README.md` to explain that the app uses anonymous authentication and does not require user registration.
    - [ ] **PR #7: `feat(mobile): implement user reactions`**
        - [ ] `Commit: feat: add engagement toolbar UI to bill component`
            - Build the UI for the upvote, downvote, and reaction buttons.
        - [ ] `Commit: feat: implement reaction persistence to supabase`
            - On user interaction, get the `user_id` from `supabase.auth` and `upsert` the action into the `reactions` table.
        - [ ] `Commit: feat: display aggregate reaction counts`
            - Create a Postgres function `get_reaction_counts(bill_id)` in Supabase.
            - Call the function using `.rpc()` in the app to get vote counts.
    - [ ] **PR #8: `feat(mobile): enable realtime updates for reactions`**
        - [ ] `Commit: feat: subscribe to reaction changes using supabase realtime`
            - Refactor the `Bill` component to subscribe to the `reactions` table for that specific `bill_id`.
        - [ ] `Commit: refactor: update UI in realtime on new reactions`
            - When a new event is received, re-fetch the reaction counts to update the UI instantly.
- [ ] **Milestone 4: Polish and Final Features**
    - [ ] **PR #9: `feat(mobile): implement saved bills and search functionality`**
        - [ ] `Commit: feat: implement "save for later" functionality`
            - Add a `saved_bills` table or extend `reactions`.
            - Create a "Saved" tab that filters bills based on the user's saved list.
        - [ ] `Commit: feat: implement full-text search for bills`
            - Use Supabase's built-in full-text search (`.textSearch()`) on the `bills` table.
            - Wire this functionality to the search bar component.


## Schema


### **`bills`**

| Column Name | Data Type | Description / Constraints |
| :--- | :--- | :--- |
| **`id`** | `BIGINT` | **Primary Key.** The LegiScan bill ID. |
| `bill_number` | `TEXT` | Not Null. The official bill number (e.g., "SB376"). |
| `title` | `TEXT` | Not Null. The official title of the bill. |
| `description` | `TEXT` | The short description of the bill's purpose. |
| `status` | `TEXT` | The current legislative status (e.g., "Introduced", "Passed"). |
| `state_link` | `TEXT` | A URL to the official government page for the bill. |
| `summary_simple` | `TEXT` | AI-generated summary for a simple reading level. |
| `summary_medium`| `TEXT` | AI-generated summary for a medium reading level. |
| `summary_complex`| `TEXT` | AI-generated summary for a complex reading level. |
| `panel_review` | `JSONB` | A single object for all panel feedback, e.g., `{"pros": [], "cons": [], "thoughts": []}`. |
| `is_verified` | `BOOLEAN` | Default: `false`. A flag indicating if the `panel_review` is complete. |
| `created_at` | `TIMESTAMPTZ` | The timestamp when the bill was first added to the database. |

---

### **`profiles`**

| Column Name | Data Type | Description / Constraints |
| :--- | :--- | :--- |
| **`id`** | `UUID` | **Primary Key.** Foreign Key to `auth.users.id`. |
| `username` | `TEXT` | Unique. A public-facing username. |
| `updated_at` | `TIMESTAMPTZ` | The timestamp when the profile was last updated. |

---

### **`reactions`**

| Column Name | Data Type | Description / Constraints |
| :--- | :--- | :--- |
| **`bill_id`** | `BIGINT` | **Composite Primary Key.** Foreign Key to `bills.id`. |
| **`user_id`** | `UUID` | **Composite Primary Key.** Foreign Key to `profiles.id`. |
| `reaction_type` | `TEXT` | Not Null. Stores values like `'upvote'`, `'downvote'`, `'love'`, `'sad'`. |
| `created_at` | `TIMESTAMPTZ`| The timestamp when the reaction was created or last updated. |

---

### **`bookmarks`**

| Column Name | Data Type | Description / Constraints |
| :--- | :--- | :--- |
| **`bill_id`** | `BIGINT` | **Composite Primary Key.** Foreign Key to `bills.id`. |
| **`user_id`** | `UUID` | **Composite Primary Key.** Foreign Key to `profiles.id`. |
| `created_at` | `TIMESTAMPTZ`| The timestamp when the bookmark was created. |

---