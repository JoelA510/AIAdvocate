// Stabilize the fingerprint-based runtime version (expo-updates).
//
// By default @expo/fingerprint hashes the fully-evaluated Expo config, which
// for this app includes two things that must NOT affect OTA compatibility:
//
//   - the entire `extra` object (ExpoConfigExtraSection skips all of it, not
//     just the field below — currently that's extra.publicEnv, extra.eas,
//     and extra.router). extra.publicEnv is injected from EXPO_PUBLIC_* env
//     vars in app.config.ts, so the hash would differ between environments
//     (EAS build workers vs a laptop running `eas update`), silently
//     publishing updates under a runtime version no shipped binary embeds.
//     extra.eas/extra.router are static identifiers, not native-relevant —
//     if that ever changes (e.g. a genuine EAS project migration), treat it
//     as a native change and ship a full build rather than relying on the
//     fingerprint to catch it.
//   - version — the user-facing version string, which is bumped with zero
//     native changes and must not sever update compatibility
//
// Neither affects native binary compatibility: extra.* travels with each
// update bundle itself, and the version string is cosmetic. Skip both so the
// fingerprint only changes when something native-relevant changes.
module.exports = {
  sourceSkips: ["ExpoConfigVersions", "ExpoConfigExtraSection"],
};
