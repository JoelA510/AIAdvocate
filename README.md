# AI Advocate

AI Advocate is Love Never Fails' mobile and web companion for survivors, allies, and advocates who want a clear picture of the policy landscape. The app curates survivor-focused legislation, rewrites complex bill text in plain language, and pairs it with one-tap outreach tools so users can take action with confidence.

> **Status**: Production-ready. Android/iOS store builds and the responsive web client share a single Expo codebase. Supabase edge functions keep legislation, summaries, legislators, and translations in sync automatically.

---

## Feature Tour

| Feature | What users see | How it works |
| --- | --- | --- |
| **Active Bills feed** | A prioritized list of open California bills with search, bill-number regex matching, session filter toggle, and curated pins | Supabase `bills` view + Postgres websearch; sorts by curation → rank → recency; session labels are parsed from `state_link` and cached client-side |
| **AI bilingual summaries** | Simple / Medium / Complex write-ups in English and Spanish on every bill card and detail page | `sync-updated-bills` edge function cleans LegiScan text, prompts OpenAI gpt-4o-mini for both languages in one call, stores results + embeddings, and upserts them atomically |
| **Bookmarks & reactions** | “Saved” tab with sentiment buttons that stay in sync across devices | `bookmarks` and `reactions` tables with RPC helpers; client subscribes to realtime channels for instant UI updates |
| **Advocacy hub** | “Find Your Representatives” workflow with optional bill context and ready-to-send email content | Edge function caches ZIP/city lookups in `location_lookup_cache`; OpenStates API is reconciled against the Supabase `legislators` table for app-specific metadata |
| **Voting history & outreach** | Legislator vote timelines with filters plus copy-ready outreach template | `v_rep_vote_history` view + `votes-backfill`/`votes-daily` edge functions normalize OpenStates vote events into `vote_events`/`vote_records` for the UI |
| **Love Never Fails home tab** | Embedded brand storytelling, giving/volunteer CTAs, and external site deep links | WebView on native, card-based CTA on web to respect CSP restrictions |
| **Global theming & fonts** | Brand-consistent palette and typography (SF Pro on iOS, Roboto on Android, Helvetica on web) | Centralized MD3 Paper theme (`constants/paper-theme.ts`) driven by the Love Never Fails color palette; typography resolves per platform |
| **Language & accessibility** | On-demand locale switching, text-to-speech prompts, and responsive layout | i18next + React Native Paper tokens; translations cached in `bill_translations`; TTS uses Expo Speech on supported platforms |
| **Smart notifications** | (Planned) digest and follow-up alerts for saved bills | Bookmarks table and Supabase cron jobs already emit structured events; Expo push tokens stored in `user_push_tokens` |

---

## Architecture Overview

```
Expo Router (iOS/Android/Web)
    │  React Query • React Native Paper • i18next
    ▼
Supabase REST / RPC (PostgREST + Row Level Security)
    │
    ├─ Edge Functions (Deno):
    │     • bulk-import-dataset  • sync-updated-bills
    │     • votes-backfill • votes-daily
    │     • sync-legislators-and-votes (legacy) • translate-bill(s)
    │     • find-your-rep • invoke_full_legislative_refresh helpers
    │
    └─ PostgreSQL + Extensions:
          • pgvector • pg_cron • realtime • vault
```

* **Client** – Expo Router controls navigation, bottom tabs, and screen layouts. React Query handles caching; Paper MD3 theming consumes Love Never Fails brand colors. Language and accessibility hooks mirror the current locale across tabs.
* **API surface** – Public access is limited to read-only tables via RLS. Mutations flow through RPC helpers (`toggle_bookmark_and_subscription`, `handle_reaction`, etc.). Auth uses anonymous Supabase sessions; no personally identifiable info is stored.
* **Automation** – Nightly cron kicks `invoke_full_legislative_refresh`, which pulls new LegiScan datasets, refreshes summaries, updates legislators/votes, and regenerates embeddings. Location lookups are cached with TTL + cleanup job to stay inside API quotas.

---

## Data Pipelines in Detail

1. **Bill ingestion** (`bulk-import-dataset`)  
   *Downloads the active CA dataset ZIP, filters for survivor-centric keywords, preserves existing summaries, and stages new rows with placeholder flags.*

2. **Summaries & embeddings** (`sync-updated-bills`)  
   *Processes pending bills in batches, sanitizes text, prompts OpenAI gpt-4o-mini for English + Spanish tiered summaries, stores both languages, and generates text-embedding-3-small vectors for similarity search.*

3. **Translations on demand** (`translate-bill` / `translate-bills`)  
   *Edge functions expose RPCs the app calls when a new locale is requested; cached results come from `bill_translations` before hitting OpenAI again.*

4. **Legislator roster & vote history** (`votes-backfill`, `votes-daily`)  
   *Backfills OpenStates vote events for every tracked bill, upserts normalized data into `legislators`, `vote_events`, and `vote_records`, and uses the `job_state` checkpoint table so the nightly incremental sync (02:15 America/Los_Angeles) resumes safely. The legacy `sync-legislators-and-votes` function remains for one-off LegiScan imports.* Deploy with `supabase functions deploy votes-backfill` / `votes-daily`, then schedule the cron job via `supabase functions schedule create votes-daily "15 2 * * *" --timezone "America/Los_Angeles"`.

5. **Location caching** (`find-your-rep`)  
   *Accepts ZIP/city input, uses LocationIQ + OpenStates, upserts results into `location_lookup_cache`, and increments hit counts. Short queries return cached coordinates instantly.*

6. **Cron health** (`cleanup-location-cache`, `cleanup-old-cron-job-errors`)  
   *Keeps cache tables lean and logs only actionable failures. Each job writes to `cron_job_errors` for observability.*

---

## Tech Stack Notes

- **Navigation & layout**: File-system routing under `mobile-app/app/` with nested tab + stack navigators. `_layout.tsx` wraps providers, splash handling, and status bar configuration.
- **Brand theming**: `constants/Colors.ts` defines the palette; `constants/paper-theme.ts` produces Light/Dark variants with MD3 elevation tokens. `ThemedText` and `ThemedView` ensure typography and surfaces stay in sync with the active theme.
- **State & data**: React Query + Supabase client for network state; minimal Redux usage. `safeFetch` wrapper gives deterministic retries for critical fetches.
- **Internationalization**: English and Spanish translations live in `src/locales/`. i18next scanner config extracts new keys. Spanish summaries prefer pre-generated translations, then fall back to English.
- **Testing & QA**: Jest unit tests for bill utilities, linting via ESLint/Prettier, and TypeScript `--noEmit` for strong typing. Expo E2E smoke tests run manually pre-release.
- **Build & deploy**: EAS profiles (`eas.json`) define production, preview, and simulator builds. OTA updates available via `eas update`; native store submissions use the `production` profile (`npm run eas-build-ios/android`).

---

## Local Development

1. **Prerequisites**
   - Node.js 20+, Yarn 1.22+, Watchman (macOS), Supabase CLI (latest), Git, and optionally ngrok for webhooks.
   - Install the Expo CLI globally (`npm install -g expo-cli`) or rely on `npx` commands.

2. **Clone & install**
   ```bash
   git clone https://github.com/JoelA510/AIAdvocate.git
   cd AIAdvocate
   cd mobile-app
   yarn install
   ```

3. **Environment variables**
   - `mobile-app/.env`: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_OPENSTATES_API_KEY`, `EXPO_PUBLIC_LOCATIONIQ_API_KEY`, optional `EXPO_PUBLIC_LNF_URL`.
  - `supabase/.env`: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `LEGISCAN_API_KEY`, `OPENSTATES_API_KEY`, `OpenAI_GPT_Key`, and any auxiliary secrets.

4. **Database & functions**
   ```bash
   cd ../supabase
  supabase start           # launches local Postgres + studio
  supabase db push         # applies migrations & policies
  supabase functions serve sync-updated-bills
  supabase functions serve votes-backfill
  supabase functions serve votes-daily
  supabase functions serve find-your-rep
   ```

5. **Run the client**
   ```bash
   cd ../mobile-app
   yarn expo start
   ```
   Choose web, iOS simulator, or Android emulator from the Expo dev tools.

6. **Execute pipelines locally (optional)**
   ```bash
   # Pull & summarize new bills
   supabase functions serve bulk-import-dataset
   supabase functions serve sync-updated-bills

   # Refresh legislator roster and vote history
   supabase functions serve votes-backfill
   supabase functions serve votes-daily
   ```

---

## Release Checklist

1. Bump version metadata in `app.json` (`version`, `buildNumber`, `android.versionCode`).
2. Audit `CHANGELOG` and update the Love Never Fails release log.
3. Run the full QA suite:
   ```bash
   yarn lint
   yarn test
   yarn tsc --noEmit
   ```
4. Ensure Supabase migrations are up to date (`supabase db push`).
5. Trigger EAS builds:
   ```bash
   eas build --platform android --profile production
   eas build --platform ios --profile production
   ```
6. Upload artifacts to the Play Console/App Store Connect and submit for review.

---

## Repository Guide

```
AIAdvocate/
├── mobile-app/               # Expo project
│   ├── app/                  # Router-based screens and layouts
│   ├── components/           # Shared UI primitives (ThemedText, Bill, HeaderBanner, etc.)
│   ├── constants/            # Brand colors and MD3 theme definitions
│   ├── hooks/                # Platform-aware utilities (color scheme, dimensions)
│   ├── src/lib/              # Supabase client, translations, analytics, find-your-rep helpers
│   ├── src/providers/        # Auth, i18n, and language context providers
│   ├── types/                # Type augmentation (MD3 color tokens)
│   └── assets/               # Images and fonts (platform-native fonts referenced by name)
└── supabase/
    ├── migrations/           # SQL schema, policies, Edge function helpers
    ├── functions/            # Deno edge functions (bill ingestion, summaries, location cache)
    ├── config.*              # Supabase project configuration
    └── scripts/              # Developer helper scripts (legislator sync, cron tooling)
```

---

## Security & Privacy Considerations

- No survivor-identifying data is stored. Anonymous auth tokens are tied to Supabase session IDs only.
- API keys are fetched from Edge Vault or environment variables; never hardcode secrets in the client.
- Edge functions redact external API responses before logging; only aggregate diagnostics reach `cron_job_errors`.
- RLS denies write access to public tables for `anon`/`authenticated`; mutations go through vetted RPCs.

---

## Support

Questions, bug reports, or feature ideas? Reach out to Love Never Fails or open an issue in this repository. Together we can keep survivors informed, empowered, and safe.
