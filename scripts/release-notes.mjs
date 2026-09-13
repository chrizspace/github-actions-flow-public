#!/usr/bin/env node

import { writeFile } from "node:fs/promises";

const [milestoneArgument, outputPath = "release-notes.md"] = process.argv.slice(2);
const milestoneNumber = Number(milestoneArgument);
const repository = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;

if (!Number.isSafeInteger(milestoneNumber) || milestoneNumber < 1) {
  throw new Error("Usage: node scripts/release-notes.mjs <milestone-number> [output]");
}
if (!repository || !token) {
  throw new Error("GITHUB_REPOSITORY and GITHUB_TOKEN are required");
}

const headings = [
  ["type:feature", "Features"],
  ["type:fix", "Fixes"],
  ["type:hotfix", "Hotfixes"]
];
const grouped = new Map(headings.map(([label]) => [label, []]));
grouped.set("other", []);

for (let page = 1; ; page += 1) {
  const url = new URL(`https://api.github.com/repos/${repository}/issues`);
  url.searchParams.set("milestone", String(milestoneNumber));
  url.searchParams.set("state", "all");
  url.searchParams.set("per_page", "100");
  url.searchParams.set("page", String(page));

  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "github-actions-flow-poc",
      "X-GitHub-Api-Version": "2022-11-28"
    }
  });
  if (!response.ok) {
    throw new Error(`Unable to load milestone issues: ${response.status} ${response.statusText}`);
  }

  const responseItems = await response.json();
  const issues = responseItems.filter((issue) => !issue.pull_request);
  for (const issue of issues) {
    const labels = issue.labels.map((label) =>
      typeof label === "string" ? label : label.name
    );
    const category =
      headings.find(([label]) => labels.includes(label))?.[0] || "other";
    grouped.get(category).push(issue);
  }

  if (responseItems.length < 100) {
    break;
  }
}

const sections = [];
for (const [label, title] of [...headings, ["other", "Other changes"]]) {
  const issues = grouped.get(label);
  if (issues.length === 0) {
    continue;
  }

  sections.push(
    `## ${title}\n\n${issues
      .sort((left, right) => left.number - right.number)
      .map((issue) => `- ${issue.title} ([#${issue.number}](${issue.html_url}))`)
      .join("\n")}`
  );
}

const notes =
  sections.length > 0
    ? `${sections.join("\n\n")}\n`
    : "No categorized issues were found for this milestone.\n";
await writeFile(outputPath, notes);
console.log(`Wrote release notes for milestone #${milestoneNumber} to ${outputPath}`);
