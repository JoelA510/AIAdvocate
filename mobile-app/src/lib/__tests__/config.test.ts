describe("config", () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock("expo-constants");
    jest.dontMock("expo-updates");
  });

  function loadConfig(publicEnv: Record<string, unknown> | null): typeof import("../config") {
    jest.resetModules();
    jest.doMock("expo-constants", () => ({
      __esModule: true,
      default: {
        expoConfig: publicEnv ? { extra: { publicEnv } } : { extra: {} },
        manifest: null,
      },
    }));
    jest.doMock("expo-updates", () => ({
      __esModule: true,
      manifest: null,
    }));

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("../config");
  }

  it("does not require public provider API keys", () => {
    const { getConfig } = loadConfig({
      supabaseUrl: "https://test.supabase.co",
      supabaseAnonKey: "anon-test-key",
      recaptchaSiteKey: "recaptcha-site-key",
      firebaseWebConfigJson: "{}",
      lnfUrl: "https://example.com",
    });

    expect(getConfig()).toEqual({
      supabaseUrl: "https://test.supabase.co",
      supabaseAnonKey: "anon-test-key",
      recaptchaSiteKey: "recaptcha-site-key",
      firebaseWebConfigJson: "{}",
      lnfUrl: "https://example.com",
    });
  });

  it("keeps missing-env errors scoped to current public client config", () => {
    const { getConfig } = loadConfig({
      supabaseUrl: "https://test.supabase.co",
    });

    expect(() => getConfig()).toThrow("supabaseAnonKey");
    expect(() => getConfig()).not.toThrow("OpenStates");
    expect(() => getConfig()).not.toThrow("LocationIQ");
  });
});
