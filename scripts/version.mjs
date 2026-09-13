#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { bumpVersion, parseVersion, rcVersion } from "./lib/version.mjs";

function usage() {
  console.error(
    "Usage: node scripts/version.mjs <validate|bump|rc> [patch|minor|major] [--file PATH] [--write] [--number N]"
  );
}

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

async function main() {
  const command = process.argv[2];
  const file = option("--file", "VERSION");
  const current = (await readFile(file, "utf8")).trim();
  let next;

  if (command === "validate") {
    parseVersion(current);
    next = current;
  } else if (command === "bump") {
    next = bumpVersion(current, process.argv[3]);
  } else if (command === "rc") {
    next = rcVersion(current, Number(option("--number", "1")));
  } else {
    usage();
    process.exitCode = 2;
    return;
  }

  if (process.argv.includes("--write")) {
    if (command === "rc") {
      throw new Error("RC versions are tags and must not be written to VERSION");
    }
    await writeFile(file, `${next}\n`);
  }

  process.stdout.write(`${next}\n`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
