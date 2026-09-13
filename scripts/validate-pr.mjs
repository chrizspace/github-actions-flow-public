#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import {
  validateIssueLink,
  validateIssueMetadata,
  validateRoute
} from "./lib/policy.mjs";

async function githubIssue(repository, issueNumber, token) {
  const response = await fetch(
    `https://api.github.com/repos/${repository}/issues/${issueNumber}`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "github-actions-flow-poc",
        "X-GitHub-Api-Version": "2022-11-28"
      }
    }
  );

  if (!response.ok) {
    throw new Error(
      `Unable to load issue #${issueNumber}: ${response.status} ${response.statusText}`
    );
  }

  return response.json();
}

async function main() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  const repository = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;

  if (!eventPath || !repository || !token) {
    throw new Error("GITHUB_EVENT_PATH, GITHUB_REPOSITORY, and GITHUB_TOKEN are required");
  }

  const event = JSON.parse(await readFile(eventPath, "utf8"));
  const pullRequest = event.pull_request;
  if (!pullRequest) {
    throw new Error("The event payload does not contain a pull_request");
  }

  const labels = pullRequest.labels.map((label) => label.name);
  const route = validateRoute({
    base: pullRequest.base.ref,
    head: pullRequest.head.ref,
    labels
  });

  if (!route.requiresIssue) {
    console.log(
      `Validated promotion/backport route ${pullRequest.head.ref} -> ${pullRequest.base.ref}`
    );
    return;
  }

  const branch = validateIssueLink({
    branch: pullRequest.head.ref,
    body: pullRequest.body || ""
  });
  const issue = await githubIssue(repository, branch.issueNumber, token);
  validateIssueMetadata(issue, branch.type);
  console.log(
    `Validated ${pullRequest.head.ref} -> ${pullRequest.base.ref} against issue #${issue.number} and milestone "${issue.milestone.title}"`
  );
}

main().catch((error) => {
  console.error(`Policy check failed: ${error.message}`);
  process.exitCode = 1;
});
