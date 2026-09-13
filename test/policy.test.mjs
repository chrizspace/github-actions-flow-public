import test from "node:test";
import assert from "node:assert/strict";
import {
  branchDetails,
  closingIssueNumbers,
  validateIssueLink,
  validateIssueMetadata,
  validateRoute
} from "../scripts/lib/policy.mjs";

test("accepts the supported promotion routes", () => {
  assert.equal(
    validateRoute({ base: "dev", head: "feature/42-demo" }).requiresIssue,
    true
  );
  assert.equal(
    validateRoute({ base: "release", head: "dev" }).requiresIssue,
    false
  );
  assert.equal(
    validateRoute({ base: "prod", head: "release" }).requiresIssue,
    false
  );
  assert.equal(
    validateRoute({ base: "prod", head: "hotfix/9-urgent" }).requiresIssue,
    true
  );
});

test("requires the backport label for reverse promotion routes", () => {
  assert.throws(
    () => validateRoute({ base: "dev", head: "hotfix/9-urgent" }),
    /not allowed/
  );
  assert.equal(
    validateRoute({
      base: "dev",
      head: "hotfix/9-urgent",
      labels: ["backport"]
    }).isBackport,
    true
  );
});

test("validates branch naming and matching closing references", () => {
  assert.deepEqual(branchDetails("feature/123-add-login"), {
    type: "feature",
    issueNumber: 123
  });
  assert.deepEqual(closingIssueNumbers("Fixes #7 and resolves #9"), [7, 9]);
  assert.deepEqual(
    validateIssueLink({
      branch: "fix/7-correct-copy",
      body: "Fixes #7"
    }),
    { type: "fix", issueNumber: 7 }
  );
  assert.throws(
    () => validateIssueLink({ branch: "fix/no-issue", body: "Fixes #7" }),
    /must match/
  );
  assert.throws(
    () => validateIssueLink({ branch: "fix/7-correct-copy", body: "Fixes #8" }),
    /must close branch issue/
  );
});

test("requires milestone and matching issue type", () => {
  assert.doesNotThrow(() =>
    validateIssueMetadata(
      {
        number: 42,
        milestone: { title: "Sprint 1" },
        labels: [{ name: "type:feature" }]
      },
      "feature"
    )
  );
  assert.throws(
    () =>
      validateIssueMetadata(
        { number: 42, milestone: null, labels: [{ name: "type:feature" }] },
        "feature"
      ),
    /milestone/
  );
  assert.throws(
    () =>
      validateIssueMetadata(
        { number: 42, milestone: { title: "Sprint 1" }, labels: [] },
        "feature"
      ),
    /type:feature/
  );
  assert.throws(
    () =>
      validateIssueMetadata(
        {
          number: 42,
          pull_request: {},
          milestone: { title: "Sprint 1" },
          labels: [{ name: "type:feature" }]
        },
        "feature"
      ),
    /not a tracking issue/
  );
});
