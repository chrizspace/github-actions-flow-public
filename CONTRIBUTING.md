# Contributing

This repository demonstrates a promotion-based delivery model. `dev`, `release`,
and `prod` are protected, long-lived branches. Work always starts with an issue.

## Start work

1. Create a Feature, Fix, or Production hotfix issue.
2. Assign it to a milestone. Prefix the milestone title with `Major: ` only when
   closing it should advance the major version; every other milestone advances
   the minor version.
3. Create the branch with the issue number:
   - `feature/123-short-description` from `dev`
   - `fix/123-short-description` from `dev`
   - `hotfix/123-short-description` from `prod`
4. Open a pull request with `Closes #123` in its body.

The CI policy job rejects an invalid source/target pair, a malformed branch
name, a missing closing reference, an issue without a milestone, or an issue
without the matching `type:feature`, `type:fix`, or `type:hotfix` label.

Keep only one milestone's unreleased feature/fix work on `dev` at a time. The
milestone workflow compares `release...dev` and refuses to promote if any
qualifying PR belongs to a different milestone or its PATCH bump is unfinished.

## Merge and release behavior

| Route | Merge method | Result |
|---|---|---|
| `feature/*` or `fix/*` → `dev` | Squash | PATCH bump and Dev artifact |
| `dev` → `release` | Merge commit, automated on milestone close | MINOR/MAJOR bump, RC tag, and UAT artifact |
| `release` → `prod` | Merge commit, automated after approval | Final tag, GitHub Release, and Pages deployment |
| `hotfix/*` → `prod` | Merge commit | PATCH bump, immediate Pages deployment, and backport PRs |
| `backport/*` → `release`/`dev` | Merge commit | Code sync without another version bump |

Backport PRs carry the `backport` label and are excluded from versioning. Do
not add the label to normal work.

## Production promotion

After UAT validates the latest RC:

1. Open **Actions → Promote to production**.
2. Choose the `release` branch and click **Run workflow**.
3. When the repository plan supports Environment protection, a configured
   reviewer approves the `production` deployment.

No version is entered. The workflow selects the latest RC that belongs to
`release`, verifies it against `VERSION`, promotes it to `prod`, publishes its
issue-derived release notes, and deploys GitHub Pages.
