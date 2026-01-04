---
name: task-decomposition
description: Breaks down complex software tasks into atomic, actionable work items using structured methodologies. Use when planning features, analyzing requirements, decomposing user stories, creating work breakdown structures, or splitting large tasks into implementable units.
---

# Task Decomposition

Structured methodologies for transforming complex, ambiguous software tasks into clear, atomic work items suitable for AI agent execution.

## Quick Start

**Break down a feature:**
```
Decompose this feature into implementable tasks: "Add user authentication with social login"
```

**Analyze requirements:**
```
Break down these requirements into a task list with clear boundaries and deliverables
```

**Split a large task:**
```
This task is too big. Help me split it into smaller, independently testable units
```

## Core Principles

### The Atomic Task Test

A task is properly decomposed when it passes ALL criteria:

| Criterion | Question | Good Example | Bad Example |
|-----------|----------|--------------|-------------|
| Single Outcome | Does it produce exactly one deliverable? | "Create User model" | "Create User model and API" |
| Verifiable | Can completion be objectively confirmed? | "API returns 200 on valid input" | "API works correctly" |
| Independent | Can it be done without waiting for other tasks? | "Write validation schema" | "Integrate with backend" |
| Bounded | Are the files/scope clearly defined? | "Edit src/models/user.ts" | "Update user-related files" |
| Testable | Can you write a test for completion? | "User.create() returns User object" | "User creation works" |

### Decomposition Depth

| Task Scope | Target Granularity | Example |
|------------|-------------------|---------|
| Epic | 5-15 features | "User Management System" -> Auth, Profile, Permissions, etc. |
| Feature | 3-10 tasks | "User Authentication" -> Schema, API, UI, Tests |
| Task | 1-5 subtasks | "Login API" -> Endpoint, Validation, Session, Error handling |
| Subtask | Atomic | "Create POST /auth/login endpoint" |

## Decomposition Methods

### 1. Vertical Slice Decomposition

Break features by user-facing functionality, not technical layers.

**Pattern:**
```
Feature: User can reset password

Vertical Slices:
1. User requests password reset (UI form + API + email trigger)
2. User receives reset email (email template + token generation)
3. User sets new password (reset form + validation + password update)
4. User sees confirmation (success UI + redirect)
```

**When to use:** User-facing features, MVPs, incremental delivery

**Advantages:**
- Each slice is deployable and testable end-to-end
- Value delivered incrementally
- Reduces integration risk

### 2. Horizontal Layer Decomposition

Break by technical architecture layers.

**Pattern:**
```
Feature: User profile management

Layers:
1. Database: Schema migrations, indexes
2. Backend: API endpoints, business logic, validation
3. Frontend: Components, forms, state management
4. Infrastructure: Caching, file storage for avatars
```

**When to use:** Infrastructure changes, platform work, cross-cutting concerns

**Advantages:**
- Clear ownership by specialist agents
- Reusable components across features
- Easier parallel execution within layers

### 3. Risk-First Decomposition

Order tasks by technical risk and uncertainty.

**Pattern:**
```
Feature: Real-time collaborative editing

Risk-Ordered Tasks:
1. [HIGH] Prototype CRDT algorithm for conflict resolution
2. [HIGH] Test WebSocket connection scaling
3. [MEDIUM] Implement cursor presence indicators
4. [MEDIUM] Build operational transform queue
5. [LOW] Add undo/redo support
6. [LOW] Style collaboration indicators
```

**When to use:** Innovative features, unfamiliar technology, tight deadlines

**Advantages:**
- Fail fast on high-risk items
- Informs go/no-go decisions early
- De-risks implementation

### 4. Dependency-First Decomposition

Order by what unblocks other work.

**Pattern:**
```
Feature: E-commerce checkout

Dependency Order:
1. [FOUNDATION] Cart data model and API
2. [FOUNDATION] Payment provider integration (Stripe setup)
3. [DEPENDS: 1] Cart UI components
4. [DEPENDS: 1,2] Checkout flow logic
5. [DEPENDS: 4] Order confirmation and receipts
6. [DEPENDS: 4] Inventory updates on purchase
```

**When to use:** Complex integrations, many interdependencies, team coordination

**Advantages:**
- Clear execution order
- Minimizes blocked work
- Enables parallel tracks

### 5. INVEST Criteria Method

Apply INVEST to each potential task:

| Letter | Criterion | Validation Question |
|--------|-----------|---------------------|
| I | Independent | Can this be done without other incomplete tasks? |
| N | Negotiable | Is there flexibility in implementation approach? |
| V | Valuable | Does completing this provide measurable value? |
| E | Estimable | Can complexity be reasonably assessed? |
| S | Small | Can this be completed in a single work session? |
| T | Testable | Can success be verified with a concrete test? |

**Decomposition process:**
1. Draft initial task list
2. Apply INVEST to each task
3. Split tasks failing any criterion
4. Repeat until all tasks pass

## Task Description Template

Use this template for each decomposed task:

```markdown
## Task: [Clear action verb] [specific thing] [in specific location]

**Objective:** [One sentence describing the outcome]

**Scope:**
- Files: [Exact files to create/modify]
- Changes: [Specific changes required]
- NOT included: [Explicit exclusions]

**Acceptance Criteria:**
- [ ] [Specific, testable criterion 1]
- [ ] [Specific, testable criterion 2]
- [ ] [Specific, testable criterion 3]

**Dependencies:**
- Requires: [Task IDs that must complete first]
- Blocks: [Task IDs waiting on this]

**Agent:** [Recommended specialist agent]
**Complexity:** Simple | Medium | Complex
```

## Decomposition Patterns by Domain

### API Development

```
Feature: User CRUD API

Tasks:
1. Create User schema/model (database layer)
2. Create User validation schemas (Zod/Yup)
3. Implement POST /users (create)
4. Implement GET /users/:id (read)
5. Implement PUT /users/:id (update)
6. Implement DELETE /users/:id (delete)
7. Implement GET /users (list with pagination)
8. Add authentication middleware
9. Write API integration tests
10. Document API endpoints (OpenAPI)
```

### Frontend Features

```
Feature: User profile page

Tasks:
1. Create ProfilePage route and layout
2. Create ProfileHeader component (avatar, name, bio)
3. Create ProfileStats component (followers, posts, etc.)
4. Create ProfileTabs component (posts, likes, saved)
5. Implement profile data fetching hook
6. Add profile edit modal
7. Implement avatar upload
8. Add loading and error states
9. Write component tests
10. Add responsive styles
```

### Database Changes

```
Feature: Add multi-tenancy support

Tasks:
1. Design tenant schema and relationships
2. Create tenant table migration
3. Add tenant_id to existing tables (migration)
4. Create tenant context middleware
5. Update queries with tenant filtering
6. Add tenant-aware indexes
7. Create tenant seeding script
8. Update tests with tenant fixtures
9. Document multi-tenant data model
```

### Infrastructure

```
Feature: Add Redis caching layer

Tasks:
1. Add Redis configuration and connection
2. Create cache utility functions (get/set/invalidate)
3. Implement cache-aside pattern for User queries
4. Add cache invalidation on User updates
5. Implement cache warming on startup
6. Add cache hit/miss metrics
7. Configure Redis for production (cluster, persistence)
8. Write cache integration tests
9. Add cache health check endpoint
```

## Anti-Patterns to Avoid

| Anti-Pattern | Problem | Fix |
|--------------|---------|-----|
| Mega-task | "Build the feature" - too vague | Break into specific deliverables |
| Implicit dependencies | Tasks assume others are done | Make dependencies explicit |
| Technology-first | "Set up Redux" without context | Tie to user value |
| Overlapping scope | Multiple tasks touch same files | Define clear file ownership |
| Missing tests | Tasks don't include test work | Always pair implementation with tests |
| Undefined boundaries | "Update user-related code" | List specific files |
| Sequential assumption | Assuming all tasks are serial | Identify parallel opportunities |

## Validation Checklist

Before finalizing decomposition:

**Completeness:**
- [ ] All requirements are covered by at least one task
- [ ] No gaps between tasks (nothing falls through cracks)
- [ ] Tests are included for each functional task

**Independence:**
- [ ] Each task has clearly defined file ownership
- [ ] Dependencies are explicit and minimized
- [ ] Parallel execution opportunities identified

**Clarity:**
- [ ] Each task has a single, clear outcome
- [ ] Acceptance criteria are testable
- [ ] Scope exclusions are documented

**Executability:**
- [ ] Agent assignments are appropriate
- [ ] Complexity ratings are consistent
- [ ] No task requires "figuring out" the approach

## Integration with Workflow Planner

This skill complements the workflow-planner agent by providing:

1. **Decomposition methodologies** for breaking down the user's request
2. **Task templates** for consistent task descriptions
3. **Validation criteria** for ensuring proper granularity
4. **Domain patterns** for common decomposition scenarios

The workflow-planner uses these techniques in its Analysis Phase before generating the Task Breakdown table.

## Example: Full Decomposition

**User Request:** "Add user authentication with Google OAuth"

**Analysis:**
- New feature, moderate complexity
- Involves backend, frontend, and configuration
- External service integration (Google)

**Decomposition (Vertical Slice + Dependency-First):**

| # | Task | Files | Dependencies | Agent | Complexity |
|---|------|-------|--------------|-------|------------|
| 1 | Configure Google OAuth credentials | .env, docs/setup.md | None | backend-engineer | Simple |
| 2 | Create User and Session models | prisma/schema.prisma | None | backend-engineer | Simple |
| 3 | Run database migration | prisma/migrations/ | Task 2 | backend-engineer | Simple |
| 4 | Implement OAuth callback handler | app/api/auth/callback/route.ts | Tasks 1, 3 | backend-engineer | Medium |
| 5 | Create session management utilities | lib/auth.ts | Task 3 | backend-engineer | Medium |
| 6 | Build Google Sign-In button component | components/GoogleSignIn.tsx | None | frontend-architect | Simple |
| 7 | Create auth context and hooks | contexts/AuthContext.tsx | Task 5 | fullstack-integrator | Medium |
| 8 | Integrate sign-in button with OAuth flow | components/GoogleSignIn.tsx | Tasks 4, 6, 7 | fullstack-integrator | Medium |
| 9 | Add protected route middleware | middleware.ts | Task 5 | backend-engineer | Medium |
| 10 | Write authentication tests | __tests__/auth/ | Tasks 4, 5, 8, 9 | test-engineer | Medium |

**Parallel Groups:**
- Group 1: Tasks 1, 2, 6 (no dependencies)
- Group 2: Tasks 3, 5, 7 (after their dependencies)
- Group 3: Tasks 4, 9 (backend, after setup)
- Group 4: Task 8 (integration)
- Group 5: Task 10 (testing)
