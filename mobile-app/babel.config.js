// mobile-app/babel.config.js (modified)
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: [
      // Path alias for "@/...". This resolves imports like "@/src/components".
      [
        "module-resolver",
        {
          root: ["./"],
          alias: { "@": "./src", "@/src": "./src", "~": "./" },
          extensions: [".tsx", ".ts", ".jsx", ".js", ".json"],
        },
      ],

      // MUST be last to support React Native Reanimated.
      "react-native-reanimated/plugin",
    ],
  };
};
