# Release Notes Templates

Templates for different release types and audiences.

## Standard Release

```markdown
# {Project Name} v{X.Y.Z}

**Release Date:** {YYYY-MM-DD}

---

## Highlights

{2-3 sentence summary of the most exciting changes}

---

## What's New

### Features

#### {Feature Name}
{Description of the feature and its benefits}

```{language}
// Example usage
```

#### {Feature Name}
{Description}

### Improvements

- **{Area}:** {Improvement description}
- **{Area}:** {Improvement description}

---

## Bug Fixes

- Fixed issue where {description} ([#{issue}]({url}))
- Fixed {description} that caused {problem} ([#{issue}]({url}))

---

## Breaking Changes

### {Change Title}

**Previous behavior:**
{What it was before}

**New behavior:**
{What it is now}

**Migration:**
```{language}
// Before
oldWay();

// After
newWay();
```

---

## Deprecations

The following features are deprecated and will be removed in v{X+1}.0.0:

- `oldFunction()` - Use `newFunction()` instead
- `OldComponent` - Use `NewComponent` instead

---

## Dependencies

### Updated
- {package}: {old} -> {new}

### Added
- {package} {version} - {purpose}

### Removed
- {package} - {reason}

---

## Security

- Updated {package} to address {CVE} ([Security Advisory]({url}))

---

## Performance

- Improved {operation} performance by {X}%
- Reduced bundle size by {X}KB

---

## Contributors

Thanks to everyone who contributed to this release!

{List of contributors with links to profiles}

---

## Full Changelog

[v{previous}...v{current}]({compare-url})
```

---

## Major Release

```markdown
# {Project} v{X}.0.0

**Release Date:** {YYYY-MM-DD}

---

## Overview

{Project} v{X}.0.0 is a major release that {high-level summary of theme}.

### Key Themes

- **{Theme 1}:** {Description}
- **{Theme 2}:** {Description}
- **{Theme 3}:** {Description}

---

## Upgrade Guide

### Requirements

- Node.js >= {version}
- {Other requirements}

### Migration Steps

#### Step 1: Update Dependencies

```bash
npm install {project}@{version}
```

#### Step 2: Update Configuration

{Configuration changes}

#### Step 3: Update Code

{Code changes with examples}

### Codemods

We provide automatic migration tools:

```bash
npx {project}-codemod {migration-name}
```

---

## New Features

{Detailed feature descriptions with examples}

---

## Breaking Changes

{Detailed breaking change descriptions with migrations}

---

## Deprecation Timeline

| Deprecated In | Removed In | Item | Replacement |
|---------------|------------|------|-------------|
| v{X-1}.0 | v{X}.0 | `oldThing` | `newThing` |
| v{X}.0 | v{X+1}.0 | `deprecatedThing` | `betterThing` |

---

## FAQ

### Q: {Common question}

A: {Answer}

### Q: {Common question}

A: {Answer}

---

## Getting Help

- [Documentation]({docs-url})
- [Migration Guide]({migration-url})
- [GitHub Discussions]({discussions-url})
- [Discord]({discord-url})

---

## What's Next

Preview of what's coming in v{X}.1.0:

- {Planned feature}
- {Planned feature}
```

---

## Patch Release

```markdown
# {Project} v{X.Y.Z}

**Release Date:** {YYYY-MM-DD}

This is a patch release with bug fixes and security updates.

## Bug Fixes

- {Fix description} (#{issue})
- {Fix description} (#{issue})

## Security

- {Security fix if applicable}

## Update

```bash
npm update {project}
```

[Full Changelog](v{previous}...v{current})
```

---

## Pre-Release (Alpha/Beta/RC)

```markdown
# {Project} v{X.Y.Z}-{beta.N}

**Type:** {Alpha | Beta | Release Candidate}
**Release Date:** {YYYY-MM-DD}

---

## Status

{Current stability status and what's being tested}

### Known Issues

- {Known issue 1}
- {Known issue 2}

### Not Yet Implemented

- {Pending feature}
- {Pending feature}

---

## Installation

```bash
npm install {project}@{version}
# or
npm install {project}@{tag}  # e.g., @beta, @next
```

---

## Changes Since {Previous Pre-release}

### Added
- {New item}

### Changed
- {Changed item}

### Fixed
- {Fixed item}

---

## Testing Needed

We especially need testing for:

- [ ] {Area needing testing}
- [ ] {Area needing testing}

---

## Feedback

Please report issues and feedback:

- [GitHub Issues]({url}) - Bug reports
- [GitHub Discussions]({url}) - Questions and feedback
- [Survey]({url}) - Quick feedback form

---

## Timeline

- **Beta:** {date}
- **RC:** {date}
- **Stable:** {date}
```

---

## Security Release

```markdown
# Security Release: {Project} v{X.Y.Z}

**Release Date:** {YYYY-MM-DD}
**Severity:** {Critical | High | Medium | Low}

---

## Summary

This release addresses {number} security vulnerabilities.

**All users should upgrade immediately.**

---

## Vulnerabilities Fixed

### {CVE-XXXX-XXXXX}: {Title}

**Severity:** {severity}
**CVSS Score:** {score}
**Affected Versions:** {versions}

**Description:**
{Description of the vulnerability}

**Impact:**
{What could happen if exploited}

**Mitigation:**
{Temporary mitigation if upgrade not immediately possible}

---

## Upgrade

```bash
npm update {project}
```

Verify installation:
```bash
npm list {project}
# Should show v{X.Y.Z}
```

---

## Credits

Thanks to {reporter} for responsibly disclosing this vulnerability.

---

## Questions

Contact security@{project}.com for security-related questions.
```

---

## Minimal Changelog Entry

For CHANGELOG.md file updates:

```markdown
## [{version}] - {YYYY-MM-DD}

### Added
- {Addition}

### Changed
- {Change}

### Fixed
- {Fix}

### Security
- {Security fix}
```
