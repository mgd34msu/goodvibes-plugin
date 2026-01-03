# Severity Weights

How to classify and weight issues when calculating code scores.

---

## Severity Levels

### Critical (Multiplier: 2.0x)

**Definition:** Issues that pose immediate risk to security, data integrity, or system stability.

**Characteristics:**
- Security vulnerabilities that could be exploited
- Data loss or corruption risks
- System crashes or hangs
- Compliance violations (GDPR, HIPAA, PCI)
- Production outages

**Examples:**
| Issue | Base Points | With Multiplier |
|-------|-------------|-----------------|
| SQL injection vulnerability | 2.0 | 4.0 |
| Hardcoded production secrets | 2.0 | 4.0 |
| No authentication on sensitive endpoints | 1.5 | 3.0 |
| Unencrypted PII storage | 1.5 | 3.0 |
| Memory corruption bugs | 1.5 | 3.0 |

**Action Required:** Block deployment. Fix immediately before any release.

---

### Major (Multiplier: 1.5x)

**Definition:** Issues that significantly impact functionality, performance, or maintainability.

**Characteristics:**
- Bugs affecting core functionality
- Performance bottlenecks in critical paths
- Missing error handling that could cause failures
- Design patterns that create tech debt
- Missing tests for critical functionality

**Examples:**
| Issue | Base Points | With Multiplier |
|-------|-------------|-----------------|
| N+1 query pattern in API | 1.5 | 2.25 |
| No error handling on external calls | 1.5 | 2.25 |
| God class with 500+ lines | 1.5 | 2.25 |
| Empty catch blocks | 1.0 | 1.5 |
| Circular dependencies | 1.0 | 1.5 |
| Missing input validation | 1.5 | 2.25 |

**Action Required:** Fix before merge to main. May block release depending on severity.

---

### Minor (Multiplier: 1.0x)

**Definition:** Issues that affect code quality but don't pose immediate risks.

**Characteristics:**
- Code smells and anti-patterns
- Non-critical performance issues
- Documentation gaps
- Minor style inconsistencies
- Missing edge case handling

**Examples:**
| Issue | Base Points | With Multiplier |
|-------|-------------|-----------------|
| Inconsistent naming convention | 1.0 | 1.0 |
| Missing JSDoc on public API | 1.0 | 1.0 |
| Deep nesting (4+ levels) | 1.0 | 1.0 |
| Duplicated code blocks | 1.0 | 1.0 |
| Magic numbers without constants | 1.0 | 1.0 |

**Action Required:** Should be fixed, but can be tracked for later. Does not block release.

---

### Nitpick (Multiplier: 0.5x)

**Definition:** Suggestions for improvement that don't significantly affect quality.

**Characteristics:**
- Style preferences
- Optional optimizations
- Minor readability improvements
- Alternative approaches that are equally valid
- Future-proofing suggestions

**Examples:**
| Issue | Base Points | With Multiplier |
|-------|-------------|-----------------|
| Could use template literal instead of concatenation | 0.5 | 0.25 |
| Slightly verbose variable name | 0.5 | 0.25 |
| Missing trailing comma | 0.5 | 0.25 |
| Could use destructuring | 0.5 | 0.25 |
| Outdated but secure dependency | 0.5 | 0.25 |

**Action Required:** Nice to have. Author discretion whether to address.

---

## Classification Decision Tree

```
START: Evaluate the issue

Q1: Could this cause security breach, data loss, or system crash?
    YES -> CRITICAL (2.0x)
    NO -> Continue

Q2: Does this affect core functionality or create significant tech debt?
    YES -> MAJOR (1.5x)
    NO -> Continue

Q3: Is this a code quality issue that should be fixed?
    YES -> MINOR (1.0x)
    NO -> Continue

Q4: Is this a valid improvement suggestion?
    YES -> NITPICK (0.5x)
    NO -> Not an issue (0 points)
```

---

## Context-Based Adjustments

### Escalation Factors

Increase severity by one level when:

| Factor | Example |
|--------|---------|
| **Public-facing** | Authentication bypass on public API |
| **PII/PHI data** | Missing validation on health records |
| **Financial data** | Rounding errors in payment calculations |
| **High traffic** | Memory leak in frequently called function |
| **Core functionality** | Bug in primary user workflow |

### De-escalation Factors

Decrease severity by one level when:

| Factor | Example |
|--------|---------|
| **Internal only** | Admin dashboard style issue |
| **Low traffic** | Performance issue in rarely used feature |
| **Non-production** | Test environment configuration |
| **Already mitigated** | Vulnerability behind VPN |
| **Temporary code** | Known tech debt with ticket |

---

## Severity Matrix by Category

Quick reference for typical severities within each scoring category.

### Organization

| Issue | Typical Severity |
|-------|------------------|
| File > 1000 lines | Major |
| File > 500 lines | Minor |
| Circular dependencies | Major |
| Mixed concerns | Minor |

### Naming

| Issue | Typical Severity |
|-------|------------------|
| Misleading names | Major |
| Inconsistent convention | Minor |
| Single-letter variables | Minor |
| Magic numbers | Minor |

### Error Handling

| Issue | Typical Severity |
|-------|------------------|
| No error handling (critical path) | Major |
| Empty catch blocks | Major |
| Swallowed errors | Major |
| Generic catch | Minor |

### Testing

| Issue | Typical Severity |
|-------|------------------|
| No tests at all | Critical |
| No tests for critical path | Major |
| Only happy path | Major |
| Missing edge cases | Minor |

### Performance

| Issue | Typical Severity |
|-------|------------------|
| Memory leaks | Major |
| N+1 queries | Major |
| Blocking in hot path | Major |
| Missing pagination | Minor |

### Security

| Issue | Typical Severity |
|-------|------------------|
| Injection vulnerabilities | Critical |
| Hardcoded secrets | Critical |
| Missing auth checks | Major |
| XSS vulnerabilities | Major |

### Documentation

| Issue | Typical Severity |
|-------|------------------|
| No docs at all | Major |
| Outdated docs | Minor |
| Missing API docs | Minor |
| No README | Minor |

### SOLID

| Issue | Typical Severity |
|-------|------------------|
| God class | Major |
| Tight coupling | Major |
| LSP violation | Minor |
| Fat interface | Minor |

### Dependencies

| Issue | Typical Severity |
|-------|------------------|
| Critical CVE | Critical |
| High CVE | Major |
| Circular deps | Major |
| Unlocked versions | Minor |

### Maintainability

| Issue | Typical Severity |
|-------|------------------|
| Cyclomatic complexity > 30 | Major |
| Cyclomatic complexity > 15 | Minor |
| Deep nesting | Minor |
| Duplicated code | Minor |

---

## Cumulative Effects

### Issue Accumulation

When multiple issues of the same type exist, apply diminishing returns:

```
Total = First Issue + (0.5 * Second Issue) + (0.25 * Third+)
```

**Example:** Three instances of magic numbers (1.0 points each)
```
Total = 1.0 + (0.5 * 1.0) + (0.25 * 1.0) = 1.75 points
(Not 3.0 points)
```

**Rationale:** One systemic issue (using magic numbers) shouldn't compound indefinitely.

### Pattern Recognition

If 3+ instances of the same issue exist, consider:
1. Is this a systemic problem?
2. Should it be flagged as a pattern rather than individual issues?
3. Add one "systemic pattern" issue instead of many individual ones

**Systemic pattern deduction:** 2.0 points (regardless of individual issue severity)

---

## Severity Disputes

When unsure about severity:

1. **Default to higher severity** for security-related issues
2. **Default to lower severity** for style-related issues
3. **Consult team standards** for project-specific patterns
4. **Document the reasoning** for borderline cases

### Appeals Process

For code authors to dispute severity:

```markdown
## Severity Appeal

**Issue:** [Description]
**Current Severity:** [Level]
**Proposed Severity:** [Level]

**Justification:**
- [Reason 1]
- [Reason 2]

**Mitigating Factors:**
- [Factor 1]
```
