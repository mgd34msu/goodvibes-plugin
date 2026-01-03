---
name: dependency-management
description: Analyzes, optimizes, and audits project dependencies for cleanup, circular detection, version conflicts, bundle size, and security vulnerabilities. Use when cleaning unused deps, detecting circular imports, managing version upgrades, optimizing bundles, or auditing for security/license compliance.
---

# Dependency Management

Comprehensive dependency analysis, optimization, and auditing for modern JavaScript/TypeScript, Python, Go, and Rust projects.

## Quick Start

**Find unused dependencies:**
```
Analyze this project for unused dependencies and suggest which to remove
```

**Detect circular imports:**
```
Find circular dependencies in this codebase and suggest how to break them
```

**Audit security vulnerabilities:**
```
Run a dependency security audit and prioritize what needs immediate attention
```

**Analyze bundle size:**
```
Analyze which dependencies are contributing most to bundle size and suggest optimizations
```

## Capabilities

### 1. Dependency Cleanup

Find and remove unused dependencies to reduce bloat and attack surface.

#### Detection Methods

| Method | Tool | Command |
|--------|------|---------|
| Static Analysis (JS) | depcheck | `npx depcheck` |
| Static Analysis (JS) | unimported | `npx unimported` |
| Bundle Analysis | webpack-bundle-analyzer | `npx webpack-bundle-analyzer stats.json` |
| Import Tracing | knip | `npx knip` |
| Python | pip-autoremove | `pip-autoremove --list` |
| Go | go mod tidy | `go mod tidy -v` |

#### Cleanup Workflow

```
1. Generate dependency report
   npx depcheck --json > depcheck-report.json

2. Cross-reference with bundle analysis
   npm run build -- --stats
   npx webpack-bundle-analyzer stats.json

3. Identify candidates for removal
   - Dependencies with no imports
   - Dependencies only used in removed code
   - Duplicate functionality (e.g., multiple date libraries)

4. Verify before removal
   - Check for dynamic imports: grep -r "require(" src/
   - Check for peer dependencies of remaining packages
   - Run tests after removal

5. Remove and verify
   npm uninstall <package>
   npm test && npm run build
```

#### Common False Positives

| Package Type | Why Detected as Unused | How to Verify |
|--------------|----------------------|---------------|
| TypeScript types (@types/*) | Only used at compile time | Check tsconfig.json types array |
| Babel plugins | Referenced in config | Check babel.config.js |
| ESLint plugins | Referenced in config | Check .eslintrc |
| PostCSS plugins | Referenced in config | Check postcss.config.js |
| Test utilities | Only used in test files | Verify test config includes them |

See [references/cleanup-patterns.md](references/cleanup-patterns.md) for language-specific patterns.

---

### 2. Circular Dependency Detection

Identify and resolve circular imports that cause runtime issues and maintenance problems.

#### Detection Tools

```bash
# JavaScript/TypeScript
npx madge --circular --extensions ts,tsx,js,jsx src/
npx dpdm --circular src/index.ts

# Python
pycycle --here
python -c "import sys; print(sys.modules)"  # Runtime check

# Go
go list -f '{{join .Imports "\n"}}' ./... | sort | uniq -d
```

#### Circular Dependency Patterns

**Type 1: Direct Cycle (A -> B -> A)**
```
moduleA.ts imports moduleB.ts
moduleB.ts imports moduleA.ts
```

**Resolution: Extract shared code**
```
moduleA.ts imports shared.ts
moduleB.ts imports shared.ts
shared.ts contains common functionality
```

**Type 2: Indirect Cycle (A -> B -> C -> A)**
```
auth.ts -> user.ts -> permissions.ts -> auth.ts
```

**Resolution: Dependency inversion**
```typescript
// Before: permissions.ts imports auth for getCurrentUser
import { getCurrentUser } from './auth';

// After: Pass user as parameter
export function checkPermission(user: User, permission: string): boolean {
  // No longer needs to import auth
}
```

**Type 3: Type-Only Cycle**
```typescript
// Often safe - use import type
import type { User } from './user';  // No runtime cycle
```

See [references/circular-dependencies.md](references/circular-dependencies.md) for resolution patterns.

---

### 3. Version Management

Handle version conflicts, plan upgrades, and follow semver best practices.

#### Version Analysis

```bash
# Check outdated packages
npm outdated --json

# Check for security updates specifically
npm audit fix --dry-run

# Check peer dependency conflicts
npm ls 2>&1 | grep "peer dep"

# Find duplicate packages
npm ls --all | grep -E "^\s+.*@" | sort | uniq -d
```

#### Upgrade Strategies

| Strategy | When to Use | Risk Level |
|----------|-------------|------------|
| Patch updates only | Production stability | Low |
| Minor updates | Regular maintenance | Medium |
| Major updates | Quarterly planning | High |
| Lockfile only | Security fixes | Low |

#### Semver Quick Reference

```
MAJOR.MINOR.PATCH

^1.2.3  = >=1.2.3 <2.0.0   (compatible changes)
~1.2.3  = >=1.2.3 <1.3.0   (patch updates only)
1.2.3   = exactly 1.2.3    (locked version)
*       = any version      (dangerous!)
>=1.0.0 = 1.0.0 or higher  (wide open)
```

#### Conflict Resolution

```bash
# Find conflicting versions
npm ls react  # See all versions of react

# Force resolution (package.json)
{
  "overrides": {
    "react": "^18.2.0"
  }
}

# Yarn resolutions
{
  "resolutions": {
    "react": "^18.2.0"
  }
}

# pnpm overrides
{
  "pnpm": {
    "overrides": {
      "react": "^18.2.0"
    }
  }
}
```

See [references/version-management.md](references/version-management.md) for upgrade planning.

---

### 4. Bundle Optimization

Reduce bundle size by analyzing dependency weight and optimizing imports.

#### Analysis Tools

```bash
# Webpack bundle analyzer
npm run build -- --stats
npx webpack-bundle-analyzer stats.json

# Vite/Rollup visualization
npx vite-bundle-visualizer

# Check package size before install
npx bundle-phobia-cli lodash

# Source map explorer
npx source-map-explorer dist/**/*.js
```

#### Size Reduction Strategies

**1. Replace Heavy Dependencies**

| Heavy Package | Size | Alternative | Size |
|---------------|------|-------------|------|
| moment | 290KB | date-fns | 13KB (tree-shakeable) |
| lodash | 70KB | lodash-es | 0KB (tree-shake unused) |
| axios | 14KB | native fetch | 0KB |
| uuid | 8KB | crypto.randomUUID() | 0KB |
| classnames | 2KB | clsx | 0.5KB |

**2. Tree Shaking**

```javascript
// BAD: Imports entire library
import _ from 'lodash';
_.map(arr, fn);

// GOOD: Named import (tree-shakeable with lodash-es)
import { map } from 'lodash-es';
map(arr, fn);

// BEST: Direct import
import map from 'lodash/map';
```

**3. Dynamic Imports**

```javascript
// BAD: Always loaded
import { Chart } from 'chart.js';

// GOOD: Loaded on demand
const loadChart = () => import('chart.js').then(m => m.Chart);

// React lazy loading
const Chart = React.lazy(() => import('./Chart'));
```

**4. External CDN for Large Dependencies**

```javascript
// vite.config.js
export default defineConfig({
  build: {
    rollupOptions: {
      external: ['react', 'react-dom'],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
        },
      },
    },
  },
});
```

See [references/bundle-optimization.md](references/bundle-optimization.md) for detailed patterns.

---

### 5. Import Optimization

Eliminate dead code and consolidate imports for smaller bundles.

#### Dead Code Detection

```bash
# TypeScript/JavaScript
npx knip  # Finds unused exports, files, dependencies
npx ts-prune  # Finds unused exports in TypeScript

# Check for unused exports
npx unimported --show-unused-exports
```

#### Import Consolidation

```javascript
// BEFORE: Scattered imports
import { useState } from 'react';
import { useEffect } from 'react';
import { useCallback } from 'react';

// AFTER: Consolidated
import { useState, useEffect, useCallback } from 'react';
```

#### Barrel Export Optimization

```javascript
// PROBLEM: Barrel exports break tree-shaking
// components/index.ts
export * from './Button';
export * from './Modal';
export * from './Form';

// Importing any component loads all
import { Button } from './components';  // Loads Modal and Form too!

// SOLUTION: Direct imports
import { Button } from './components/Button';

// OR: Use sideEffects in package.json
{
  "sideEffects": false  // Tells bundler all files are tree-shakeable
}
```

#### Import Cost Awareness

Use IDE extensions to show import costs inline:
- Import Cost (VS Code)
- Bundle Size (VS Code)

---

### 6. Dependency Auditing

Security vulnerability detection, license compliance, and package health checks.

#### Security Scanning

```bash
# npm built-in audit
npm audit --json
npm audit fix  # Auto-fix where possible
npm audit fix --force  # Force major updates (risky!)

# More comprehensive scanning
npx snyk test
npx retire  # Check for known vulnerable packages

# Python
pip-audit
safety check

# Go
govulncheck ./...

# Rust
cargo audit
```

#### Audit Report Interpretation

| Severity | Action Required | Timeline |
|----------|-----------------|----------|
| Critical | Immediate fix | Same day |
| High | Priority fix | Within week |
| Moderate | Scheduled fix | Within month |
| Low | Track in backlog | Quarterly review |

#### License Compliance

```bash
# List all licenses
npx license-checker --summary
npx license-checker --onlyAllow "MIT;Apache-2.0;BSD-3-Clause;ISC"

# Python
pip-licenses --format=markdown

# Check for problematic licenses
npx license-checker --failOn "GPL;AGPL;SSPL"
```

#### License Risk Matrix

| License | Commercial Use | Copyleft | Risk |
|---------|---------------|----------|------|
| MIT | Yes | No | Low |
| Apache-2.0 | Yes | No | Low |
| BSD-3-Clause | Yes | No | Low |
| ISC | Yes | No | Low |
| LGPL-3.0 | Yes | Weak | Medium |
| MPL-2.0 | Yes | Weak | Medium |
| GPL-3.0 | Yes | Strong | High |
| AGPL-3.0 | Yes | Network | High |
| SSPL | Limited | Service | High |

See [references/security-auditing.md](references/security-auditing.md) for comprehensive auditing.

---

## Workflows

### Complete Dependency Health Check

```
1. Security Audit
   npm audit --json > audit-report.json

2. Outdated Check
   npm outdated --json > outdated-report.json

3. Unused Detection
   npx depcheck --json > unused-report.json

4. Bundle Analysis
   npm run build -- --stats
   npx webpack-bundle-analyzer stats.json --mode static -r bundle-report.html

5. Circular Dependency Check
   npx madge --circular --extensions ts src/ > circular-report.txt

6. License Audit
   npx license-checker --json > license-report.json

7. Generate Summary
   python scripts/analyze_deps.py --path . --output health-report.json
```

### Dependency Upgrade Workflow

```
1. Create feature branch
   git checkout -b deps/quarterly-update

2. Update lockfile only first (safest)
   npm update
   npm test

3. Update minor versions
   npx npm-check-updates -u --target minor
   npm install
   npm test

4. Evaluate major updates individually
   npx npm-check-updates --format group
   # Update one at a time, test between each

5. Run full test suite
   npm run test:all
   npm run build

6. Update documentation if needed
   # Check CHANGELOG files of updated packages

7. Create PR with detailed changelog
```

### Emergency Security Fix

```
1. Identify vulnerable package
   npm audit --json | jq '.vulnerabilities | keys'

2. Check if direct or transitive
   npm ls <vulnerable-package>

3. If direct: Update to fixed version
   npm update <package>@<safe-version>

4. If transitive: Try audit fix
   npm audit fix

5. If audit fix fails: Use overrides
   // package.json
   {
     "overrides": {
       "<vulnerable-package>": "<safe-version>"
     }
   }

6. If no fix available: Evaluate alternatives
   - Can you remove the dependency?
   - Is there an alternative package?
   - Can you vendor and patch?

7. Document decision in ADR
```

---

## Scripts

Run the dependency analyzer script for automated health checks:

```bash
python scripts/analyze_deps.py --path ./src --output report.json
python scripts/analyze_deps.py --path . --format markdown
```

See [scripts/analyze_deps.py](scripts/analyze_deps.py) for implementation.

---

## CI/CD Integration

### GitHub Actions

```yaml
name: Dependency Health

on:
  pull_request:
  schedule:
    - cron: '0 9 * * 1'  # Weekly on Monday

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install
        run: npm ci

      - name: Security Audit
        run: npm audit --audit-level=moderate

      - name: Check Outdated
        run: |
          npm outdated --json > outdated.json || true
          if [ -s outdated.json ]; then
            echo "::warning::Outdated dependencies found"
          fi

      - name: License Check
        run: npx license-checker --onlyAllow "MIT;Apache-2.0;BSD-3-Clause;ISC"

      - name: Unused Dependencies
        run: npx depcheck --ignores="@types/*,eslint-*"

      - name: Circular Dependencies
        run: |
          npx madge --circular --extensions ts src/
          if [ $? -eq 0 ]; then
            exit 0
          else
            echo "::error::Circular dependencies detected"
            exit 1
          fi
```

### Pre-commit Hook

```bash
#!/bin/bash
# .git/hooks/pre-commit

# Check for new dependencies with problematic licenses
if git diff --cached package.json | grep -q '"dependencies"'; then
  npx license-checker --onlyAllow "MIT;Apache-2.0;BSD-3-Clause;ISC" || {
    echo "Error: New dependency has incompatible license"
    exit 1
  }
fi

# Check for circular dependencies in changed files
changed_ts=$(git diff --cached --name-only | grep -E '\.(ts|tsx)$')
if [ -n "$changed_ts" ]; then
  npx madge --circular $changed_ts && exit 0 || {
    echo "Error: Circular dependency introduced"
    exit 1
  }
fi
```

---

## Reference Files

- [references/cleanup-patterns.md](references/cleanup-patterns.md) - Language-specific cleanup patterns
- [references/circular-dependencies.md](references/circular-dependencies.md) - Circular dependency resolution patterns
- [references/version-management.md](references/version-management.md) - Version upgrade strategies and conflict resolution
- [references/bundle-optimization.md](references/bundle-optimization.md) - Bundle size reduction techniques
- [references/security-auditing.md](references/security-auditing.md) - Security and license auditing patterns

## Scripts

- [scripts/analyze_deps.py](scripts/analyze_deps.py) - Automated dependency health analyzer
