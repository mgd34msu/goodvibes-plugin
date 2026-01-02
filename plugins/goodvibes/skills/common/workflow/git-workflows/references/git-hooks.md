# Git Hooks Reference

Examples and patterns for client-side and server-side git hooks.

## Hook Types

### Client-Side Hooks

| Hook | Trigger | Use Case |
|------|---------|----------|
| `pre-commit` | Before commit created | Linting, tests, format check |
| `prepare-commit-msg` | Before editor opens | Template commit messages |
| `commit-msg` | After message entered | Validate message format |
| `post-commit` | After commit created | Notifications, triggers |
| `pre-push` | Before push | Run tests, check branch |
| `post-checkout` | After checkout | Dependency updates |
| `post-merge` | After merge | Dependency updates |

### Server-Side Hooks

| Hook | Trigger | Use Case |
|------|---------|----------|
| `pre-receive` | Before accepting push | Policy enforcement |
| `update` | Per branch before update | Branch-specific rules |
| `post-receive` | After push accepted | Deploy, notify |

---

## Pre-commit Hooks

### Linting and Formatting

```bash
#!/bin/bash
# .git/hooks/pre-commit

set -e

echo "Running pre-commit checks..."

# Get staged files
staged_files=$(git diff --cached --name-only --diff-filter=ACM)

# JavaScript/TypeScript linting
js_files=$(echo "$staged_files" | grep -E '\.(js|ts|jsx|tsx)$' || true)
if [ -n "$js_files" ]; then
  echo "Linting JavaScript/TypeScript files..."
  echo "$js_files" | xargs npx eslint --fix
  echo "$js_files" | xargs git add  # Re-add if fixed
fi

# Python linting
py_files=$(echo "$staged_files" | grep -E '\.py$' || true)
if [ -n "$py_files" ]; then
  echo "Linting Python files..."
  echo "$py_files" | xargs ruff check --fix
  echo "$py_files" | xargs git add
fi

# Format check (Prettier)
format_files=$(echo "$staged_files" | grep -E '\.(js|ts|jsx|tsx|json|css|md)$' || true)
if [ -n "$format_files" ]; then
  echo "Checking formatting..."
  echo "$format_files" | xargs npx prettier --check
fi

echo "Pre-commit checks passed!"
```

### Type Checking

```bash
#!/bin/bash
# .git/hooks/pre-commit

# TypeScript type check
if [ -f "tsconfig.json" ]; then
  echo "Running TypeScript type check..."
  npx tsc --noEmit || {
    echo "TypeScript errors found. Fix before committing."
    exit 1
  }
fi

# Python type check
if [ -f "pyproject.toml" ] || [ -f "setup.py" ]; then
  echo "Running mypy..."
  mypy src/ || {
    echo "Type errors found. Fix before committing."
    exit 1
  }
fi
```

### Security Checks

```bash
#!/bin/bash
# .git/hooks/pre-commit

echo "Scanning for secrets..."

# Check for common secret patterns
patterns=(
  "password\s*=\s*['\"][^'\"]+['\"]"
  "api[_-]?key\s*=\s*['\"][^'\"]+['\"]"
  "secret\s*=\s*['\"][^'\"]+['\"]"
  "AKIA[0-9A-Z]{16}"  # AWS Access Key
  "-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----"
)

for pattern in "${patterns[@]}"; do
  if git diff --cached | grep -qE "$pattern"; then
    echo "ERROR: Potential secret detected matching pattern: $pattern"
    echo "Review staged changes and remove secrets."
    exit 1
  fi
done

# Use gitleaks for comprehensive scanning
if command -v gitleaks &> /dev/null; then
  gitleaks protect --staged || exit 1
fi

echo "Secret scan passed!"
```

### Test Execution

```bash
#!/bin/bash
# .git/hooks/pre-commit

echo "Running tests for changed files..."

# Get changed source files
changed=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(ts|js)$' || true)

if [ -z "$changed" ]; then
  echo "No source files changed, skipping tests."
  exit 0
fi

# Run tests related to changed files
for file in $changed; do
  # Find corresponding test file
  test_file=$(echo "$file" | sed 's/src/tests/' | sed 's/\.ts$/.test.ts/')

  if [ -f "$test_file" ]; then
    echo "Running tests for $test_file..."
    npm test -- "$test_file" --passWithNoTests || exit 1
  fi
done

echo "Tests passed!"
```

---

## Commit-msg Hooks

### Conventional Commits Validation

```bash
#!/bin/bash
# .git/hooks/commit-msg

commit_msg_file="$1"
commit_msg=$(cat "$commit_msg_file")

# Conventional commit pattern
pattern="^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\(.+\))?: .{1,}"

# Check first line
first_line=$(echo "$commit_msg" | head -n1)

if [[ ! $first_line =~ $pattern ]]; then
  echo "ERROR: Invalid commit message format!"
  echo ""
  echo "Expected format: <type>(<scope>): <subject>"
  echo ""
  echo "Types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert"
  echo ""
  echo "Examples:"
  echo "  feat(auth): add OAuth2 login"
  echo "  fix(api): correct pagination offset"
  echo "  docs: update README"
  echo ""
  echo "Your message: $first_line"
  exit 1
fi

# Check subject length (max 72 chars)
subject_length=${#first_line}
if [ $subject_length -gt 72 ]; then
  echo "ERROR: Commit subject too long ($subject_length > 72 characters)"
  exit 1
fi

# Check for trailing period
if [[ $first_line =~ \.$ ]]; then
  echo "ERROR: Commit subject should not end with a period"
  exit 1
fi

echo "Commit message format valid!"
```

### Issue Reference Check

```bash
#!/bin/bash
# .git/hooks/commit-msg

commit_msg=$(cat "$1")

# Require issue reference for features and fixes
if echo "$commit_msg" | head -n1 | grep -qE "^(feat|fix):"; then
  if ! echo "$commit_msg" | grep -qE "(#[0-9]+|[A-Z]+-[0-9]+)"; then
    echo "ERROR: Feature/fix commits must reference an issue"
    echo "Add: Closes #123 or PROJ-123"
    exit 1
  fi
fi
```

---

## Pre-push Hooks

### Branch Naming Check

```bash
#!/bin/bash
# .git/hooks/pre-push

branch=$(git rev-parse --abbrev-ref HEAD)

# Allowed patterns
pattern="^(main|develop|feature|fix|hotfix|release|chore)/[a-z0-9._-]+$"

# Allow main and develop
if [[ $branch == "main" ]] || [[ $branch == "develop" ]]; then
  exit 0
fi

if [[ ! $branch =~ $pattern ]]; then
  echo "ERROR: Branch name '$branch' doesn't match naming convention"
  echo ""
  echo "Expected patterns:"
  echo "  feature/<description>"
  echo "  fix/<description>"
  echo "  hotfix/<description>"
  echo "  release/<version>"
  echo "  chore/<description>"
  echo ""
  echo "Examples:"
  echo "  feature/add-user-auth"
  echo "  fix/login-validation"
  echo "  release/1.2.0"
  exit 1
fi
```

### Protected Branch Check

```bash
#!/bin/bash
# .git/hooks/pre-push

protected_branches="^(main|master|develop|release/.*)$"
current_branch=$(git rev-parse --abbrev-ref HEAD)

if [[ $current_branch =~ $protected_branches ]]; then
  echo "WARNING: You're pushing to protected branch '$current_branch'"
  read -p "Are you sure? (y/n) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
fi
```

### Full Test Suite

```bash
#!/bin/bash
# .git/hooks/pre-push

echo "Running full test suite before push..."

# Run all tests
npm test || {
  echo "Tests failed. Push aborted."
  exit 1
}

# Run integration tests
npm run test:integration || {
  echo "Integration tests failed. Push aborted."
  exit 1
}

echo "All tests passed!"
```

---

## Post Hooks

### Post-commit Notification

```bash
#!/bin/bash
# .git/hooks/post-commit

commit_hash=$(git rev-parse HEAD)
commit_msg=$(git log -1 --pretty=%B)
author=$(git log -1 --pretty=%an)

# Send to Slack (if webhook configured)
if [ -n "$SLACK_WEBHOOK" ]; then
  curl -X POST -H 'Content-type: application/json' \
    --data "{\"text\":\"New commit by $author: $commit_msg\"}" \
    "$SLACK_WEBHOOK"
fi
```

### Post-checkout Dependency Update

```bash
#!/bin/bash
# .git/hooks/post-checkout

prev_head="$1"
new_head="$2"
branch_checkout="$3"  # 1 = branch checkout, 0 = file checkout

# Only run on branch checkout
if [ "$branch_checkout" != "1" ]; then
  exit 0
fi

# Check if package files changed
if git diff "$prev_head" "$new_head" --name-only | grep -qE "package(-lock)?\.json|yarn\.lock"; then
  echo "Dependencies changed, running npm install..."
  npm install
fi

# Python
if git diff "$prev_head" "$new_head" --name-only | grep -qE "requirements.*\.txt|Pipfile|pyproject\.toml"; then
  echo "Python dependencies changed..."
  pip install -r requirements.txt
fi
```

### Post-merge Migrations

```bash
#!/bin/bash
# .git/hooks/post-merge

# Check for new migrations
if git diff ORIG_HEAD HEAD --name-only | grep -q "migrations/"; then
  echo "New migrations detected, running..."
  npm run db:migrate
fi
```

---

## Husky Setup (Modern Alternative)

### Installation

```bash
# Install husky
npm install --save-dev husky

# Initialize husky
npx husky init

# Creates .husky/ directory with sample pre-commit
```

### Configure Hooks

```bash
# Pre-commit
echo "npm run lint && npm test" > .husky/pre-commit

# Commit-msg (with commitlint)
npm install --save-dev @commitlint/cli @commitlint/config-conventional
echo "module.exports = {extends: ['@commitlint/config-conventional']}" > commitlint.config.js
echo "npx --no -- commitlint --edit \$1" > .husky/commit-msg

# Pre-push
echo "npm run test:all" > .husky/pre-push
```

### lint-staged Integration

```json
// package.json
{
  "lint-staged": {
    "*.{js,ts,jsx,tsx}": [
      "eslint --fix",
      "prettier --write"
    ],
    "*.{json,md,css}": [
      "prettier --write"
    ]
  }
}
```

```bash
# .husky/pre-commit
npx lint-staged
```

---

## Sharing Hooks

### Git Template Directory

```bash
# Create template directory
mkdir -p ~/.git-templates/hooks

# Copy hooks
cp pre-commit ~/.git-templates/hooks/

# Configure git to use template
git config --global init.templateDir ~/.git-templates

# New repos will have hooks automatically
git init my-new-repo
```

### Repository Hooks Directory

```bash
# Store hooks in repo
mkdir -p .githooks

# Copy hooks
cp .git/hooks/pre-commit .githooks/

# Configure repo to use custom hooks path
git config core.hooksPath .githooks

# Add to README for team setup
```

---

## Bypassing Hooks

```bash
# Skip pre-commit and commit-msg hooks
git commit --no-verify -m "emergency fix"

# Skip pre-push hooks
git push --no-verify

# Note: Use sparingly, only for emergencies
```
