// mobile-app/.eslintrc.js
module.exports = {
  root: true,
  extends: ["expo", "prettier"],
  plugins: ["prettier", "import", "i18next", "react-hooks"],
  ignorePatterns: ["node_modules/", "dist/", "build/", ".expo/", "scripts/"],
  rules: {
    "prettier/prettier": "error",
    "import/no-unresolved": "error",
    "react-hooks/rules-of-hooks": "error",
    "react-hooks/exhaustive-deps": "warn",
    "i18next/no-literal-string": [
      "warn",
      {
        markupOnly: true,
        onlyAttribute: ["aria-label", "alt", "placeholder", "title"],
        ignoreAttribute: ["testID"],
      },
    ],
  },
  settings: {
    "import/resolver": {
      // Let ESLint follow TS path aliases (reads ./tsconfig.json)
      typescript: {
        alwaysTryTypes: true,
        project: "./tsconfig.json",
      },
      // Let ESLint follow Babel's module-resolver alias "@": "./src"
      "babel-module": {
        alias: { "@": "./src" },
        extensions: [".js", ".jsx", ".ts", ".tsx", ".json"],
      },
      // Fallback plain node resolution
      node: {
        extensions: [".js", ".jsx", ".ts", ".tsx", ".json"],
      },
    },
  },
};
