// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

// Get the project root
const projectRoot = __dirname;

const config = getDefaultConfig(projectRoot);

// 1. Watch all files in the project, including the `src` directory
config.watchFolders = [projectRoot];

// 2. Let Metro know where to resolve packages and in what order
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
];

// 3. Force Metro to resolve (sub)dependencies of `react-native` to the root `node_modules`
config.resolver.disableHierarchicalLookup = true;

module.exports = config;