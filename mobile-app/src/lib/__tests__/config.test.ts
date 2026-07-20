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

  it("treats unexpanded ${} placeholders as missing (the v1.6–1.7 eas.json incident)", () => {
    const { getConfig } = loadConfig({
      // EAS passes eas.json env values verbatim — "${VAR}" is never interpolated.
      supabaseUrl: "${EXPO_PUBLIC_SUPABASE_URL}",
      supabaseAnonKey: "${EXPO_PUBLIC_SUPABASE_ANON_KEY}",
    });

    expect(() => getConfig()).toThrow("supabaseUrl");
    expect(() => getConfig()).toThrow("unexpanded");
  });

  it("drops placeholder values in optional fields instead of passing them through", () => {
    const { getConfig } = loadConfig({
      supabaseUrl: "https://test.supabase.co",
      supabaseAnonKey: "anon-test-key",
      recaptchaSiteKey: "${EXPO_PUBLIC_RECAPTCHA_SITE_KEY}",
    });

    expect(getConfig().recaptchaSiteKey).toBeUndefined();
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
