// Guards the external-API rules in docs/external-api-policy.md.
//
// Context: on 2026-07-26 the LegiScan API key was locked for ToS abuse after a
// sweep issued 23 getSearch calls in ~20 seconds. Every individual call passed
// the reserve_legiscan_api_call cooldown/quota check — nothing in the system
// limited *rate*, and nothing stopped a new file from calling LegiScan without
// metering at all. LegiScan forbids registering a replacement key, so this
// failure mode is close to unrecoverable and is worth failing CI over.
//
// Checks:
//   1. Only allowlisted files may contact LegiScan or OpenStates at all.
//      Adding a call site is deliberate friction: a reviewer must confirm it is
//      metered, throttled and sequential.
//   2. Any file that fetches api.legiscan.com must route through the
//      reserve_legiscan_api_call RPC (the only thing that records quota use).
//   3. LegiScan throttle defaults must stay at or above the policy floors.

const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..", "..");

// Files permitted to contact each provider. Keep this list short; see
// docs/external-api-policy.md §7 before adding to it.
const LEGISCAN_ALLOWLIST = [
  "supabase/functions/bulk-import-dataset/index.ts",
  "supabase/functions/sync-updated-bills/index.ts",
];

const OPENSTATES_ALLOWLIST = [
  "src/lib/openstatesClient.ts",
  // Operator-run one-off backfills, never on a schedule. They predate the
  // shared client; if either is ever automated, move it onto openstatesClient
  // first so retries and error reporting are consistent.
  "scripts/backfill-openstates-ids.mjs",
  "scripts/backfill-votes.mjs",
];

// Everywhere a provider call could plausibly be added. `mobile-app` is included
// deliberately: a provider call from the client would also ship the API key to
// end users, so it must never appear there without review.
const SCAN_ROOTS = ["supabase/functions", "src", "scripts", "mobile-app"];

const LEGISCAN_HOST_RE = /api\.legiscan\.com/;
const OPENSTATES_HOST_RE = /openstates\.org\/graphql/;
const RESERVE_RPC_RE = /reserve_legiscan_api_call/;

// Policy floors from docs/external-api-policy.md §2-§3.
const THROTTLE_FLOORS = [
  {
    file: "supabase/functions/bulk-import-dataset/index.ts",
    constant: "DEFAULT_SEARCH_DELAY_MS",
    min: 1000,
    unit: "ms between LegiScan calls",
  },
  {
    file: "supabase/functions/bulk-import-dataset/index.ts",
    constant: "DEFAULT_SEARCH_MAX_CALLS_PER_RUN",
    min: null,
    max: 6,
    unit: "LegiScan calls per invocation",
  },
];

const failures = [];

// This script necessarily contains the host patterns it searches for, so it
// would otherwise flag itself.
const SELF_PATH = path.resolve(__filename);

function listFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full));
    else if (
      /\.(ts|tsx|js|mjs|py|sh)$/.test(entry.name) &&
      path.resolve(full) !== SELF_PATH
    ) {
      out.push(full);
    }
  }
  return out;
}

function rel(p) {
  return path.relative(repoRoot, p).split(path.sep).join("/");
}

/** Read `const NAME = 1_500;` style declarations, tolerating numeric separators. */
function readNumericConstant(source, name) {
  const match = source.match(
    new RegExp(`const\\s+${name}\\s*=\\s*([0-9_]+)\\s*;`),
  );
  if (!match) return null;
  return Number(match[1].replace(/_/g, ""));
}

const files = SCAN_ROOTS.flatMap((root) => listFiles(path.join(repoRoot, root)));

// 1 + 2. Call-site allowlist and mandatory metering.
for (const file of files) {
  const relPath = rel(file);
  const source = fs.readFileSync(file, "utf8");

  if (LEGISCAN_HOST_RE.test(source)) {
    if (!LEGISCAN_ALLOWLIST.includes(relPath)) {
      failures.push(
        `${relPath}: contacts api.legiscan.com but is not in LEGISCAN_ALLOWLIST. ` +
          `LegiScan locks keys for ToS abuse and forbids replacements — every call ` +
          `site must be reviewed against docs/external-api-policy.md before it ships.`,
      );
    }

    if (!RESERVE_RPC_RE.test(source)) {
      failures.push(
        `${relPath}: fetches api.legiscan.com without calling ` +
          `reserve_legiscan_api_call. Unmetered calls bypass the daily/monthly ` +
          `budget and leave no row in legiscan_api_call_log.`,
      );
    }
  }

  if (OPENSTATES_HOST_RE.test(source) && !OPENSTATES_ALLOWLIST.includes(relPath)) {
    failures.push(
      `${relPath}: contacts the OpenStates GraphQL endpoint but is not in ` +
        `OPENSTATES_ALLOWLIST. Route provider calls through ` +
        `src/lib/openstatesClient.ts so retry and error reporting stay in one place.`,
    );
  }
}

// 3. Throttle defaults must not drift below the policy floors.
for (const rule of THROTTLE_FLOORS) {
  const full = path.join(repoRoot, rule.file);
  if (!fs.existsSync(full)) {
    failures.push(`${rule.file}: expected to exist so ${rule.constant} can be checked.`);
    continue;
  }

  const value = readNumericConstant(fs.readFileSync(full, "utf8"), rule.constant);
  if (value === null) {
    failures.push(
      `${rule.file}: could not find \`const ${rule.constant} = <number>;\`. ` +
        `The rate-limit guardrail depends on this constant; do not rename or ` +
        `remove it without updating docs/external-api-policy.md.`,
    );
    continue;
  }

  if (rule.min !== null && rule.min !== undefined && value < rule.min) {
    failures.push(
      `${rule.file}: ${rule.constant} is ${value}, below the policy floor of ` +
        `${rule.min} ${rule.unit}. See docs/external-api-policy.md §3.`,
    );
  }

  if (rule.max !== null && rule.max !== undefined && value > rule.max) {
    failures.push(
      `${rule.file}: ${rule.constant} is ${value}, above the policy ceiling of ` +
        `${rule.max} ${rule.unit}. See docs/external-api-policy.md §3.`,
    );
  }
}

if (failures.length > 0) {
  console.error("External API usage guardrail failed:\n");
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  console.error("\nSee docs/external-api-policy.md");
  process.exit(1);
}

console.log("External API usage guardrail passed.");
