# Phase Templates and Examples

This document provides detailed templates for each phase of the fullstack-feature workflow, plus complete worked examples for common feature types.

## Phase Templates

### Phase 1: Understand - Agent Prompt Template

```
Your task is to clarify requirements for the feature: {FEATURE_NAME}

Steps:
1. Ask the user:
   - What is the exact functionality requested?
   - Who are the users and what are their goals?
   - What are the acceptance criteria?
   - Are there constraints (performance, accessibility, browser support)?

2. Identify affected layers based on the feature:
   - Database: new tables/columns?
   - API: new endpoints? Modify existing?
   - Types: new type definitions?
   - UI: new components? Modify existing?
   - State: new state management?
   - Tests: what types?

3. Check goodvibes memory:
   - Use precision_read to read .goodvibes/memory/{decisions,patterns,failures}.json
   - Identify relevant decisions/constraints

4. Create implementation plan:
   - Decompose feature into sub-tasks
   - Identify dependencies
   - Estimate scope (number of files)
   - Map sub-tasks to phases

5. Write requirements document to .goodvibes/memory/current-task.md

Deliverables:
- Requirements document
- Affected layers list
- Implementation plan
```

### Phase 2: Foundation - Database Agent Prompt Template

```
Your task is to design the database schema for: {FEATURE_NAME}

Requirements:
{$REQUIREMENTS_FROM_PHASE1}

Steps:
1. Use discover tool to explore existing schema:
   discover:
     queries:
       - id: existing_schema
         type: glob
         patterns: ["prisma/schema.prisma", "src/db/**/schema.*"]
       - id: migrations
         type: glob
         patterns: ["prisma/migrations/*"]
     verbosity: files_only

2. Read existing schema to understand patterns

3. Design new tables/columns:
   - Follow existing naming conventions
   - Add appropriate indexes
   - Add foreign key constraints
   - Add timestamps (createdAt, updatedAt)

4. Create migration using precision_write

5. Run migration using precision_exec:
   precision_exec:
     commands:
       - cmd: "npx prisma migrate dev --name {MIGRATION_NAME}"
         expect:
           exit_code: 0
     verbosity: minimal

6. Generate types using precision_exec:
   precision_exec:
     commands:
       - cmd: "npx prisma generate"
         expect:
           exit_code: 0
     verbosity: minimal

7. Verify:
   precision_exec:
     commands:
       - cmd: "npm run typecheck"
         expect:
           exit_code: 0
     verbosity: minimal

Deliverables:
- Database schema updated
- Migrations applied
- Types generated
- Typecheck passes
```

### Phase 3: Core Implementation - API Agent Prompt Template

```
Your task is to implement API endpoints for: {FEATURE_NAME}

Requirements:
{$REQUIREMENTS_FROM_PHASE1}

Steps:
1. Use discover tool to explore existing API patterns:
   discover:
     queries:
       - id: existing_endpoints
         type: glob
         patterns: ["src/app/api/**/route.ts", "src/api/**/*.ts"]
       - id: validation_patterns
         type: grep
         pattern: "(^\s*const\s+\w+Schema\s*=\s*z\.)|(import \{ z \} from 'zod')"
         glob: "src/**/*.ts"
     verbosity: files_only

2. Read 1-2 existing endpoints to understand patterns

3. Implement new endpoints using precision_write:
   - Input validation with Zod
   - Error handling (try/catch)
   - Authentication/authorization checks
   - ORM for database access
   - Logging

4. Verify:
   precision_exec:
     commands:
       - cmd: "npm run typecheck"
         expect: { exit_code: 0 }
       - cmd: "npm run lint"
         expect: { exit_code: 0 }
     verbosity: minimal

Deliverables:
- All API endpoints implemented
- Input validation added
- Error handling added
- Typecheck and lint pass
```

### Phase 3: Core Implementation - UI Agent Prompt Template

```
Your task is to implement UI components for: {FEATURE_NAME}

Requirements:
{$REQUIREMENTS_FROM_PHASE1}

Steps:
1. Use discover tool to explore existing UI patterns:
   discover:
     queries:
       - id: existing_components
         type: glob
         patterns: ["src/components/**/*.tsx", "src/app/**/*.tsx"]
       - id: ui_library
         type: grep
         pattern: "import .* from '@/components/ui'"
         glob: "src/**/*.tsx"
     verbosity: files_only

2. Read 1-2 existing components to understand patterns

3. Implement new components using precision_write:
   - Accessibility (ARIA attributes, keyboard navigation)
   - Responsive design
   - Loading and error states
   - Optimization (useMemo, useCallback)

4. Verify:
   precision_exec:
     commands:
       - cmd: "npm run typecheck"
         expect: { exit_code: 0 }
       - cmd: "npm run lint"
         expect: { exit_code: 0 }
     verbosity: minimal

Deliverables:
- All UI components implemented
- Accessibility best practices followed
- Responsive design added
- Typecheck and lint pass
```

### Phase 4: Integration - Agent Prompt Template

```
Your task is to integrate UI with API for: {FEATURE_NAME}

Requirements:
{$REQUIREMENTS_FROM_PHASE1}

Steps:
1. Read API endpoints and UI components:
   precision_read:
     files:
       - path: {$API_FILES_FROM_PHASE3}
         extract: outline
       - path: {$UI_FILES_FROM_PHASE3}
         extract: outline
     verbosity: minimal

2. Use precision_edit to add API client calls to components:
   - In correct lifecycle hooks (useEffect, event handlers)
   - Handle loading states
   - Handle error states
   - Display API responses

3. Wire state management:
   - Connect state to components
   - Use selectors
   - Dispatch actions

4. Test data flow:
   precision_exec:
     commands:
       - cmd: "npm run dev"
         timeout_ms: 3000
         background: true
     verbosity: minimal

   Manually test:
   - UI -> API -> Database -> API -> UI
   - Loading states appear
   - Error states appear on failure

5. Fix any integration issues (type mismatches, data mapping)

6. Verify:
   precision_exec:
     commands:
       - cmd: "npm run typecheck"
         expect: { exit_code: 0 }
     verbosity: minimal

Deliverables:
- UI components call API endpoints
- Data flows end-to-end
- Loading and error states work
- Typecheck passes
```

### Phase 5: Quality - Tester Agent Prompt Template

```
Your task is to write tests for: {FEATURE_NAME}

Requirements:
{$REQUIREMENTS_FROM_PHASE1}

Steps:
1. Use discover tool to explore existing test patterns:
   discover:
     queries:
       - id: existing_tests
         type: glob
         patterns: ["**/*.test.ts", "**/*.spec.ts", "**/*.test.tsx"]
       - id: test_utils
         type: glob
         patterns: ["src/test-utils/*", "src/__tests__/*"]
     verbosity: files_only

2. Read 1-2 existing tests to understand patterns

3. Write unit tests for API endpoints

4. Write component tests for UI

5. Write integration tests for data flow

6. Target >=80% coverage for new code

7. Test both happy path and edge cases

8. Run tests using precision_exec:
   precision_exec:
     commands:
       - cmd: "npm run test -- --coverage"
         expect:
           exit_code: 0
     verbosity: standard

Deliverables:
- Unit tests for API endpoints
- Component tests for UI
- Integration tests for data flow
- >=80% coverage
- All tests pass
```

### Phase 6: Review - Reviewer Agent Prompt Template

```
Your task is to review code for: {FEATURE_NAME}

Use the review-scoring skill.

Steps:
1. Identify all files changed in this feature:
   Use git diff or precision_grep to find new/modified files

2. Read all changed files using precision_read

3. Score across all 10 dimensions:
   - Correctness (20%)
   - Completeness (15%)
   - Security (15%)
   - Performance (10%)
   - Conventions (10%)
   - Testability (10%)
   - Readability (5%)
   - Error Handling (5%)
   - Type Safety (5%)
   - Integration (5%)

4. Categorize issues as Critical/Major/Minor

5. Provide specific FILE:LINE references

6. Provide specific fix suggestions

7. Calculate overall score and verdict:
   - >= 9.5 => PASS
   - 8.0-9.49 => CONDITIONAL PASS
   - < 8.0 => FAIL

Deliverables:
- Structured review following review-scoring output format
- Clear verdict
- Actionable issues list
```

## Worked Examples

### Example 1: User Authentication System

**Feature Request**: Add user authentication with email/password login, signup, and protected routes.

**Phase 1: Understand**

Clarifications from user:
- Functionality: Email/password login, signup, logout, session management
- Users: End users accessing protected pages
- Acceptance: Users can sign up, log in, access dashboard, log out
- Constraints: Use NextAuth, follow security best practices

Affected layers:
- Database: `User` table needs `email`, `passwordHash` fields
- API: `/api/auth/*` routes for NextAuth
- Types: NextAuth Session type extensions
- UI: Login/Signup forms, dashboard layout
- State: Session state via NextAuth provider
- Tests: Auth flow unit and integration tests

Implementation plan:
1. Foundation: Add email/passwordHash to User table, migrate
2. Core (parallel):
   - API: Setup NextAuth config with Credentials provider
   - UI: Create LoginForm, SignupForm, dashboard layout
3. Integration: Wrap app with SessionProvider, add middleware for protected routes
4. Quality (parallel): Tests, security check (password hashing), a11y check (forms)
5. Review: WRFC loop
6. Commit: `feat: add user authentication with NextAuth`

**Phase 2: Foundation**

Database agent output:
- Added `passwordHash` field to `User` table
- Added unique index on `email`
- Migration: `npx prisma migrate dev --name add_auth_fields`
- Types: `npx prisma generate` run

Typecheck: PASS

**Phase 3: Core Implementation** (Parallel)

API agent output:
- Created `src/app/api/auth/[...nextauth]/route.ts` for NextAuth
- Added Credentials provider with bcrypt password verification
- Added JWT session strategy
- Added error handling

UI agent output:
- Created `src/components/auth/LoginForm.tsx`
- Created `src/components/auth/SignupForm.tsx`
- Created `src/app/(auth)/login/page.tsx`
- Created `src/app/(auth)/signup/page.tsx`
- Added ARIA labels, keyboard support

State agent output:
- Created `src/lib/auth.ts` with `getServerSession` helper
- No extra state management needed (NextAuth handles it)

Typecheck: PASS
Lint: PASS

**Phase 4: Integration**

Integration agent output:
- Wrapped `src/app/layout.tsx` with `SessionProvider`
- Created `src/middleware.ts` to redirect unauthenticated users from `/dashboard`
- Added `useSession` hook to dashboard components
- Tested flow: Login -> API -> Database -> Session -> Dashboard access

Typecheck: PASS

**Phase 5: Quality** (Parallel)

Tester agent output:
- Wrote unit tests for auth API endpoints
- Wrote component tests for LoginForm/SignupForm
- Wrote integration test for full auth flow
- Coverage: 85%

Security agent output:
- Verified passwords are bcrypted
- Verified JWT secret is not hardcoded (in env var)
- Verified protected routes require authentication
- No critical issues

A11y agent output:
- Verified ARIA labels on form inputs
- Verified keyboard navigation works
- Verified focus indicators present
- No critical issues

**Phase 6: Review**

Reviewer agent output:
- Overall Score: 6.8/10
- Verdict: FAIL
- Issues:
  - Critical: SignupForm doesn't validate password strength
  - Major: No rate limiting on login endpoint
  - Major: Error messages expose too much info ("User not found" vs "Invalid credentials")
  

Fix agent output:
- Added password strength validation (min 8 chars, 1 upper, 1 lower, 1 number)
- Added `next-rate-limit` to login endpoint (max number attempts/pm)
- Generalized error messages to "Invalid credentials"

Re-reviewer agent output:
- Overall Score: 9.6/10
- Verdict: PASS
- All previous issues resolved

**Phase 7: Commit + Log**

- Git commit:
  ```
  feat: add user authentication with NextAuth
  
  - Add email/password fields to User table
  - Implement NextAuth with Credentials provider
  - Add login/signup forms with accessibility
  - Add protected route middleware
  - Add rate limiting and password validation
  - Add comprehensive test suite (85% coverage)
  
  Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
  ```

- Updated `.goodvibes/memory/decisions.json` with "auth: nextauth"
- Updated `.goodvibes/memory/patterns.json` with "rate_limiting: next-rate-limit"
- Logged to `.goodvibes/logs/tasks.jsonl`

### Example 2: Payment Integration

**Feature Request**: Add Stripe payment processing for subscription plans.

**Affected layers**:
- Database: `Subscription` table (`userId`, `stripeSubscriptionId`, `status`, `planId`)
- API: `/api/payment/create-checkout`, `/api/payment/webhook`
- UI: PricingPage component, CheckoutButton component
- Tests: Webhook handling, checkout flow

**Implementation flow**:
1. Foundation: Create Subscription table, migrate
2. Core (parallel):
   - API: Checkout session endpoint, webhook handler
   - UI: PricingPage, CheckoutButton
3. Integration: Connect buttons to checkout API, test webhooks
4. Quality (parallel): Test webhooks, security check (API key handling)
5. Review: WRFC
6. Commit: `feat: add Stripe payment integration`

### Example 3: Analytics Dashboard

**Feature Request**: Build a dashboard displaying real-time analytics with charts.

**Affected layers**:
- Database: AnalyticsEvent table (`userId`, `eventType`, `timestamp`, `metadata`)
- API: `/api/analytics/events` (GET with filters)
- UI: DashboardPage, ChartComponents (AreaChart, BarChart)
- State: Filter state (date range, event type)

**Implementation flow**:
1. Foundation: Create AnalyticsEvent table with indexes on `timestamp` + `eventType`
2. Core (parallel):
   - API: Aggregation endpoint with optimized queries
   - UI: Chart components with Recharts
   - State: Zustand store for filters
3. Integration: Wire filters to API, charts to data
4. Quality (parallel): Tests for aggregation logic, a11y for charts
5. Review: WRFC
6. Commit: `feat: add analytics dashboard`

## Dependency Diagrams

### Dependency Flow

```
Phase 1: Understand
    v
    | (Requirements, plan)
    v
Phase 2: Foundation (SEQUENTIAL)
    | - Database schema
    | - Type generation
    v
    | (Types available)
    v
Phase 3: Core Implementation (PARALLEL)
    |-- API agent
    |-- UI agent
    +-- State agent
    v
    | (API + UI + State ready)
    v
Phase 4: Integration (SEQUENTIAL)
    | - Wire UI to API
    | - Wire state to UI
    | - Test data flow
    v
    | (Full integration working)
    v
Phase 5: Quality (PARALLEL)
    |-- Tester agent
    |-- Security agent
    +-- A11y agent
    v
    | (Tests + checks passing)
    v
Phase 6: Review (SEQUENTIAL - WRFC loop)
    | - Review
    | - Fix
    | - Check
    v (loop until score >= 9.5)
    v
Phase 7: Commit + Log (SEQUENTIAL)
    | - Git commit
    | - Update memory
    | - Update logs
    v
    DONE
```

### Phase Inter-Dependencies

| Phase | Depends On | Must Complete Before |
|-------|-----------|---------------------|
| 1. Understand | None | ALL other phases |
| 2. Foundation | Phase 1 | 3 (core needs types) |
| 3. Core Implementation | Phase 2 | 4 (integration needs API+UI) |
| 4. Integration | Phase 3 | 5 (quality needs working feature) |
| 5. Quality | Phase 4 | 6 (review needs tests) |
| 6. Review | Phase 5 | 7 (commit needs PASS) |
| 7. Commit+Log | Phase 6 | None (final) |

## Common Pitfalls by Phase

### Phase 1: Understand

- **Starting work too early**: Don't spawn agents until requirements are clear
- **Forgetting to check memory**: Always check decisions/patterns/failures.json
- **Vague plan**: Be specific about files and sub-tasks

### Phase 2: Foundation

- **Skipping indexes**: Always add indexes for foreign keys and query fields
- **Not testing migrations**: Run migrations in dev and verify they work
- **Forgetting type generation**: Must run ORM type gen after schema changes

### Phase 3: Core Implementation

- **Running sequentially**: API, UI, State agents can run in parallel
- **Missing validation**: All API endpoints need input validation
- **Missing error states**: UI must handle loading and error states

### Phase 4: Integration

- **Skipping end-to-end testing**: Manually test data flow before moving to Phase 5
- **Ignoring type mismatches**: Fix all typescript errors now, not later

### Phase 5: Quality

- **Skipping tests**: Tests are not optional
- **Only happy path tests**: Test edge cases and error paths
- **Ignoring security**: Security check is not optional

### Phase 6: Review

- **Accepting low scores**: Don't exit until >= 9.5
- **Not fixing Critical issues**: All Critical and Major issues must be fixed
- **Skipping re-review**: After fixes, always re-review

### Phase 7: Commit+Log

- **Forgetting memory updates**: Always update decisions/patterns/logs
- **Poor commit messages**: Follow project conventions, be clear and concise