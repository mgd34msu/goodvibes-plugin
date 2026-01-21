# Agent Migration Guide: v1 → v2

## Overview

GoodVibes v2 consolidates specialized agents into unified, multi-skilled agents that use batch operations internally. This guide explains how v1 agents map to v2 agents and what behavioral changes to expect.

## Key Changes

### Agent Consolidation
- **v1**: 15+ specialized agents (backend-engineer, frontend-engineer, unit-tester, etc.)
- **v2**: 6 unified agents (engineer, reviewer, tester, architect, deployer, integrator)

### Internal Architecture
- **v1**: Direct tool usage (Read, Write, Edit, Bash)
- **v2**: Batch operations with atomic transactions, validation, recovery

### Budget Management
- **v1**: Manual tracking, no enforcement
- **v2**: Automatic budget tracking with hard limits

### Result Persistence
- **v1**: Results lost after completion
- **v2**: Results persisted to telemetry and memory systems

## Agent Consolidation Map

### v2 Unified Agents

| v2 Agent | Replaces v1 Agents | Expertise |
|----------|-------------------|-----------|
| **engineer** | backend-engineer, frontend-engineer, fullstack-engineer, api-engineer, database-engineer, component-engineer | Full-stack implementation: APIs, databases, auth, components, pages, styling |
| **reviewer** | code-reviewer, pr-reviewer, security-reviewer, performance-reviewer | Code review, PR review, security analysis, performance optimization |
| **tester** | unit-tester, integration-tester, e2e-tester, test-analyzer | All testing: unit, integration, E2E, test generation |
| **architect** | system-architect, api-designer, database-designer, state-architect | Architecture, design, planning, system design |
| **deployer** | deployment-specialist, devops-engineer, ci-engineer, infra-engineer | Deployment, DevOps, CI/CD, infrastructure |
| **integrator** | api-integrator, state-manager, form-specialist, content-manager | Integration, state management, forms, content |

## Agent Behavior Changes

### Engineer Agent

**v1 Agents:**
- `backend-engineer`: API routes, database, auth
- `frontend-engineer`: Components, pages, styling
- `fullstack-engineer`: Both backend and frontend

**v2 Unified Engineer:**
- **Skills**: All backend AND frontend skills
- **Mode-aware**: Adapts behavior based on vibecoding/justvibes
- **Batch-first**: Uses batch operations for multi-file work
- **Context-aware**: Automatically receives relevant patterns and decisions
- **Self-healing**: Automatic retry and fix loops

**Example Task Assignment:**

```yaml
# v1: Had to choose specific agent
backend-engineer: "Create user authentication API"
frontend-engineer: "Create login form component"

# v2: One agent handles both
engineer: "Implement user authentication with API and UI"
```

**Behavior:**

```yaml
# The engineer will:
# 1. Use discover to understand project structure
# 2. Create API route in single batch
# 3. Create component in same or chained batch
# 4. Run validation (typecheck, lint, test)
# 5. Auto-fix any issues
# 6. Record decisions to memory
```

### Reviewer Agent

**v1 Agents:**
- `code-reviewer`: General code review
- `pr-reviewer`: Pull request review
- `security-reviewer`: Security issues
- `performance-reviewer`: Performance issues

**v2 Unified Reviewer:**
- **Skills**: All review dimensions (quality, security, performance, accessibility)
- **Batch analysis**: Reviews all files in parallel
- **Priority ranking**: Identifies critical issues first
- **Fix suggestions**: Provides actionable fixes
- **Auto-remediation**: Can spawn engineer agents to fix

**Example:**

```yaml
# v1: Multiple review passes
code-reviewer: "Review PR #123"
security-reviewer: "Check for security issues in PR #123"
performance-reviewer: "Check for performance issues in PR #123"

# v2: Single comprehensive review
reviewer: "Review PR #123"
```

**Output:**

```markdown
## Code Review Results

### Critical Issues (2)
1. SQL Injection vulnerability in `api/users.ts:45`
2. Memory leak in `components/Dashboard.tsx:89`

### High Priority (5)
...

### Suggestions (12)
...

### Auto-fix Available
- Import ordering (ESLint --fix)
- Type annotations (TypeScript auto-fix)
```

### Tester Agent

**v1 Agents:**
- `unit-tester`: Unit tests only
- `integration-tester`: Integration tests only
- `e2e-tester`: E2E tests only
- `test-analyzer`: Test analysis

**v2 Unified Tester:**
- **Skills**: All test types (unit, integration, E2E)
- **Smart generation**: Analyzes code to determine test types needed
- **Batch creation**: Generates all test files in one batch
- **Coverage-aware**: Focuses on untested code

**Example:**

```yaml
# v1: Multiple agents for test suite
unit-tester: "Write unit tests for user service"
integration-tester: "Write integration tests for user API"
e2e-tester: "Write E2E tests for login flow"

# v2: One agent, comprehensive testing
tester: "Write tests for user authentication"
```

**Decision Making:**

```yaml
# The tester will:
# 1. Analyze authentication code
# 2. Determine test types needed:
#    - Unit: UserService methods
#    - Integration: API endpoints
#    - E2E: Full login/logout flow
# 3. Generate all tests in single batch
# 4. Run tests to verify they pass
# 5. Report coverage metrics
```

### Architect Agent

**v1 Agents:**
- `system-architect`: Overall architecture
- `api-designer`: API design
- `database-designer`: Database schema
- `state-architect`: State management

**v2 Unified Architect:**
- **Skills**: All architecture dimensions (system, API, database, state, frontend)
- **Holistic planning**: Considers entire system
- **Documentation**: Creates architectural decision records (ADRs)
- **Validation**: Checks consistency with existing patterns

**Example:**

```yaml
# v1: Multiple planning sessions
system-architect: "Design authentication system"
api-designer: "Design authentication API"
database-designer: "Design user schema"

# v2: Unified architectural design
architect: "Design authentication system"
```

**Output:**

```markdown
## Authentication System Architecture

### System Design
- JWT-based authentication
- Refresh token rotation
- OAuth2 integration support

### API Design
- POST /auth/login
- POST /auth/refresh
- POST /auth/logout
- GET /auth/me

### Database Schema
- users table
- sessions table
- oauth_providers table

### State Management
- Zustand store for auth state
- Persistent storage in localStorage
- Automatic token refresh

### Decision Records
- ADR-001: JWT over sessions (stateless, scalable)
- ADR-002: Zustand over Redux (simpler, smaller)
```

### Deployer Agent

**v1 Agents:**
- `deployment-specialist`: General deployment
- `devops-engineer`: DevOps tasks
- `ci-engineer`: CI/CD pipelines
- `infra-engineer`: Infrastructure

**v2 Unified Deployer:**
- **Skills**: All deployment dimensions (CI/CD, containers, cloud, monitoring)
- **Safe defaults**: Uses best practices automatically
- **Environment-aware**: Different configs for dev/staging/prod
- **Rollback-ready**: Creates deployment checkpoints

**Example:**

```yaml
# v1: Multiple deployment steps
ci-engineer: "Set up GitHub Actions"
infra-engineer: "Configure Vercel"
devops-engineer: "Set up monitoring"

# v2: End-to-end deployment setup
deployer: "Set up production deployment pipeline"
```

### Integrator Agent

**v1 Agents:**
- `api-integrator`: API integration
- `state-manager`: State management
- `form-specialist`: Form handling
- `content-manager`: Content handling

**v2 Unified Integrator:**
- **Skills**: All integration types (APIs, state, forms, content, third-party)
- **Type-safe**: Generates TypeScript types from APIs
- **Validation**: Adds Zod/Yup validation schemas
- **Error handling**: Comprehensive error handling

**Example:**

```yaml
# v1: Multiple integration tasks
api-integrator: "Integrate Stripe API"
state-manager: "Set up payment state"
form-specialist: "Create payment form"

# v2: Complete integration
integrator: "Integrate Stripe payment system"
```

## Spawning Agents in v2

### Single Agent

```yaml
batch:
  operations:
    exec:
      - type: agent
        agent: engineer
        task: "Implement user authentication"
        budget:
          turns: 10
          tokens: 50000
        inject:
          patterns: ["auth"]
          decisions: ["security"]
```

### Multiple Agents (Parallel)

```yaml
batch:
  operations:
    exec:
      - type: agent
        agents:
          - agent: engineer
            task: "Implement API endpoints"
            budget: { turns: 8, tokens: 40000 }

          - agent: tester
            task: "Write API tests"
            depends_on: [engineer]
            budget: { turns: 5, tokens: 20000 }

          - agent: reviewer
            task: "Review implementation"
            depends_on: [engineer, tester]
            budget: { turns: 3, tokens: 10000 }
```

### Agent Chaining

```yaml
batch:
  operations:
    exec:
      - type: agent
        agent: architect
        task: "Design authentication system"
        budget: { turns: 5, tokens: 20000 }
        chain_on_complete:
          - agent: engineer
            task: "Implement design from {{architect.outputs.design}}"
            budget: { turns: 10, tokens: 50000 }
          - agent: tester
            task: "Test implementation"
            budget: { turns: 5, tokens: 20000 }
```

## Budget Management

### v1: Manual Tracking

```markdown
No automatic budget tracking
Agent continues until task complete or user stops
No warnings about token usage
```

### v2: Automatic Budget

```yaml
agent:
  budget:
    turns: 10          # Hard limit on conversation turns
    tokens: 50000      # Hard limit on token usage
    timeout_ms: 300000 # Hard limit on execution time

# Agent automatically stops when:
# - Turns limit reached
# - Token limit reached
# - Timeout reached
# - Task marked complete
```

### Budget Utilization Tracking

```yaml
# After agent completes
result:
  agent_id: "agent_engineer_001"
  status: completed
  budget_utilization:
    turns_used: 7
    turns_limit: 10
    tokens_used: 38450
    tokens_limit: 50000
    duration_ms: 245000
    timeout_ms: 300000
  files_modified: 8
  operations_completed: 12
```

## Mode-Aware Behavior

### Vibecoding Mode

Agents in vibecoding mode:
- **Communicate progress**: Report what they're doing
- **Explain decisions**: Explain why they made choices
- **Ask on ambiguity**: Ask user when unclear
- **Report results**: Detailed completion report

**Example:**

```markdown
Engineer Agent: I'll implement user authentication with these steps:

1. Create API route at `src/app/api/auth/route.ts`
2. Add Prisma schema for User and Session
3. Implement JWT token generation
4. Create login/logout endpoints
5. Add middleware for protected routes

I'm using JWT because your project already uses @auth/core.
Proceeding with implementation...

[Creates files in batch]

Done! Created 5 files:
- src/app/api/auth/route.ts (237 lines)
- prisma/schema.prisma (added User, Session models)
- src/lib/auth.ts (JWT utilities)
- src/middleware.ts (Auth middleware)
- src/types/auth.ts (Type definitions)

All type checks passed ✓
All tests passed ✓
```

### Justvibes Mode

Agents in justvibes mode:
- **Silent execution**: No progress reports
- **Autonomous decisions**: Make best-guess without asking
- **Minimal output**: Only final results
- **Activity logging**: Log to `.goodvibes/logs/activity.md`

**Example:**

```markdown
[No agent output during execution]

Engineer Agent: Implementation complete. 5 files created, 8 files modified.
Type checks: ✓ Tests: ✓
```

**Activity Log:**

```markdown
## 2026-01-21 14:23:45 - engineer_001

Task: Implement user authentication
Status: completed
Duration: 4m 35s
Budget: 7/10 turns, 38450/50000 tokens

Files:
- Created: src/app/api/auth/route.ts
- Created: src/lib/auth.ts
- Modified: prisma/schema.prisma
- Modified: src/middleware.ts

Decisions:
- Used JWT (project already has @auth/core)
- Added refresh token rotation
- Stored sessions in Prisma
```

## Result Persistence

### v2 Agent Results

All agent results are persisted to:

1. **Telemetry** (`.goodvibes/telemetry/current.json`):
```json
{
  "agents": {
    "agent_engineer_001": {
      "id": "agent_engineer_001",
      "agent_type": "engineer",
      "task": "Implement authentication",
      "started_at": "2026-01-21T14:19:10Z",
      "completed_at": "2026-01-21T14:23:45Z",
      "status": "completed",
      "tokens_used": 38450,
      "turns_used": 7,
      "files_modified": 8,
      "summary": "Implemented JWT-based authentication..."
    }
  }
}
```

2. **Memory** (`.goodvibes/memory/decisions.md`):
```markdown
## Decision: Use JWT for Authentication

**ID**: dec_001
**Date**: 2026-01-21
**Category**: security
**Confidence**: high
**Agent**: engineer_001

**What**: Use JWT tokens for authentication instead of sessions

**Why**:
- Project already uses @auth/core (JWT-based)
- Stateless (better for scaling)
- Works well with Next.js middleware
- Refresh token rotation for security

**Scope**:
- Files: src/lib/auth.ts, src/middleware.ts
- Symbols: generateToken, verifyToken, refreshToken
```

3. **State** (`.goodvibes/state/agents.json`):
```json
{
  "completed": [
    {
      "id": "agent_engineer_001",
      "agent_type": "engineer",
      "task": "Implement authentication",
      "status": "completed",
      "files_modified": [
        "src/app/api/auth/route.ts",
        "src/lib/auth.ts",
        "prisma/schema.prisma"
      ]
    }
  ]
}
```

## Agent Communication

### v2: Inter-Agent Communication

Agents can communicate with each other:

```yaml
batch:
  operations:
    exec:
      - type: agent
        agent: architect
        task: "Design system"

      - type: agent
        agent: engineer
        task: "Implement design"
        depends_on: [architect]
        inject:
          - "{{architect.outputs.design}}"
          - "{{architect.outputs.decisions}}"

      - type: agent
        agent: reviewer
        task: "Review implementation"
        depends_on: [engineer]
        inject:
          - "{{engineer.outputs.files}}"
          - "{{engineer.outputs.summary}}"
```

**Data flow:**
1. Architect creates design document
2. Engineer receives design via injection
3. Engineer implements and outputs file list
4. Reviewer receives file list via injection

## Skills Integration

### v2: Skill Loading

Agents automatically load relevant skills based on:
- Project stack (detected via `analysis-engine/detect_stack`)
- Task keywords (matched against skill registry)
- User context (past decisions, preferences)

**Example:**

```yaml
# User task: "Add Stripe payment"
#
# Agent automatically loads:
# - skills/core/apis/rest-api-design.md
# - skills/stacks/payment/stripe.md
# - skills/core/validation/zod.md
# - skills/stacks/typescript/type-generation.md
```

### Skill Recommendations

```yaml
# If agent doesn't have needed skill:
engineer: "I'll implement GraphQL API..."

# Agent checks registry:
registry-engine/recommend_skills:
  query: "GraphQL API implementation"
  stack: ["nextjs", "typescript"]

# Results:
# - skills/core/apis/graphql.md
# - skills/stacks/apollo/apollo-server.md

# Agent loads skills and proceeds
```

## Migration Strategy

### Step 1: Map Your v1 Agent Usage

**Audit current usage:**

```bash
# Find all agent references
rg "backend-engineer|frontend-engineer|unit-tester" .
```

**Create mapping:**

| Current v1 Agent | New v2 Agent | Notes |
|-----------------|--------------|-------|
| backend-engineer | engineer | Full-stack now |
| frontend-engineer | engineer | Handles both |
| unit-tester | tester | All test types |

### Step 2: Update Task Descriptions

**Before (v1):**
```yaml
backend-engineer: "Create user API endpoint"
frontend-engineer: "Create user profile component"
```

**After (v2):**
```yaml
engineer: "Implement user profile feature (API + UI)"
```

### Step 3: Add Budget Constraints

**v2 requires budgets:**

```yaml
batch:
  operations:
    exec:
      - type: agent
        agent: engineer
        task: "..."
        budget:
          turns: 10      # Reasonable for most features
          tokens: 50000  # ~$0.15 on Sonnet
          timeout_ms: 300000  # 5 minutes
```

### Step 4: Enable Safety Features

```yaml
batch:
  operations:
    exec:
      - type: agent
        agent: engineer
        task: "..."
        budget: {...}

  config:
    transaction:
      mode: atomic
      rollback_on_fail: true
    recovery:
      checkpoint: true
      max_fix_attempts: 3
    validation:
      after: [typecheck, lint, test]
```

### Step 5: Use Chaining for Multi-Stage

```yaml
batch:
  operations:
    exec:
      - type: agent
        agent: architect
        task: "Design payment system"
        chain_on_complete:
          - agent: engineer
            task: "Implement design"
          - agent: tester
            task: "Write tests"
          - agent: reviewer
            task: "Review all"
```

## Common Patterns

### Pattern: Feature Implementation

```yaml
batch:
  operations:
    exec:
      - type: agent
        agent: engineer
        task: "Implement user notifications feature"
        budget:
          turns: 12
          tokens: 60000
        inject:
          patterns: ["notifications", "real-time"]
          decisions: ["state-management"]
        chain_on_complete:
          - agent: tester
            task: "Write comprehensive tests"
            budget: { turns: 6, tokens: 25000 }
          - agent: reviewer
            task: "Security review"
            budget: { turns: 4, tokens: 15000 }
```

### Pattern: Bug Fix

```yaml
batch:
  operations:
    exec:
      - type: agent
        agent: engineer
        task: "Fix authentication bug in src/lib/auth.ts"
        scope:
          files: ["src/lib/auth.ts", "src/middleware.ts"]
          constraints: ["Don't change API signatures"]
        budget:
          turns: 5
          tokens: 20000
```

### Pattern: Refactoring

```yaml
batch:
  operations:
    exec:
      - type: agent
        agent: architect
        task: "Plan migration from Redux to Zustand"
        budget: { turns: 5, tokens: 20000 }

      - type: agent
        agent: engineer
        task: "Execute migration plan"
        depends_on: [architect]
        inject:
          - "{{architect.outputs.plan}}"
        budget: { turns: 15, tokens: 75000 }

      - type: agent
        agent: tester
        task: "Verify all tests still pass"
        depends_on: [engineer]
        budget: { turns: 5, tokens: 20000 }
```

### Pattern: Code Review

```yaml
batch:
  operations:
    exec:
      - type: agent
        agent: reviewer
        task: "Review PR #123"
        scope:
          files: "{{pr_files}}"
        budget:
          turns: 5
          tokens: 25000
        chain_on_complete:
          - agent: engineer
            task: "Fix issues from review"
            inject:
              - "{{reviewer.outputs.issues}}"
            budget: { turns: 8, tokens: 35000 }
```

## Troubleshooting

### Issue: Agent Budget Exceeded

**Symptom**: Agent stops mid-task with "Budget exceeded"

**Solution**: Increase budget or break into smaller tasks

```yaml
# Before: Single large task
agent: engineer
task: "Implement entire e-commerce system"
budget: { turns: 10, tokens: 50000 }  # Too small

# After: Break into batches
batch:
  operations:
    exec:
      - agent: engineer
        task: "Implement product catalog"
        budget: { turns: 10, tokens: 50000 }

      - agent: engineer
        task: "Implement shopping cart"
        budget: { turns: 10, tokens: 50000 }

      - agent: engineer
        task: "Implement checkout"
        budget: { turns: 10, tokens: 50000 }
```

### Issue: Agent Stuck in Loop

**Symptom**: Agent retries same operation repeatedly

**Solution**: Check task clarity, add constraints

```yaml
# Before: Ambiguous
agent: engineer
task: "Make it faster"

# After: Specific
agent: engineer
task: "Optimize database queries in src/lib/db.ts"
scope:
  files: ["src/lib/db.ts"]
  constraints:
    - "Add indexes to Prisma schema"
    - "Use query batching"
    - "Target <100ms response time"
```

### Issue: Wrong Agent Chosen

**Symptom**: Agent doesn't have right skills

**Solution**: Be explicit about agent type

```yaml
# Before: Wrong agent
agent: engineer
task: "Review code quality"

# After: Correct agent
agent: reviewer
task: "Review code quality"
```

## Performance Comparison

### Execution Time

| Task | v1 Time | v2 Time | Improvement |
|------|---------|---------|-------------|
| Simple feature (3 files) | 5 min | 2 min | 2.5x faster |
| Complex feature (10+ files) | 20 min | 6 min | 3.3x faster |
| Bug fix (single file) | 3 min | 1 min | 3x faster |
| Code review | 8 min | 3 min | 2.7x faster |

### Token Usage

| Task | v1 Tokens | v2 Tokens | Savings |
|------|-----------|-----------|---------|
| Multi-file feature | 150,000 | 45,000 | 70% |
| Refactoring | 200,000 | 55,000 | 72% |
| Test generation | 80,000 | 25,000 | 69% |

### Reliability

| Metric | v1 | v2 |
|--------|----|----|
| First-time success rate | 65% | 85% |
| Requires manual fixes | 35% | 10% |
| Rollback needed | N/A | 5% |
| Auto-recovery success | N/A | 80% |

## Best Practices

### 1. Use Appropriate Agent

```yaml
# Good - right agent for task
architect: "Design system"
engineer: "Implement system"
tester: "Test system"
reviewer: "Review system"

# Bad - wrong agent
engineer: "Design and implement and test and review"
```

### 2. Set Realistic Budgets

```yaml
# Good - appropriate budgets
- Small bug fix: { turns: 3-5, tokens: 10000-20000 }
- Feature: { turns: 8-12, tokens: 40000-60000 }
- Large refactor: { turns: 15-20, tokens: 75000-100000 }

# Bad - arbitrary budgets
- All tasks: { turns: 50, tokens: 500000 }
```

### 3. Use Chaining for Workflows

```yaml
# Good - explicit workflow
batch:
  operations:
    exec:
      - agent: architect
        chain_on_complete: [engineer, tester, reviewer]

# Bad - manual orchestration
# User manually spawns each agent
```

### 4. Inject Context

```yaml
# Good - provide context
agent: engineer
task: "Fix authentication bug"
inject:
  patterns: ["auth"]
  decisions: ["jwt-tokens"]
  failures: ["auth-bug-456"]

# Bad - no context
agent: engineer
task: "Fix auth"
```

## Migration Checklist

- [ ] Audit current v1 agent usage
- [ ] Map v1 agents to v2 agents
- [ ] Update task descriptions (combine where appropriate)
- [ ] Add budget constraints to all agent spawns
- [ ] Enable transaction safety (`atomic` mode)
- [ ] Add validation hooks (`typecheck`, `lint`, `test`)
- [ ] Use agent chaining for workflows
- [ ] Inject relevant context (patterns, decisions)
- [ ] Test with vibecoding mode first
- [ ] Enable justvibes mode for autonomous workflows
- [ ] Monitor telemetry for budget optimization
- [ ] Review memory system for decision tracking

## Further Reading

- [Tool Migration Guide](./tool-migration.md)
- [Configuration Migration Guide](./config-migration.md)
- [Agent Coordination Specification](../../SPEC-v2.md#12-agent-coordination)
- [Batch Engine Core](../../SPEC-v2.md#3-batch-engine-core)

---

*Last updated: 2026-01-21*
*SPEC version: v2.0.0*
