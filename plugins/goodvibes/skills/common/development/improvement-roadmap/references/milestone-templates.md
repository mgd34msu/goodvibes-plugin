# Milestone Templates

Templates for structuring improvement phases with clear deliverables and scope.

## Milestone Structure

Every milestone includes:

```
MILESTONE: [Name]
Owner: [Team/Person]
Dependencies: [What must complete first]

Objectives:
- [Measurable goal 1]
- [Measurable goal 2]

Deliverables:
- [Concrete output 1]
- [Concrete output 2]

Definition of Done:
- [ ] [Verifiable criterion 1]
- [ ] [Verifiable criterion 2]

Success Metrics:
- [Metric]: [Current] -> [Target]
```

---

## Critical Fixes Milestone

For security and blocking issues that must be resolved first.

### Template

```markdown
## Milestone: Critical Security Fixes

**Owner**: Security lead + available developer
**Dependencies**: None (highest priority)

### Objectives
- Eliminate all P0 security vulnerabilities
- Prevent potential data breaches
- Meet compliance requirements

### Deliverables
- [ ] Patched authentication bypass
- [ ] Removed hardcoded credentials
- [ ] Input validation on all endpoints
- [ ] Security advisory published (if public)

### Definition of Done
- [ ] Security scan passes with no critical/high findings
- [ ] Penetration test validates fixes
- [ ] Changes deployed to production
- [ ] Monitoring confirms no new incidents

### Success Metrics
- Critical vulnerabilities: 5 -> 0
- High vulnerabilities: 3 -> 0
- Security score: 2/10 -> 7/10
```

### Critical Milestone Characteristics

| Aspect | Critical Milestone |
|--------|---------------------|
| **Scope** | Smallest possible to resolve crisis |
| **Team** | Best available developers |
| **Process** | Expedited review, emergency deploy |
| **Communication** | Frequent updates to stakeholders |
| **Documentation** | Post-mortem after resolution |

---

## Quick Wins Milestone

For high-impact, low-effort improvements.

### Template

```markdown
## Milestone: Code Quality Foundation

**Owner**: Tech lead
**Dependencies**: Critical fixes complete

### Objectives
- Establish consistent code style
- Enable stricter type checking
- Organize project structure

### Deliverables

#### Part 1
- [ ] Prettier configured and applied
- [ ] ESLint rules defined and auto-fixed
- [ ] Directory structure reorganized
- [ ] Barrel exports added

#### Part 2
- [ ] TypeScript strict mode enabled
- [ ] All type errors resolved
- [ ] Import aliases configured
- [ ] Pre-commit hooks installed

### Definition of Done
- [ ] `npm run lint` passes with no errors
- [ ] `npm run typecheck` passes
- [ ] No files in src/ root except index.ts
- [ ] All imports use path aliases
- [ ] CI pipeline validates on every PR

### Success Metrics
- Linting errors: 247 -> 0
- Type coverage: 60% -> 95%
- Files in src/ root: 47 -> 1
- Maintainability score: 5/10 -> 7/10
```

### Quick Wins Milestone Characteristics

| Aspect | Quick Wins Milestone |
|--------|----------------------|
| **Scope** | Focused theme (quality, organization, etc.) |
| **Team** | 1-2 developers |
| **Process** | Standard PR review |
| **Communication** | Regular updates |
| **Risk** | Low, isolated changes |

---

## Major Improvements Milestone

For significant refactoring and architecture changes.

### Template

```markdown
## Milestone: Architecture Modernization

**Owner**: Engineering team
**Dependencies**: Code quality foundation complete

### Objectives
- Reduce cyclomatic complexity across codebase
- Establish clear module boundaries
- Implement comprehensive testing

### Deliverables

#### Phase A: Analysis & Planning
- [ ] Complexity hotspots identified
- [ ] Module boundary proposals documented
- [ ] Test strategy defined
- [ ] Migration plan approved

#### Phase B: Core Refactoring
- [ ] High-complexity functions refactored
- [ ] Service layer extracted
- [ ] Domain modules created
- [ ] Unit tests added for new code

#### Phase C: Integration & Testing
- [ ] Integration tests implemented
- [ ] E2E tests for critical paths
- [ ] Performance benchmarks established
- [ ] Documentation updated

### Definition of Done
- [ ] No function exceeds 10 cyclomatic complexity
- [ ] All modules have defined public APIs
- [ ] Test coverage >= 80%
- [ ] All tests pass in CI
- [ ] Performance within 10% of baseline

### Success Metrics
- Max cyclomatic complexity: 35 -> 10
- Module coupling: High -> Low
- Test coverage: 40% -> 80%
- Maintainability: 5/10 -> 9/10

### Risk Mitigation
- Feature flags for gradual rollout
- Regular checkpoints for course correction
- Rollback plan for each major change
- Parallel running of old/new code paths
```

### Major Improvements Milestone Characteristics

| Aspect | Major Improvements Milestone |
|--------|----------------------|
| **Scope** | Major initiative with multiple phases |
| **Team** | Full team or dedicated subset |
| **Process** | Sprint planning, regular demos |
| **Communication** | Regular stakeholder updates |
| **Risk** | Medium-high, requires mitigation plan |

---

## Polish Milestone

For final refinements to reach 10/10.

### Template

```markdown
## Milestone: Production Excellence

**Owner**: Engineering leadership
**Dependencies**: Major improvements complete

### Objectives
- Achieve 10/10 quality score
- Complete all documentation
- Optimize performance

### Deliverables

#### Documentation
- [ ] API documentation complete
- [ ] Architecture decision records updated
- [ ] Runbooks for operations
- [ ] Developer onboarding guide

#### Performance
- [ ] N+1 queries eliminated
- [ ] Bundle size optimized
- [ ] Database queries optimized
- [ ] Caching implemented where appropriate

#### Edge Cases
- [ ] Error handling comprehensive
- [ ] Edge case tests added
- [ ] Accessibility compliance verified
- [ ] Security hardening complete

### Definition of Done
- [ ] All features work correctly
- [ ] Performance metrics met
- [ ] No regressions in user metrics
- [ ] Team proficient in codebase
- [ ] Technical debt at acceptable level

### Success Metrics
- Overall quality: 9/10 -> 10/10
- Documentation coverage: 70% -> 100%
- Performance benchmarks: All green
```

### Polish Milestone Characteristics

| Aspect | Polish Milestone |
|--------|---------------------|
| **Scope** | Final refinements |
| **Team** | Cross-functional teams |
| **Process** | Standard development |
| **Communication** | Final review with stakeholders |
| **Risk** | Low, refinement only |

---

## Phase Transition Criteria

### Moving to Next Phase

```markdown
## Phase Transition Checklist

### From Critical to Quick Wins
- [ ] All P0 issues resolved
- [ ] No active incidents
- [ ] Monitoring confirms stability
- [ ] Team has capacity

### From Quick Wins to Major Improvements
- [ ] Quick wins complete
- [ ] Code quality baseline established
- [ ] Technical debt inventory complete
- [ ] Architecture plan approved

### From Major Improvements to Polish
- [ ] Core improvements complete
- [ ] Test coverage adequate
- [ ] Team skills ready
- [ ] Resources available
```

---

## Milestone Communication Templates

### Kickoff Announcement

```markdown
## Starting: [Milestone Name]

**Team**: [Names]

### What We're Doing
[1-2 sentence summary]

### Why It Matters
[Business impact in plain language]

### What You'll Notice
- [Visible change 1]
- [Visible change 2]

### How to Help
- [Action item for stakeholders]
```

### Progress Update

```markdown
## [Milestone Name] - Progress Update

### Status: [On Track / At Risk / Blocked]

### Completed
- [Deliverable 1]
- [Deliverable 2]

### In Progress
- [Deliverable 3]
- [Deliverable 4]

### Metrics
- [Metric]: [Current] (Target: [Target])

### Blockers/Risks
- [Blocker if any]
```

### Completion Announcement

```markdown
## Completed: [Milestone Name]

### Summary
[What was accomplished]

### Impact
- [Metric 1]: [Before] -> [After]
- [Metric 2]: [Before] -> [After]

### What's Next
[Next milestone or steady state]

### Thanks
[Acknowledgments]
```

---

## Milestone Anti-Patterns

| Anti-Pattern | Problem | Fix |
|--------------|---------|-----|
| **Scope Creep** | Milestone never ends | Strict scope, defer additions |
| **No Metrics** | Can't prove success | Define upfront |
| **No Owner** | Diffused responsibility | Single accountable person |
| **Too Large** | Loses momentum | Break into smaller milestones |
| **Unclear Done** | Debates about completion | Explicit checkboxes |
| **No Dependencies** | Blocked mid-milestone | Map before starting |
