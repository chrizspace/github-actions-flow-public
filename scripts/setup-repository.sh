#!/usr/bin/env bash

set -euo pipefail

if ! command -v gh >/dev/null 2>&1 || ! command -v jq >/dev/null 2>&1; then
  echo "gh and jq are required." >&2
  exit 1
fi

repository="${REPOSITORY:-$(gh repo view --json nameWithOwner --jq .nameWithOwner)}"
production_reviewer="${PRODUCTION_REVIEWER:-}"
backport_token="${BACKPORT_TOKEN:-}"
warnings=()

if [[ -z "$production_reviewer" ]]; then
  echo "Set PRODUCTION_REVIEWER to the GitHub username that approves Production." >&2
  exit 1
fi
if [[ -z "$backport_token" ]]; then
  echo "Set BACKPORT_TOKEN to a fine-grained token with Pull requests: write." >&2
  exit 1
fi

default_sha="$(gh api "repos/${repository}/git/ref/heads/main" --jq .object.sha)"

ensure_branch() {
  local branch="$1"
  if ! gh api "repos/${repository}/git/ref/heads/${branch}" >/dev/null 2>&1; then
    gh api --method POST "repos/${repository}/git/refs" \
      -f "ref=refs/heads/${branch}" \
      -f "sha=${default_sha}" >/dev/null
    echo "Created ${branch}."
  fi
}

ensure_environment_branch() {
  local environment="$1"
  local branch="$2"
  local existing
  existing="$(
    gh api "repos/${repository}/environments/${environment}/deployment-branch-policies" \
      --paginate --jq '.branch_policies[].name' 2>/dev/null || true
  )"
  if ! grep -Fxq "$branch" <<<"$existing"; then
    gh api --method POST \
      "repos/${repository}/environments/${environment}/deployment-branch-policies" \
      -f "name=${branch}" -f type=branch >/dev/null
  fi
}

for branch in dev release prod; do
  ensure_branch "$branch"
done
gh api --method PATCH "repos/${repository}" \
  -f default_branch=dev \
  -F allow_merge_commit=true \
  -F allow_squash_merge=true \
  -F allow_rebase_merge=false \
  -F delete_branch_on_merge=true >/dev/null

gh label create "type:feature" --repo "$repository" --color 1f883d \
  --description "New functionality" --force
gh label create "type:fix" --repo "$repository" --color d4c5f9 \
  --description "Non-critical bug fix" --force
gh label create "type:hotfix" --repo "$repository" --color b60205 \
  --description "Urgent production fix" --force
gh label create "backport" --repo "$repository" --color fbca04 \
  --description "Automated no-version-bump backport" --force

reviewer_id="$(gh api "users/${production_reviewer}" --jq .id)"
environment_policy='{"protected_branches":false,"custom_branch_policies":true}'

gh api --method PUT "repos/${repository}/environments/dev" \
  --input - <<<"$(jq -n --argjson policy "$environment_policy" \
    '{deployment_branch_policy: $policy}')" >/dev/null
ensure_environment_branch dev dev

gh api --method PUT "repos/${repository}/environments/uat" \
  --input - <<<"$(jq -n --argjson policy "$environment_policy" \
    '{deployment_branch_policy: $policy}')" >/dev/null
ensure_environment_branch uat dev

production_payload="$(
  jq -n --argjson policy "$environment_policy" --argjson reviewer "$reviewer_id" '{
    prevent_self_review: true,
    reviewers: [{type: "User", id: $reviewer}],
    deployment_branch_policy: $policy
  }'
)"
if ! production_error="$(
  gh api --method PUT "repos/${repository}/environments/production" \
    --input - <<<"$production_payload" 2>&1
)"; then
  if grep -Fq "billing plan supports the required reviewers" <<<"$production_error"; then
    warnings+=(
      "Required reviewers are unavailable on this billing plan; workflow_dispatch remains the Production gate."
    )
    gh api --method PUT "repos/${repository}/environments/production" \
      --input - <<<"$(jq -n --argjson policy "$environment_policy" \
        '{deployment_branch_policy: $policy}')" >/dev/null
  else
    echo "$production_error" >&2
    exit 1
  fi
fi
ensure_environment_branch production release

gh api --method PUT "repos/${repository}/environments/production-hotfix" \
  --input - <<<"$(jq -n --argjson policy "$environment_policy" \
    '{deployment_branch_policy: $policy}')" >/dev/null
ensure_environment_branch production-hotfix prod

if gh api "repos/${repository}/pages" >/dev/null 2>&1; then
  if ! pages_error="$(
    gh api --method PUT "repos/${repository}/pages" \
      -f build_type=workflow 2>&1
  )"; then
    warnings+=("GitHub Pages could not be configured: ${pages_error}")
  fi
else
  if ! pages_error="$(
    gh api --method POST "repos/${repository}/pages" \
      -f build_type=workflow 2>&1
  )"; then
    warnings+=(
      "GitHub Pages is unavailable. Private repositories require a supporting paid plan, or the repository must be public."
    )
  fi
fi

if rulesets_json="$(gh api "repos/${repository}/rulesets" 2>&1)"; then
  actions_app_id="${ACTIONS_APP_ID:-$(gh api /apps/github-actions --jq .id)}"
  ruleset_payload="$(mktemp)"
  trap 'rm -f "$ruleset_payload"' EXIT
  jq -n --argjson actions_app_id "$actions_app_id" '{
    name: "protected-promotion-branches",
    target: "branch",
    enforcement: "active",
    bypass_actors: [{
      actor_id: $actions_app_id,
      actor_type: "Integration",
      bypass_mode: "always"
    }],
    conditions: {
      ref_name: {
        include: ["refs/heads/dev", "refs/heads/release", "refs/heads/prod"],
        exclude: []
      }
    },
    rules: [
      {type: "deletion"},
      {type: "non_fast_forward"},
      {
        type: "pull_request",
        parameters: {
          allowed_merge_methods: ["merge", "squash"],
          dismiss_stale_reviews_on_push: true,
          require_code_owner_review: true,
          require_last_push_approval: true,
          required_approving_review_count: 1,
          required_review_thread_resolution: true
        }
      },
      {
        type: "required_status_checks",
        parameters: {
          do_not_enforce_on_create: true,
          strict_required_status_checks_policy: true,
          required_status_checks: [
            {context: "PR policy"},
            {context: "Test and build"}
          ]
        }
      }
    ]
  }' > "$ruleset_payload"

  ruleset_id="$(
    jq -r '.[] | select(.name == "protected-promotion-branches") | .id' \
      <<<"$rulesets_json" | head -n 1
  )"
  if [[ -n "$ruleset_id" ]]; then
    gh api --method PUT "repos/${repository}/rulesets/${ruleset_id}" \
      --input "$ruleset_payload" >/dev/null
  else
    gh api --method POST "repos/${repository}/rulesets" \
      --input "$ruleset_payload" >/dev/null
  fi
else
  warnings+=(
    "Repository rulesets are unavailable on this plan; long-lived branches remain unprotected."
  )
fi

gh secret set RELEASE_TOKEN --repo "$repository" --body "$backport_token"

echo "Configured ${repository}."
echo "The default branch is dev; normal production promotion must be dispatched from release."
if (( ${#warnings[@]} > 0 )); then
  printf '\nConfiguration warnings:\n' >&2
  printf -- '- %s\n' "${warnings[@]}" >&2
fi
