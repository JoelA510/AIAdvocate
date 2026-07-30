const fs = require("node:fs");
const path = require("node:path");
const requireContext =
  require("expo-router/build/testing-library/require-context-ponyfill").default;
const { EXPO_ROUTER_CTX_IGNORE } = require("expo-router/_ctx-shared");

// The typed-route generator is not part of any package's public API, and SDK 57
// moved it out of expo-router into @expo/router-server. Try both, newest first,
// and fail loudly rather than silently emitting no routes — CI's `tsc --noEmit`
// depends on this file existing, and an empty declaration would turn every
// route typo into a passing build.
const TYPED_ROUTE_GENERATOR_PATHS = [
  "@expo/router-server/build/typed-routes/generate", // SDK 57+
  "expo-router/build/typed-routes/generate", // SDK 53-56
];

function loadDeclarationFileGenerator() {
  const failures = [];
  for (const modulePath of TYPED_ROUTE_GENERATOR_PATHS) {
    try {
      const { getTypedRoutesDeclarationFile } = require(modulePath);
      if (typeof getTypedRoutesDeclarationFile === "function") {
        return getTypedRoutesDeclarationFile;
      }
      failures.push(`${modulePath}: no getTypedRoutesDeclarationFile export`);
    } catch (error) {
      failures.push(`${modulePath}: ${error.message}`);
    }
  }
  throw new Error(
    `Could not load Expo Router's typed-route generator. Tried:\n  ${failures.join("\n  ")}`,
  );
}

const getTypedRoutesDeclarationFile = loadDeclarationFileGenerator();

const appRoot = path.resolve(__dirname, "../app");
const typesDir = path.resolve(__dirname, "../.expo/types");
const outputFile = path.join(typesDir, "router.d.ts");

process.env.EXPO_ROUTER_APP_ROOT = appRoot;

fs.mkdirSync(typesDir, { recursive: true });

const ctx = requireContext(appRoot, true, EXPO_ROUTER_CTX_IGNORE);
const declaration = getTypedRoutesDeclarationFile(ctx);

if (!declaration) {
  throw new Error("Expo Router did not generate route declarations.");
}

fs.writeFileSync(outputFile, declaration);
