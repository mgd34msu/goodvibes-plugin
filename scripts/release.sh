#!/usr/bin/env bash
# Release the goodvibes plugin.
#
# Usage: ./scripts/release.sh [patch|minor|major] [--dry-run] [--no-git] [--skip-build] [--skip-reinstall]
#
# The pipeline (the same one every 2.0.x release ran by hand):
#   1. Preconditions: on main, clean tree, CHANGELOG section for the new version.
#   2. Bump plugins/goodvibes/.claude-plugin/plugin.json and
#      .claude-plugin/marketplace.json in lockstep.
#   3. npm run build (all three server bundles + ARTIFACTS.json; committed, CI
#      byte-diffs them).
#   4. Gates: tsc --noEmit x4, vitest run, lint, check-versions, the dist-match
#      rebuild check, validate-plugin, smoke-mcp, claude plugin validate.
#   5. Commit, tag vX.Y.Z, push main + tags.
#   6. Wait for the push CI run on that exact commit to conclude successfully.
#   7. gh release create with the version's CHANGELOG section as notes.
#   8. claude plugin marketplace update + plugin update (the local dogfood copy).
#
# The release is only published after CI on the pushed commit goes green. If CI
# fails, the tag and commit are already on main and this script stops with the
# recovery steps printed rather than shipping a broken release.
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; NC='\033[0m'
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

BUMP="${1:-patch}"
DRY_RUN=false; NO_GIT=false; SKIP_BUILD=false; SKIP_REINSTALL=false
# Overall deadline for the post-push CI wait. The 3-OS smoke matrix is the long
# pole; 30 minutes covers it with room for a queued runner.
CI_WAIT_SECONDS="${CI_WAIT_SECONDS:-1800}"
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
# Every source check-versions asserts must move together; bumping a subset
# fails the gate this script runs four steps later.
node -e "
const fs = require('fs');
const write = (file, m) => fs.writeFileSync(file, JSON.stringify(m, null, 2) + '\n');
const json = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const v = '$NEXT';
const plugin = json('$PLUGIN_JSON'); plugin.version = v; write('$PLUGIN_JSON', plugin);
const market = json('$MARKETPLACE_JSON');
market.plugins.find((p) => p.name === 'goodvibes').version = v; write('$MARKETPLACE_JSON', market);
for (const file of ['package.json',
  'packages/core/package.json', 'packages/intel/package.json',
  'packages/analytics/package.json', 'packages/connect/package.json',
  'plugins/goodvibes/server/intel/package.json',
  'plugins/goodvibes/server/analytics/package.json',
  'plugins/goodvibes/server/connect/package.json']) {
  const m = json(file); m.version = v; write(file, m);
}
for (const file of ['package-lock.json',
  'plugins/goodvibes/server/intel/package-lock.json',
  'plugins/goodvibes/server/analytics/package-lock.json',
  'plugins/goodvibes/server/connect/package-lock.json']) {
  const m = json(file); m.version = v;
  if (m.packages && m.packages['']) m.packages[''].version = v;
  write(file, m);
}
"
echo -e "${GREEN}All version sources bumped to $NEXT${NC}"

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
npm run lint
node scripts/check-versions.mjs

# dist-match, locally, before anything is committed. The release tree is
# intentionally dirty (the bump plus the build above), so this cannot diff
# against HEAD the way CI does. Staging the built tree first and then rebuilding
# on top of it makes `git diff` compare the rebuild against what we just
# produced, which is the same question CI asks: does a rebuild change anything?
if $SKIP_BUILD; then
  echo -e "${YELLOW}--skip-build: dist-match verification skipped, CI will be the first check of the committed bundles.${NC}"
elif $NO_GIT; then
  node scripts/artifact-manifest.mjs --check
  echo -e "${GREEN}artifact manifest matches the built tree${NC}"
else
  git add -A -- plugins/goodvibes
  npm run build
  if ! git diff --exit-code -- plugins/goodvibes; then
    echo -e "${RED}Rebuild changed the plugin tree: the build is not reproducible from these sources.${NC}"
    echo -e "${RED}Nothing has been committed. Investigate the diff above before releasing.${NC}"
    exit 1
  fi
  node scripts/artifact-manifest.mjs --check
  echo -e "${GREEN}dist-match clean: a rebuild reproduces the staged plugin tree byte for byte${NC}"
fi

node scripts/validate-plugin.mjs
node scripts/smoke-mcp.mjs
claude plugin validate ./plugins/goodvibes

# ── 5. Commit, tag, push ────────────────────────────────────────────────────
if ! $NO_GIT; then
  git add -A
  git commit -m "release: v$NEXT"
  git tag "v$NEXT"
  git push origin main --tags
  echo -e "${GREEN}Pushed main + v$NEXT${NC}"

  # ── 6. Wait for CI on the pushed commit ───────────────────────────────────
  # The release must not be published before the shipped artifact has passed
  # the gates on a clean checkout. Local gates ran against a working tree that
  # already had node_modules and built output in it; CI is the honest check.
  RELEASE_SHA="$(git rev-parse HEAD)"
  CI_DEADLINE=$(( $(date +%s) + CI_WAIT_SECONDS ))
  RUN_ID=""
  echo -e "${CYAN}Waiting for CI on $RELEASE_SHA (up to ${CI_WAIT_SECONDS}s)...${NC}"

  while [[ -z "$RUN_ID" && "$(date +%s)" -lt "$CI_DEADLINE" ]]; do
    RUN_ID="$(timeout 300 gh run list --workflow ci.yml --event push --commit "$RELEASE_SHA" \
      --limit 1 --json databaseId --jq '.[0].databaseId // empty' 2>/dev/null || true)"
    [[ -n "$RUN_ID" ]] && break
    sleep 10
  done

  if [[ -z "$RUN_ID" ]]; then
    echo -e "${RED}No CI run appeared for $RELEASE_SHA within ${CI_WAIT_SECONDS}s.${NC}"
    echo -e "${YELLOW}main and tag v$NEXT are already pushed. No GitHub release was created.${NC}"
    echo -e "${YELLOW}Recover: confirm CI at https://github.com/mgd34msu/goodvibes-plugin/actions,${NC}"
    echo -e "${YELLOW}then publish manually with:${NC}"
    echo -e "${YELLOW}  gh release create v$NEXT --latest --title v$NEXT --notes-file <changelog-section>${NC}"
    exit 1
  fi

  CI_STATUS=""; CI_CONCLUSION=""
  while [[ "$(date +%s)" -lt "$CI_DEADLINE" ]]; do
    CI_JSON="$(timeout 300 gh run view "$RUN_ID" --json status,conclusion 2>/dev/null || echo '{}')"
    CI_STATUS="$(node -p "try{JSON.parse(process.argv[1]).status||''}catch{''}" "$CI_JSON")"
    CI_CONCLUSION="$(node -p "try{JSON.parse(process.argv[1]).conclusion||''}catch{''}" "$CI_JSON")"
    [[ "$CI_STATUS" == "completed" ]] && break
    echo -e "${CYAN}  CI run $RUN_ID: ${CI_STATUS:-pending}...${NC}"
    sleep 15
  done

  if [[ "$CI_STATUS" != "completed" || "$CI_CONCLUSION" != "success" ]]; then
    echo -e "${RED}CI did not finish green for v$NEXT (status=${CI_STATUS:-unknown} conclusion=${CI_CONCLUSION:-none}).${NC}"
    echo -e "${YELLOW}main and tag v$NEXT are already pushed. No GitHub release was created,${NC}"
    echo -e "${YELLOW}so nobody can install this version from the marketplace yet.${NC}"
    echo -e "${YELLOW}Recover:${NC}"
    echo -e "${YELLOW}  1. Inspect the failure: gh run view $RUN_ID --log-failed${NC}"
    echo -e "${YELLOW}  2. Fix on main and push; the tag can be moved with:${NC}"
    echo -e "${YELLOW}       git tag -f v$NEXT && git push origin -f v$NEXT${NC}"
    echo -e "${YELLOW}  3. Publish once CI is green:${NC}"
    echo -e "${YELLOW}       gh release create v$NEXT --latest --title v$NEXT --notes-file <changelog-section>${NC}"
    exit 1
  fi
  echo -e "${GREEN}CI run $RUN_ID passed on $RELEASE_SHA${NC}"

  # ── 7. GitHub release from the CHANGELOG section ──────────────────────────
  NOTES_FILE="$(mktemp)"
  awk "/^## \[$NEXT\]/{flag=1; next} /^## \[/{flag=0} flag" CHANGELOG.md > "$NOTES_FILE"
  gh release create "v$NEXT" --latest --title "v$NEXT" --notes-file "$NOTES_FILE"
  rm -f "$NOTES_FILE"
fi

# ── 8. Update the local install ─────────────────────────────────────────────
if ! $SKIP_REINSTALL; then
  claude plugin marketplace update goodvibes-market
  claude plugin update goodvibes@goodvibes-market
  echo -e "${YELLOW}Installed copy updated — restart the session, then run /goodvibes:setup for native deps.${NC}"
fi

echo -e "${GREEN}Released v$NEXT${NC}"
