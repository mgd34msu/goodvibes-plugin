#!/usr/bin/env bash
# Release the goodvibes plugin.
#
# Usage: ./scripts/release.sh [patch|minor|major] [--dry-run] [--no-git] [--skip-build] [--skip-reinstall]
#
# The pipeline (the same one every 2.0.x release ran by hand):
#   1. Preconditions: on main, clean tree, CHANGELOG section for the new version.
#   2. Bump plugins/goodvibes/.claude-plugin/plugin.json and
#      .claude-plugin/marketplace.json in lockstep.
#   3. npm run build (all three server bundles; committed, CI byte-diffs them).
#   4. Gates: tsc --noEmit x4, vitest run, check-versions, claude plugin validate.
#   5. Commit, tag vX.Y.Z, push main + tags.
#   6. gh release create with the version's CHANGELOG section as notes.
#   7. claude plugin marketplace update + plugin update (the local dogfood copy).
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; NC='\033[0m'
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

BUMP="${1:-patch}"
DRY_RUN=false; NO_GIT=false; SKIP_BUILD=false; SKIP_REINSTALL=false
for arg in "${@:2}"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    --no-git) NO_GIT=true ;;
    --skip-build) SKIP_BUILD=true ;;
    --skip-reinstall) SKIP_REINSTALL=true ;;
    *) echo -e "${RED}Unknown flag: $arg${NC}"; exit 1 ;;
  esac
done
case "$BUMP" in patch|minor|major) ;; *) echo -e "${RED}Usage: release.sh [patch|minor|major] [flags]${NC}"; exit 1 ;; esac

PLUGIN_JSON="plugins/goodvibes/.claude-plugin/plugin.json"
MARKETPLACE_JSON=".claude-plugin/marketplace.json"

CURRENT="$(node -p "JSON.parse(require('fs').readFileSync('$PLUGIN_JSON','utf8')).version")"
NEXT="$(node -e "
const [ma, mi, pa] = '$CURRENT'.split('.').map(Number);
const bump = '$BUMP';
console.log(bump === 'major' ? \`\${ma + 1}.0.0\` : bump === 'minor' ? \`\${ma}.\${mi + 1}.0\` : \`\${ma}.\${mi}.\${pa + 1}\`);
")"
echo -e "${CYAN}Release: $CURRENT -> $NEXT ($BUMP)${NC}"

# ── 1. Preconditions ────────────────────────────────────────────────────────
if ! $NO_GIT; then
  BRANCH="$(git rev-parse --abbrev-ref HEAD)"
  if [[ "$BRANCH" != "main" ]]; then echo -e "${RED}Not on main (on $BRANCH).${NC}"; exit 1; fi
  if [[ -n "$(git status --porcelain)" ]]; then echo -e "${RED}Working tree not clean.${NC}"; exit 1; fi
fi
if ! grep -q "^## \[$NEXT\]" CHANGELOG.md; then
  echo -e "${RED}CHANGELOG.md has no '## [$NEXT]' section — write the changelog first.${NC}"; exit 1
fi

if $DRY_RUN; then echo -e "${YELLOW}Dry run: would bump to $NEXT, build, gate, tag v$NEXT, release.${NC}"; exit 0; fi

# ── 2. Bump both manifests ──────────────────────────────────────────────────
node -e "
const fs = require('fs');
for (const [file, patch] of [
  ['$PLUGIN_JSON', (m) => { m.version = '$NEXT'; }],
  ['$MARKETPLACE_JSON', (m) => { m.plugins.find((p) => p.name === 'goodvibes').version = '$NEXT'; }],
]) {
  const m = JSON.parse(fs.readFileSync(file, 'utf8'));
  patch(m);
  fs.writeFileSync(file, JSON.stringify(m, null, 2) + '\n');
}
"
echo -e "${GREEN}Manifests bumped to $NEXT${NC}"

# ── 3. Build ────────────────────────────────────────────────────────────────
if ! $SKIP_BUILD; then
  echo -e "${CYAN}Building server bundles...${NC}"
  npm run build
fi

# ── 4. Gates ────────────────────────────────────────────────────────────────
echo -e "${CYAN}Gates...${NC}"
for pkg in core intel analytics connect; do
  npx tsc --noEmit -p "packages/$pkg"
done
echo -e "${GREEN}tsc x4 clean${NC}"
npx vitest run
node scripts/check-versions.mjs
claude plugin validate ./plugins/goodvibes

# ── 5. Commit, tag, push ────────────────────────────────────────────────────
if ! $NO_GIT; then
  git add -A
  git commit -m "release: v$NEXT"
  git tag "v$NEXT"
  git push origin main --tags
  echo -e "${GREEN}Pushed main + v$NEXT${NC}"

  # ── 6. GitHub release from the CHANGELOG section ──────────────────────────
  NOTES_FILE="$(mktemp)"
  awk "/^## \[$NEXT\]/{flag=1; next} /^## \[/{flag=0} flag" CHANGELOG.md > "$NOTES_FILE"
  gh release create "v$NEXT" --latest --title "v$NEXT" --notes-file "$NOTES_FILE"
  rm -f "$NOTES_FILE"
fi

# ── 7. Update the local install ─────────────────────────────────────────────
if ! $SKIP_REINSTALL; then
  claude plugin marketplace update goodvibes-market
  claude plugin update goodvibes@goodvibes-market
  echo -e "${YELLOW}Installed copy updated — restart the session, then run /goodvibes:setup for native deps.${NC}"
fi

echo -e "${GREEN}Released v$NEXT${NC}"
