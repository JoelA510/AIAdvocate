const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const FORBIDDEN_PATTERNS = [
  ["EXPO_PUBLIC", "OPENSTATES_API_KEY"].join("_"),
  ["EXPO_PUBLIC", "LOCATIONIQ_API_KEY"].join("_"),
];

const IGNORED_PATH_SEGMENTS = new Set([
  ".expo",
  ".git",
  "build",
  "coverage",
  "dist",
  "node_modules",
]);

const IGNORED_PATHS = new Set(["mobile-app/project_context.txt"]);
const MARKDOWN_EXTENSIONS = new Set([".md", ".mdx"]);
const BINARY_EXTENSIONS = new Set([
  ".aiff",
  ".bin",
  ".bmp",
  ".br",
  ".db",
  ".eot",
  ".gif",
  ".gz",
  ".heic",
  ".ico",
  ".jar",
  ".jpeg",
  ".jpg",
  ".keystore",
  ".mov",
  ".mp3",
  ".mp4",
  ".otf",
  ".pdf",
  ".png",
  ".sqlite",
  ".tgz",
  ".ttf",
  ".wasm",
  ".wav",
  ".webp",
  ".woff",
  ".woff2",
  ".zip",
]);

const ALLOWED_MARKDOWN_PATTERNS = [
  /\b(forbidden|removed|deleted|rotated|disallowed)\b/i,
  /\b(must not|should not|do not|don't|never)\s+(?:be\s+)?(?:use|used|set|store|stored|add|added|configure|configured|require|required|expose|exposed)\b/i,
];

function repoRoot() {
  return execFileSync("git", ["rev-parse", "--show-toplevel"], {
    encoding: "utf8",
  }).trim();
}

function trackedFiles(rootDir) {
  const output = execFileSync("git", ["ls-files", "-z"], {
    cwd: rootDir,
    encoding: "utf8",
  });

  return output.split("\0").filter(Boolean);
}

function hasIgnoredSegment(filePath) {
  return filePath
    .split(path.posix.sep)
    .some((segment) => IGNORED_PATH_SEGMENTS.has(segment));
}

function isBinaryFile(filePath) {
  return BINARY_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function shouldScan(filePath) {
  return (
    !IGNORED_PATHS.has(filePath) &&
    !hasIgnoredSegment(filePath) &&
    !isBinaryFile(filePath)
  );
}

function isMarkdown(filePath) {
  return MARKDOWN_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function isAllowedMarkdownLine(line) {
  return ALLOWED_MARKDOWN_PATTERNS.some((pattern) => pattern.test(line));
}

function scanText(filePath, text) {
  const findings = [];
  const lines = text.split(/\r?\n/);
  const markdown = isMarkdown(filePath);

  lines.forEach((line, index) => {
    FORBIDDEN_PATTERNS.forEach((pattern) => {
      if (
        line.includes(pattern) &&
        !(markdown && isAllowedMarkdownLine(line))
      ) {
        findings.push({
          filePath,
          line: index + 1,
          pattern,
        });
      }
    });
  });

  return findings;
}

function scanFiles(rootDir, files) {
  const findings = [];
  const readFailures = [];

  files.forEach((filePath) => {
    if (!shouldScan(filePath)) {
      return;
    }

    const absolutePath = path.join(rootDir, filePath);
    try {
      const text = fs.readFileSync(absolutePath, "utf8");
      findings.push(...scanText(filePath, text));
    } catch (error) {
      readFailures.push({
        filePath,
        reason: error && error.code ? error.code : "READ_ERROR",
      });
    }
  });

  return { findings, readFailures };
}

function runSelfTest() {
  const [firstPattern, secondPattern] = FORBIDDEN_PATTERNS;
  const failingClientResult = scanText(
    "mobile-app/app.config.ts",
    `const keyName = "${firstPattern}";`,
  );
  const allowedDocResult = scanText(
    "docs/security.md",
    `The ${firstPattern} variable is forbidden in Expo client config.`,
  );
  const allowedMustNotResult = scanText(
    "docs/security.md",
    `${secondPattern} must not be used in Expo client config.`,
  );
  const failingDocResult = scanText(
    "docs/setup.md",
    `Set ${secondPattern} before building the app.`,
  );
  const failingEnvTemplateResult = scanText(
    "mobile-app/.env.example",
    `${firstPattern}=`,
  );
  const envTemplateIsScanned = shouldScan("mobile-app/.env.example");
  const trackedEnvIsScanned = shouldScan("mobile-app/.env.production");
  const binaryAssetIsIgnored = !shouldScan("mobile-app/assets/icon.png");
  const staleReminderIsFlagged = scanText(
    "docs/setup.md",
    `Do not forget to set ${secondPattern}.`,
  );

  if (failingClientResult.length !== 1) {
    throw new Error("Self-test failed: client-code violation was not detected.");
  }

  if (allowedDocResult.length !== 0) {
    throw new Error("Self-test failed: allowed documentation warning was flagged.");
  }

  if (allowedMustNotResult.length !== 0) {
    throw new Error("Self-test failed: must-not-use documentation was flagged.");
  }

  if (failingDocResult.length !== 1) {
    throw new Error("Self-test failed: stale documentation requirement was not detected.");
  }

  if (failingEnvTemplateResult.length !== 1) {
    throw new Error("Self-test failed: env template violation was not detected.");
  }

  if (!envTemplateIsScanned) {
    throw new Error("Self-test failed: env templates are not scanned.");
  }

  if (!trackedEnvIsScanned) {
    throw new Error("Self-test failed: tracked env files are not scanned.");
  }

  if (!binaryAssetIsIgnored) {
    throw new Error("Self-test failed: binary assets are not ignored.");
  }

  if (staleReminderIsFlagged.length !== 1) {
    throw new Error("Self-test failed: stale reminder wording was not detected.");
  }

  console.log("Public env guardrail self-test passed.");
}

function main() {
  if (process.argv.includes("--self-test")) {
    runSelfTest();
    return;
  }

  const rootDir = repoRoot();
  const { findings, readFailures } = scanFiles(rootDir, trackedFiles(rootDir));

  if (findings.length === 0 && readFailures.length === 0) {
    console.log("Public env guardrail passed.");
    return;
  }

  if (findings.length > 0) {
    console.error(
      "Forbidden public provider env names were found in tracked files:",
    );
    findings.forEach((finding) => {
      console.error(`${finding.filePath}:${finding.line} ${finding.pattern}`);
    });
  }

  if (readFailures.length > 0) {
    console.error("Unable to scan these tracked files:");
    readFailures.forEach((failure) => {
      console.error(`${failure.filePath} ${failure.reason}`);
    });
  }

  process.exit(1);
}

if (require.main === module) {
  main();
}

module.exports = {
  FORBIDDEN_PATTERNS,
  isAllowedMarkdownLine,
  scanText,
  shouldScan,
};
