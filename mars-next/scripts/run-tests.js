#!/usr/bin/env node
const { spawnSync } = require("node:child_process");
const { readdirSync, existsSync } = require("node:fs");
const { join, resolve } = require("node:path");
const tsxBin = require.resolve("tsx/cli");

const testsRoot = join(__dirname, "..", "tests");

/**
 * Recursively collects test files under the tests directory that satisfy the
 * provided predicate.
 */
function collectTests(root, predicate) {
  const entries = readdirSync(root, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = join(root, entry.name);

    if (entry.isDirectory()) {
      files.push(...collectTests(fullPath, predicate));
    } else if (predicate(fullPath, entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
}

const argv = process.argv.slice(2);
const passthrough = [];
const patterns = [];

for (const arg of argv) {
  if (arg === "--runInBand") {
    // Preserve the intent of Jest's --runInBand flag by limiting Node's test
    // runner to a single worker. Passing the Jest flag through directly causes
    // Node to treat it as a CLI option and exit early with "bad option".
    passthrough.push("--test-concurrency=1");
    continue;
  }

  if (arg.startsWith("-")) {
    passthrough.push(arg);
    continue;
  }

  if (existsSync(arg) || existsSync(resolve(arg))) {
    patterns.push(arg);
    continue;
  }

  const matches = collectTests(testsRoot, (_, name) => name === arg);
  if (matches.length > 0) {
    patterns.push(...matches);
    continue;
  }

  patterns.push(arg);
}

const tsxArgs = ["--test", ...passthrough];
if (patterns.length > 0) {
  tsxArgs.push(...patterns);
} else {
  tsxArgs.push(...collectTests(testsRoot, (fullPath) => fullPath.endsWith(".test.ts")));
}

const result = spawnSync("node", [tsxBin, ...tsxArgs], { stdio: "inherit" });
if (result.error) {
  console.error(result.error);
  process.exit(1);
}
process.exit(result.status ?? 1);
