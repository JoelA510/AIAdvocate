// Regression guard for the v1.6–1.7 boot-death mode: importing the supabase
// module must NEVER throw, even when runtime config is missing/unexpanded —
// it falls back to an inert sentinel client so _layout can mount and render
// the Configuration Error screen (which re-throws via initConfig()).

describe("lib/supabase with broken config", () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock("../config");
    jest.dontMock("@react-native-async-storage/async-storage");
    jest.restoreAllMocks();
  });

  it("module import survives a getConfig() throw and exports a client", () => {
    jest.resetModules();
    // jest resolves ../supabase to supabase.native.ts, whose AsyncStorage
    // import needs the official mock (no global setup file provides it).
    jest.doMock("@react-native-async-storage/async-storage", () =>
      require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
    );
    jest.doMock("../config", () => ({
      __esModule: true,
      getConfig: () => {
        throw new Error("Missing or unexpanded environment variables: supabaseUrl");
      },
      initConfig: () => {
        throw new Error("Missing or unexpanded environment variables: supabaseUrl");
      },
    }));
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});

    let mod: typeof import("../supabase") | undefined;
    expect(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      mod = require("../supabase");
    }).not.toThrow();

    expect(mod?.supabase).toBeDefined();
    expect(typeof mod?.supabase.auth.getSession).toBe("function");
    expect(consoleError).toHaveBeenCalled();
  });
});
