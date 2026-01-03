# Prioritization Matrix

Framework for ordering improvements by impact, effort, dependencies, and risk.

## Impact vs Effort Matrix

```
                HIGH IMPACT
                     |
     Quick Wins      |      Major Projects
     (Do First)      |      (Plan Carefully)
                     |
LOW EFFORT ----------+---------- HIGH EFFORT
                     |
     Fill-ins        |      Thankless Tasks
     (When Time)     |      (Reconsider)
                     |
                LOW IMPACT
```

### Quadrant Actions

| Quadrant | Action | Timeline |
|----------|--------|----------|
| **Quick Wins** | Execute immediately | Hours to days |
| **Major Projects** | Plan sprints, allocate resources | Weeks to months |
| **Fill-ins** | Batch together, do between tasks | Opportunistic |
| **Thankless Tasks** | Deprioritize or eliminate | Never or automate |

---

## Impact Scoring (1-5)

| Score | Impact Level | Examples |
|-------|--------------|----------|
| **5** | Critical | Security vulnerability, data loss risk, system crash |
| **4** | High | Major performance issue, core functionality bug |
| **3** | Medium | User-facing issue, moderate tech debt |
| **2** | Low | Minor UX issue, code smell |
| **1** | Minimal | Cosmetic, nice-to-have |

### Impact Factors

```
SECURITY IMPACT
- Data exposure risk: +2
- Authentication bypass: +3
- Privilege escalation: +3
- Compliance violation: +2

RELIABILITY IMPACT
- System crash risk: +3
- Data corruption: +3
- Partial failure: +2
- Edge case failure: +1

USER IMPACT
- Blocks core workflow: +3
- Degrades experience: +2
- Minor inconvenience: +1
- Invisible to users: +0

DEVELOPER IMPACT
- Blocks future work: +2
- Slows development: +1
- Increases cognitive load: +1
- Prevents hiring/onboarding: +1
```

---

## Effort Scoring (1-5)

| Score | Effort Level | Time | Scope |
|-------|--------------|------|-------|
| **1** | Trivial | <1 hour | Single file, config change |
| **2** | Small | 1-4 hours | Few files, isolated change |
| **3** | Medium | 1-2 days | Multiple files, testing needed |
| **4** | Large | 1-2 weeks | Significant refactoring |
| **5** | Massive | 2+ weeks | Architecture change |

### Effort Multipliers

```
RISK FACTORS
- No tests exist: x1.5
- Complex dependencies: x1.3
- Production system: x1.2
- Multiple teams affected: x1.5

SKILL FACTORS
- New technology: x1.5
- Domain expertise needed: x1.3
- External dependencies: x1.4
```

---

## Priority Calculation

```
Priority Score = Impact Score / Effort Score

P0 (Critical):  Score >= 3.0 OR Security Impact 5
P1 (High):      Score >= 2.0
P2 (Medium):    Score >= 1.0
P3 (Low):       Score < 1.0
```

### Example Calculations

| Issue | Impact | Effort | Score | Priority |
|-------|--------|--------|-------|----------|
| SQL injection | 5 | 2 | 2.5 | P0 (security) |
| Reorganize files | 3 | 2 | 1.5 | P1 |
| Add strict TS | 3 | 3 | 1.0 | P2 |
| Better comments | 1 | 3 | 0.33 | P3 |

---

## Dependency Mapping

Map dependencies before sequencing work.

### Dependency Types

| Type | Description | Example |
|------|-------------|---------|
| **Technical** | Code requires other code | Types before using them |
| **Knowledge** | Learning required first | Understand system before refactoring |
| **Infrastructure** | Systems must exist | CI before automated testing |
| **Order** | Logical sequence | Organize before testing organization |

### Dependency Diagram

```
[Add TypeScript strict]
         |
         v
[Fix type errors] --> [Add Zod validation]
         |                    |
         v                    v
[Refactor API layer] --------+
         |
         v
[Add integration tests]
```

### Dependency Resolution

1. **Identify blockers**: What must complete first?
2. **Find parallel work**: What can proceed simultaneously?
3. **Sequence phases**: Group by dependency chains
4. **Mark critical path**: Longest chain determines timeline

---

## Quick Win Identification

Quick wins build momentum and demonstrate progress.

### Criteria for Quick Wins

```
MUST HAVE
- [ ] Effort score <= 2 (< 4 hours)
- [ ] Impact score >= 2 (visible improvement)
- [ ] No dependencies on other work
- [ ] Low risk of breaking changes

NICE TO HAVE
- [ ] Affects multiple files (visible in diff)
- [ ] Produces measurable metric change
- [ ] Easy to verify success
- [ ] Can demonstrate to stakeholders
```

### Common Quick Wins by Category

| Category | Quick Win | Impact | Effort |
|----------|-----------|--------|--------|
| **Formatting** | Add Prettier, format all | 2 | 1 |
| **Linting** | Add ESLint, fix auto-fixable | 3 | 1 |
| **Types** | Enable strict null checks | 3 | 2 |
| **Organization** | Add barrel exports | 2 | 1 |
| **Security** | Update dependencies | 3 | 1 |
| **Docs** | Add README sections | 2 | 1 |
| **Config** | Add .editorconfig | 1 | 1 |

---

## Risk-Based Ordering

Higher risk items need more buffer time.

### Risk Assessment

| Risk Factor | Score | Mitigation |
|-------------|-------|------------|
| **No test coverage** | +3 | Write tests first |
| **Many dependents** | +2 | Careful planning, feature flags |
| **Production system** | +2 | Staged rollout |
| **External API changes** | +2 | Backward compatibility |
| **Database migration** | +3 | Backup, rollback plan |
| **Team unfamiliar** | +2 | Pair programming, review |

### Risk-Adjusted Scheduling

```
LOW RISK (Score 0-2)
- Schedule normally
- Standard code review

MEDIUM RISK (Score 3-4)
- Add buffer time (1.5x estimate)
- Additional review
- Rollback plan ready

HIGH RISK (Score 5+)
- Add significant buffer (2x estimate)
- Multiple reviewers
- Staged rollout
- Monitoring in place
- Documented rollback
```

---

## Batching Related Work

Group related items to reduce context switching.

### Batch Categories

```
BY AREA
- All auth-related fixes together
- All API endpoint improvements
- All database queries

BY TYPE
- All type additions
- All test additions
- All documentation

BY FILE
- All changes to a module together
- Reduces merge conflicts
```

### Batch Sizing

| Team Size | Optimal Batch | Duration |
|-----------|---------------|----------|
| Solo | 3-5 items | 1-2 days |
| Pair | 5-8 items | 2-3 days |
| Team | 8-15 items | 1 sprint |

---

## Prioritization Checklist

```markdown
## Before Prioritizing
- [ ] All issues identified and documented
- [ ] Impact scores assigned
- [ ] Effort scores assigned
- [ ] Dependencies mapped

## During Prioritization
- [ ] Priority scores calculated
- [ ] Security issues flagged as P0
- [ ] Quick wins identified
- [ ] Batches created by area/type
- [ ] Risk factors considered

## Final Order
- [ ] P0 items at top
- [ ] Dependencies respected
- [ ] Quick wins early for momentum
- [ ] Risk buffered appropriately
- [ ] Related items batched
```

---

## Stakeholder Communication

### For Technical Audience

```
Priority | Issue | Impact/Effort | Dependencies
---------|-------|---------------|-------------
P0       | SQL injection | 5/2 | None
P1       | Reorganize src/ | 3/2 | None
P1       | Enable strict TS | 3/3 | Reorganize
P2       | Integration tests | 4/4 | Strict TS
```

### For Non-Technical Audience

```
Phase 1 (Critical): Fix security issues
- Prevents data breaches
- Required for compliance
- Timeline: This week

Phase 2 (High Value): Quick improvements
- Faster development after this
- Visible code quality gains
- Timeline: Next week
```
