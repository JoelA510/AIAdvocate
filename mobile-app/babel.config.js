// mobile-app/babel.config.js (modified)
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: [
      // Path alias for "@/...". This resolves imports like "@/src/components".
      //
      // Deliberately no `root` option. Metro runs this config over node_modules
      // too, and `root: ["./"]` makes module-resolver treat a bare `require(".")`
      // in a dependency as a root-relative specifier: expo-router's
      // build/navigationEvents/navigation.js does `require(".")` to reach its own
      // sibling index, and root rewrote that to `require("../../../../mobile-app")`
      // — the app's own entry, which has no `emit` export. Every navigation
      // dispatch then threw "(0, _1.emit) is not a function" (blank web screen,
      // instant native crash on any tab or bill tap). The aliases below do not
      // need `root`, and nothing in this app imports root-relative bare paths.
      //
      // `cwd` is pinned to this file's directory because module-resolver
      // resolves relative alias targets against `opts.cwd || process.cwd()` —
      // Babel's own `cwd` never reaches the plugin. Without it, running Metro
      // or jest from the workspace root resolved "@/lib/paths" to the repo's
      // top-level src/ instead of mobile-app/src/, which exists, so it failed
      // silently rather than loudly.
      [
        "module-resolver",
        {
          cwd: __dirname,
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
