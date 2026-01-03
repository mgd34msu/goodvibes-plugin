# Dependency Cleanup Patterns

Language and framework-specific patterns for finding and removing unused dependencies.

## Node.js / JavaScript

### Tools Comparison

| Tool | Strengths | Limitations |
|------|-----------|-------------|
| depcheck | Fast, config-aware | Some false positives |
| unimported | File-level analysis | Slower on large projects |
| knip | Comprehensive, exports too | Complex configuration |
| npm-check | Interactive UI | Less accurate detection |

### depcheck Usage

```bash
# Basic usage
npx depcheck

# JSON output for processing
npx depcheck --json

# Ignore specific packages
npx depcheck --ignores="@types/*,eslint-*,prettier"

# Skip directories
npx depcheck --ignore-dirs="dist,build,coverage"

# Custom parsers for special files
npx depcheck --parsers="**/*.vue:vue"
```

**depcheck.json configuration:**
```json
{
  "ignorePatterns": ["dist", "build"],
  "ignoreMatches": [
    "@types/*",
    "eslint-*",
    "prettier",
    "@commitlint/*"
  ],
  "specials": [
    "bin",
    "eslint",
    "babel",
    "webpack",
    "rollup"
  ]
}
```

### knip Usage (Recommended for TypeScript)

```bash
# Full project analysis
npx knip

# Just unused dependencies
npx knip --include dependencies

# Also find unused exports
npx knip --include exports

# Fix mode (shows what would be removed)
npx knip --fix --dry-run
```

**knip.json configuration:**
```json
{
  "entry": ["src/index.ts"],
  "project": ["src/**/*.ts"],
  "ignore": ["**/*.test.ts"],
  "ignoreDependencies": [
    "@types/node",
    "typescript"
  ],
  "ignoreExportsUsedInFile": true
}
```

### Common Cleanup Patterns

#### Pattern 1: Config File Dependencies

These packages are often used only in configuration files:

```json
{
  "eslint": "Used in .eslintrc.js",
  "prettier": "Used in .prettierrc",
  "typescript": "Used in tsconfig.json",
  "babel-*": "Used in babel.config.js",
  "postcss-*": "Used in postcss.config.js",
  "tailwindcss": "Used in tailwind.config.js"
}
```

**Verification:**
```bash
# Check if referenced in config
grep -r "eslint" .eslintrc* .eslintrc.js
grep -r "prettier" .prettierrc* prettier.config.js
```

#### Pattern 2: Type-Only Dependencies

```bash
# List all @types packages
npm ls | grep "@types/"

# Verify type is used
grep -r "import.*from '@types/react'" src/  # Should be empty
grep -r "React" src/  # Should find uses
```

If a type package exists but the main package doesn't, it's unused:
```bash
# @types/lodash without lodash = unused
npm ls lodash  # Should show lodash installed
```

#### Pattern 3: Test-Only Dependencies

```bash
# Find dependencies only used in tests
npx depcheck --skip-missing

# Look for test utilities
grep -r "jest\|vitest\|mocha\|chai" package.json
grep -r "jest\|vitest\|mocha\|chai" src/  # Should be empty
```

Move test-only deps to devDependencies:
```bash
npm install --save-dev jest @testing-library/react
```

#### Pattern 4: Build-Only Dependencies

These should be in devDependencies, not dependencies:

```bash
# Common build-only packages
"webpack", "vite", "rollup", "esbuild",
"babel-*", "@babel/*",
"typescript", "ts-node",
"eslint", "prettier",
"husky", "lint-staged"
```

**Migration:**
```bash
# Move from dependencies to devDependencies
npm uninstall <package>
npm install --save-dev <package>
```

---

## Python

### Tools

| Tool | Use Case |
|------|----------|
| pip-autoremove | Remove package and unused deps |
| pipdeptree | Visualize dependency tree |
| deptry | Find unused/missing deps |
| vulture | Find dead Python code |

### pipdeptree Usage

```bash
# Install
pip install pipdeptree

# Show tree
pipdeptree

# JSON for processing
pipdeptree --json

# Show only top-level
pipdeptree --freeze

# Find reverse dependencies
pipdeptree --reverse --packages requests
```

### deptry Usage (Modern Solution)

```bash
# Install
pip install deptry

# Scan project
deptry .

# Configuration in pyproject.toml
[tool.deptry]
ignore_missing = ["package_to_ignore"]
ignore_obsolete = ["dev_package"]
ignore_transitive = ["implicit_dep"]
```

### Cleanup Workflow

```bash
# 1. List installed packages
pip freeze > current_requirements.txt

# 2. Find top-level only (not transitive)
pipdeptree --freeze > top_level.txt

# 3. Find unused
deptry . --json > unused.json

# 4. Remove unused
pip uninstall <package>

# 5. Regenerate requirements
pip freeze > requirements.txt
```

### Requirements File Patterns

**requirements.txt:**
```
# Pin exact versions for reproducibility
requests==2.31.0
flask==3.0.0

# Or use version ranges
requests>=2.28,<3.0
```

**pyproject.toml (modern):**
```toml
[project]
dependencies = [
    "requests>=2.28",
    "flask>=3.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=7.0",
    "black>=23.0",
]
```

---

## Go

### Built-in Tools

```bash
# Tidy removes unused dependencies
go mod tidy

# Verbose mode shows what's removed
go mod tidy -v

# Check why a module is needed
go mod why -m github.com/some/module

# Graph of dependencies
go mod graph
```

### go mod tidy Workflow

```bash
# 1. Check current state
go mod graph | wc -l  # Count dependencies

# 2. Tidy
go mod tidy -v

# 3. Verify changes
git diff go.mod go.sum

# 4. Test
go test ./...

# 5. Commit
git add go.mod go.sum
git commit -m "chore: tidy go modules"
```

### Dead Code Detection

```bash
# Install staticcheck
go install honnef.co/go/tools/cmd/staticcheck@latest

# Find unused code
staticcheck -checks=U1000 ./...

# Or use golangci-lint
golangci-lint run --enable=unused
```

---

## Rust

### cargo-udeps (Unused Dependencies)

```bash
# Install (requires nightly)
cargo install cargo-udeps --locked

# Run
cargo +nightly udeps

# With all features
cargo +nightly udeps --all-features
```

### cargo-machete (Faster Alternative)

```bash
# Install
cargo install cargo-machete

# Scan
cargo machete

# Fix automatically
cargo machete --fix
```

### Cleanup Workflow

```bash
# 1. Find unused
cargo machete

# 2. Remove from Cargo.toml
# (manual edit)

# 3. Update lockfile
cargo update

# 4. Verify
cargo build
cargo test
```

---

## Monorepo Patterns

### Turborepo / pnpm Workspaces

```bash
# Check all workspaces
pnpm -r exec npx depcheck

# Generate report per package
for pkg in packages/*; do
  echo "=== $pkg ==="
  npx depcheck "$pkg"
done
```

### Nx Workspace

```bash
# Analyze affected projects
npx nx affected:dep-graph

# Check specific project
npx nx run my-app:depcheck
```

### Lerna (Legacy)

```bash
# Run in all packages
lerna exec -- npx depcheck

# Clean all node_modules
lerna clean
```

---

## Automation Scripts

### Weekly Cleanup Check

```bash
#!/bin/bash
# weekly-deps-check.sh

echo "=== Dependency Health Check ==="
echo ""

echo "### Unused Dependencies ###"
npx depcheck --json | jq '.dependencies + .devDependencies'

echo ""
echo "### Security Issues ###"
npm audit --json | jq '.vulnerabilities | length' | xargs -I {} echo "{} vulnerabilities found"

echo ""
echo "### Outdated Packages ###"
npm outdated --json | jq 'keys | length' | xargs -I {} echo "{} packages outdated"
```

### Pre-PR Cleanup

```bash
#!/bin/bash
# pre-pr-deps.sh

# Ensure no unused deps
unused=$(npx depcheck --json | jq '.dependencies | length')
if [ "$unused" -gt 0 ]; then
  echo "Error: $unused unused dependencies found"
  npx depcheck
  exit 1
fi

# Ensure lockfile is up to date
npm ci
if [ -n "$(git status --porcelain package-lock.json)" ]; then
  echo "Error: package-lock.json out of date"
  exit 1
fi

echo "Dependencies look clean!"
```

---

## False Positive Handling

### Common False Positives

| Package | Why False Positive | Solution |
|---------|-------------------|----------|
| @types/* | Only used at compile | Add to ignoreMatches |
| babel-* plugins | Config reference only | Check babel.config.js |
| eslint-plugin-* | Config reference only | Check .eslintrc |
| postcss-* | Config reference only | Check postcss.config.js |
| jest | Test framework | Check jest.config.js |
| typescript | Compile-time only | Add to ignoreMatches |

### Verification Commands

```bash
# Verify package is actually used
grep -r "package-name" src/ --include="*.ts" --include="*.tsx"

# Check if in config files
grep -r "package-name" *.config.* .eslintrc* .babelrc*

# Check if peer dependency
npm ls package-name
```
