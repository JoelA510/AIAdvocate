// mobile-app/metro.config.js
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// If you need to load JSON from locales via import, make sure it's included:
config.resolver.assetExts = config.resolver.assetExts || [];
config.resolver.sourceExts = config.resolver.sourceExts || [];

module.exports = config;
