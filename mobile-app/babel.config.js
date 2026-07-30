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
          alias: { "@": "./src", "~": "./" },
          extensions: [".tsx", ".ts", ".jsx", ".js", ".json"],
        },
      ],

      // MUST be last to support React Native Reanimated.
      //
      // Reanimated 4 moved the worklet transform out into its own package:
      // react-native-worklets is now a required peer (0.10.x) and owns the
      // babel plugin. "react-native-reanimated/plugin" no longer exists.
      "react-native-worklets/plugin",
    ],
  };
};
