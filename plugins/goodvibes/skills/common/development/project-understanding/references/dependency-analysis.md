# Dependency Analysis Reference

Language and framework-specific patterns for dependency analysis.

## Node.js / JavaScript

### Package.json Analysis

```javascript
// Key sections to analyze
{
  "dependencies": {},      // Production dependencies
  "devDependencies": {},   // Development only
  "peerDependencies": {},  // Required by consumers
  "optionalDependencies": {} // Nice-to-have
}
```

### Common Commands

```bash
# List all dependencies as tree
npm ls --all

# Find why a package is installed
npm why package-name

# Check for duplicates
npm dedupe --dry-run

# Audit vulnerabilities
npm audit --audit-level=moderate

# Check outdated
npm outdated
```

### Lock File Analysis

- `package-lock.json` (npm) - Check for integrity mismatches
- `yarn.lock` (Yarn) - Look for multiple versions of same package
- `pnpm-lock.yaml` (pnpm) - Most efficient, fewer duplicates

### Red Flags

| Pattern | Risk | Action |
|---------|------|--------|
| No lock file | Inconsistent builds | Generate and commit |
| `*` or `latest` versions | Breaking changes | Pin versions |
| `>=` ranges | Unexpected updates | Use `^` or `~` |
| Git URLs as deps | Unstable | Publish to registry |
| 100+ direct deps | Bloat | Audit necessity |

## Python

### Requirements Analysis

```bash
# From requirements.txt
pip install pipdeptree
pipdeptree --json

# From pyproject.toml (Poetry)
poetry show --tree

# Security audit
pip-audit

# Check outdated
pip list --outdated
```

### Virtual Environment Check

```bash
# Verify venv is active
which python
pip -V

# List installed
pip freeze
```

### Red Flags

| Pattern | Risk | Action |
|---------|------|--------|
| No version pins | Inconsistent envs | Pin all versions |
| `==` on everything | Hard to update | Use `~=` for patches |
| System Python | Conflicts | Use venv/conda |
| requirements.txt only | Missing dev deps | Use pyproject.toml |

## Go

### Module Analysis

```bash
# Show dependency tree
go mod graph

# Find why module is needed
go mod why module-path

# Tidy unused dependencies
go mod tidy

# Check for updates
go list -m -u all

# Verify checksums
go mod verify
```

### Red Flags

| Pattern | Risk | Action |
|---------|------|--------|
| `replace` directives | Local overrides | Document reason |
| Pseudo-versions | Unstable | Wait for release |
| Indirect deps > direct | Bloat | Review necessity |

## Rust

### Cargo Analysis

```bash
# Dependency tree
cargo tree

# Find duplicates
cargo tree --duplicates

# Outdated packages
cargo outdated

# Security audit
cargo audit

# Unused dependencies
cargo +nightly udeps
```

### Red Flags

| Pattern | Risk | Action |
|---------|------|--------|
| `*` versions | Breaking | Pin versions |
| Git dependencies | Unstable | Use crates.io |
| Many feature flags | Compile time | Minimize features |

## Ruby

### Bundler Analysis

```bash
# Dependency tree
bundle list

# Why is gem installed
bundle info gem-name

# Outdated
bundle outdated

# Security
bundle audit
```

## Universal Checks

### Security Scanning

| Tool | Languages | Command |
|------|-----------|---------|
| Snyk | All | `snyk test` |
| Dependabot | All (GitHub) | Auto PRs |
| OWASP Dependency-Check | Java, .NET | `dependency-check` |
| Trivy | Containers | `trivy fs .` |

### License Compliance

```bash
# Node.js
npx license-checker --summary

# Python
pip-licenses

# Go
go-licenses csv ./...
```

### Problematic Licenses for Commercial Use

- GPL (copyleft, viral)
- AGPL (network copyleft)
- SSPL (service restriction)
- Commons Clause (commercial restriction)

### Safe Licenses

- MIT
- Apache 2.0
- BSD (2/3 clause)
- ISC
