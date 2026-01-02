# Changelog Conventions

Guidelines for generating and maintaining changelogs.

## Keep a Changelog Format

The standard format from [keepachangelog.com](https://keepachangelog.com).

### Structure

```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]
### Added
### Changed
### Deprecated
### Removed
### Fixed
### Security

## [1.0.0] - YYYY-MM-DD
### Added
- Initial release

[Unreleased]: https://github.com/owner/repo/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/owner/repo/releases/tag/v1.0.0
```

### Change Types

| Type | When to Use |
|------|-------------|
| **Added** | New features |
| **Changed** | Changes in existing functionality |
| **Deprecated** | Soon-to-be removed features |
| **Removed** | Now removed features |
| **Fixed** | Bug fixes |
| **Security** | Vulnerability fixes |

---

## Conventional Commits

Standard commit message format that enables automated changelog generation.

### Format

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Types

| Type | Description | Changelog Section |
|------|-------------|-------------------|
| `feat` | New feature | Added |
| `fix` | Bug fix | Fixed |
| `docs` | Documentation | (usually skip) |
| `style` | Formatting | (usually skip) |
| `refactor` | Code restructuring | Changed |
| `perf` | Performance improvement | Changed |
| `test` | Adding tests | (usually skip) |
| `chore` | Maintenance | (usually skip) |
| `ci` | CI configuration | (usually skip) |
| `build` | Build system | (usually skip) |

### Examples

```bash
# Feature
feat(auth): add OAuth2 login support

# Fix with issue reference
fix(api): correct rate limiting calculation

Closes #123

# Breaking change
feat(api)!: change response format for /users endpoint

BREAKING CHANGE: The /users endpoint now returns an object with
a `data` array instead of a plain array.

# Multiple footers
fix(database): resolve connection pool exhaustion

This fixes the issue where connections were not being returned
to the pool after query timeout.

Fixes #456
Reviewed-by: Jane Doe
```

### Breaking Changes

Two ways to indicate breaking changes:

1. **Exclamation mark:** `feat!:` or `feat(scope)!:`
2. **Footer:** `BREAKING CHANGE: description`

---

## Generating Changelogs from Git

### Using git log

```bash
# All commits since last tag
git log $(git describe --tags --abbrev=0)..HEAD --pretty=format:"- %s (%h)"

# Grouped by type (requires conventional commits)
git log $(git describe --tags --abbrev=0)..HEAD --pretty=format:"%s" | \
  grep -E "^feat" | sed 's/^feat[^:]*: /- /'

# With author
git log $(git describe --tags --abbrev=0)..HEAD --pretty=format:"- %s (@%an)"

# With date
git log $(git describe --tags --abbrev=0)..HEAD --pretty=format:"- %s (%ad)" --date=short
```

### Using conventional-changelog

```bash
# Install
npm install -g conventional-changelog-cli

# Generate changelog
conventional-changelog -p angular -i CHANGELOG.md -s

# Generate from scratch
conventional-changelog -p angular -i CHANGELOG.md -s -r 0
```

### Using standard-version

```bash
# Install
npm install -g standard-version

# First release
standard-version --first-release

# Subsequent releases (auto-determines version bump)
standard-version

# Specific version bump
standard-version --release-as minor
standard-version --release-as 2.0.0
```

---

## Changelog Writing Guidelines

### Good Entry Examples

```markdown
### Added
- User authentication via OAuth2 providers (Google, GitHub) (#123)
- Dark mode support with automatic system preference detection
- Export functionality for reports in CSV and PDF formats

### Changed
- Improved search performance by 40% through query optimization
- Updated dashboard layout for better mobile responsiveness
- Migrated from REST to GraphQL for user profile endpoints

### Fixed
- Resolved memory leak in long-running background jobs (#456)
- Fixed incorrect timezone handling in scheduled reports
- Corrected validation error messages for email fields

### Security
- Updated lodash to 4.17.21 to address prototype pollution (CVE-2021-23337)
- Added rate limiting to authentication endpoints
```

### Bad Entry Examples

```markdown
### Added
- Added stuff          # Too vague
- New feature          # What feature?
- Updated deps         # Not "Added", and too vague

### Fixed
- Fixed bug            # Which bug?
- Fix                  # No description
- Fixes #123           # Should describe what was fixed
```

### Writing Tips

1. **Start with a verb**: Add, Fix, Update, Remove, Improve
2. **Be specific**: Include what changed and why
3. **Include references**: Link to issues/PRs when relevant
4. **Think of users**: What do they need to know?
5. **Group related changes**: Don't repeat similar entries

---

## Version Numbering (SemVer)

### Format: MAJOR.MINOR.PATCH

| Increment | When |
|-----------|------|
| **MAJOR** | Breaking changes, incompatible API changes |
| **MINOR** | New functionality, backwards compatible |
| **PATCH** | Bug fixes, backwards compatible |

### Pre-release Versions

```
1.0.0-alpha.1
1.0.0-beta.1
1.0.0-rc.1
```

### Determining Version Bump

From conventional commits:
- `fix:` -> PATCH bump
- `feat:` -> MINOR bump
- `BREAKING CHANGE:` or `!` -> MAJOR bump

---

## Automation Tools

### GitHub Actions Workflow

```yaml
name: Release

on:
  push:
    branches: [main]

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Generate changelog
        run: |
          npm install -g conventional-changelog-cli
          conventional-changelog -p angular -i CHANGELOG.md -s

      - name: Commit changelog
        run: |
          git config user.name "github-actions"
          git config user.email "github-actions@github.com"
          git add CHANGELOG.md
          git commit -m "docs: update changelog" || exit 0
          git push
```

### release-please

Google's release automation:

```yaml
# .github/workflows/release-please.yml
name: release-please

on:
  push:
    branches: [main]

jobs:
  release-please:
    runs-on: ubuntu-latest
    steps:
      - uses: google-github-actions/release-please-action@v4
        with:
          release-type: node
```

---

## Changelog Maintenance

### When to Update

1. **Before release**: Finalize "Unreleased" section
2. **After release**: Add new "Unreleased" section
3. **Continuous**: As PRs are merged (optional)

### Release Checklist

- [ ] All entries in "Unreleased" are accurate
- [ ] Version number follows SemVer
- [ ] Date is correct (YYYY-MM-DD)
- [ ] Comparison links are updated
- [ ] Breaking changes are clearly marked
- [ ] Security fixes are highlighted
