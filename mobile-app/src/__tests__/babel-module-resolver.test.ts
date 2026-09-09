/**
 * Guards the babel.config.js module-resolver options.
 *
 * Metro applies this babel config to node_modules as well as app code. A
 * `root` option therefore leaks into dependency files: with `root: ["./"]`,
 * module-resolver rewrote expo-router's `require(".")` (in
 * build/navigationEvents/navigation.js, which reaches its own sibling index)
 * into `require("../../../../mobile-app")` — the app's entry point, which has
 * no `emit` export. Every navigation dispatch then threw
 * "(0, _1.emit) is not a function": blank screen on web, immediate crash on
 * native for any tab switch or bill tap.
 *
 * These cases pin both halves: dependency specifiers must survive untouched,
 * and the "@"/"~" aliases must still resolve for app code.
 */
import * as path from "path";

import { transformSync } from "@babel/core";

const PROJECT_ROOT = path.resolve(__dirname, "../..");
const CONFIG_FILE = path.join(PROJECT_ROOT, "babel.config.js");

function transform(code: string, filename: string): string {
  const result = transformSync(code, {
    filename,
    cwd: PROJECT_ROOT,
    root: PROJECT_ROOT,
    configFile: CONFIG_FILE,
    babelrc: false,
    // babel-preset-expo needs a caller to pick a platform; the resolver
    // rewrites are platform-independent, so web is as good as any.
    caller: {
      name: "metro",
      // @ts-expect-error -- Babel's caller type is open-ended; Metro sets these.
      platform: "web",
      isDev: false,
      supportsStaticESM: false,
    },
  });

  if (!result?.code) throw new Error(`Babel produced no output for ${filename}`);
  return result.code;
}

const DEPENDENCY_FILE = path.join(
  PROJECT_ROOT,
  "..",
  "node_modules",
  "expo-router",
  "build",
  "navigationEvents",
  "navigation.js",
);

describe("babel module-resolver", () => {
  it('leaves a dependency\'s self-referential require(".") alone', () => {
    const output = transform(`const _1 = require(".");`, DEPENDENCY_FILE);
    expect(output).toContain('require(".")');
    expect(output).not.toContain("mobile-app");
  });

  it("leaves other relative specifiers in dependencies alone", () => {
    const output = transform(
      `require(".."); require("./sibling"); require("../parent/child");`,
      DEPENDENCY_FILE,
    );
    expect(output).toContain('require("..")');
    expect(output).toContain('require("./sibling")');
    expect(output).toContain('require("../parent/child")');
  });

  it("leaves bare package specifiers in dependencies alone", () => {
    const output = transform(`require("react"); require("@expo/vector-icons");`, DEPENDENCY_FILE);
    expect(output).toContain('require("react")');
    expect(output).toContain('require("@expo/vector-icons")');
  });

  it("still resolves the @ and ~ aliases for app code", () => {
    const output = transform(
      `require("@/lib/paths"); require("~/constants/Colors");`,
      path.join(PROJECT_ROOT, "app", "_layout.tsx"),
    );
    expect(output).toContain('require("../src/lib/paths")');
    expect(output).toContain('require("../constants/Colors")');
  });

  it("does not mistake a scoped package for the @ alias", () => {
    const output = transform(
      `require("@react-navigation/elements");`,
      path.join(PROJECT_ROOT, "app", "_layout.tsx"),
    );
    expect(output).toContain('require("@react-navigation/elements")');
  });
});
