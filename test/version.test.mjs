import test from "node:test";
import assert from "node:assert/strict";
import { bumpVersion, parseVersion, rcVersion } from "../scripts/lib/version.mjs";

test("bumps each supported version segment and resets lower segments", () => {
  assert.equal(bumpVersion("1.7.4", "patch"), "1.7.5");
  assert.equal(bumpVersion("1.7.4", "minor"), "1.8.0");
  assert.equal(bumpVersion("1.7.4", "major"), "2.0.0");
});

test("formats release candidates without changing the base version", () => {
  assert.equal(rcVersion("1.8.0", 3), "1.8.0-rc.3");
});

test("rejects malformed versions and invalid bump levels", () => {
  assert.throws(() => parseVersion("v1.2.3"), /Invalid version/);
  assert.throws(() => parseVersion("1.02.3"), /Invalid version/);
  assert.throws(() => bumpVersion("1.2.3", "banana"), /Unsupported bump level/);
  assert.throws(() => rcVersion("1.2.3", 0), /positive integer/);
});
