/**
 * Guards app.config.ts's public-env checks.
 *
 * The config must stay evaluable for the passes that only read metadata --
 * eas-cli resolves the project by evaluating it BEFORE injecting the
 * environment chosen with --environment, so a hard throw deadlocked env:pull,
 * env:exec, build:view and channel:view on a clean checkout -- while still
 * refusing to resolve for anything that bakes the values into a bundle.
 *
 * These cases pin that decision table in both directions. The strict side is
 * the one that matters: it is all that stands between a missing value and a
 * shipped binary (the v1.6-1.7 incident).
 */
import * as path from "path";

const CONFIG_PATH = path.resolve(__dirname, "../../app.config.ts");

const REQUIRED = ["EXPO_PUBLIC_SUPABASE_URL", "EXPO_PUBLIC_SUPABASE_ANON_KEY"] as const;

// argv[1] is the entry point that loaded the config; argv[2] its subcommand.
const ARGV = {
  expoConfig: ["/usr/bin/node", "/repo/node_modules/expo/bin/cli", "config", "--json"],
  expoExport: ["/usr/bin/node", "/repo/node_modules/.bin/expo", "export", "-p", "web"],
  expoStart: ["/usr/bin/node", "/repo/node_modules/.bin/expo", "start"],
  fingerprint: [
    "/usr/bin/node",
    "/repo/node_modules/@expo/fingerprint/build/ExpoConfigLoader.js",
    "/repo/mobile-app",
  ],
  unknown: ["/usr/bin/node", "/repo/scripts/something-else.js"],
};

type PublicEnv = { supabaseUrl: string; supabaseAnonKey: string; lnfUrl?: string };
// The real parameter is expo/config's ConfigContext; this config ignores it.
type ConfigFn = (ctx: unknown) => { extra?: { publicEnv?: PublicEnv } };

function loadConfig(): ConfigFn {
  // Required lazily so each case sees the argv/env set up by the test. The
  // module itself is cached; collectPublicEnv() reads process.env per call.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(CONFIG_PATH).default as ConfigFn;
}

function evaluate() {
  // The config ignores its context argument, so an empty object exercises it.
  return loadConfig()({});
}

describe("app.config public-env guard", () => {
  const originalArgv = process.argv;
  const originalEnv = { ...process.env };
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    // dotenv-flow populates process.env at import time from any local .env, so
    // clear the keys explicitly rather than trusting the ambient environment.
    for (const key of REQUIRED) delete process.env[key];
    delete process.env.EAS_BUILD_PROFILE;
  });

  afterEach(() => {
    warn.mockRestore();
    process.argv = originalArgv;
    process.env = { ...originalEnv };
  });

  describe("values missing", () => {
    it("resolves for `expo config`, which only prints", () => {
      process.argv = ARGV.expoConfig;
      const publicEnv = evaluate().extra?.publicEnv;
      expect(publicEnv).toEqual({ supabaseUrl: "", supabaseAnonKey: "" });
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("metadata only"));
    });

    it("resolves for @expo/fingerprint's config loader", () => {
      // extra.publicEnv is skipped by fingerprint.config.js, so an empty one
      // cannot move the runtime version.
      process.argv = ARGV.fingerprint;
      expect(evaluate().extra?.publicEnv).toEqual({ supabaseUrl: "", supabaseAnonKey: "" });
    });

    it("throws for `expo export`, which bundles", () => {
      process.argv = ARGV.expoExport;
      expect(evaluate).toThrow(/Missing environment variables for build/);
    });

    it("throws for `expo start`", () => {
      process.argv = ARGV.expoStart;
      expect(evaluate).toThrow(/Missing environment variables for build/);
    });

    it("throws for an unrecognized entry point, so the default stays safe", () => {
      process.argv = ARGV.unknown;
      expect(evaluate).toThrow(/Missing environment variables for build/);
    });

    it("throws on an EAS builder even for `expo config`", () => {
      process.argv = ARGV.expoConfig;
      process.env.EAS_BUILD_PROFILE = "production";
      expect(evaluate).toThrow(/Missing environment variables for build/);
    });

    it("names every missing key, not just the first", () => {
      process.argv = ARGV.expoExport;
      expect(evaluate).toThrow(/EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY/);
    });

    it("treats a whitespace-only value as missing", () => {
      process.argv = ARGV.expoExport;
      process.env.EXPO_PUBLIC_SUPABASE_URL = "   ";
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
      expect(evaluate).toThrow(/EXPO_PUBLIC_SUPABASE_URL/);
    });
  });

  describe('unexpanded "${VAR}"', () => {
    // Never legitimate anywhere: EAS does not interpolate ${} in eas.json env
    // blocks, and the literal text shipped as v1.6-1.7's Supabase URL.
    it.each([
      ["expo config", ARGV.expoConfig],
      ["@expo/fingerprint", ARGV.fingerprint],
      ["expo export", ARGV.expoExport],
    ])("throws for %s", (_label, argv) => {
      process.argv = argv;
      process.env.EXPO_PUBLIC_SUPABASE_URL = "${EXPO_PUBLIC_SUPABASE_URL}";
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
      expect(evaluate).toThrow(/Unexpanded environment variables for build/);
    });

    it("is reported as unexpanded rather than missing", () => {
      process.argv = ARGV.expoConfig;
      process.env.EXPO_PUBLIC_SUPABASE_URL = "${EXPO_PUBLIC_SUPABASE_URL}";
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
      expect(evaluate).toThrow(/Unexpanded/);
      expect(evaluate).not.toThrow(/Missing environment/);
    });
  });

  describe("values present", () => {
    beforeEach(() => {
      process.env.EXPO_PUBLIC_SUPABASE_URL = "  https://example.supabase.co  ";
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    });

    it("trims and passes them through, with no warning", () => {
      process.argv = ARGV.expoExport;
      expect(evaluate().extra?.publicEnv).toMatchObject({
        supabaseUrl: "https://example.supabase.co",
        supabaseAnonKey: "anon-key",
      });
      expect(warn).not.toHaveBeenCalled();
    });

    it("drops an optional value that is itself unexpanded", () => {
      process.argv = ARGV.expoExport;
      process.env.EXPO_PUBLIC_LNF_URL = "${EXPO_PUBLIC_LNF_URL}";
      expect(evaluate().extra?.publicEnv?.lnfUrl).toBeUndefined();
    });
  });
});
