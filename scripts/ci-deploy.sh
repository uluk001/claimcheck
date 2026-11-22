#!/usr/bin/env bash
# Registers the app on first run, deploys it, and installs it in Jira and Confluence.
# Credentials come from the FORGE_EMAIL and FORGE_API_TOKEN environment variables.
set -euo pipefail

forge() { npx --no-install forge "$@"; }

forge settings set usage-analytics false
forge whoami

if grep -q 'app/00000000-0000-0000-0000-000000000000' manifest.yml; then
  echo "Registering a new Forge app"
  if [ -n "${FORGE_DEVELOPER_SPACE_ID:-}" ]; then
    forge register "Claim Check" --accept-terms --developer-space-id "$FORGE_DEVELOPER_SPACE_ID"
  else
    # forge register asks for a Developer Space name, which needs a terminal.
    command -v expect >/dev/null || (sudo apt-get update -qq && sudo apt-get install -y -qq expect >/dev/null)
    expect scripts/register.exp
  fi
  if grep -q 'app/00000000-0000-0000-0000-000000000000' manifest.yml; then
    echo "::error::App registration did not update manifest.yml"
    exit 1
  fi
  git config user.name "${GIT_AUTHOR_NAME:-Ulukman}"
  git config user.email "${GIT_AUTHOR_EMAIL:-96724618+uluk001@users.noreply.github.com}"
  git add manifest.yml
  git commit -m "Register Forge app"
  git push
fi

forge deploy -e "$FORGE_ENV" --non-interactive

if [ "$FORGE_ENV" = "production" ]; then
  # Production is installed through the app's sharing link, not on the test site.
  echo "Deployed to production. Install it with the sharing link from the developer console."
  exit 0
fi

target=()
if [ -n "${FORGE_SITE:-}" ]; then
  target=(--site "$FORGE_SITE")
else
  echo "No FORGE_SITE variable set, using the Forge demo site"
  forge site provision
  target=(--demo-site)
fi

install_into() {
  local product="$1"
  forge install "${target[@]}" --product "$product" -e "$FORGE_ENV" --upgrade --confirm-scopes --non-interactive 2>/dev/null && return 0
  forge install "${target[@]}" --product "$product" -e "$FORGE_ENV" --confirm-scopes --non-interactive
}

# Jira is the required app, so it has to be installed before Confluence.
if install_into jira; then
  install_into confluence || echo "::warning::Could not install in Confluence"
else
  echo "::error::Could not install in Jira. If the demo site is still being provisioned, run the workflow again in a few minutes."
  exit 1
fi

forge install list || true
