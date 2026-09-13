#!/usr/bin/env node

import { validateIssueLink } from "./lib/policy.mjs";

const milestoneNumber = Number(process.argv[2]);
const repository = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;

if (!Number.isSafeInteger(milestoneNumber) || milestoneNumber < 1) {
  throw new Error("Usage: node scripts/validate-milestone.mjs <milestone-number>");
}
if (!repository || !token) {
  throw new Error("GITHUB_REPOSITORY and GITHUB_TOKEN are required");
}

async function github(path) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "github-actions-flow-poc",
      "X-GitHub-Api-Version": "2022-11-28"
    }
  });
  if (!response.ok) {
    throw new Error(`GitHub API ${path} failed: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

const comparison = await github(`/repos/${repository}/compare/release...dev`);
const commits = comparison.commits;
if (comparison.total_commits > commits.length) {
  throw new Error(
    `Release validation is limited to ${commits.length} commits; promote milestones more frequently`
  );
}

const messages = commits.map((commit) => commit.commit.message);
const pullRequests = new Map();

for (const commit of commits) {
  const associated = await github(
    `/repos/${repository}/commits/${commit.sha}/pulls`
  );
  const devPullRequest = associated.find(
    (pullRequest) => pullRequest.base.ref === "dev" && pullRequest.merged_at
  );

  if (devPullRequest) {
    pullRequests.set(devPullRequest.number, devPullRequest);
    continue;
  }

  const actor = commit.author?.login || commit.committer?.login;
  const automatedVersionCommit =
    actor === "github-actions[bot]" &&
    /^chore\(version\): bump to \d+\.\d+\.\d+ after PR #\d+/m.test(
      commit.commit.message
    );
  if (!automatedVersionCommit) {
    throw new Error(
      `Commit ${commit.sha.slice(0, 12)} is not associated with a merged Dev PR`
    );
  }
}

let qualifyingPullRequests = 0;
for (const pullRequest of pullRequests.values()) {
  const labels = pullRequest.labels.map((label) => label.name);
  if (labels.includes("backport")) {
    continue;
  }

  const branch = validateIssueLink({
    branch: pullRequest.head.ref,
    body: pullRequest.body || ""
  });
  const issue = await github(
    `/repos/${repository}/issues/${branch.issueNumber}`
  );

  if (issue.milestone?.number !== milestoneNumber) {
    throw new Error(
      `PR #${pullRequest.number} belongs to milestone ${
        issue.milestone ? `#${issue.milestone.number}` : "(none)"
      }, not closing milestone #${milestoneNumber}`
    );
  }

  const hasPatchBump = messages.some((message) =>
    message.split("\n", 1)[0].endsWith(`after PR #${pullRequest.number}`)
  );
  if (!hasPatchBump) {
    throw new Error(
      `Dev PATCH bump for PR #${pullRequest.number} has not completed; rerun after Dev integration finishes`
    );
  }
  qualifyingPullRequests += 1;
}

if (qualifyingPullRequests === 0) {
  throw new Error(`Milestone #${milestoneNumber} has no releasable Dev pull requests`);
}

console.log(
  `Validated ${qualifyingPullRequests} Dev pull request(s) for milestone #${milestoneNumber}`
);
