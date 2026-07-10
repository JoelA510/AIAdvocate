// Stabilize the fingerprint-based runtime version (expo-updates).
//
// By default @expo/fingerprint hashes the fully-evaluated Expo config, which
// for this app includes two things that must NOT affect OTA compatibility:
//
//   - extra.publicEnv — injected from EXPO_PUBLIC_* env vars in app.config.ts,
//     so the hash would differ between environments (EAS build workers vs a
//     laptop running `eas update`), silently publishing updates under a
//     runtime version no shipped binary embeds
//   - version — the user-facing version string, which is bumped with zero
//     native changes and must not sever update compatibility
//
// Neither affects native binary compatibility: extra.* travels with each
// update bundle itself, and the version string is cosmetic. Skip both so the
// fingerprint only changes when something native-relevant changes.
module.exports = {
  sourceSkips: ["ExpoConfigVersions", "ExpoConfigExtraSection"],
};
