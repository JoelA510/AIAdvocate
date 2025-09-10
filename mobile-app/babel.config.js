// mobile-app/babel.config.js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: [
      // Expo Router transforms
      "expo-router/babel",

      // Path alias for "@/..."
      [
        "module-resolver",
        {
          root: ["./"],
          alias: { "@": "./src", "~": "./" },
          extensions: [".tsx", ".ts", ".jsx", ".js", ".json"],
        },
      ],

      // MUST be last
      "react-native-reanimated/plugin",
    ],
  };
};
