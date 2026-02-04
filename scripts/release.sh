#!/bin/bash

# =============================================================================
# GoodVibes Plugin Release Script
# =============================================================================
# Usage:
#   ./scripts/release.sh          # patch bump (1.0.57 -> 1.0.58)
#   ./scripts/release.sh patch    # patch bump (1.0.57 -> 1.0.58)
#   ./scripts/release.sh minor    # minor bump (1.0.57 -> 1.1.0)
#   ./scripts/release.sh major    # major bump (1.0.57 -> 2.0.0)
#   ./scripts/release.sh --dry-run          # preview patch bump
#   ./scripts/release.sh minor --dry-run    # preview minor bump
#   ./scripts/release.sh --no-git           # skip git commit/tag/push
#   ./scripts/release.sh --skip-build       # skip build step
#   ./scripts/release.sh --skip-reinstall   # skip plugin reinstall
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
PLUGIN_DIR="$PROJECT_ROOT/plugins/goodvibes"
PACKAGE_JSON="$PLUGIN_DIR/package.json"
PLUGIN_JSON="$PLUGIN_DIR/.claude-plugin/plugin.json"

# Colors
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
MAGENTA='\033[0;35m'
NC='\033[0m'

# Parse arguments
BUMP_TYPE="patch"
DRY_RUN=false
NO_GIT=false
SKIP_BUILD=false
SKIP_REINSTALL=false

for arg in "$@"; do
  case $arg in
    major|minor|patch)
      BUMP_TYPE="$arg"
      ;;
    --dry-run)
      DRY_RUN=true
      ;;
    --no-git)
      NO_GIT=true
      ;;
    --skip-build)
      SKIP_BUILD=true
      ;;
    --skip-reinstall)
      SKIP_REINSTALL=true
      ;;
    --help|-h)
      echo "Usage: $0 [major|minor|patch] [--dry-run] [--no-git] [--skip-build] [--skip-reinstall]"
      echo ""
      echo "  patch (default)  Increment patch version: 1.0.57 -> 1.0.58"
      echo "  minor            Increment minor version: 1.0.57 -> 1.1.0"
      echo "  major            Increment major version: 1.0.57 -> 2.0.0"
      echo "  --dry-run        Preview changes without modifying files"
      echo "  --no-git         Skip git commit, tag, and push"
      echo "  --skip-build     Skip the build step"
      echo "  --skip-reinstall Skip plugin reinstall at the end"
      exit 0
      ;;
    *)
      echo -e "${RED}Unknown argument: $arg${NC}"
      echo "Use --help for usage information"
      exit 1
      ;;
  esac
done

# Get current version from package.json
CURRENT_VERSION=$(grep '"version":' "$PACKAGE_JSON" | head -1 | sed 's/.*"version": *"\([^"]*\)".*/\1/')

if [[ ! $CURRENT_VERSION =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo -e "${RED}Error: Could not parse version from package.json (got: $CURRENT_VERSION)${NC}"
  exit 1
fi

# Parse version components
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"

# Calculate new version
case $BUMP_TYPE in
  major)
    NEW_MAJOR=$((MAJOR + 1))
    NEW_MINOR=0
    NEW_PATCH=0
    ;;
  minor)
    NEW_MAJOR=$MAJOR
    NEW_MINOR=$((MINOR + 1))
    NEW_PATCH=0
    ;;
  patch)
    NEW_MAJOR=$MAJOR
    NEW_MINOR=$MINOR
    NEW_PATCH=$((PATCH + 1))
    ;;
esac

NEW_VERSION="$NEW_MAJOR.$NEW_MINOR.$NEW_PATCH"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "  ${MAGENTA}GoodVibes Plugin Release${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo -e "  Bump type:       ${CYAN}$BUMP_TYPE${NC}"
echo -e "  Current version: ${YELLOW}$CURRENT_VERSION${NC}"
echo -e "  New version:     ${GREEN}$NEW_VERSION${NC}"
echo ""

if $DRY_RUN; then
  echo -e "  ${YELLOW}[DRY RUN] No changes will be made${NC}"
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  exit 0
fi

# Step 1: Update version files
echo -e "${CYAN}[1/7] Updating version files...${NC}"
sed -i "s/\"version\": \"$CURRENT_VERSION\"/\"version\": \"$NEW_VERSION\"/" "$PACKAGE_JSON"
echo -e "  ${GREEN}Updated package.json${NC}"

if [[ -f "$PLUGIN_JSON" ]]; then
  sed -i "s/\"version\": \"$CURRENT_VERSION\"/\"version\": \"$NEW_VERSION\"/" "$PLUGIN_JSON"
  echo -e "  ${GREEN}Updated plugin.json${NC}"
fi

# Step 2: Build (optional)
if ! $SKIP_BUILD; then
  echo ""
  echo -e "${CYAN}[2/7] Building...${NC}"
  
  cd "$PLUGIN_DIR"
  
  echo -e "  Building registries..."
  npx tsx scripts/build-registries.ts > /dev/null 2>&1 || {
    echo -e "  ${RED}Failed to build registries${NC}"
    exit 1
  }
  echo -e "  ${GREEN}Registries built${NC}"
  
  echo -e "  Building hooks..."
  if [[ -d "hooks/scripts" ]]; then
    pushd hooks/scripts > /dev/null
    npm install --silent > /dev/null 2>&1
    npm run build > /dev/null 2>&1 || {
      echo -e "  ${RED}Failed to build hooks${NC}"
      popd > /dev/null
      exit 1
    }
    popd > /dev/null
    echo -e "  ${GREEN}Hooks built${NC}"
  fi
  
  echo -e "  Building MCP servers..."
  SERVERS=("precision-engine" "batch-engine" "registry-engine" "analysis-engine" "project-engine" "frontend-engine")
  for SERVER in "${SERVERS[@]}"; do
    if [[ -d "tools/implementations/$SERVER" ]]; then
      pushd "tools/implementations/$SERVER" > /dev/null
      npm install --silent > /dev/null 2>&1
      npm run build > /dev/null 2>&1 || {
        echo -e "  ${RED}Failed to build $SERVER${NC}"
        popd > /dev/null
        exit 1
      }
      popd > /dev/null
    fi
  done
  echo -e "  ${GREEN}MCP servers built${NC}"
  
  cd "$PROJECT_ROOT"
else
  echo ""
  echo -e "${YELLOW}[2/7] Skipping build (--skip-build)${NC}"
fi

# Step 3: Git operations
if ! $NO_GIT; then
  echo ""
  echo -e "${CYAN}[3/7] Staging changes...${NC}"
  git add -A
  echo -e "  ${GREEN}Changes staged${NC}"
  
  echo ""
  echo -e "${CYAN}[4/7] Committing...${NC}"
  git commit -m "chore: bump version to $NEW_VERSION"
  echo -e "  ${GREEN}Committed${NC}"
  
  echo ""
  echo -e "${CYAN}[5/7] Creating tag v$NEW_VERSION...${NC}"
  git tag -a "v$NEW_VERSION" -m "Release v$NEW_VERSION"
  echo -e "  ${GREEN}Tag created${NC}"
  
  echo ""
  echo -e "${CYAN}[6/7] Pushing to remote...${NC}"
  git push && git push --tags
  echo -e "  ${GREEN}Pushed${NC}"
  
  # GitHub Release
  echo ""
  echo -e "${CYAN}[7/7] Creating GitHub release...${NC}"
  
  if ! command -v gh &> /dev/null; then
    echo -e "  ${YELLOW}WARNING: gh CLI not installed. Skipping GitHub release.${NC}"
  else
    # Get previous tag
    PREV_TAG=$(git describe --tags --abbrev=0 HEAD^ 2>/dev/null || echo "")
    
    # Gather context for Claude
    if [[ -n "$PREV_TAG" ]]; then
      COMMIT_LOG=$(git log --oneline "$PREV_TAG"..HEAD 2>/dev/null)
      DIFF_STAT=$(git diff --stat "$PREV_TAG"..HEAD 2>/dev/null | tail -20)
      CHANGED_FILES=$(git diff --name-only "$PREV_TAG"..HEAD 2>/dev/null)
    else
      COMMIT_LOG=$(git log --oneline -20 2>/dev/null)
      DIFF_STAT=$(git diff --stat HEAD~20..HEAD 2>/dev/null | tail -20)
      CHANGED_FILES=$(git diff --name-only HEAD~20..HEAD 2>/dev/null)
    fi
    
    echo -e "  Generating release notes with Claude..."
    
    RELEASE_PROMPT="Generate release notes for GoodVibes Plugin v$NEW_VERSION.

Previous version: ${PREV_TAG:-\"(first release)\"}
New version: v$NEW_VERSION
Bump type: $BUMP_TYPE

## Recent commits:
$COMMIT_LOG

## Files changed:
$CHANGED_FILES

## Diff stats:
$DIFF_STAT

Write professional release notes in markdown with these sections:
1. Summary (2-3 sentences)
2. What's New (features, improvements)
3. Bug Fixes (if any)
4. Breaking Changes (if any, otherwise omit)
5. Upgrade Notes (brief instructions)

Be concise but informative. Focus on user-facing changes."

    RELEASE_NOTES=$(echo "$RELEASE_PROMPT" | claude -p 2>/dev/null || echo "")
    
    if [[ -z "$RELEASE_NOTES" ]]; then
      echo -e "  ${YELLOW}Claude generation failed, using auto-generated notes${NC}"
      gh release create "v$NEW_VERSION" \
        --title "GoodVibes Plugin v$NEW_VERSION" \
        --generate-notes
    else
      echo -e "  Creating release with Claude-generated notes..."
      gh release create "v$NEW_VERSION" \
        --title "GoodVibes Plugin v$NEW_VERSION" \
        --notes "$RELEASE_NOTES"
    fi
    
    echo -e "  ${GREEN}GitHub release created!${NC}"
  fi
else
  echo ""
  echo -e "${YELLOW}[3-7/7] Skipping git operations (--no-git)${NC}"
fi

# Step 8: Reinstall plugin (optional)
if ! $SKIP_REINSTALL && ! $NO_GIT; then
  echo ""
  echo -e "${CYAN}Reinstalling plugin...${NC}"
  
  echo -e "  Uninstalling..."
  claude plugin uninstall goodvibes@goodvibes-market > /dev/null 2>&1 || true
  claude plugin marketplace remove goodvibes-market > /dev/null 2>&1 || true
  
  echo -e "  Adding marketplace..."
  claude plugin marketplace add mgd34msu/goodvibes-plugin > /dev/null 2>&1 || {
    echo -e "  ${RED}Failed to add marketplace${NC}"
    exit 1
  }
  
  echo -e "  Installing plugin..."
  claude plugin install goodvibes@goodvibes-market > /dev/null 2>&1 || {
    echo -e "  ${RED}Failed to install plugin${NC}"
    exit 1
  }
  
  echo -e "  ${GREEN}Plugin reinstalled!${NC}"
elif $SKIP_REINSTALL; then
  echo ""
  echo -e "${YELLOW}Skipping plugin reinstall (--skip-reinstall)${NC}"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "  ${GREEN}Release v$NEW_VERSION complete!${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
