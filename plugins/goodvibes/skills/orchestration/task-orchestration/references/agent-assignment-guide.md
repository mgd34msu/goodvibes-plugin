# Agent Assignment Guide

This guide provides the complete agent-skill assignment decision tables and examples for common task decompositions.

## Agent Type Decision Table

| Work Type | Agent Type | Rationale | Required Skills |
|-----------|------------|-----------|------------------|
| Implement API endpoints | engineer | Code creation, database integration | discover-plan-batch, precision-mastery, trpc/rest-api-design, prisma |
| Implement UI components | engineer | Component creation, styling | discover-plan-batch, precision-mastery, react, nextjs, tailwindcss |
| Create database schema | engineer | Schema design, migrations | discover-plan-batch, precision-mastery, prisma/drizzle, postgresql |
| Implement authentication | engineer | Auth integration, security | discover-plan-batch, precision-mastery, clerk/nextauth/lucia |
| Create type definitions | engineer | TypeScript types, validation | discover-plan-batch, precision-mastery |
| Review code quality | reviewer | Standards enforcement | review-scoring, type-safety, error-handling, async-patterns |
| Analyze patterns | architect | Discovery, analysis, planning | discover-plan-batch, precision-mastery |
| Plan architecture | architect | High-level design | (architect-specific skills) |
| Fix bugs | engineer | Debugging, root cause analysis | discover-plan-batch, precision-mastery, error-recovery |
| Refactor code | engineer | Code restructuring | discover-plan-batch, precision-mastery |
| Write tests | tester | Test creation, coverage, validation | discover-plan-batch, precision-mastery, error-recovery |
| Research solutions | architect | Discovery, documentation, analysis | discover-plan-batch, precision-mastery |
| Deploy application | deployer | Deployment, infrastructure setup | discover-plan-batch, precision-mastery |
| Integrate AI/ML services | integrator-ai | AI/ML service integration | discover-plan-batch, precision-mastery |
| Integrate external APIs | integrator-services | External service integration | discover-plan-batch, precision-mastery |
| Manage application state | integrator-state | State management, data flow | discover-plan-batch, precision-mastery |
| Coordinate workflows | planner | High-level orchestration, planning | discover-plan-batch, precision-mastery |

## Technology Stack → Skills Mapping

### Backend

| Technology | Skills to Include |
|------------|-------------------|
| tRPC | trpc, prisma (if using Prisma), nextauth (if auth) |
| REST API | rest-api-design, prisma/drizzle, nextauth/clerk |
| GraphQL | graphql, prisma/drizzle |
| Prisma | prisma, postgresql/mongodb |
| Drizzle | drizzle, postgresql |
| NextAuth | nextauth, prisma (if using DB sessions) |
| Clerk | clerk |
| Lucia | lucia, prisma/drizzle |

### Frontend

| Technology | Skills to Include |
|------------|-------------------|
| Next.js App Router | nextjs, react, tailwindcss |
| Next.js Pages Router | nextjs, react, tailwindcss |
| React Components | react, tailwindcss |
| Remix | remix, react, tailwindcss |
| Astro | astro, tailwindcss |
| shadcn/ui | shadcn-ui, radix-ui, tailwindcss |
| Tailwind CSS | tailwindcss |
| Framer Motion | framer-motion, react |

### Database

| Technology | Skills to Include |
|------------|-------------------|
| PostgreSQL | postgresql, prisma/drizzle |
| MongoDB | mongodb, prisma |
| Redis | redis |
| PlanetScale | postgresql, prisma/drizzle |
| Turso | postgresql, drizzle |
| Supabase | postgresql, prisma/drizzle |

## Common Task Decomposition Examples

### Example 1: Add User Authentication

**Request:** "Add authentication using NextAuth with GitHub provider"

**Decomposition:**

```yaml
tasks:
  - task_id: setup-nextauth-config
    agent: engineer
    skills: [discover-plan-batch, precision-mastery, nextauth, nextjs]
    description: Configure NextAuth with GitHub provider
    scope:
      files:
        - src/app/api/auth/[...nextauth]/route.ts
        - src/lib/auth.ts
        - .env.local (add GITHUB_ID, GITHUB_SECRET placeholders)
    blocking: [add-session-wrapper, protect-routes]
    blocked_by: []
    expected_outcome: NextAuth configured, GitHub provider added

  - task_id: add-session-wrapper
    agent: engineer
    skills: [discover-plan-batch, precision-mastery, nextjs, react]
    description: Wrap app with SessionProvider
    scope:
      files:
        - src/app/layout.tsx
    blocking: [add-auth-components]
    blocked_by: [setup-nextauth-config]
    expected_outcome: SessionProvider wraps app, session available in components

  - task_id: protect-routes
    agent: engineer
    skills: [discover-plan-batch, precision-mastery, nextjs, nextauth]
    description: Add middleware to protect authenticated routes
    scope:
      files:
        - src/middleware.ts
    blocking: []
    blocked_by: [setup-nextauth-config]
    expected_outcome: Protected routes redirect to login, public routes accessible

  - task_id: add-auth-components
    agent: engineer
    skills: [discover-plan-batch, precision-mastery, react, nextjs, shadcn-ui]
    description: Create login/logout buttons and user profile display
    scope:
      files:
        - src/components/LoginButton.tsx
        - src/components/LogoutButton.tsx
        - src/components/UserProfile.tsx
    blocking: []
    blocked_by: [add-session-wrapper]
    expected_outcome: UI components for auth, using session data
```

**Parallelism:**
- Wave 1: setup-nextauth-config
- Wave 2: add-session-wrapper + protect-routes (parallel)
- Wave 3: add-auth-components

### Example 2: Create CRUD API for Posts

**Request:** "Add API endpoints for creating, reading, updating, and deleting blog posts"

**Decomposition:**

```yaml
tasks:
  - task_id: create-post-schema
    agent: engineer
    skills: [discover-plan-batch, precision-mastery, prisma, postgresql]
    description: Add Post model to Prisma schema
    scope:
      files:
        - prisma/schema.prisma
    blocking: [create-post-types, create-post-api]
    blocked_by: []
    expected_outcome: Post model defined, migration created

  - task_id: create-post-types
    agent: engineer
    skills: [discover-plan-batch, precision-mastery]
    description: Create TypeScript types and Zod schemas for Post
    scope:
      files:
        - src/types/post.ts
    blocking: [create-post-api]
    blocked_by: [create-post-schema]
    expected_outcome: Post, CreatePostInput, UpdatePostInput types + validation

  - task_id: create-post-api
    agent: engineer
    skills: [discover-plan-batch, precision-mastery, trpc, prisma]
    description: Implement tRPC router for post CRUD operations
    scope:
      files:
        - src/server/routers/post.ts
        - src/server/routers/_app.ts (add post router)
    blocking: []
    blocked_by: [create-post-schema, create-post-types]
    expected_outcome: create, getAll, getById, update, delete procedures working
```

**Parallelism:**
- Wave 1: create-post-schema
- Wave 2: create-post-types
- Wave 3: create-post-api

### Example 3: Build Dashboard with Multiple Widgets

**Request:** "Create a dashboard page with user stats, recent activity, and quick actions"

**Decomposition:**

```yaml
tasks:
  - task_id: create-dashboard-layout
    agent: engineer
    skills: [discover-plan-batch, precision-mastery, nextjs, react, tailwindcss]
    description: Create dashboard page with grid layout
    scope:
      files:
        - src/app/dashboard/page.tsx
    blocking: [create-stats-widget, create-activity-widget, create-actions-widget]
    blocked_by: []
    expected_outcome: Dashboard page with grid layout, placeholder for widgets

  - task_id: create-stats-widget
    agent: engineer
    skills: [discover-plan-batch, precision-mastery, react, tailwindcss, shadcn-ui, trpc]
    description: Build user stats widget (posts count, views, etc.)
    scope:
      files:
        - src/components/dashboard/StatsWidget.tsx
    blocking: []
    blocked_by: [create-dashboard-layout]
    expected_outcome: Stats widget displays user metrics from API

  - task_id: create-activity-widget
    agent: engineer
    skills: [discover-plan-batch, precision-mastery, react, tailwindcss, shadcn-ui, trpc]
    description: Build recent activity widget (latest posts, comments)
    scope:
      files:
        - src/components/dashboard/ActivityWidget.tsx
    blocking: []
    blocked_by: [create-dashboard-layout]
    expected_outcome: Activity widget displays recent user actions

  - task_id: create-actions-widget
    agent: engineer
    skills: [discover-plan-batch, precision-mastery, react, tailwindcss, shadcn-ui]
    description: Build quick actions widget (create post, view profile)
    scope:
      files:
        - src/components/dashboard/ActionsWidget.tsx
    blocking: []
    blocked_by: [create-dashboard-layout]
    expected_outcome: Actions widget with buttons for common tasks
```

**Parallelism:**
- Wave 1: create-dashboard-layout
- Wave 2: create-stats-widget + create-activity-widget + create-actions-widget (3 parallel)

### Example 4: Database Migration

**Request:** "Add email verification to user accounts"

**Decomposition:**

```yaml
tasks:
  - task_id: update-user-schema
    agent: engineer
    skills: [discover-plan-batch, precision-mastery, prisma, postgresql]
    description: Add emailVerified and verificationToken fields to User model
    scope:
      files:
        - prisma/schema.prisma
    blocking: [create-verification-api, update-signup-flow]
    blocked_by: []
    expected_outcome: User model updated, migration created

  - task_id: create-verification-api
    agent: engineer
    skills: [discover-plan-batch, precision-mastery, trpc, prisma]
    description: Add API endpoints for sending and verifying email tokens
    scope:
      files:
        - src/server/routers/auth.ts (add sendVerification, verifyEmail)
    blocking: [update-signup-flow]
    blocked_by: [update-user-schema]
    expected_outcome: sendVerification and verifyEmail procedures working

  - task_id: update-signup-flow
    agent: engineer
    skills: [discover-plan-batch, precision-mastery, react, nextjs, trpc]
    description: Update signup to send verification email
    scope:
      files:
        - src/app/signup/page.tsx
        - src/components/SignupForm.tsx
    blocking: [create-verify-page]
    blocked_by: [update-user-schema, create-verification-api]
    expected_outcome: Signup sends verification email, shows pending message

  - task_id: create-verify-page
    agent: engineer
    skills: [discover-plan-batch, precision-mastery, react, nextjs, trpc]
    description: Create email verification page
    scope:
      files:
        - src/app/verify-email/page.tsx
    blocking: []
    blocked_by: [update-signup-flow]
    expected_outcome: Verification page confirms email, redirects to dashboard
```

**Parallelism:**
- Wave 1: update-user-schema
- Wave 2: create-verification-api
- Wave 3: update-signup-flow
- Wave 4: create-verify-page

### Example 5: Refactor Shared Logic

**Request:** "Extract data fetching logic into reusable server actions"

**Decomposition:**

```yaml
tasks:
  - task_id: analyze-data-fetching
    agent: engineer
    skills: [discover-plan-batch, precision-mastery]
    description: Discover all data fetching patterns in components
    scope:
      directories:
        - src/app
        - src/components
    blocking: [create-server-actions]
    blocked_by: []
    expected_outcome: List of repeated patterns, common fetch logic identified

  - task_id: create-server-actions
    agent: engineer
    skills: [discover-plan-batch, precision-mastery, nextjs, prisma]
    description: Create server actions based on discovered patterns
    scope:
      files:
        - src/actions/posts.ts
        - src/actions/users.ts
        - src/actions/comments.ts
    blocking: [refactor-pages, refactor-components]
    blocked_by: [analyze-data-fetching]
    expected_outcome: Server actions for common data operations

  - task_id: refactor-pages
    agent: engineer
    skills: [discover-plan-batch, precision-mastery, nextjs, react]
    description: Update app pages to use server actions
    scope:
      directories:
        - src/app
    blocking: []
    blocked_by: [create-server-actions]
    expected_outcome: Pages use server actions instead of inline fetching

  - task_id: refactor-components
    agent: engineer
    skills: [discover-plan-batch, precision-mastery, react]
    description: Update components to use server actions
    scope:
      directories:
        - src/components
    blocking: []
    blocked_by: [create-server-actions]
    expected_outcome: Components use server actions instead of inline fetching
```

**Parallelism:**
- Wave 1: analyze-data-fetching
- Wave 2: create-server-actions
- Wave 3: refactor-pages + refactor-components (parallel)

## Dependency Identification Patterns

### Type Dependencies

**Pattern:** Types must exist before code that uses them

**Example:**
```yaml
# Types first
task_id: create-types
blocking: [create-api, create-ui]

# Then code that uses types
task_id: create-api
blocked_by: [create-types]
```

### Database Dependencies

**Pattern:** Schema must exist before queries

**Example:**
```yaml
# Schema first
task_id: create-schema
blocking: [create-api]

# Then API that queries schema
task_id: create-api
blocked_by: [create-schema]
```

### API-UI Dependencies

**Pattern:** API can run parallel to UI if contract is defined upfront

**Example (parallel):**
```yaml
# Types define contract
task_id: create-types
blocking: [create-api, create-ui]

# API and UI both depend on types, but not each other
task_id: create-api
blocked_by: [create-types]

task_id: create-ui
blocked_by: [create-types]
```

**Example (sequential):**
```yaml
# If contract is unclear, API first
task_id: create-api
blocking: [create-ui]

# Then UI consumes discovered API
task_id: create-ui
blocked_by: [create-api]
```

### Component Hierarchy Dependencies

**Pattern:** Parent components before children if children import parent

**Example:**
```yaml
# Parent layout first
task_id: create-layout
blocking: [create-child-1, create-child-2]

# Children that import from parent
task_id: create-child-1
blocked_by: [create-layout]

task_id: create-child-2
blocked_by: [create-layout]
```

### Discovery Dependencies

**Pattern:** Analysis before implementation

**Example:**
```yaml
# Discovery first
task_id: analyze-patterns
blocking: [implement-solution]

# Implementation based on analysis
task_id: implement-solution
blocked_by: [analyze-patterns]
```

## Skill Combination Rules

### Always Include (Protocol Skills)

Every agent task must include:
- discover-plan-batch
- precision-mastery
- error-recovery
- goodvibes-memory

### Technology-Specific Skills

Add based on what the task touches:

**Backend API:**
- trpc (if using tRPC)
- rest-api-design (if using REST)
- graphql (if using GraphQL)

**Database:**
- prisma (if using Prisma)
- drizzle (if using Drizzle)
- postgresql (if using PostgreSQL)
- mongodb (if using MongoDB)

**Auth:**
- nextauth (if using NextAuth)
- clerk (if using Clerk)
- lucia (if using Lucia)

**Frontend:**
- react (if using React components)
- nextjs (if using Next.js features)
- tailwindcss (if styling)
- shadcn-ui (if using shadcn components)
- radix-ui (if using Radix primitives)

### Review Skills

For reviewer agent tasks:
- review-scoring (always)
- type-safety (if TypeScript)
- error-handling (if async code)
- async-patterns (if promises/async)
- naming-conventions (always)

## Agent Prompt Checklist

Every agent prompt must include:

- [ ] Clear task description (what to accomplish)
- [ ] Explicit scope (files to create/modify, directories in scope)
- [ ] Constraints (technical, pattern-based, dependency-based)
- [ ] Skills list with usage guidance
- [ ] Expected outcome (concrete success criteria)
- [ ] Blocking/blocked_by relationships
- [ ] WRFC participation guidance (agent does WRITE+REPORT)
- [ ] Structured output format template

## Common Mistakes

### Mistake 1: Missing Protocol Skills

**Bad:**
```yaml
task_id: create-api
skills: [trpc, prisma]
```

**Good:**
```yaml
task_id: create-api
skills: [discover-plan-batch, precision-mastery, error-recovery, goodvibes-memory, trpc, prisma]
```

### Mistake 2: Vague Scope

**Bad:**
```yaml
scope:
  - Add authentication
  - Update components
```

**Good:**
```yaml
scope:
  files:
    - src/app/api/auth/[...nextauth]/route.ts
    - src/lib/auth.ts
  directories:
    - src/components (for auth-related components)
```

### Mistake 3: Missing Dependencies

**Bad:**
```yaml
task_id: create-ui
blocking: []
blocked_by: []
```

**Good:**
```yaml
task_id: create-ui
blocking: []
blocked_by: [create-types, create-api]
```

### Mistake 4: Wrong Agent Type

**Bad:**
```yaml
task_id: review-code
agent: engineer
```

**Good:**
```yaml
task_id: review-code
agent: reviewer
skills: [review-scoring, type-safety, error-handling]
```

### Mistake 5: Over-Parallelization

**Bad:**
```yaml
# All tasks run in parallel, but API needs types!
task_id: create-types
blocking: []

task_id: create-api
blocked_by: []
```

**Good:**
```yaml
task_id: create-types
blocking: [create-api]

task_id: create-api
blocked_by: [create-types]
```
