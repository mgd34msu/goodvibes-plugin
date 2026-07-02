#!/usr/bin/env bash
#
# check-registry-fresh.sh
#
# Rebuilds the generated registry indexes and fails when the four
# _registry.yaml files differ from the working tree afterwards -- i.e.
# someone changed agents/skills/templates/tools content without re-running
# the registry build, or the build is non-deterministic.
#
# Requires dev deps installed in plugins/goodvibes (tsx, js-yaml), e.g.:
#   (cd plugins/goodvibes && npm ci --include=dev --ignore-scripts)
#
# NOTE: meant for a clean working tree (CI checkouts are). Pre-existing
# uncommitted edits to the registry files will be reported as staleness.
#
# Usage: bash scripts/check-registry-fresh.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

REGISTRY_FILES=(
  plugins/goodvibes/agents/_registry.yaml
  plugins/goodvibes/skills/_registry.yaml
  plugins/goodvibes/templates/_registry.yaml
  plugins/goodvibes/tools/_registry.yaml
)

echo "Rebuilding registries..."
(cd "$REPO_ROOT/plugins/goodvibes" && npx tsx scripts/build-registries.ts)

cd "$REPO_ROOT"
if git diff --quiet -- "${REGISTRY_FILES[@]}"; then
  echo "OK: registry files are fresh (rebuild produced no changes)."
else
  echo ""
  echo "FAIL: registry files are stale. Rebuild changed:"
  git --no-pager diff --stat -- "${REGISTRY_FILES[@]}"
  echo ""
  echo "Run 'npm run build:registries' inside plugins/goodvibes and commit the result."
  exit 1
fi
