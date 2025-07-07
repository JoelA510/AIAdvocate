// mobile-app/.eslintrc.js
module.exports = {
  root: true,
  extends: ["expo", "prettier"],
  plugins: ["prettier", "import"],
  ignorePatterns: ["scripts/"],
  rules: {
    "prettier/prettier": "error",
    "import/no-unresolved": "error", // Keep this as an error to ensure it's working
  },
  settings: {
    "import/resolver": {
      // Use the typescript resolver
      typescript: {
        // This tells the resolver to always try checking for @types packages
        alwaysTryTypes: true,
        // Point the resolver to your tsconfig.json
        project: "./tsconfig.json",
      },
      // We can also keep a 'node' resolver as a fallback
      node: true,
    },
  },
};

// This configuration file is for ESLint in a React Native project using Expo.
// It extends the base Expo configuration and integrates Prettier for code formatting.
// The 'prettier' plugin is used to enforce consistent code style,
// while the 'import' plugin helps manage module imports.
// The rules section specifies that Prettier errors should be treated as ESLint errors,
// and unresolved imports will also trigger errors to ensure all dependencies are correctly resolved.
// The settings section configures the import resolver to use TypeScript,
// allowing ESLint to understand TypeScript paths and aliases defined in the tsconfig.json file.
// This setup is essential for maintaining a clean and organized codebase in React Native applications,
// ensuring that code style is consistent and imports are correctly managed.
// The 'typescript' resolver is configured to always try checking for @types packages,
// which is useful for TypeScript projects to ensure type definitions are correctly resolved.
// The 'node' resolver is included as a fallback to handle standard Node.js modules.
// This configuration helps streamline development in React Native projects,
// making it easier to manage imports and maintain code quality.
// Ensure that you have the necessary ESLint plugins installed:
// npm install --save-dev eslint eslint-plugin-prettier eslint-plugin-import @typescript-eslint/eslint-plugin
// or
// yarn add --dev eslint eslint-plugin-prettier eslint-plugin-import @typescript-eslint/eslint-plugin
// This will ensure that ESLint can correctly parse and lint your code according to the specified rules.
// Remember to run ESLint regularly to catch any issues early in the development process.
