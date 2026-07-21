#!/usr/bin/env node
/**
 * Repo hygiene gate: secrets must not be tracked; accidental `env` file warned.
 * Exit 0 = clean, 1 = fail.
 */
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const warnings = [];

function trackedFiles() {
  const r = spawnSync("git", ["ls-files", "-z"], {
    cwd: root,
    encoding: "buffer",
    maxBuffer: 20 * 1024 * 1024,
  });
  if (r.status !== 0) {
    failures.push(`git ls-files failed: ${r.stderr?.toString() || r.status}`);
    return [];
  }
  return r.stdout
    .toString("utf8")
    .split("\0")
    .filter(Boolean);
}

const forbiddenTracked = [
  /^\.env$/,
  /^\.env\.(?!example$).+/, // .env.local etc.; allow .env.example
  /^env$/,
  /(^|\/)secrets\//,
  /\.pem$/i,
];

const files = trackedFiles();
for (const f of files) {
  if (forbiddenTracked.some((re) => re.test(f))) {
    failures.push(`tracked secret-like path: ${f}`);
  }
}

if (existsSync(join(root, "env"))) {
  warnings.push(
    "plain file `env` exists — rename to `.env` (gitignore covers `.env` and `/env`)",
  );
}

if (!existsSync(join(root, ".env.example"))) {
  failures.push("missing .env.example");
}

if (existsSync(join(root, ".env"))) {
  console.log("ok: .env present locally (ignored by git)");
} else {
  warnings.push(".env missing — copy from .env.example for live platform smoke");
}

for (const w of warnings) console.warn(`warn: ${w}`);
for (const f of failures) console.error(`fail: ${f}`);

if (failures.length > 0) {
  console.error(`hygiene: ${failures.length} failure(s)`);
  process.exit(1);
}
console.log(`hygiene: ok (${files.length} tracked files checked)`);
process.exit(0);
