---
name: git-workflows
description: Generates PR descriptions, commit messages, release notes, and manages branch strategies, changelog automation, and git hooks. Use when creating pull requests, writing commits, preparing releases, managing branches, or automating changelogs.
---

# Git Workflows

Automated git documentation, branch management, and release automation.

## Quick Start

**Generate PR description:**
```
Create a PR description for the current branch compared to main
```

**Write commit message:**
```
Generate a commit message for my staged changes
```

**Update changelog:**
```
Update the changelog based on commits since the last release
```

## Capabilities

### 1. PR Description Generation

Create comprehensive pull request descriptions from branch diffs.

#### Analysis Process

```bash
# 1. Get branch info
git branch --show-current
git log main..HEAD --oneline

# 2. Get full diff
git diff main...HEAD

# 3. Get changed files
git diff main...HEAD --name-status

# 4. Get commit messages
git log main..HEAD --pretty=format:"%s%n%b"
```

#### PR Description Template

```markdown
## Summary

{1-3 sentences describing what this PR does and why}

## Changes

### Added
- {New features or files}

### Changed
- {Modifications to existing functionality}

### Fixed
- {Bug fixes}

## Testing

- [ ] Unit tests pass
- [ ] Manual testing completed
- [ ] {Specific test scenarios}

## Related Issues

- Closes #{issue_number}
- Related to #{issue_number}

## Checklist

- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Tests added/updated
- [ ] Documentation updated
```

See [templates/pr-description.md](templates/pr-description.md) for more templates.

---

### 2. Commit Message Generation

Create meaningful commit messages from staged changes.

#### Conventional Commits Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**
| Type | When to Use |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `style` | Formatting, no code change |
| `refactor` | Code restructuring |
| `perf` | Performance improvement |
| `test` | Adding/updating tests |
| `chore` | Maintenance tasks |
| `ci` | CI/CD changes |
| `build` | Build system changes |

#### Example Messages

```
feat(auth): add OAuth2 authentication support

- Add Google OAuth provider integration
- Create session management middleware
- Add user profile endpoint

Closes #123
```

```
fix(api): correct pagination offset calculation

The offset was being calculated as page * limit instead of
(page - 1) * limit, causing the first item to be skipped.

Fixes #456
```

---

### 3. Branch Naming Conventions

Enforce consistent branch naming patterns.

#### Naming Patterns

| Pattern | Example | Use Case |
|---------|---------|----------|
| `feature/<ticket>-<description>` | `feature/PROJ-123-user-auth` | New features |
| `fix/<ticket>-<description>` | `fix/PROJ-456-login-error` | Bug fixes |
| `hotfix/<ticket>-<description>` | `hotfix/PROJ-789-security-patch` | Production fixes |
| `release/<version>` | `release/1.2.0` | Release branches |
| `chore/<description>` | `chore/update-dependencies` | Maintenance |

#### Validation Script

```bash
#!/bin/bash
# .git/hooks/pre-push

branch=$(git rev-parse --abbrev-ref HEAD)
pattern="^(feature|fix|hotfix|release|chore)/[a-z0-9-]+$"

if [[ ! $branch =~ $pattern ]]; then
  echo "Branch name '$branch' doesn't match pattern: $pattern"
  echo "Examples: feature/PROJ-123-add-login, fix/PROJ-456-null-check"
  exit 1
fi
```

See [references/branch-strategies.md](references/branch-strategies.md) for strategy comparison.

---

### 4. Changelog Automation

Automatically update CHANGELOG.md from commits.

#### Generation Process

```bash
# Get commits since last tag
git log $(git describe --tags --abbrev=0)..HEAD --pretty=format:"%s|%h|%an" > commits.txt

# Parse conventional commits
# feat: -> Added
# fix: -> Fixed
# docs: -> Documentation
# BREAKING CHANGE: -> Breaking Changes
```

#### Keep a Changelog Format

```markdown
# Changelog

## [Unreleased]

### Added
- New user authentication flow (#123) - @developer

### Changed
- Updated dependencies to latest versions

### Fixed
- Fixed race condition in queue processing (#124)

### Security
- Updated vulnerable dependency xyz to 2.0.0

## [1.2.0] - 2024-01-15

### Added
- Initial release features...

[Unreleased]: https://github.com/owner/repo/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/owner/repo/releases/tag/v1.2.0
```

#### Automation Tools

```bash
# conventional-changelog
npx conventional-changelog-cli -p angular -i CHANGELOG.md -s

# standard-version
npx standard-version

# semantic-release (fully automated)
npx semantic-release
```

---

### 5. Version Bumping from Commits

Determine semantic version from commit history.

#### Semver Detection

| Commit Type | Version Bump |
|-------------|--------------|
| `BREAKING CHANGE:` | Major (1.0.0 -> 2.0.0) |
| `feat:` | Minor (1.0.0 -> 1.1.0) |
| `fix:`, `perf:` | Patch (1.0.0 -> 1.0.1) |

#### Detection Script

```bash
#!/bin/bash
# determine-version.sh

last_tag=$(git describe --tags --abbrev=0 2>/dev/null || echo "v0.0.0")
current=${last_tag#v}

# Check for breaking changes
if git log $last_tag..HEAD --pretty=format:"%s%b" | grep -q "BREAKING CHANGE"; then
  echo "major"
elif git log $last_tag..HEAD --pretty=format:"%s" | grep -qE "^feat(\(.+\))?:"; then
  echo "minor"
else
  echo "patch"
fi
```

#### npm version Integration

```bash
# Automatic version bump based on commits
bump=$(./determine-version.sh)
npm version $bump -m "chore(release): %s"
git push --follow-tags
```

---

### 6. Git Hooks

Pre-commit and commit-msg validation.

#### Pre-commit Hook

```bash
#!/bin/bash
# .git/hooks/pre-commit

# Run linting
npm run lint --silent || {
  echo "Linting failed. Fix errors before committing."
  exit 1
}

# Run type checking
npm run type-check --silent || {
  echo "Type checking failed. Fix errors before committing."
  exit 1
}

# Check for debug statements
if git diff --cached | grep -E "console\.(log|debug)|debugger"; then
  echo "Remove debug statements before committing."
  exit 1
fi

# Check for secrets
if git diff --cached | grep -E "(password|api_key|secret)\s*=\s*['\"][^'\"]+['\"]"; then
  echo "Potential secrets detected. Review before committing."
  exit 1
fi
```

#### Commit-msg Hook

```bash
#!/bin/bash
# .git/hooks/commit-msg

commit_msg=$(cat "$1")
pattern="^(feat|fix|docs|style|refactor|perf|test|chore|ci|build)(\(.+\))?: .{1,72}"

if [[ ! $commit_msg =~ $pattern ]]; then
  echo "Invalid commit message format!"
  echo "Expected: <type>(<scope>): <subject>"
  echo "Example: feat(auth): add login endpoint"
  echo ""
  echo "Types: feat, fix, docs, style, refactor, perf, test, chore, ci, build"
  exit 1
fi
```

See [references/git-hooks.md](references/git-hooks.md) for more hook examples.

---

### 7. Merge Conflict Resolution

Guide for resolving merge conflicts.

#### Common Conflict Patterns

**Same line edited:**
```
<<<<<<< HEAD
const config = { timeout: 5000 };
=======
const config = { timeout: 10000 };
>>>>>>> feature/new-timeout
```

**Resolution options:**
1. Keep ours: `git checkout --ours <file>`
2. Keep theirs: `git checkout --theirs <file>`
3. Manual merge: Edit file and remove markers

#### Resolution Workflow

```bash
# 1. Start merge
git merge feature-branch

# 2. See conflicted files
git status

# 3. Open in merge tool
git mergetool

# 4. After resolving
git add <resolved-files>
git commit
```

#### Prevention Strategies

- Rebase frequently: `git pull --rebase`
- Small, focused branches
- Clear code ownership
- Modular file structure

---

### 8. Rebase and Squash Guidance

Clean up commit history before merging.

#### Interactive Rebase

```bash
# Squash last 5 commits
git rebase -i HEAD~5

# In editor:
pick abc1234 First commit
squash def5678 Second commit
squash ghi9012 Third commit
fixup jkl3456 WIP commit (discard message)
reword mno7890 Final commit (edit message)
```

#### Rebase onto Main

```bash
# Update feature branch with main
git checkout feature-branch
git fetch origin
git rebase origin/main

# If conflicts, resolve then:
git rebase --continue
# Or abort:
git rebase --abort
```

#### Squash Merge

```bash
# Merge with squash (combines all commits)
git checkout main
git merge --squash feature-branch
git commit -m "feat: add user authentication (#123)"
```

---

### 9. Git Bisect Assistance

Find the commit that introduced a bug.

#### Bisect Workflow

```bash
# Start bisect
git bisect start

# Mark current as bad
git bisect bad

# Mark known good commit
git bisect good v1.0.0

# Git checks out middle commit
# Test and mark:
git bisect good  # if works
git bisect bad   # if broken

# Repeat until found
# Git will output: "abc1234 is the first bad commit"

# End bisect
git bisect reset
```

#### Automated Bisect

```bash
# Run test script automatically
git bisect start HEAD v1.0.0
git bisect run npm test

# Or custom script
git bisect run ./check-bug.sh
```

---

### 10. Stale Branch Cleanup

Identify and remove stale branches.

#### List Stale Branches

```bash
# Branches merged into main
git branch --merged main

# Remote branches not updated in 30 days
git for-each-ref --sort=committerdate refs/remotes/ \
  --format='%(committerdate:relative) %(refname:short)' |
  grep -E "months? ago"

# Branches with no remote
git branch -vv | grep ': gone]'
```

#### Cleanup Script

```bash
#!/bin/bash
# cleanup-branches.sh

# Delete merged local branches (except main/develop)
git branch --merged main |
  grep -vE "^\*|main|develop" |
  xargs -r git branch -d

# Prune remote tracking branches
git fetch --prune

# Delete local branches without remote
git branch -vv |
  grep ': gone]' |
  awk '{print $1}' |
  xargs -r git branch -D
```

---

### 11. Branch Strategies

Choose the right branching strategy.

#### GitFlow

```
main ─────────────────────────────────────────
       \                    /
        develop ───────────────────────
         \         /    \         /
          feature/a    feature/b
```

**Best for:** Large teams, scheduled releases

#### Trunk-Based Development

```
main ──●──●──●──●──●──●──●──●──●──
       │  │     │     │
      short-lived branches (< 1 day)
```

**Best for:** Small teams, continuous deployment

#### GitHub Flow

```
main ─────────────────────────────
       \         /    \       /
        feature/a     feature/b
```

**Best for:** Web applications, simple workflow

See [references/branch-strategies.md](references/branch-strategies.md) for detailed comparison.

---

## Release Workflow

### Release Checklist

```markdown
## Release v{version}

### Pre-Release
- [ ] All PRs for release merged
- [ ] CI green on main
- [ ] Version bumped
- [ ] CHANGELOG.md updated
- [ ] Documentation updated

### Release
- [ ] Tag created: git tag -a v{version} -m "Release v{version}"
- [ ] Tag pushed: git push --tags
- [ ] GitHub release created
- [ ] Package published

### Post-Release
- [ ] Announcement posted
- [ ] Documentation site updated
- [ ] Stakeholders notified
```

### GitHub Release Command

```bash
# Create release with notes
gh release create v1.3.0 \
  --title "v1.3.0" \
  --notes-file RELEASE_NOTES.md \
  --target main

# Auto-generate notes from PRs
gh release create v1.3.0 --generate-notes
```

---

## Hook Integration

### PreToolUse Hook - Commit Message Validation

Before commits, validate message format:

```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "Bash",
      "command": "validate-commit.sh",
      "condition": "contains(input, 'git commit')"
    }]
  }
}
```

**Script example:**
```bash
#!/bin/bash
# validate-commit.sh

# Extract commit message from command
message=$(echo "$INPUT" | grep -oP '(?<=-m ")[^"]+')

pattern="^(feat|fix|docs|style|refactor|perf|test|chore|ci|build)(\(.+\))?: .{1,72}"

if [[ ! $message =~ $pattern ]]; then
  echo "BLOCK: Invalid commit message format"
  echo "Expected: <type>(<scope>): <subject>"
  echo "Got: $message"
  exit 1
fi

echo "Commit message format valid"
```

**Hook response pattern:**
```typescript
interface CommitValidationResponse {
  valid: boolean;
  message?: string;
  suggestions?: string[];
}
```

### PostToolUse Hook - Auto-Changelog

After commits, suggest changelog updates:

```json
{
  "hooks": {
    "PostToolUse": [{
      "matcher": "Bash",
      "command": "suggest-changelog.sh",
      "condition": "contains(output, 'create mode') || contains(output, 'insertions')"
    }]
  }
}
```

## CI/CD Integration

### GitHub Actions

```yaml
name: Release
on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Generate changelog
        run: |
          npx conventional-changelog-cli -p angular -r 2 > RELEASE_NOTES.md

      - name: Create Release
        uses: softprops/action-gh-release@v1
        with:
          body_path: RELEASE_NOTES.md
          draft: false
          prerelease: ${{ contains(github.ref, 'alpha') || contains(github.ref, 'beta') }}
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Publish to npm
        run: npm publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

### Automated Version Bump

```yaml
name: Version Bump
on:
  push:
    branches: [main]

jobs:
  version:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Bump version
        run: |
          git config user.name github-actions
          git config user.email github-actions@github.com
          npx standard-version
          git push --follow-tags
```

### Pre-commit with Husky

```bash
# Install husky
npm install --save-dev husky
npx husky init

# Add pre-commit hook
echo "npm run lint && npm test" > .husky/pre-commit

# Add commit-msg hook
echo 'npx commitlint --edit "$1"' > .husky/commit-msg
```

## Templates

- [templates/pr-description.md](templates/pr-description.md) - PR description templates
- [templates/release-notes.md](templates/release-notes.md) - Release notes templates
- [templates/commit-message.md](templates/commit-message.md) - Commit message examples

## Reference Files

- [references/conventional-commits.md](references/conventional-commits.md) - Commit message conventions
- [references/branch-strategies.md](references/branch-strategies.md) - Branch strategy comparison
- [references/git-hooks.md](references/git-hooks.md) - Git hook examples and patterns
