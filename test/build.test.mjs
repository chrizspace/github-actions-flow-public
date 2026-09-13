import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { spawn } from "node:child_process";

const repositoryRoot = new URL("..", import.meta.url);

function runBuild(outputDirectory) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["scripts/build.mjs"], {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        OUTPUT_DIR: relative(repositoryRoot.pathname, outputDirectory),
        DEPLOY_ENVIRONMENT: "test",
        BRANCH_NAME: "feature/42-demo",
        COMMIT_SHA: "1234567890abcdef",
        BUILD_TIMESTAMP: "2026-01-02T03:04:05.000Z"
      }
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      code === 0 ? resolve() : reject(new Error(stderr));
    });
  });
}

test("build injects immutable deployment metadata", async () => {
  const directory = await mkdtemp(join(tmpdir(), "actions-flow-"));

  try {
    await runBuild(directory);
    const html = await readFile(join(directory, "index.html"), "utf8");
    const metadata = JSON.parse(await readFile(join(directory, "build.json"), "utf8"));
    const version = (await readFile(new URL("VERSION", repositoryRoot), "utf8")).trim();

    assert.match(html, new RegExp(`v${version.replaceAll(".", "\\.")}`));
    assert.match(html, /feature\/42-demo/);
    assert.doesNotMatch(html, /\{\{[A-Z_]+\}\}/);
    assert.deepEqual(metadata, {
      VERSION: version,
      ENVIRONMENT: "test",
      BRANCH: "feature/42-demo",
      COMMIT: "1234567890ab",
      BUILT_AT: "2026-01-02T03:04:05.000Z"
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
