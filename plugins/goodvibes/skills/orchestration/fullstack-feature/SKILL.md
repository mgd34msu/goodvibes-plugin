---
name: fullstack-feature
description: "Load PROACTIVELY when task involves building a complete feature across multiple layers. Use when user says \"build a feature\", \"add user profiles\", \"create a dashboard\", or any request spanning database, API, UI, and tests. Orchestrates multi-agent work sequentially: schema and migrations, API endpoints, UI components, tests, and review. Handles dependency ordering and cross-layer type sharing."
metadata:
  version: 1.0.0
  category: orchestration
  tags: [fullstack, feature, end-to-end, workflow, multi-agent]
---

## Resources
```
scripts/
  validate-feature-workflow.sh
references/
  phase-templates.md
```

# Fullstack Feature Orchestration

This skill defines the end-to-end workflow for implementing complete features that span multiple layers of the stack. It orchestrates specialized agents through 7 distinct phases, from requirements clarification through delivery.

## When to Use This Skill

Use fullstack-feature when the user requests:

- A complete feature that requires database, API, and UI changes
- End-to-end implementation with testing and review
- A new user-facing capability that touches multiple components
- Anything described as: "build X", "add X feature", "implement X capability"

**Do NOT use this skill for:**
- Single-layer changes (just API, just UI)
- Bug fixes (use bugfix or hotfix skills)
- Code review only (use review-scoring skill)
- Refactoring without new functionality

## Overview

The fullstack feature workflow consists of 7 phases:

1. **Understand** - Clarify requirements, load skills, identify affected layers
2. **Foundation** (sequential) - Database schema/migrations, type generation
3. **Core Implementation** (parallel) - API endpoints, UI components, state management
4. **Integration** (sequential) - Wire UI to API, state to UI, verify data flow
5. **Quality** (parallel) - Tests, security check, accessibility check
6. **Review** (WRFC) - Full code review, fix issues, re-review until score >= 9.5
7. **Commit + Log** - Git commit, update goodvibes memory/logs, report to user

## Phase 1: Understand

### Purpose

Ensure you have complete clarity on what to build before spawning work agents. This phase prevents wasted effort from misunderstandings.

### Steps

1. **Clarify requirements** with the user:
   - What is the exact functionality requested?
   - Who are the users and what are their goals?
   - What are the acceptance criteria (how do we know it's done)?
   - Are there specific constraints (performance, accessibility, browser support)?
   - Are there existing patterns to follow or avoid?

2. **Identify affected layers**:
   - Database: New tables/columns? Migrations?
   - API: New endpoints? Modify existing?
   - Types: New type definitions?
   - UI: New components? Modify existing?
   - State: New state management?
   - Tests: Unit, integration, e2e?

3. **Load relevant outcome skills**:
   - Backend: `trpc`, `prisma`, `postgresql`, `clerk`, `nextauth`, `graphql`, `rest-api-design`
   - Frontend: `nextjs`, `react`, `tailwindcss`, `shadcn-ui`, `framer-motion`
   - Protocol: `discover-plan-batch`, `review-scoring`, `goodvibes-memory`

4. **Check goodvibes memory**:
   - `.goodvibes/memory/decisions.json` - Architectural choices
   - `.goodvibes/memory/patterns.json` - Coding patterns
   - `.goodvibes/memory/failures.json` - Past failures to avoid

5. **Create implementation plan**:
   - Decompose feature into sub-tasks
   - Identify dependencies between sub-tasks
   - Estimate scope (how many files/components)
   - Map sub-tasks to phases (Foundation, Core, Integration)

### Output

At the end of Phase 1, you must have:

- **Requirements document** (in memory/current-task.md)
- **Affected layers list** (database, API, UI, tests)
- **Implementation plan** (decomposed sub-tasks with dependencies)
- **Loaded skills** (relevant outcome skills available)

### Mode-Specific Behavior

**Vibecoding**: Confirm with user before proceeding to Phase 2.
**Justvibes**: Auto-proceed if requirements are clear. (Pause for clarification if ambiguous.)

## Phase 2: Foundation (Sequential)

### Purpose

Establish the data model and type foundation before building any upstream code. This ensures type safety and consistency across layers.

### Steps

1. **Database schema** (if required):
   - Spawn database agent to design schema
   - Create migration files
   - Run migrations (dev environment)
   - Verify migration success

2. **Type generation** (if using Prisma/Drizzle/etc):
   - Run ORM type generation command
   - Verify types are generated
   - Commit generated types (if necessary)

3. **Shared type definitions** (if not using ORM):
   - Create `src/types/[...].ts` files
   - Define entities, DTOs, request/response types
   - Export from barrel `index.ts`

### Agent Instructions

**Database agent**:

Protocol skills (required for all agents): discover-plan-batch, precision-mastery, error-recovery, goodvibes-memory

- Use `discover-plan-batch` protocol
- Follow existing schema patterns (check memory/decisions.json)
- Add appropriate indexes for query performance
- Add foreign key constraints
- Use timestamps (`createdAt`, `updatedAt`)
- Test migration before completing

**Engineer agent (type generation)**:

Protocol skills (required for all agents): discover-plan-batch, precision-mastery, error-recovery, goodvibes-memory

- Run type generation command
- Verify types are correct (spot check generated code)
- Run `tsc` to confirm no type errors

### Clear Definition of Done

- Database schema exists, migrations applied
- Types generated and exported
- `npm run typecheck` passes
- All files committed

### Mode-Specific Behavior

**Vibecoding**: Checkpoint after this phase. Commit with message `checkpoint: foundation - schema and types`.
**Justvibes**: Auto-proceed to Phase 3.

## Phase 3: Core Implementation (Parallel)

### Purpose

Implement the main functionality across API and UI layers in parallel. This maximizes throughput and minimizes wait time.

### Sub-Phases

These sub-phases run in parallel:

1. **API endpoints** (API agent)
2. **UI components** (UI agent)
3. **State management** (State agent)

### Agent Instructions

**API agent**:

Protocol skills (required for all agents): discover-plan-batch, precision-mastery, error-recovery, goodvibes-memory

- Implement endpoints using existing patterns (check decisions.json for API style)
- Add input validation (use Zod or similar)
- Add error handling
- Add authentication/authorization checks
- Use ORM for database access
- Add logging at appropriate levels
- Use `discover-plan-batch` protocol

**UI agent**:

Protocol skills (required for all agents): discover-plan-batch, precision-mastery, error-recovery, goodvibes-memory

- Create components using existing patterns (check decisions.json for UI libraries)
- Follow accessibility best practices (ARIA attributes, keyboard navigation)
- Implement responsive design
- Add loading and error states
- Optimize performance (`useMemo`, `useCallback`)
- Use `discover-plan-batch` protocol

**State agent**:

Protocol skills (required for all agents): discover-plan-batch, precision-mastery, error-recovery, goodvibes-memory

- Implement state management using existing patterns (Zustand, Redux, etc)
- Define state shape and actions
- Add selectors for derived state
- Add persistence if required (localStorage, sessionStorage)
- Use `discover-plan-batch` protocol

### Clear Definition of Done

- All API endpoints implemented and validated
- All UI components created
- State management implemented
- `npm run typecheck` passes
- `npm run lint` passes
- All files committed

### Mode-Specific Behavior

**Vibecoding**: Checkpoint after this phase. Commit with message `checkpoint: core implementation`.
**Justvibes**: Auto-proceed to Phase 4.

## Phase 4: Integration (Sequential)

### Purpose

Connect UI to API, wire state to UI, and verify data flows end-to-end. This phase must be sequential because it depends on Phase 3 completion.

### Steps

1. **Wire UI to API**:
   - Add API client calls to components
   - Handle loading states during API calls
   - Handle error states from API
   - Display API responses in UI

2. **Wire state to UI**:
   - Connect state management to components
   - Use selectors to access state
   - Dispatch actions on user interactions
   - Verify UI updates when state changes

3. **End-to-end verification**:
   - Manually test data flow: UI -> API -> Database -> API -> UI
   - Confirm loading states appear
   - Confirm error states appear on failure
   - Confirm success states appear on success

4. **Fix integration issues**:
   - Fix type mismatches between UI and API
   - Fix data mapping issues
   - Fix state synchronization issues

### Agent Instructions

**Integration agent**:

Protocol skills (required for all agents): discover-plan-batch, precision-mastery, error-recovery, goodvibes-memory

- Read both API and UI code to understand interfaces
- Add API client calls in correct lifecycle hooks (`useEffect`, event handlers)
- Ensure error handling is present
- Ensure loading states are displayed
- Test each integration point manually
- Use `discover-plan-batch` protocol

### Clear Definition of Done

- UI components can call API endpoints
- Data flows from UI -> API -> DB -> API -> UI
- State works correctly
- Loading states display
- Error states display
- `npm run typecheck` passes
- All files committed

### Mode-Specific Behavior

**Vibecoding**: Checkpoint after this phase. Commit with message `checkpoint: integration`.
**Justvibes**: Auto-proceed to Phase 5.

## Phase 5: Quality (Parallel)

### Purpose

Verify the implementation meets quality standards across multiple dimensions. These checks run in parallel.

### Sub-Phases

These sub-phases run in parallel:

1. **Tests** (Tester agent)
2. **Security check** (Security agent)
3. **Accessibility check** (A11y agent)

### Agent Instructions

**Tester agent**:

Protocol skills (required for all agents): discover-plan-batch, precision-mastery, error-recovery, goodvibes-memory

- Write unit tests for API endpoints
- Write component tests for UI
- Write integration tests for data flow
- Target >=80% coverage for new code
- Test both happy path and edge cases
- Use `discover-plan-batch` protocol

**Security agent**:

Protocol skills (required for all agents): discover-plan-batch, precision-mastery, error-recovery, goodvibes-memory

- Check for input validation on all endpoints
- Check for authentication/authorization checks
- Check for SQL injection vulnerabilities
- Check for XSS vulnerabilities
- Check for exposed secrets
- Check for CORS configuration
- Use `discover-plan-batch` protocol

**A11y agent**:

Protocol skills (required for all agents): discover-plan-batch, precision-mastery, error-recovery, goodvibes-memory

- Check for ARIA attributes on interactive elements
- Check for keyboard navigation support
- Check for color contrast (WCAG AA)
- Check for focus indicators
- Check for alt text on images
- Use `discover-plan-batch` protocol

### Clear Definition of Done

- Tests written and passing
- Security check complete (no critical issues)
- Accessibility check complete (no critical issues)
- All files committed

### Mode-Specific Behavior

**Vibecoding**: Checkpoint after this phase. Commit with message `checkpoint: quality checks`.
**Justvibes**: Auto-proceed to Phase 6.

## Phase 6: Review (WRFC Loop)

### Purpose

Ensure all code meets production standards through systematic review and fix. Use the Work-Review-Fix-Check loop until score >= 9.5.

### WRFC Loop

1. **Review** (Reviewer agent):
   - Apply `review-scoring` skill to all new code
   - Score across all 10 dimensions
   - Produce structured review with issues and verdict

2. **Fix** (Fix agent):
   - Address all Critical and Major issues
   - Address Minor issues unless explicitly deprioritized
   - Produce fix report

3. **Check** (Re-reviewer agent):
   - Verify all issues were fixed
   - Re-score all 10 dimensions
   - Identify new issues (if any)
   - Determine verdict: PASS (>= 9.5), CONDITIONAL PASS (8.0-9.49), FAIL (< 8.0)

4. **Loop**:
   - If FAIL or CONDITIONAL PASS, repeat from step 1
   - If PASS, exit the loop

### Agent Instructions

**Reviewer agent**:

Protocol skills (required for all agents): discover-plan-batch, precision-mastery, error-recovery, goodvibes-memory

- Use `review-scoring` skill
- Score objectively, use the rubric literally
- Provide specific FILE:LINE references
- Provide specific fix suggestions
- Categorize issues as Critical/Major/Minor

**Fix agent**:

Protocol skills (required for all agents): discover-plan-batch, precision-mastery, error-recovery, goodvibes-memory

- Address all Critical and Major issues
- Document fixes applied
- Document issues not fixed (with reasons)
- Do not claim fixed without actual changes
- Use `discover-plan-batch` protocol

**Re-reviewer agent**:

Protocol skills (required for all agents): discover-plan-batch, precision-mastery, error-recovery, goodvibes-memory

- Verify each previously flagged issue was fixed
- Re-score from scratch (DO NOT copy previous scores)
- Identify new issues
- Use `review-scoring` skill

### Clear Definition of Done

- Overall score >= 9.5/10
- Verdict: PASS
- All Critical and Major issues resolved
- All files committed

### Mode-Specific Behavior

**Vibecoding**: No checkpoint here. Commit only when PASS verdict reached.
**Justvibes**: Auto-loop until PASS.

## Phase 7: Commit + Log

### Purpose

Finalize the feature by committing to git and updating project memory.

### Steps

1. **Create git commit**:
   - Stage all new/modified files
   - Write clear commit message (follow existing conventions)
   - Include `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>`
   - Commit

2. **Update goodvibes memory**:
   - Add to `.goodvibes/memory/patterns.json` (if new patterns emerged)
   - Add to `.goodvibes/memory/decisions.json` (if new decisions made)
   - Use `goodvibes-memory` skill

3. **Update goodvibes logs**:
   - Log feature completion to `.goodvibes/logs/tasks.jsonl`
   - Include feature name, files changed, final score
   - Use `goodvibes-memory` skill

4. **Report to user**:
   - Summarize what was built
   - List files created/modified
   - List commit SHA
   - List final review score
   - Provide next steps (if any)

### Clear Definition of Done

- All files committed to git
- Memory updated
- Logs updated
- User report provided

### Mode-Specific Behavior

**Vibecoding**: Confirm commit message with user before committing.
**Justvibes**: Auto-commit with generated message.

## Mode-Specific Behavior

### Vibecoding Mode

Vibecoding mode is collaborative. The orchestrator:

- **Confirms** after Phase 1 (Understand) before proceeding
- **Checkpoints** after Phases 2, 3, 4, 5 (creates git commits)
- **Confirms** commit message before final commit in Phase 7
- Pauses for approval if uncertainties arise

Checkpoint commit messages:
- `checkpoint: foundation - schema and types`
- `checkpoint: core implementation`
- `checkpoint: integration`
- `checkpoint: quality checks`

### Justvibes Mode

Justvibes mode is autonomous. The orchestrator:

- **Auto-proceeds** through all phases without user input
- Pauses only if requirements are ambiguous or critical decisions are needed
- Auto-loops in Phase 6 (until PASS verdict)
- Auto-commits in Phase 7 (generates commit message)

## Agent Orchestration Patterns

### Sequential Phases

Phases 2, 4, 6, 7 must be sequential:

- **Phase 2 (Foundation)**: Must complete before Phase 3 because API/UI code depends on types
- **Phase 4 (Integration)**: Must come after Phase 3 because it connects API+UI
- **Phase 6 (Review)**: Must come after Phase 5 because it reviews completed work
- **Phase 7 (Commit+Log)**: Must be last because it finalizes everything

### Parallel Phases

Phases 3 and 5 spawn multiple agents in parallel:

- **Phase 3 (Core)**: API agent, UI agent, State agent run in parallel
- **Phase 5 (Quality)**: Tester agent, Security agent, A11y agent run in parallel

All agents in a parallel phase must complete before proceeding to the next phase.

### Agent Communication

Agents should NOT communicate directly. Instead:

- Agents write results to filesystem
- Orchestrator reads agent outputs
- Orchestrator passes relevant info to next agents

## Integration with Other Protocols

### Discover-Plan-Batch (DPB)

All work agents must follow the DPB loop:

1. **Discover**: Use `discover` tool to run parallel grep/glob/symbol queries
2. **Plan**: Identify files to create/modify, order of operations, batch opportunities
3. **Batch**: Group operations into batched precision_engine calls
4. **Loop**: Return to discovery if assumptions change

See `discover-plan-batch` skill for details.

### Review-Scoring (WRFC)

Phase 6 uses the Work-Review-Fix-Check loop:

1. **Work**: Phases 2-5 produce the work
2. **Review**: Reviewer agent scores using review-scoring rubric
3. **Fix**: Fix agent addresses issues
4. **Check**: Re-reviewer agent verifies fixes
5. Loop until score >= 9.5

See `review-scoring` skill for details.

### Goodvibes Memory

Use `goodvibes-memory` skill to:

- Read `.goodvibes/memory/{decisions,patterns,failures}.json` in Phase 1
- Write to `.goodvibes/logs/tasks.jsonl` in Phase 7
- Update memory files with new patterns/decisions in Phase 7

## Common Pitfalls

### Starting Implementation Too Early

Do not spawn work agents until Phase 1 is complete. Clarify requirements first.

### Parallelizing Sequential Phases

Do not run Phases 2 and 3 in parallel. Phase 3 depends on Phase 2 types.

### Skipping Quality Phase

Do not skip Phase 5. Tests are not optional. Security is not optional.

### Accepting Low Review Scores

Do not exit Phase 6 until score >= 9.5. Loop until standards are met.

### Committing Without Review

Do not commit in Phase 7 until Phase 6 is complete. All code must be reviewed.

### Forgetting to Update Memory

Do not skip memory updates in Phase 7. Future agents rely on this context.

## Validation

Use `scripts/validate-feature-workflow.sh` to verify your orchestration follows this workflow. See `references/phase-templates.md` for detailed templates and examples.
