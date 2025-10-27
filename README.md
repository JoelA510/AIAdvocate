# AI Advocate

AI Advocate is Love Never Fails’ companion application for survivors, allies, and advocates who need a precise view of the policy landscape. The Expo client (web + iOS + Android) surfaces curated California legislation, rewrites dense bill text in plain language, pairs every item with outreach tooling, and now highlights real vote history for each representative the moment it becomes available.

> **Status**: Production (v1.0). Store builds and the responsive web client share one codebase. Supabase manages authentication, data pipelines, translations, vote ingestion, and scheduling.

---

## Table of Contents

1. [Highlights](#highlights)
2. [Architecture](#architecture)
3. [Edge Functions & Automations](#edge-functions--automations)
4. [Data Model Overview](#data-model-overview)
5. [Local Development](#local-development)
6. [Testing & Quality Gates](#testing--quality-gates)
7. [Operations & Runbooks](#operations--runbooks)
8. [Release Process](#release-process)
9. [Repository Layout](#repository-layout)
10. [Security & Privacy](#security--privacy)
11. [Support](#support)

---

## Highlights

| Experience | What users see | Under the hood |
| --- | --- | --- |
| **Active Bills feed** | Prioritised list of California survivor-focused legislation with search, session toggle, and curated pins | Supabase `bills` view + Postgres websearch. Ranks by curation → score → recency. Session tags parsed from `state_link` and cached client-side. |
| **AI-powered summaries** | Simple / Medium / Complex write-ups in English & Spanish on every card and detail page | `sync-updated-bills` cleans LegiScan text, prompts OpenAI `gpt-4o-mini` once for both languages, stores summaries + `text-embedding-3-small` vectors. |
| **Representative lookup with context** | Address-based finder that lists state legislators only and shows their freshest vote on the active bill | `find-your-rep` edge function caches OpenStates lookups. The app cross-references `legislators` + `v_rep_vote_history`, falling back to chamber-aware “not eligible yet” messaging when an assembly vote is still pending. |
| **Legislator vote history** | Timeline of votes with filters on profile screens plus outreach templates | `v_rep_vote_history` invoker-secured view joins `vote_records`, `vote_events`, `bills`, and `legislators`. `votes-backfill` hydrates historic rolls; `votes-daily` watches for updates. |
| **Bookmarks & reactions** | “Saved” tab, emoji reactions, and toast feedback that stay in sync across devices | RPC helpers (`toggle_bookmark_and_subscription`, `handle_reaction`) wrap row-level security, with realtime channels broadcasting optimistic updates. |
| **Love Never Fails hub** | Brand-first landing tab with storytelling, give/volunteer CTAs, and external deep links | Native platforms use a WebView; the web client renders card CTAs to respect CSP rules. |
| **Accessibility & localisation** | Locale switcher, reader-friendly typography, and TTS prompts | i18next + React Native Paper tokens drive the theme. Translations live in `bill_translations`; Expo Speech powers narration on supported devices. |

---

## Architecture

```
Expo Router (iOS / Android / Web)
    ├─ React Query & TanStack • React Native Paper • i18next
    └─ Custom hooks for auth, localisation, analytics
▼
Supabase (PostgREST • Edge Functions • Realtime • pgvector)
    ├─ REST + RPC surface secured by row-level security
    ├─ Edge Functions (Deno, TypeScript)
    └─ PostgreSQL with pg_cron, vault, and verification scripts
```

* **Client** – Expo Router manages navigation, deep links, and tab layouts. React Query caches Supabase responses. Paper’s Material 3 theming is centralised in `mobile-app/constants/paper-theme.ts` so the brand palette stays consistent.
* **API** – Public clients read via the PostgREST API with `anon` or `authenticated` roles. All writes go through RPC helpers or edge functions, keeping RLS intact.
* **Automation** – Cron triggers in Supabase orchestrate bill ingestion, summary generation, vote syncing, and email scheduling. Verification SQL scripts (e.g., `supabase/verification/20251021_vote_history.sql`) guard against regressions before deploys.

---

## Edge Functions & Automations

| Function / Task | Purpose | Trigger | Notes |
| --- | --- | --- | --- |
| `bulk-import-dataset` | Pulls the latest CA legislative dataset, filters to survivor-centric bills, and stages rows for review. | Manual / cron | Use before `sync-updated-bills` when new sessions drop. |
| `sync-updated-bills` | Sanitises bill text, generates bilingual summaries, stores embeddings, and flags completion. | Nightly cron + manual | Idempotent; respects `job_state` checkpoints. |
| `votes-backfill` | Hydrates historical vote events and member records from OpenStates. | Manual | Accepts `force=true` query param to reprocess populated bills. |
| `votes-daily` | Incremental poller that syncs new vote events since the last run. | Scheduled via `supabase functions schedule create votes-daily ...` | Updates `job_state` (`votes-daily:last-run`). |
| `find-your-rep` | Cached address → legislators lookup with OpenStates + LocationIQ. | Client invoked | Added provider ID matching so state reps surface even when names vary. |
| `translate-bill` / `translate-bills` | On-demand translation helpers that reuse cached content when available. | Client invoked | Works alongside the nightly summary job. |
| `summarize-simple` / `summarize-simple-backfill` | Legacy summarisation utilities retained for specialised queues. | Manual | Useful for targeted re-summarisation. |
| `send-push-notifications` | Service-role only function for Expo push fan-out. | Cron / manual | Requires vault-managed Expo credentials. |
| `verify-app-check` | App Check handshake for the client. | Client invoked | JWT disabled per mobile requirements. |
| `ingest-and-summarize` | Local mock harness demonstrating ingestion without external APIs. | Manual | Safe sandbox for new contributors. |

> **Cron topology**: Supabase’s pg_cron schedules call `votes-daily` and `sync-updated-bills`. The production environment also runs a nightly `invoke_full_legislative_refresh` workflow (see `supabase/scripts/`) to chain dataset pull → summaries → vote sync.

---

## Data Model Overview

Key tables & views:

- `bills`, `bill_translations`, `bill_embeddings` – curated legislation, multilingual summaries, and semantic search vectors.
- `legislators` – unified roster keyed by OpenStates provider IDs with lookup keys for fuzzy matching.
- `vote_events`, `vote_records` – normalised roll call data. Policies ensure service-role write access while `anon`/`authenticated` stay read-only.
- `v_rep_vote_history` – invoker-secured view feeding representative profile screens and the lookup tool.
- `job_state` – generic checkpoint table used by every long-running function.
- `location_lookup_cache` – throttling layer for address → representative resolution.
- `bookmarks`, `reactions`, `user_push_tokens` – user-generated signals powering engagement features.

Recent migrations (2024-09 through 2025-10) align RLS policies with Supabase guidance, ensure `v_rep_vote_history` grants, and harden audit coverage. Run `supabase/verification/20251021_vote_history.sql` after each deploy to confirm security posture and data availability.

---

## Local Development

### 1. Prerequisites

- Node.js 20+, Yarn 1.22+, Git, Supabase CLI ≥ 2.48 (upgrade regularly), and Watchman (macOS).
- Expo tooling (`npm install -g eas-cli` optionally) and either Android Studio, Xcode, or a web browser for the Expo target.
- Access to required secrets: OpenStates, LocationIQ, LegiScan, OpenAI, Supabase keys.

### 2. Clone & install

```bash
git clone https://github.com/JoelA510/AIAdvocate.git
cd AIAdvocate

# Mobile app dependencies
cd mobile-app
yarn install
```

### 3. Configure environment variables

- `mobile-app/.env`
  - `EXPO_PUBLIC_SUPABASE_URL`
  - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
  - `EXPO_PUBLIC_OPENSTATES_API_KEY`
  - `EXPO_PUBLIC_LOCATIONIQ_API_KEY`
  - Optional extras: `EXPO_PUBLIC_LNF_URL`, `EXPO_PUBLIC_RECAPTCHA_SITE_KEY`, Firebase config.
- `supabase/.env`
  - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
  - `LEGISCAN_API_KEY`, `OPENSTATES_API_KEY`, `OpenAI_GPT_Key`
  - `DB_URL` (percent-encode the password when using `--db-url`)
  - Any downstream service secrets (Expo push, Gemini, etc.).

Never commit `.env` files; rely on Supabase Vault or CI secrets.

### 4. Start Supabase locally

```bash
cd ../supabase
supabase start              # launches local Postgres + Studio
supabase db push            # applies migrations, policies, seed data

# Optional: run edge functions locally
supabase functions serve sync-updated-bills
supabase functions serve votes-backfill
supabase functions serve votes-daily
supabase functions serve find-your-rep
```

### 5. Run the Expo client

```bash
cd ../mobile-app
yarn expo start
```

Choose web, iOS simulator, or Android emulator from the Expo dev tools. The app auto-loads translations and Supabase config on boot; run `expo-doctor` if dependencies drift.

### 6. Optional pipelines locally

```bash
# Pull & summarise new bills
supabase functions serve bulk-import-dataset
supabase functions serve sync-updated-bills

# Refresh legislators & vote records
supabase functions serve votes-backfill
supabase functions serve votes-daily
```

---

## Testing & Quality Gates

| Command | Purpose |
| --- | --- |
| `yarn lint` | ESLint + custom rules for the Expo client. |
| `yarn test` | Jest unit tests for shared utilities/components. |
| `yarn tsc --noEmit` | TypeScript project-wide type check. |
| `npx supabase gen types typescript --local` | (Optional) Regenerate database types for client consumption. |
| `supabase db verify` | Run verification scripts (requires CLI ≥ 2.50). |

Add tests for new pipelines wherever possible. For data migrations, pair them with verification SQL under `supabase/verification/`.

---

## Operations & Runbooks

### Backfill vote history

```bash
supabase functions deploy votes-backfill
supabase functions deploy votes-daily

# Trigger a controlled run (service-role token required)
python scripts/backfill-votes.mjs           # or call the HTTPS endpoint
```

Passing `force=true` in the query string reprocesses bills even if votes already exist.

### Daily vote sync health check

1. Inspect `job_state` → `votes-daily:last-run` timestamp.
2. Review logs in the Supabase dashboard for `votes-daily`.
3. Run the verification SQL to ensure `v_rep_vote_history` returns rows.

### Manual summary refresh

```bash
supabase functions invoke sync-updated-bills --no-verify-jwt --body '{"force":true}'
```

Ensure OpenAI quotas are available before running large batches.

### Representative lookup cache purge

Clear stale entries with a simple SQL job:

```sql
DELETE FROM location_lookup_cache WHERE updated_at < now() - interval '30 days';
```

Schedule through pg_cron if needed.

---

## Release Process

1. **Versioning** – bump `app.json` (`version`, `buildNumber`, `android.versionCode`) and update any in-app version banners.
2. **Changelog** – summarise user-facing changes and note database migrations applied.
3. **Quality gates** – run the commands listed in [Testing & Quality Gates](#testing--quality-gates).
4. **Supabase schema** – `supabase db push --include-all` to ensure the remote project matches migrations. Run verification scripts.
5. **Edge functions** – `supabase functions deploy <name>` for any touched functions, then smoke test via HTTPS.
6. **EAS builds** – `eas build --platform android --profile production` and `eas build --platform ios --profile production`. Attach release notes.
7. **Launch checklist** – confirm `votes-daily` schedule is active, check monitoring dashboards, and communicate release highlights to Love Never Fails stakeholders.

---

## Repository Layout

```
AIAdvocate/
├── mobile-app/               # Expo project
│   ├── app/                  # Router-based screens and layouts
│   ├── components/           # Shared UI primitives (Bill, VotingHistory, etc.)
│   ├── constants/            # Brand palette and Paper theme definitions
│   ├── hooks/                # Platform-aware utilities (color scheme, viewport)
│   ├── src/lib/              # Supabase client, lookup helpers, analytics
│   ├── src/providers/        # Auth, i18n, language contexts
│   ├── types/                # Type augmentation (MD3, navigation)
│   └── assets/               # Images, fonts, icons
└── supabase/
    ├── migrations/           # SQL schema, policy, and view migrations
    ├── verification/         # Post-deploy validation queries
    ├── functions/            # Deno edge functions (bill ingestion, votes, lookup)
    ├── scripts/              # Developer tooling (cron orchestration, diagnostics)
    └── config.*              # Supabase project configuration
```

---

## Security & Privacy

- No survivor-identifying information is collected. Anonymous auth tokens map only to Supabase session IDs.
- Secrets live in environment variables or Supabase Vault; never hardcode keys in the client.
- Edge functions redact third-party API payloads before logging. Only aggregate diagnostics flow into `cron_job_errors`.
- Row-level security denies writes from `anon`/`authenticated` roles; mutations must go through RPCs/edge functions with explicit policies.

---

## Support

Questions, bug reports, or feature requests? Reach out to Love Never Fails or open a GitHub issue. Every improvement helps survivors stay informed, empowered, and safe.

