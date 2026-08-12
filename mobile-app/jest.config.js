// mobile-app/jest.config.js
module.exports = {
  preset: "jest-expo",
  // No `testEnvironment` override. jest-expo 57 inherits a custom environment
  // from @react-native/jest-preset, and forcing plain "node" broke Expo's
  // "winter" runtime, which installs web-standard globals through a lazy Proxy
  // — every suite died with "trying to require a file outside of the scope of
  // the test code".
  // No `setupFilesAfterEnv`. It used to load
  // "@testing-library/jest-native/extend-expect"; that package is deprecated,
  // its matchers were folded into @testing-library/react-native in v12.4, and
  // from v13 on they register automatically — there is no extend-expect entry
  // point left to load, so keeping it fails config validation outright.
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  testPathIgnorePatterns: ["/node_modules/", "__tests_DISABLED__"],
  // No `transformIgnorePatterns` override either. The old hand-maintained copy
  // required an exact path segment (`...|react-native|...)/`), so every
  // `react-native-*` package had to be listed by name. SDK 57's preset matches
  // on prefix instead, so react-native-paper / -toast-message / -url-polyfill /
  // -worklets are all covered, and it additionally allows packages the local
  // copy never knew about (@expo-google-fonts, standard-navigation, .pnpm).
  // Deferring to the preset keeps that list current for free.
  // Coverage settings
  collectCoverage: true,
  coverageDirectory: "<rootDir>/coverage",
  coverageReporters: ["json", "lcov", "text", "clover"],
  coverageThreshold: {
    global: {
      branches: 30,
      functions: 30,
      lines: 30,
      statements: 30,
    },
  },
};
