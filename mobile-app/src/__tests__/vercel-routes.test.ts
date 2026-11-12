// The web build is a static export (app.json web.output "static"): every
// route is written as <route>.html, and a dynamic route as a single
// "[param].html" shell. Vercel serves neither at its real URL without help,
// so a direct visit or a refresh on /saved or /bill/123 returned 404 while
// in-app navigation worked. vercel.json fixes that with cleanUrls (for
// /saved -> saved.html) and one rewrite per dynamic route. This keeps the two
// in step: a new dynamic route without a rewrite fails here, not in
// production.

import fs from "fs";
import path from "path";

const appDir = path.join(__dirname, "..", "..", "app");
const vercel = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "..", "vercel.json"), "utf8"),
) as {
  cleanUrls?: boolean;
  rewrites?: { source: string; destination: string }[];
};

const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });

// app/(tabs)/advocacy/legislator/[id].tsx -> /advocacy/legislator/[id]
const routeOf = (file: string): string =>
  "/" +
  path
    .relative(appDir, file)
    .replace(/\.tsx$/, "")
    .split(path.sep)
    .filter((segment) => !/^\(.+\)$/.test(segment))
    .join("/");

// (tabs)/index/legislator/[id] sits under a directory that shares its name
// with the (tabs)/index route; the export emits no page for it (checked on
// the deployed site), so there is nothing to rewrite to.
const NOT_EXPORTED = new Set(["/index/legislator/[id]"]);

const dynamicRoutes = walk(appDir)
  .filter((file) => file.endsWith(".tsx") && /\[[^\]]+\]/.test(file))
  .map(routeOf)
  .filter((route) => !NOT_EXPORTED.has(route));

describe("vercel.json serves the static export's routes", () => {
  const rewrites = vercel.rewrites ?? [];

  it("serves <route>.html at /<route>", () => {
    expect(vercel.cleanUrls).toBe(true);
  });

  it("finds the dynamic routes it is meant to guard", () => {
    expect(dynamicRoutes).toEqual(
      expect.arrayContaining(["/bill/[id]", "/legislator/[id]", "/advocacy/legislator/[id]"]),
    );
  });

  it.each(dynamicRoutes)("rewrites %s to its exported shell", (route) => {
    const source = route.replace(/\[([^\]]+)\]/g, ":$1");
    expect(rewrites).toContainEqual({ source, destination: route });
  });

  it("has no rewrite pointing at a route that does not exist", () => {
    for (const { destination } of rewrites) {
      expect(dynamicRoutes).toContain(destination);
    }
  });
});
