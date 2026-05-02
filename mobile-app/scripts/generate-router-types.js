const fs = require("node:fs");
const path = require("node:path");
const requireContext = require("expo-router/build/testing-library/require-context-ponyfill").default;
const { getTypedRoutesDeclarationFile } = require("expo-router/build/typed-routes/generate");
const { EXPO_ROUTER_CTX_IGNORE } = require("expo-router/_ctx-shared");

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
