// Guards the "admin is web-only" invariant (Play Data Safety: store binaries
// must not bundle the staff email/password login). The failure mode is silent
// — the first attempt at this split shipped admin code to Android with tests,
// lint, and typecheck all green — so CI enforces the structure:
//
//   1. app/admin/*.tsx (except _layout.tsx) must be one-line re-exports from
//      src/features/admin/<name>.
//   2. No platform-suffixed route files (*.web.tsx etc.) may exist under
//      app/ — expo-router bundles every app/ file on every platform.
//   3. Every src/features/admin/*.web.tsx needs a sibling .tsx stub that
//      re-exports AdminWebOnly (what native builds resolve).
//   4. Nothing may import a features/admin module with an explicit .web
//      extension (which would drag web code into native bundles).
//
// Release-time backstop: `npx expo export --platform android` and grep the
// bundle for "manage-admin-users" (must be absent). See DEPLOYMENT_GUIDE.md.

const fs = require("node:fs");
const path = require("node:path");

const mobileAppRoot = path.resolve(__dirname, "..");
const adminRoutesDir = path.join(mobileAppRoot, "app", "admin");
const adminFeaturesDir = path.join(mobileAppRoot, "src", "features", "admin");
const appDir = path.join(mobileAppRoot, "app");

const ROUTE_RE_EXPORT_RE =
  /^export \{ default \} from "\.\.\/\.\.\/src\/features\/admin\/[a-zA-Z0-9-]+";\s*$/;
const STUB_RE_EXPORT_RE = /^export \{ default \} from "\.\.\/\.\.\/components\/AdminWebOnly";\s*$/;
const PLATFORM_SUFFIX_RE = /\.(web|ios|android|native)\.[jt]sx?$/;

const failures = [];

function listFiles(dir, recursive = false) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (recursive) out.push(...listFiles(full, true));
    } else {
      out.push(full);
    }
  }
  return out;
}

function rel(p) {
  return path.relative(mobileAppRoot, p);
}

// 1. Route files must be pure re-exports.
for (const file of listFiles(adminRoutesDir)) {
  const base = path.basename(file);
  if (base === "_layout.tsx") continue;
  const content = fs.readFileSync(file, "utf8").trim();
  if (!ROUTE_RE_EXPORT_RE.test(content)) {
    failures.push(
      `${rel(file)}: admin route files must be a single re-export from src/features/admin ` +
        `(got ${content.split("\n").length} line(s)). Real screens belong in ` +
        `src/features/admin/<name>.web.tsx with a .tsx AdminWebOnly stub.`,
    );
  }
}

// 2. No platform-suffixed route files anywhere under app/.
for (const file of listFiles(appDir, true)) {
  if (PLATFORM_SUFFIX_RE.test(path.basename(file))) {
    failures.push(
      `${rel(file)}: platform-suffixed files are forbidden under app/ — expo-router ` +
        `bundles every app/ file on every platform, so this does NOT platform-split.`,
    );
  }
}

// 3. Every web screen needs a native stub that resolves to AdminWebOnly.
for (const file of listFiles(adminFeaturesDir)) {
  const base = path.basename(file);
  if (!base.endsWith(".web.tsx")) continue;
  const stubPath = path.join(adminFeaturesDir, base.replace(".web.tsx", ".tsx"));
  if (!fs.existsSync(stubPath)) {
    failures.push(
      `${rel(file)}: missing native stub ${rel(stubPath)} — without it, native builds ` +
        `resolve nothing (or worse, the web screen) for this module.`,
    );
    continue;
  }
  const stubContent = fs.readFileSync(stubPath, "utf8").trim();
  if (!STUB_RE_EXPORT_RE.test(stubContent)) {
    failures.push(
      `${rel(stubPath)}: native admin stubs must only re-export AdminWebOnly; anything ` +
        `else risks shipping admin code in the store binaries.`,
    );
  }
}

// 4. No explicit .web imports of admin modules from anywhere.
const scanRoots = [appDir, path.join(mobileAppRoot, "src"), path.join(mobileAppRoot, "components")];
for (const root of scanRoots) {
  if (!fs.existsSync(root)) continue;
  for (const file of listFiles(root, true)) {
    if (!/\.[jt]sx?$/.test(file)) continue;
    const content = fs.readFileSync(file, "utf8");
    if (/features\/admin\/[a-zA-Z0-9-]+\.web/.test(content)) {
      failures.push(
        `${rel(file)}: imports a features/admin module with an explicit .web extension, ` +
          `which would bundle web admin code into native builds.`,
      );
    }
  }
}

if (failures.length > 0) {
  console.error("Admin web-only guardrail failed:\n");
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}

console.log("Admin web-only guardrail passed.");
