# Technical Debt Assessment Checklist

Systematic discovery and prioritization of technical debt across all categories.

## Architecture Debt

### Structural Issues

- [ ] **Circular dependencies exist**
  - Run: `npx madge --circular src/`
  - Document all cycles found
  - Prioritize by impact

- [ ] **God classes/modules present**
  - Files > 500 lines
  - Classes with > 15 methods
  - Modules imported by > 30% of codebase

- [ ] **Wrong architecture pattern**
  - Pattern doesn't match problem domain
  - Partial pattern implementation
  - Mixed patterns without clear boundaries

- [ ] **Missing abstraction layers**
  - Business logic mixed with infrastructure
  - No clear separation of concerns
  - Direct database access from UI

- [ ] **Over-engineering**
  - Abstractions with single implementation
  - Unused flexibility
  - Premature optimization

### Findings

| Issue | Location | Impact | Effort | Priority |
|-------|----------|--------|--------|----------|
| | | | | |
| | | | | |

---

## Code Debt

### Complexity Issues

- [ ] **High cyclomatic complexity**
  - Functions with CC > 15
  - Run: `npx escomplex src/` or `radon cc src/`
  - List top 10 offenders

- [ ] **High cognitive complexity**
  - Deeply nested code (> 4 levels)
  - Complex boolean expressions
  - Long methods (> 50 lines)

- [ ] **Code duplication**
  - Run: `npx jscpd src/`
  - Document duplicate blocks
  - Identify extraction opportunities

- [ ] **Dead code**
  - Unreachable code paths
  - Unused functions/classes
  - Commented-out code

### Code Quality Issues

- [ ] **Inconsistent naming**
  - Mixed naming conventions
  - Unclear variable/function names
  - Abbreviations without context

- [ ] **Missing error handling**
  - Unhandled promise rejections
  - Missing try-catch blocks
  - Silent failures

- [ ] **Magic numbers/strings**
  - Hardcoded values without explanation
  - Configuration in code
  - Environment-specific values

- [ ] **Type safety issues** (if applicable)
  - Excessive use of `any`
  - Missing type definitions
  - Type assertions hiding errors

### Findings

| Issue | Location | Impact | Effort | Priority |
|-------|----------|--------|--------|----------|
| | | | | |
| | | | | |

---

## Dependency Debt

### Security Vulnerabilities

- [ ] **Known vulnerabilities**
  - Run: `npm audit` / `pip-audit` / `snyk test`
  - List critical and high severity
  - Check if patches available

- [ ] **Outdated packages with vulns**
  - Vulnerabilities in outdated versions
  - No upgrade path available
  - Breaking changes blocking upgrade

### Outdated Dependencies

- [ ] **Major versions behind**
  - Run: `npm outdated` / `pip list --outdated`
  - List packages > 1 major version behind
  - Assess upgrade complexity

- [ ] **Deprecated packages**
  - Packages no longer maintained
  - Packages with better alternatives
  - Packages with known issues

- [ ] **Unnecessary dependencies**
  - Dependencies for unused features
  - Heavy dependencies for simple tasks
  - Duplicate functionality

### Findings

| Package | Current | Latest | Vulns? | Effort | Priority |
|---------|---------|--------|--------|--------|----------|
| | | | | | |
| | | | | | |

---

## Test Debt

### Coverage Issues

- [ ] **Overall coverage low**
  - Current coverage: ___%
  - Target coverage: 80%+
  - Critical paths untested

- [ ] **Missing unit tests**
  - Business logic without tests
  - Utility functions untested
  - Edge cases not covered

- [ ] **Missing integration tests**
  - API endpoints untested
  - Database operations untested
  - External service mocks missing

- [ ] **Missing E2E tests**
  - Critical user journeys untested
  - Cross-browser testing absent
  - Mobile testing absent

### Test Quality Issues

- [ ] **Flaky tests**
  - Tests that fail intermittently
  - Timing-dependent tests
  - Order-dependent tests

- [ ] **Slow test suite**
  - Full suite takes > 10 minutes
  - No parallel execution
  - Unnecessary test data setup

- [ ] **Poor test structure**
  - Tests testing multiple things
  - Missing assertions
  - Unclear test names

### Findings

| Area | Current Coverage | Target | Gap | Priority |
|------|-----------------|--------|-----|----------|
| | | | | |
| | | | | |

---

## Documentation Debt

### Missing Documentation

- [ ] **No API documentation**
  - Endpoints undocumented
  - Request/response schemas missing
  - Authentication unclear

- [ ] **No architecture docs**
  - No high-level overview
  - No ADRs (Architecture Decision Records)
  - No diagrams

- [ ] **No onboarding guide**
  - Setup instructions incomplete
  - Development workflow unclear
  - Contributing guidelines missing

- [ ] **Missing code comments**
  - Complex logic unexplained
  - Public API undocumented
  - Workarounds not explained

### Outdated Documentation

- [ ] **README out of date**
  - Setup instructions wrong
  - Dependencies list incorrect
  - Screenshots outdated

- [ ] **API docs don't match implementation**
  - Changed endpoints not updated
  - New parameters undocumented
  - Deprecated features still documented

- [ ] **Architecture docs stale**
  - Diagrams don't reflect reality
  - Patterns described but not used
  - New components not added

### Findings

| Documentation | Status | Impact | Effort | Priority |
|---------------|--------|--------|--------|----------|
| | | | | |
| | | | | |

---

## Infrastructure Debt

### Deployment Issues

- [ ] **Manual deployment steps**
  - No CI/CD pipeline
  - Manual configuration required
  - No automated rollback

- [ ] **Missing environments**
  - No staging environment
  - Prod differs from dev
  - No environment parity

- [ ] **No infrastructure as code**
  - Manual server setup
  - No Terraform/CDK/Pulumi
  - Configuration drift

### Monitoring Issues

- [ ] **No application monitoring**
  - No APM tool
  - No error tracking
  - No performance metrics

- [ ] **No alerting**
  - No error alerts
  - No threshold alerts
  - No on-call rotation

- [ ] **Insufficient logging**
  - Missing request logging
  - No structured logging
  - No log aggregation

### Security Issues

- [ ] **No secrets management**
  - Secrets in code/env files
  - No rotation policy
  - Shared credentials

- [ ] **Missing security headers**
  - No CORS policy
  - No CSP headers
  - No rate limiting

### Findings

| Issue | Impact | Effort | Priority |
|-------|--------|--------|----------|
| | | | |
| | | | |

---

## Process Debt

### Development Process

- [ ] **No code review process**
  - No PR reviews required
  - No review guidelines
  - No automated checks

- [ ] **No branching strategy**
  - Commits to main
  - No release branches
  - No feature branches

- [ ] **No release process**
  - Ad-hoc releases
  - No versioning
  - No changelog

### Quality Process

- [ ] **No linting/formatting**
  - Inconsistent code style
  - No automated checks
  - Manual style debates

- [ ] **No pre-commit hooks**
  - Tests not run before commit
  - Linting not enforced
  - Secrets can be committed

### Findings

| Issue | Impact | Effort | Priority |
|-------|--------|--------|----------|
| | | | |
| | | | |

---

## Debt Prioritization Matrix

### Impact Assessment

| Level | Definition | Examples |
|-------|------------|----------|
| Critical | Blocks work, security risk | Security vulns, data loss risk |
| High | Significantly slows development | God classes, no tests for core |
| Medium | Noticeable friction | Outdated deps, missing docs |
| Low | Minor inconvenience | Code style, small duplicates |

### Effort Assessment

| Level | Definition | Time |
|-------|------------|------|
| Trivial | Quick fix | < 2 hours |
| Small | Single task | 2-8 hours |
| Medium | Multi-day | 1-3 days |
| Large | Sprint-sized | 1-2 weeks |
| XL | Epic-sized | > 2 weeks |

### Priority Matrix

```
              Impact
         Low    |    High
        +-------+--------+
Large   | DEFER | PLAN   |
        +-------+--------+
Effort  | MAYBE | DO NOW |
Small   +-------+--------+
```

---

## Debt Inventory Summary

### By Category

| Category | Critical | High | Medium | Low | Total |
|----------|----------|------|--------|-----|-------|
| Architecture | | | | | |
| Code | | | | | |
| Dependencies | | | | | |
| Tests | | | | | |
| Documentation | | | | | |
| Infrastructure | | | | | |
| Process | | | | | |
| **Total** | | | | | |

### Top 10 Priority Items

| # | Item | Category | Impact | Effort | Owner | Target Date |
|---|------|----------|--------|--------|-------|-------------|
| 1 | | | | | | |
| 2 | | | | | | |
| 3 | | | | | | |
| 4 | | | | | | |
| 5 | | | | | | |
| 6 | | | | | | |
| 7 | | | | | | |
| 8 | | | | | | |
| 9 | | | | | | |
| 10 | | | | | | |

---

## Remediation Planning

### Quick Wins (This Sprint)

Items with high impact and low effort:

1. [ ] _________________
2. [ ] _________________
3. [ ] _________________

### Short-term (This Quarter)

Scheduled work for systematic improvement:

1. [ ] _________________
2. [ ] _________________
3. [ ] _________________

### Long-term (Roadmap)

Strategic initiatives:

1. [ ] _________________
2. [ ] _________________
3. [ ] _________________

### Accept/Defer

Items consciously accepted as debt:

| Item | Reason | Review Date |
|------|--------|-------------|
| | | |
| | | |

---

## Metrics to Track

### Debt Reduction Progress

| Metric | Baseline | Current | Target | Trend |
|--------|----------|---------|--------|-------|
| Total debt items | | | | |
| Critical items | | | | |
| High items | | | | |
| Test coverage | | | | |
| Dependency vulns | | | | |
| Avg complexity | | | | |

### Review Schedule

- [ ] Weekly: Quick wins progress
- [ ] Monthly: Inventory update
- [ ] Quarterly: Full reassessment
