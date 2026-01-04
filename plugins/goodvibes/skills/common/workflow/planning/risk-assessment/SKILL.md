---
name: risk-assessment
description: Identifies, evaluates, and mitigates project and task-level risks during planning. Use when assessing technical risks, evaluating complexity, identifying blockers, planning contingencies, or determining project confidence levels.
---

# Risk Assessment

Structured frameworks for identifying, evaluating, and mitigating risks in software development projects and task planning.

## Quick Start

**Assess project risk:**
```
What are the main risks in implementing this feature? Evaluate likelihood and impact.
```

**Identify blockers:**
```
What could block or delay this work? What are the technical unknowns?
```

**Evaluate complexity:**
```
How complex is this task? What factors contribute to that complexity?
```

## Risk Categories

### Technical Risks

| Risk Type | Description | Example |
|-----------|-------------|---------|
| **Unfamiliar Technology** | Team has limited experience | First time using GraphQL subscriptions |
| **Integration Complexity** | External system dependencies | Connecting to legacy SOAP API |
| **Performance Uncertainty** | Unknown scaling behavior | Real-time sync with 10k concurrent users |
| **Security Sensitivity** | Data protection requirements | PCI compliance for payment handling |
| **Architecture Impact** | Changes affect system structure | Adding multi-tenancy to existing app |

### Dependency Risks

| Risk Type | Description | Example |
|-----------|-------------|---------|
| **External Service** | Third-party reliability | Stripe API availability |
| **Team Dependencies** | Waiting on other teams | Mobile team API requirements |
| **Vendor Lock-in** | Hard to change providers | Deep AWS service integration |
| **License Issues** | Legal/compliance concerns | GPL dependency in commercial product |

### Scope Risks

| Risk Type | Description | Example |
|-----------|-------------|---------|
| **Unclear Requirements** | Ambiguous specifications | "Make it user-friendly" |
| **Scope Creep** | Expanding boundaries | "While we're at it, also add..." |
| **Hidden Complexity** | Underestimated effort | "Simple form" with 20 edge cases |
| **Missing Context** | Unknown constraints | Undocumented legacy behavior |

### Execution Risks

| Risk Type | Description | Example |
|-----------|-------------|---------|
| **Critical Path Length** | Long dependency chains | 8-task sequential chain |
| **Single Point of Failure** | One blocker stops all work | Database migration blocks everything |
| **Resource Contention** | Same files/systems modified | Three tasks editing User model |
| **Rollback Difficulty** | Hard to undo changes | Data migration without reverse |

## Risk Evaluation Framework

### Likelihood Assessment

| Level | Description | Indicators |
|-------|-------------|------------|
| **Low** | Unlikely to occur | Proven technology, clear requirements, team expertise |
| **Medium** | May occur | Some unknowns, moderate complexity, partial experience |
| **High** | Likely to occur | New technology, unclear requirements, external dependencies |

### Impact Assessment

| Level | Description | Indicators |
|-------|-------------|------------|
| **Low** | Minor inconvenience | Workarounds available, isolated scope, easy rollback |
| **Medium** | Significant delay or rework | Moderate scope impact, some downstream effects |
| **High** | Major project impact | Critical path affected, widespread changes needed |
| **Critical** | Project failure risk | Security breach, data loss, regulatory violation |

### Risk Priority Matrix

```
                    IMPACT
             Low    Medium   High    Critical
         ┌────────┬────────┬────────┬────────┐
    High │ Medium │  High  │ Critical│Critical│
         ├────────┼────────┼────────┼────────┤
  Medium │  Low   │ Medium │  High  │  High  │
LIKELIHOOD├────────┼────────┼────────┼────────┤
    Low  │  Low   │  Low   │ Medium │  High  │
         └────────┴────────┴────────┴────────┘
```

**Priority Actions:**
- **Critical:** Must address before proceeding, create contingency plan
- **High:** Address in planning, assign mitigation owner
- **Medium:** Monitor, have backup approach ready
- **Low:** Accept, document for awareness

## Risk Identification Techniques

### Pre-Mortem Analysis

Imagine the project failed. What went wrong?

```markdown
## Pre-Mortem: User Authentication Feature

Assume it's 2 weeks later and this feature failed. Possible causes:

1. OAuth provider changed their API mid-implementation
2. Session management conflicted with existing auth
3. Database migration corrupted user data
4. Security review found vulnerabilities requiring redesign
5. Mobile app couldn't integrate with new auth flow
6. Performance degraded under load testing

For each: Assess likelihood, plan mitigation
```

### Assumption Surfacing

List all assumptions and validate them:

```markdown
## Assumptions Analysis

| Assumption | Validation Method | Risk if Wrong |
|------------|-------------------|---------------|
| Users have email addresses | Check existing data | Auth flow redesign |
| API response < 200ms | Load test | Performance refactor |
| Stripe supports our region | Check documentation | Payment provider change |
| Team knows React hooks | Ask team | Training delay |
| Database handles 10k users | Capacity test | Scaling work needed |
```

### Risk Storming Questions

For each task, ask:

**Technical:**
- What technology are we least familiar with?
- What has caused problems in similar projects?
- What could fail at scale?
- What security implications exist?

**Dependencies:**
- What external services could fail?
- What team coordination is required?
- What shared resources might conflict?

**Scope:**
- What requirements are vague?
- What edge cases might we discover?
- What could users request that would change scope?

**Execution:**
- What is the longest sequential chain?
- What would block the most work if delayed?
- What is hardest to roll back?

## Risk Documentation

### Risk Register Template

```markdown
## Risk Register

### R1: OAuth Provider API Changes

**Category:** External Dependency
**Likelihood:** Medium
**Impact:** High
**Priority:** High

**Description:**
Google OAuth API could change during implementation, requiring rework of authentication flow.

**Indicators:**
- Google announces deprecation
- API version we're using is old
- Authentication suddenly fails

**Mitigation:**
- Use latest stable API version
- Abstract OAuth behind interface
- Monitor Google developer blog

**Contingency:**
- Switch to Auth0 as alternative provider
- Implement email/password as fallback

**Owner:** Backend team
**Status:** Monitoring
```

### Risk Summary Table

```markdown
| ID | Risk | Category | L | I | Priority | Mitigation | Owner |
|----|------|----------|---|---|----------|------------|-------|
| R1 | OAuth API changes | External | M | H | High | Abstract interface | BE |
| R2 | Performance at scale | Technical | M | H | High | Load test early | BE |
| R3 | Unclear mobile reqs | Scope | H | M | High | Clarify with mobile | PM |
| R4 | Migration data loss | Execution | L | C | High | Test on backup first | DBA |
| R5 | UI/UX iterations | Scope | H | L | Medium | Prototype first | FE |
```

## Complexity Assessment

### Complexity Factors

| Factor | Simple | Medium | Complex |
|--------|--------|--------|---------|
| **Files Affected** | 1-5 | 6-15 | 16+ |
| **Agents Required** | 1-2 | 3-4 | 5+ |
| **Dependency Depth** | 0-2 levels | 3-4 levels | 5+ levels |
| **New Technology** | None | 1 new tool | Multiple new tools |
| **Integration Points** | 0-1 | 2-3 | 4+ |
| **Security Sensitivity** | Public data | User data | Financial/PII |
| **Rollback Difficulty** | Trivial | Moderate | Difficult |

### Complexity Scoring

```markdown
## Complexity Assessment

**Feature:** Multi-tenant User Management

| Factor | Rating | Notes |
|--------|--------|-------|
| Files Affected | Complex (20+) | Schema, APIs, UI, middleware |
| Agents Required | Medium (4) | BE, FE, test, devops |
| Dependency Depth | Medium (3) | Schema -> API -> UI |
| New Technology | Simple | Using existing stack |
| Integration Points | Medium (3) | DB, cache, auth service |
| Security Sensitivity | Complex | Multi-tenant data isolation |
| Rollback Difficulty | Complex | Data migration involved |

**Overall Complexity:** Complex
**Confidence Level:** Medium (familiar domain, unfamiliar multi-tenancy)
```

### Confidence Levels

| Level | Description | Guidance |
|-------|-------------|----------|
| **High** | Clear requirements, known technology, team experience | Proceed with normal planning |
| **Medium** | Some unknowns, partial experience, moderate complexity | Add buffer, plan checkpoints |
| **Low** | Many unknowns, new technology, unclear requirements | Spike first, reduce scope, prototype |

## Mitigation Strategies

### By Risk Type

| Risk Type | Strategy | Example |
|-----------|----------|---------|
| **Technical Unknown** | Spike/prototype first | Build auth POC before full implementation |
| **External Dependency** | Abstract interface | Wrap payment provider in abstraction |
| **Performance** | Test early | Load test after core API done |
| **Security** | Review early | Security review before merge |
| **Scope Creep** | Clear boundaries | Document what's NOT included |
| **Integration** | Mock/stub | Mock external API for parallel work |

### Mitigation Patterns

**Defense in Depth:**
```
Primary: Use established OAuth library
Secondary: Add session validation layer
Tertiary: Implement rate limiting
Fallback: Circuit breaker for auth service
```

**Progressive Disclosure:**
```
Phase 1: Core functionality only (reduced risk)
Phase 2: Add advanced features (isolated risk)
Phase 3: Optimize and harden (known risks)
```

**Risk Transfer:**
```
Internal: Assign to team with expertise
External: Use managed service (Auth0 vs. custom)
Insurance: SLA from vendor, support contract
```

## Risk Monitoring

### Risk Indicators

For each risk, define leading indicators:

```markdown
## R1: OAuth Provider API Changes

**Leading Indicators:**
- Google developer blog announcements
- Deprecation warnings in API responses
- Community discussions about changes

**Trigger Points:**
- Any deprecation notice: Review abstraction layer
- Major version announced: Plan upgrade sprint
- API errors increasing: Investigate immediately
```

### Risk Review Checkpoints

| Checkpoint | Actions |
|------------|---------|
| **Planning Complete** | All risks identified and documented |
| **Each Group Complete** | Review for realized risks, update register |
| **Blocker Encountered** | Check if in risk register, update likelihood |
| **Project Complete** | Retrospective on risk predictions |

## Integration with Workflow Planner

This skill provides the workflow-planner agent with:

1. **Risk identification** frameworks for the Risk Factors table
2. **Complexity assessment** methodology for the Complexity section
3. **Confidence level** determination for planning output
4. **Mitigation strategies** to include in risk documentation

The workflow-planner uses these techniques when generating:
- Risk Factors table (Risk, Likelihood, Impact, Mitigation)
- Complexity Assessment section (Overall rating, Factors, Confidence)
- Task prioritization based on risk-first decomposition

## Example: Full Risk Assessment

**Feature:** Real-time Collaborative Document Editing

### Risk Register

| ID | Risk | Category | L | I | Priority | Mitigation |
|----|------|----------|---|---|----------|------------|
| R1 | CRDT algorithm complexity | Technical | H | H | Critical | Spike first, use existing library |
| R2 | WebSocket scaling | Technical | M | H | High | Load test early, plan for Redis pub/sub |
| R3 | Conflict resolution edge cases | Scope | H | M | High | Define conflict rules upfront |
| R4 | Mobile offline sync | Technical | M | H | High | Defer to phase 2 |
| R5 | Browser compatibility | Technical | L | M | Medium | Test matrix, polyfills |
| R6 | Data persistence timing | Execution | M | M | Medium | Define save strategy early |

### Complexity Assessment

| Factor | Rating | Notes |
|--------|--------|-------|
| Files Affected | Complex | Editor, sync, presence, persistence |
| Agents Required | Complex (5) | FE, BE, infra, test, security |
| Dependency Depth | Complex (5) | Long chain to full functionality |
| New Technology | Complex | CRDTs, operational transform |
| Integration Points | Complex (4) | WebSocket, DB, cache, presence |
| Security Sensitivity | Medium | Document access control |
| Rollback Difficulty | Medium | Separate from core app |

**Overall Complexity:** Complex
**Confidence Level:** Low

**Recommendation:** Conduct 2-day spike on CRDT implementation before committing to full plan. Consider using established library (Yjs, Automerge) rather than custom implementation.

### Pre-Mortem Summary

Top failure scenarios:
1. CRDT implementation too complex, delivery delayed
2. WebSocket server can't handle load, requires re-architecture
3. Edge cases in conflict resolution frustrate users
4. Mobile sync deferred creates feature gap

**Mitigation focus:** R1 (CRDT spike) and R2 (load test early) are critical path risks.
