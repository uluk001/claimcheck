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

target=()
if [ -n "${FORGE_SITE:-}" ]; then
  target=(--site "$FORGE_SITE")
else
  echo "No FORGE_SITE variable set, using the Forge demo site"
  forge site provision
  target=(--demo-site)
fi

for product in jira confluence; do
  if ! forge install "${target[@]}" --product "$product" -e "$FORGE_ENV" --upgrade --confirm-scopes --non-interactive; then
    forge install "${target[@]}" --product "$product" -e "$FORGE_ENV" --confirm-scopes --non-interactive || \
      echo "::warning::Could not install in $product"
  fi
done

forge install list -e "$FORGE_ENV" || true
