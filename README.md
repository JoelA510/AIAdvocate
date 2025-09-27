# AI Advocate

AI Advocate is a privacy-first advocacy companion built with Expo and Supabase. The app translates complex legislation into accessible language, lets survivors and allies discover relevant bills, and provides one-tap tools to contact representatives with informed talking points.

> **Status:** V1 is feature-complete and production ready. The codebase is stable, the ingestion pipeline is automated, and the frontend is polished for iOS, Android, and web builds.

---

## What the Product Delivers

- **Legislation Explorer:** Search, filter, and browse a curated catalog of survivor-focused bills. Each bill has AI-generated summaries at multiple reading levels, the original text, and panel reviews authored by subject-matter experts.
- **Accessibility First:** The client auto-detects language, provides on-demand translations via Gemini, and offers text-to-speech playback to remove reading barriers.
- **Advocacy Workflow:** Users can find their representatives, review vote histories, and compose templated outreach emails tied to a specific bill.
- **Personalized Experience:** Anonymous Supabase Auth sessions let people bookmark bills, react with sentiment, and subscribe to push notifications without sharing personal data.
- **Intelligent Recommendations:** `pgvector` powered similarity search surfaces related legislation to keep users informed about adjacent policy changes.

---

## System Architecture

| Layer | Technologies | Responsibilities |
| --- | --- | --- |
| Client | Expo Router, React Native Paper, React Query, i18next | Navigation, theming, data fetching, translations, accessibility, local caching |
| API Gateway | Supabase REST over PostgREST | Auth, database access, RPC invocation |
| Data & AI | PostgreSQL + `pgvector`, Supabase Edge Functions, Gemini APIs | Bill ingestion, summarization, translation, embedding search, vote syncing |
| Notifications | Expo push service, Edge cron jobs | Bookmark alerts, future custom digests |
| Telemetry | Supabase events table, custom analytics hooks | Anonymous event tracking and feature adoption insights |

---

## Getting Started

1. **Install prerequisites**
   - Node.js 20 (prefer NVM), Yarn, Supabase CLI, Git.
2. **Clone and bootstrap**
   ```bash
   git clone <repo>
   cd AIAdvocate
   cd mobile-app
   yarn install
   ```
3. **Configure environments**
   - Copy `supabase/env.example` → `supabase/.env` and insert Supabase, LegiScan, Gemini secrets.
   - Create `mobile-app/.env` with the public Supabase URL/key plus OpenStates and LocationIQ keys.
4. **Run locally**
   ```bash
   cd mobile-app
   yarn expo start
   ```
5. **Sync data (first run)**
   ```bash
   cd ../supabase
   supabase start       # launches local stack
   supabase db push     # applies schema and policies
   supabase functions serve sync-legislators-and-votes
   ```

---

## Developer Workflow Notes

- **Expo Router & Navigation:** Most screens live under `mobile-app/app/`. File system routing means renaming files will change URLs automatically.
- **Authentication:** Anonymous sessions are provisioned on app launch inside `src/providers/AuthProvider.tsx` and persisted through Supabase’s client SDK.
- **Data Fetching:** `safeFetch` wraps critical network requests with configurable retry/backoff/timeout handling. React Query manages client caching for bill lists, translations, and related entities.
- **Translations:** `src/lib/translation.ts` orchestrates Gemini calls via Supabase edge functions (`translate-bill` and `translate-bills`). Results are cached in `bill_translations`.
- **Advocacy Flow:** `FindYourRep` performs a LocationIQ → OpenStates pipeline, reconciles the results with the Supabase `legislators` table, and routes to Legislator detail screens.
- **CI Expectations:** Type-check with `yarn tsc --noEmit`, run unit tests with `yarn test`, and lint via `yarn lint` before opening pull requests.

---

## Data & AI Pipelines

1. **Bill ingestion** (`supabase/functions/bulk-import-dataset` & `sync-updated-bills`)
   - Pulls the active CA LegiScan dataset, filters by survivor-focused keywords, upserts metadata, and triggers summarization + embedding jobs.
2. **Summaries & Translations** (`supabase/functions/ingest-and-summarize`, `translate-bill`, `translate-bills`)
   - Request batched Gemini responses, store multilingual tiers, and warm vector embeddings for semantic search.
3. **Legislator & Vote Sync** (`supabase/functions/sync-legislators-and-votes`)
   - Imports CA legislators, derives lookup keys, flattens LegiScan roll calls into per-legislator vote rows, and keeps Supabase in sync.
4. **Notifications** (`supabase/functions/send-push-notifications`)
   - Placeholder job for reading the subscriptions table and dispatching Expo push messages.
5. **Verification & Security** (`supabase/functions/verify-app-check`)
   - Validates Firebase App Check tokens for requests originating from trusted mobile clients.

---

## Deployment Overview

- **Mobile Builds:** Use `eas build --platform all --profile production` for app-store binaries, and `eas update` for JavaScript-only OTA updates.
- **Web Export:** `yarn expo export` writes a static bundle under `dist/` suitable for Netlify, Vercel, or any static host.
- **Supabase Migrations:** Apply schema changes with `supabase db push`. Redeploy modified Edge Functions via `supabase functions deploy <name>`.

---

## Repository Map

### Root
- `.gitignore` – excludes node modules, build artifacts, secrets, and local tooling.
- `.idea/` – JetBrains project metadata (modules, workspace state).
- `.venv/` – Python virtual environment scaffold for ingestion helper scripts.
- `.vscode/settings.json` – workspace defaults for editors (TypeScript SDK path, formatting prefs).
- `dist/` – latest static web export (`assetmap.json`, `metadata.json`, `debug.html`, plus hashed runtime assets under `dist/assets/`).
- `mobile-app/` – Expo React Native application (see below).
- `process_backlog.py` – utility for reprocessing historical LegiScan records.
- `process_full_backlog.py` – full dataset ingestion harness with resume logic.
- `README.md` – you are here.
- `supabase/` – infrastructure as code, SQL migrations, and edge functions.

### `mobile-app/` root
- `.env`, `.env.production` – sample environment overrides for Expo.
- `.eslintrc.js`, `.prettierrc`, `.prettierignore` – linting and formatting guides.
- `.gitignore` – ignores build output (Android/iOS native folders, dist assets, etc.).
- `app.json` – Expo project manifest (name, icons, plugins, native config).
- `app.json.bak.*` – timestamped backups of the Expo manifest.
- `babel.config.js` – module resolver configuration, React Native presets.
- `create_context.sh` – helper for generating AI context bundles.
- `eas.json` – Expo Application Services profiles for build & update commands.
- `env.d.ts`, `expo-env.d.ts` – TypeScript declarations for Expo environment variables.
- `GoogleService-Info.plist`, `google-services.json` – Firebase configuration for iOS & Android.
- `GoogleService-Info.plist.bak.*`, `google-services.jsonbak.*` – backups of the Firebase configs captured before edits.
- `i18next-scanner.config.js` – extraction rules for translation keys.
- `jest.config.js` – Jest test runner configuration.
- `metro.config.js` – Metro bundler overrides (SVG/assets, alias resolution).
- `package.json`, `yarn.lock`, `package-lock.json` – dependency manifests.
- `project_context.txt` – AI assistant prompt context file describing the project.
- `store.config.json` – configuration scaffold for Expo Updates.
- `tsconfig.json` – TypeScript compiler options for the Expo project.

#### `mobile-app/app/`
- `_layout.tsx` – root navigation stack, registers stack routes, sets up providers.
- `index.tsx` – animated splash screen and initial tab navigator handoff.
- `+not-found.tsx` – fallback screen when an unknown route is visited.
- `bill/[id].tsx` – bill detail page with summary slider, translation controls, and advocacy panel.
- `legislator/[id].tsx` – legislator voting record view populated from Supabase roll-call data.
- `(tabs)/_layout.tsx` – bottom tab navigator configuration (highlighted, saved, bills, LNF, advocacy, language).
- `(tabs)/index.tsx` – main bills feed with filters, search, and infinite scroll.
- `(tabs)/highlighted.tsx` – curated survivor-first bill list.
- `(tabs)/saved.tsx` – bookmarks screen with sentiment reactions.
- `(tabs)/advocacy.tsx` – advocacy hub housing the Find Your Rep workflow.
- `(tabs)/lnf.tsx` – Love Never Fails content hub (brand storytelling, support resources).
- `(tabs)/language.tsx` – hidden route for managing language selection and persistence.

#### `mobile-app/components/`
- `HapticTab.tsx` – tab bar button wrapper adding haptic feedback.
- `ThemedText.tsx` – typography component synced with light/dark themes.
- `ThemedView.tsx` – view wrapper exposing themed background colors.
- `ui/HeaderBanner.tsx` – top-of-screen mission banner & CTA.
- `ui/IconSymbol.tsx` / `.ios.tsx` – platform-aware icon abstraction bridging SF Symbols and Material icons.
- `ui/LanguageMenuButton.tsx` – language switcher trigger embedded in toolbars.
- `ui/LnfIcon.tsx` – renders the Love Never Fails icon asset for branding consistency.
- `ui/TabBarBackground.tsx` / `.ios.tsx` – gradient and blur styling for the bottom tab bar.

#### `mobile-app/hooks/`
- `useColorScheme.ts`, `.web.ts` – hooks for tracking system theme and syncing the Paper MD3 palette.

#### `mobile-app/assets/`
- `fonts/SpaceMono-Regular.ttf` – app font bundled with Expo.
- `images/adaptive-icon.png` – adaptive icon background for Android.
- `images/banner.png` – mission banner artwork used in `HeaderBanner`.
- `images/favicon.png` – web favicon.
- `images/header-banner.png` – hero art shown at the top of the app.
- `images/icon.png` – legacy icon still referenced in some manifests.
- `images/icon-foreground.png` – foreground layer for adaptive icon.
- `images/LNFmini.png` – Love Never Fails tab icon.
- `images/splash-icon.png` – splash screen logo for Expo launch screen.

#### `mobile-app/src/components/`
- `Bill.tsx` – bill list tile with bookmarking, reactions, and summary preview.
- `BillSkeleton.tsx` – shimmer placeholder for loading states.
- `EmailTemplate.tsx` – renders advocacy email body and subject when composing outreach.
- `EmptyState.tsx` – reusable empty/error placeholder component.
- `ExpandableCard.tsx` – collapsible card used for FAQs and contextual info.
- `FindYourRep.tsx` – address search UI, Supabase reconciliation, and legislator routing.
- `LanguageSwitcher.tsx` – dropdown for runtime language selection.
- `RelatedBills.tsx` – displays AI-ranked related bills with navigation shortcuts.
- `SummarySlider.tsx` – segmented control for toggling summary difficulty levels.

#### `mobile-app/src/lib/`
- `analytics.ts` – wrappers for logging track events into Supabase.
- `config.ts` – runtime environment loader with validation and memoization.
- `find-your-representative.ts` – shared logic for LocationIQ + OpenStates pipeline.
- `i18n.ts` – i18next initialization + language detector wiring.
- `legislatorLookup.ts` – deterministic key generator for matching OpenStates results to Supabase records.
- `push.ts` – Expo push token registration helper.
- `safeFetch.ts` – fetch wrapper with configurable retries, exponential backoff, and optional per-attempt timeouts.
- `supabase.ts` / `supabase.native.ts` – Supabase clients optimized for web vs native storage layers.
- `translation.ts` – high-level helpers for invoking translation edge functions and caching outcomes.

#### `mobile-app/src/providers/`
- `AuthProvider.tsx` – anonymous session bootstrap and context surface.
- `ConfigProvider.tsx` – runtime config hydration and global error fallback.
- `LanguageProvider.tsx` – current language context, persistence, and update callbacks.

#### `mobile-app/src/locales/`
- `en.json`, `es.json` – translation dictionaries for English and Spanish.

#### `mobile-app/src/encryption.ts`
- AES wrapper and helper for future client-side encrypted notes.

### `supabase/`
- `.env` – Supabase CLI credentials (excluded from version control but noted here for completeness).
- `config.sql` – low-level Supabase configuration (RLS policies, background jobs).
- `config.toml` – Supabase CLI project metadata.
- `env.example` – template for Supabase service role and third-party API keys.
- `schema.sql` – canonical Postgres schema, tables, indexes, triggers, and data migrations (including legislator lookup keys and roll-call vote columns).

#### `supabase/functions/_shared/`
- `cors.ts` – reusable CORS headers for HTTP responses.
- `mock-data.ts` – stub payloads for local testing without live API calls.

#### `supabase/functions/bulk-import-dataset/`
- `index.ts` – downloads LegiScan datasets, filters survivor-relevant bills, and seeds Supabase.
- `deno.json` – Deno module resolution and permissions for the function.

#### `supabase/functions/ingest-and-summarize/`
- `index.ts` – orchestrates Gemini summarization, translation tier caching, and embedding creation.
- `deno.json`, `.npmrc` – Deno configuration and npm registry access for Gemini.

#### `supabase/functions/send-push-notifications/`
- `index.ts` – planned job for dispatching Expo push notices to subscribers.
- `deno.json` – runtime configuration.

#### `supabase/functions/sync-legislators-and-votes/`
- `index.ts` – imports legislators, builds lookup keys, fetches roll-call votes, and upserts normalized rows.
- `deno.json` – Deno settings.

#### `supabase/functions/sync-updated-bills/`
- `index.ts` – scheduled worker that refreshes bill metadata, triggers AI summarization, and recomputes embeddings.
- `deno.json` – Deno settings.

#### `supabase/functions/translate-bill/`
- `index.ts` – on-demand translation of a single bill for a target language.
- `deno.json` – Deno settings.

#### `supabase/functions/translate-bills/`
- `index.ts` – batch translation pipeline for multiple bills.
- `deno.js` – compatibility shim for deployment tooling.

#### `supabase/functions/verify-app-check/`
- `index.ts` – validates Firebase App Check tokens before allowing protected actions.
- `deno.json` – Deno settings.

---

## Roadmap Ideas

- [ ] Expand automated test coverage (unit, integration, and edge-function suites).
- [ ] Finish notification dispatcher for bookmark alerts and action reminders.
- [ ] Build encrypted survivor notes using `encryption.ts` and Supabase row-level encryption.
- [ ] Add more translation packs (`src/locales/<lang>.json`) and tune Gemini prompts for region-specific nuance.
- [ ] Harden analytics by piping critical actions through `analytics.ts` and Supabase events tables.

---

## Support & Contact

Have questions or want to collaborate? Reach out via the Love Never Fails engineering team or open an issue in this repository. Contributions focused on accessibility, survivor safety, or policy reach are especially welcome.
