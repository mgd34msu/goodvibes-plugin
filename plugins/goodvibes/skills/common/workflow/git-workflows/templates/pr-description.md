# PR Description Templates

Copy and customize these templates for your pull requests.

## Feature PR

```markdown
## Summary

{Brief description of the feature and its value}

## Motivation

{Why is this feature needed? Link to issue/discussion if available}

## Implementation Details

{Key technical decisions and approach}

## Changes

### Added
- {New file/component/function}
- {New file/component/function}

### Changed
- {Modified behavior}
- {Modified behavior}

## Screenshots/Demos

{Add screenshots, GIFs, or video for UI changes}

| Before | After |
|--------|-------|
| {screenshot} | {screenshot} |

## Testing

### Automated
- [ ] Unit tests added
- [ ] Integration tests added
- [ ] E2E tests added

### Manual Testing Steps
1. {Step 1}
2. {Step 2}
3. {Expected result}

## Deployment Notes

{Any special deployment considerations}

## Related Issues

- Closes #{issue}
- Part of #{epic}

## Checklist

- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] Tests pass locally
- [ ] No breaking changes (or documented)
```

---

## Bug Fix PR

```markdown
## Summary

Fixes {brief description of the bug}

## Bug Description

**Expected Behavior:** {What should happen}

**Actual Behavior:** {What was happening}

**Steps to Reproduce:**
1. {Step 1}
2. {Step 2}
3. {Bug occurs}

## Root Cause

{Technical explanation of why the bug occurred}

## Solution

{How this PR fixes the issue}

## Changes

- {File}: {Change description}
- {File}: {Change description}

## Testing

### Regression Testing
- [ ] Original bug no longer reproducible
- [ ] Related functionality still works

### New Tests
- [ ] Test added to prevent regression

## Related Issues

- Fixes #{issue}

## Checklist

- [ ] Bug is reproducible before fix
- [ ] Bug is fixed after changes
- [ ] No new bugs introduced
- [ ] Tests added
```

---

## Refactoring PR

```markdown
## Summary

Refactors {area} to improve {maintainability/performance/readability}

## Motivation

{Why is this refactoring needed?}

## Changes

### Before
{Brief description or code snippet of old approach}

### After
{Brief description or code snippet of new approach}

## What's NOT Changing

{Explicitly state what behavior is preserved}

- Feature X still works the same way
- API contract unchanged
- No changes to external interfaces

## Performance Impact

{If applicable}

| Metric | Before | After |
|--------|--------|-------|
| {metric} | {value} | {value} |

## Migration

{If any migration needed by consumers}

## Testing

- [ ] All existing tests pass
- [ ] Behavior unchanged (verified manually)
- [ ] Performance benchmarks run (if applicable)

## Checklist

- [ ] No functional changes
- [ ] All tests pass
- [ ] Code coverage maintained or improved
```

---

## Dependency Update PR

```markdown
## Summary

Updates {dependency} from {old version} to {new version}

## Motivation

{Why are we updating?}

- [ ] Security vulnerability fix
- [ ] New features needed
- [ ] Bug fix in dependency
- [ ] Routine maintenance

## Changes

| Package | From | To |
|---------|------|----|
| {package} | {version} | {version} |

## Changelog Highlights

{Key changes from dependency changelog}

- {Change 1}
- {Change 2}

## Breaking Changes

{Any breaking changes in the update and how we handle them}

## Testing

- [ ] Build passes
- [ ] Tests pass
- [ ] Manual smoke test completed
- [ ] Verified in staging environment

## Rollback Plan

{How to rollback if issues arise}

```bash
npm install {package}@{old-version}
```

## Checklist

- [ ] Dependency changelog reviewed
- [ ] Breaking changes addressed
- [ ] No security advisories on new version
```

---

## Documentation PR

```markdown
## Summary

Updates documentation for {area}

## Changes

- {Document}: {Change}
- {Document}: {Change}

## Type of Documentation Change

- [ ] New documentation
- [ ] Fix incorrect information
- [ ] Improve clarity
- [ ] Add examples
- [ ] Update for code changes

## Preview

{Link to preview if available, or paste relevant sections}

## Checklist

- [ ] Spelling/grammar checked
- [ ] Links verified
- [ ] Code examples tested
- [ ] Consistent with existing style
```

---

## Hotfix PR

```markdown
## HOTFIX: {Brief description}

**Severity:** {Critical/High/Medium}
**Affected Version(s):** {versions}
**Affected Users:** {scope of impact}

## Issue

{Description of the production issue}

## Immediate Impact

{What is happening to users right now}

## Fix

{What this PR does to fix it}

## Changes

- {Minimal, targeted changes only}

## Testing

- [ ] Fix verified locally
- [ ] Fix verified in staging
- [ ] No new issues introduced

## Deployment Plan

1. {Merge to main}
2. {Deploy to production}
3. {Verify in production}
4. {Monitor for issues}

## Rollback Plan

{Immediate rollback steps if needed}

## Post-Mortem

- [ ] Schedule post-mortem meeting
- [ ] Document timeline of events
- [ ] Identify preventive measures

## Approvals Required

- [ ] {Team lead}
- [ ] {On-call engineer}
```

---

## Quick Formats

### Tiny Change
```markdown
{One-line description}

{Slightly longer explanation if needed}
```

### Dependabot-Style
```markdown
Bumps [{package}]({url}) from {old} to {new}.

**Release notes**
{Collapsed section with release notes}

**Commits**
{List of commits}
```

### Draft PR
```markdown
## WIP: {Feature name}

**Status:** Draft - not ready for review

## Goal

{What this will accomplish when complete}

## Done

- [x] {Completed item}
- [x] {Completed item}

## TODO

- [ ] {Remaining item}
- [ ] {Remaining item}
- [ ] Write tests
- [ ] Update documentation

## Questions/Blockers

- {Question for reviewers}
- {Blocker that needs resolution}
```
