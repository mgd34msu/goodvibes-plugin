# Version Management Reference

Strategies for handling version conflicts, planning upgrades, and following semver best practices.

## Semantic Versioning (Semver)

### Version Number Anatomy

```
MAJOR.MINOR.PATCH[-PRERELEASE][+BUILD]

Examples:
1.2.3         = Stable release
1.2.3-beta.1  = Pre-release
1.2.3+build.1 = Build metadata (ignored in comparisons)
0.x.x         = Development phase (API unstable)
```

### Change Types

| Version Bump | When | Example |
|--------------|------|---------|
| MAJOR (1.0.0 -> 2.0.0) | Breaking changes | API removed, signature changed |
| MINOR (1.0.0 -> 1.1.0) | New features (backward compatible) | New function added |
| PATCH (1.0.0 -> 1.0.1) | Bug fixes (backward compatible) | Fix null check |

### Version Ranges

```javascript
// package.json ranges
"^1.2.3"   // >=1.2.3 <2.0.0  (caret - most common)
"~1.2.3"   // >=1.2.3 <1.3.0  (tilde - patch only)
"1.2.3"    // Exactly 1.2.3   (locked)
"*"        // Any version     (dangerous!)
">=1.0.0"  // 1.0.0 or higher (wide open)
"1.x"      // Any 1.x version
"1.2.x"    // Any 1.2.x version

// Complex ranges
">=1.0.0 <2.0.0"       // Explicit range
"1.0.0 || 2.0.0"       // Either version
">=1.0.0 <1.5.0 || >=2.0.0"  // Multiple ranges
```

### Recommended Version Strategies

| Package Type | Strategy | Why |
|--------------|----------|-----|
| Critical (React, DB drivers) | `~` (patch only) | Stability matters |
| Well-maintained libraries | `^` (minor + patch) | Get features safely |
| Internal packages | `*` or `workspace:*` | Always latest |
| CLI tools (devDeps) | `^` or `latest` | Less risk |

---

## Package Manager Commands

### npm

```bash
# Check outdated
npm outdated
npm outdated --json  # Machine-readable

# Update within ranges
npm update

# Update to latest (ignoring ranges)
npm update <package>@latest

# Interactive update
npx npm-check-updates -i

# Lock file only update (safest)
npm ci && npm update --package-lock-only
```

### yarn

```bash
# Check outdated
yarn outdated

# Interactive upgrade
yarn upgrade-interactive

# Upgrade to latest
yarn upgrade <package>@latest

# Upgrade within ranges
yarn upgrade
```

### pnpm

```bash
# Check outdated
pnpm outdated

# Update within ranges
pnpm update

# Update to latest
pnpm update --latest

# Interactive
pnpm update -i
```

---

## Conflict Resolution

### Identifying Conflicts

```bash
# npm - show dependency tree
npm ls
npm ls <package>  # Specific package
npm ls 2>&1 | grep "peer dep"  # Peer dependency issues

# Find duplicate versions
npm ls --all | grep -E "^\s+.*@" | sort | uniq -d

# Why is package installed?
npm why <package>
```

### Resolution Techniques

#### 1. npm overrides (npm 8.3+)

```json
{
  "overrides": {
    "react": "^18.2.0",
    "lodash": "^4.17.21",
    "vulnerable-package": "npm:safe-alternative@^1.0.0"
  }
}
```

**Nested overrides:**
```json
{
  "overrides": {
    "some-package": {
      "nested-dep": "^2.0.0"
    }
  }
}
```

#### 2. Yarn resolutions

```json
{
  "resolutions": {
    "react": "^18.2.0",
    "**/lodash": "^4.17.21",
    "package-a/**/lodash": "^4.17.21"
  }
}
```

#### 3. pnpm overrides

```json
{
  "pnpm": {
    "overrides": {
      "react": "^18.2.0"
    },
    "packageExtensions": {
      "some-package": {
        "peerDependencies": {
          "missing-peer": "*"
        }
      }
    }
  }
}
```

### Peer Dependency Conflicts

```bash
# See what peers are expected
npm info <package> peerDependencies

# Install with legacy peer deps (npm 7+)
npm install --legacy-peer-deps

# Force install (last resort)
npm install --force
```

**Better solution - match peer versions:**
```json
{
  "dependencies": {
    "react": "^18.2.0"
  },
  "peerDependencies": {
    "react": "^18.2.0"
  }
}
```

---

## Upgrade Strategies

### Strategy 1: Conservative (Patch Only)

Best for: Production systems, risk-averse teams

```bash
# Update package.json to use tilde
npx npm-check-updates -u --target patch

# Verify
npm install
npm test
```

### Strategy 2: Regular Maintenance (Minor Updates)

Best for: Active development, monthly cadence

```bash
# See what can be updated
npx npm-check-updates --target minor

# Update package.json
npx npm-check-updates -u --target minor

# Install and test
npm install
npm test
npm run build
```

### Strategy 3: Major Upgrades (Quarterly)

Best for: Planned maintenance windows

```bash
# Create tracking issue/branch
git checkout -b deps/q1-2024-updates

# Group updates by risk
npx npm-check-updates --format group

# Update one major at a time
npm install <package>@latest
npm test

# Document breaking changes
# Update code as needed
# Repeat for each major
```

### Strategy 4: Security-Only

Best for: Minimal changes, security focus

```bash
# See security updates only
npm audit

# Auto-fix what's safe
npm audit fix

# See what would be fixed with breaking changes
npm audit fix --dry-run --force
```

---

## Upgrade Planning

### Pre-Upgrade Checklist

```markdown
- [ ] Current test suite passes
- [ ] Backup of lock file exists
- [ ] Team notified of upgrade window
- [ ] Changelog of target version reviewed
- [ ] Breaking changes documented
- [ ] Rollback plan in place
```

### Major Upgrade Template

```markdown
# Upgrading [package] from vX to vY

## Breaking Changes
- [ ] Change 1: Description
  - Affected files: list
  - Migration: steps
- [ ] Change 2: Description

## New Features to Adopt
- [ ] Feature 1: Description
- [ ] Feature 2: Description

## Deprecated APIs to Migrate
- [ ] Old API -> New API

## Testing Plan
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Manual smoke test
- [ ] Performance regression check

## Rollback Plan
1. Revert to previous lock file
2. npm ci
3. Deploy previous version
```

### React Major Upgrade Example

```markdown
# Upgrading React 17 -> 18

## Breaking Changes
- [ ] ReactDOM.render -> createRoot
  - Files: src/index.tsx
  - Migration:
    ```tsx
    // Before
    ReactDOM.render(<App />, document.getElementById('root'));

    // After
    const root = createRoot(document.getElementById('root')!);
    root.render(<App />);
    ```

- [ ] Automatic batching changes
  - Review: setTimeout/Promise setState calls
  - May need: flushSync for immediate updates

## New Features
- [ ] useId hook for SSR
- [ ] Concurrent features (optional)
- [ ] Suspense improvements

## Testing
- [ ] All tests pass with React 18
- [ ] No console warnings about deprecated APIs
- [ ] StrictMode double-render handled
```

---

## npm-check-updates (ncu)

### Basic Usage

```bash
# Check what can be updated
npx npm-check-updates

# Check specific packages
npx npm-check-updates --filter "react*"

# Exclude packages
npx npm-check-updates --reject "legacy-package"

# Update package.json
npx npm-check-updates -u

# Only update to latest minor/patch
npx npm-check-updates -u --target minor
```

### Advanced Options

```bash
# Group by update type
npx npm-check-updates --format group

# Interactive mode
npx npm-check-updates -i

# Check peer dependencies
npx npm-check-updates --peer

# Target options
--target patch       # 1.0.0 -> 1.0.1
--target minor       # 1.0.0 -> 1.1.0
--target latest      # 1.0.0 -> 2.0.0
--target newest      # Including prereleases
--target greatest    # Highest version
```

### Configuration File

```javascript
// .ncurc.js
module.exports = {
  // Packages to ignore
  reject: [
    'legacy-package',
    '@types/node'  // Pin to match Node version
  ],

  // Only check these
  filter: [
    'react*',
    '@testing-library/*'
  ],

  // Target version
  target: 'minor',

  // Upgrade peer dependencies too
  peer: true
};
```

---

## Dependency Bots

### Dependabot (GitHub)

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
      day: "monday"
      time: "09:00"
    open-pull-requests-limit: 10
    groups:
      development-dependencies:
        dependency-type: "development"
        update-types:
          - "minor"
          - "patch"
      production-dependencies:
        dependency-type: "production"
        update-types:
          - "patch"
    ignore:
      - dependency-name: "aws-sdk"
        versions: [">=3.0.0"]
    commit-message:
      prefix: "deps"
```

### Renovate

```json
// renovate.json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": [
    "config:recommended",
    ":semanticCommitTypeAll(deps)",
    "group:allNonMajor"
  ],
  "schedule": ["before 9am on monday"],
  "packageRules": [
    {
      "matchDepTypes": ["devDependencies"],
      "automerge": true
    },
    {
      "matchPackagePatterns": ["eslint"],
      "groupName": "eslint"
    },
    {
      "matchPackagePatterns": ["^@types/"],
      "groupName": "types"
    }
  ],
  "vulnerabilityAlerts": {
    "enabled": true,
    "labels": ["security"]
  }
}
```

---

## Lock File Management

### Best Practices

```bash
# Always commit lock files
git add package-lock.json  # npm
git add yarn.lock          # yarn
git add pnpm-lock.yaml     # pnpm

# Use ci for reproducible installs
npm ci        # Not npm install in CI
yarn --frozen-lockfile
pnpm install --frozen-lockfile
```

### Lock File Conflicts

```bash
# When lock file conflicts occur:

# Option 1: Accept theirs, regenerate
git checkout --theirs package-lock.json
npm install

# Option 2: Accept ours, regenerate
git checkout --ours package-lock.json
npm install

# Option 3: Delete and regenerate
rm package-lock.json
npm install
```

### Lock File Auditing

```bash
# Check lock file integrity
npm ci  # Will fail if lock file doesn't match package.json

# Verify checksums
npm audit signatures  # npm 8.13+

# Detect changes
git diff package-lock.json
```

---

## Monorepo Version Management

### Workspace Protocols

```json
// pnpm workspace
{
  "dependencies": {
    "shared-utils": "workspace:*",      // Any version
    "shared-config": "workspace:^1.0.0" // Compatible version
  }
}

// npm/yarn workspace
{
  "dependencies": {
    "shared-utils": "*"  // Resolved to workspace version
  }
}
```

### Synchronized Versions

```bash
# Lerna
lerna version --conventional-commits

# Changesets
npx changeset add
npx changeset version
npx changeset publish

# Turborepo
# Uses package manager workspaces
```

### Version Constraints Across Packages

```json
// Root package.json
{
  "workspaces": ["packages/*"],
  "overrides": {
    "react": "^18.2.0",
    "typescript": "^5.0.0"
  }
}
```
