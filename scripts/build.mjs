#!/usr/bin/env node

import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { parseVersion } from "./lib/version.mjs";

const root = resolve(import.meta.dirname, "..");
const source = resolve(root, "site");
const destination = resolve(root, process.env.OUTPUT_DIR || "dist");
const version = (await readFile(resolve(root, "VERSION"), "utf8")).trim();
parseVersion(version);

function currentCommit() {
  if (process.env.COMMIT_SHA) {
    return process.env.COMMIT_SHA;
  }

  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch {
    return process.env.GITHUB_SHA || "working-tree";
  }
}

const metadata = {
  VERSION: version,
  ENVIRONMENT: process.env.DEPLOY_ENVIRONMENT || "local",
  BRANCH: process.env.BRANCH_NAME || process.env.GITHUB_REF_NAME || "local",
  COMMIT: currentCommit().slice(0, 12),
  BUILT_AT: process.env.BUILD_TIMESTAMP || new Date().toISOString()
};

await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
await cp(source, destination, { recursive: true });

const indexPath = resolve(destination, "index.html");
let index = await readFile(indexPath, "utf8");

for (const [key, value] of Object.entries(metadata)) {
  index = index.replaceAll(`{{${key}}}`, value);
}

const unresolved = index.match(/\{\{[A-Z_]+\}\}/g);
if (unresolved) {
  throw new Error(`Unresolved build placeholders: ${unresolved.join(", ")}`);
}

await writeFile(indexPath, index);
await writeFile(resolve(destination, "build.json"), `${JSON.stringify(metadata, null, 2)}\n`);
console.log(`Built ${metadata.ENVIRONMENT} v${version} in ${destination}`);
