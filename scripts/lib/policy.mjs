const BRANCH_PATTERN = /^(feature|fix|hotfix)\/(\d+)-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CLOSING_REFERENCE_PATTERN =
  /(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)/gi;

export function closingIssueNumbers(body = "") {
  return [...body.matchAll(CLOSING_REFERENCE_PATTERN)].map((match) => Number(match[1]));
}

export function branchDetails(branch) {
  const match = BRANCH_PATTERN.exec(branch);
  return match
    ? { type: match[1], issueNumber: Number(match[2]) }
    : null;
}

export function validateRoute({ base, head, labels = [] }) {
  const isBackport = labels.includes("backport");
  const valid =
    (base === "dev" &&
      ((isBackport && /^(?:hotfix|backport)\//.test(head)) ||
        /^(?:feature|fix)\//.test(head))) ||
    (base === "release" &&
      (head === "dev" ||
        (isBackport && /^(?:hotfix|backport)\//.test(head)))) ||
    (base === "prod" && (head === "release" || /^hotfix\//.test(head)));

  if (!valid) {
    throw new Error(`Pull requests from "${head}" to "${base}" are not allowed`);
  }

  return {
    requiresIssue:
      /^(?:feature|fix)\//.test(head) || (base === "prod" && /^hotfix\//.test(head)),
    isBackport
  };
}

export function validateIssueLink({ branch, body }) {
  const details = branchDetails(branch);
  if (!details) {
    throw new Error(
      `Branch "${branch}" must match feature/<issue>-description, fix/<issue>-description, or hotfix/<issue>-description`
    );
  }

  const references = closingIssueNumbers(body);
  if (!references.includes(details.issueNumber)) {
    throw new Error(
      `PR body must close branch issue #${details.issueNumber} with Closes, Fixes, or Resolves`
    );
  }

  return details;
}

export function validateIssueMetadata(issue, expectedType) {
  if (issue.pull_request) {
    throw new Error(`#${issue.number} is a pull request, not a tracking issue`);
  }
  if (!issue.milestone) {
    throw new Error(`Issue #${issue.number} must be assigned to a milestone`);
  }

  const labels = issue.labels.map((label) =>
    typeof label === "string" ? label : label.name
  );
  const expectedLabel = `type:${expectedType}`;
  if (!labels.includes(expectedLabel)) {
    throw new Error(`Issue #${issue.number} must have the "${expectedLabel}" label`);
  }
}
