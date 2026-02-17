---
name: task-orchestration
description: "Load PROACTIVELY when decomposing a user request into parallel agent work. Use when user says \"build this\", \"implement this feature\", or any request requiring multiple agents working concurrently. Guides task decomposition into parallelizable units, agent assignment with skill matching, dependency graph construction, WRFC loop coordination across up to 6 concurrent agent chains, and result aggregation."
metadata:
  version: 1.0.0
  category: orchestration
  tags: [orchestration, decomposition, agents, parallel, wrfc, coordination]
---

## Resources
```
scripts/
  validate-orchestration.sh
references/
  agent-assignment-guide.md
```

# Task Orchestration Protocol

The task orchestration protocol defines how the GoodVibes orchestrator decomposes feature requests into agent tasks, assigns agents and skills, manages parallel execution, and coordinates WRFC loops. This is the orchestrator's primary workflow for multi-agent feature delivery.

## When to Use This Skill

Use this skill when:

- User provides a feature request requiring multiple work streams
- Request involves multiple domains (backend, frontend, database, etc.)
- Request can be parallelized into independent subtasks
- Request requires coordination across multiple agents

Do NOT use this skill for:

- Simple single-file edits (handle directly)
- Pure analysis tasks without code changes
- Tasks already decomposed by the user

## Decomposition Process

### Step 1: Classify the Request

Before decomposing, classify the request into one of these categories:

**Feature Implementation** - Add new functionality
- Identify: "Add X feature", "Implement Y", "Create Z capability"
- Decomposition strategy: Split by domain (API, UI, DB, types)
- Parallelism: High (most work streams independent)

**Bug Fix** - Resolve existing issue
- Identify: "Fix X not working", "Resolve Y error", "Correct Z behavior"
- Decomposition strategy: Root cause first, then fix propagation
- Parallelism: Low (diagnosis must precede fixes)

**Refactoring** - Improve code structure without changing behavior
- Identify: "Refactor X", "Restructure Y", "Extract Z"
- Decomposition strategy: Analysis first, then file-by-file changes
- Parallelism: Medium (analysis sequential, changes parallel)

**Integration** - Connect existing systems
- Identify: "Integrate X with Y", "Connect A to B"
- Decomposition strategy: Understand both sides, then adapter layer
- Parallelism: Medium (research parallel, integration sequential)

**Enhancement** - Improve existing feature
- Identify: "Improve X", "Add Y to existing Z"
- Decomposition strategy: Understand current state, plan incremental additions
- Parallelism: Medium (discovery sequential, additions parallel)

### Step 2: Identify Parallel Opportunities

After classifying, identify work that can run in parallel:

**Independent domains:**
- API route + React component (if contract is defined upfront)
- Type definitions + database schema
- Multiple UI components with shared types
- Multiple API endpoints with shared middleware

**Independent files:**
- Creating new files in different directories
- Editing files with no import relationships
- Writing tests for different modules

**Independent research:**
- Checking multiple documentation sources
- Analyzing multiple files for patterns
- Discovering patterns in different directories

**When NOT to parallelize:**
- Type definitions must exist before implementation uses them
- Database schema must exist before API queries it
- Parent component must exist before child imports it
- Discovery must complete before planning

### Step 3: Define Agent Tasks

For each parallelizable work stream, define a task with:

**Task structure:**
```yaml
task_id: unique-task-identifier
agent: engineer | reviewer | tester | architect | deployer | integrator-ai | integrator-services | integrator-state | planner
skills: [skill-1, skill-2]
description: Brief description of what this task accomplishes
scope:
  files: [list of files to create/modify]
  directories: [directories to work within]
constraints:
  - Must use TypeScript
  - Follow existing patterns in src/features/
blocking: [list of task_ids this task blocks]
blocked_by: [list of task_ids blocking this task]
expected_outcome: What success looks like
```

**Example:**
```yaml
task_id: create-user-types
agent: engineer
skills: [discover-plan-batch, precision-mastery, error-recovery, goodvibes-memory]
description: Create TypeScript type definitions for User domain
scope:
  files: [src/types/user.ts, src/types/auth.ts]
  directories: [src/types]
constraints:
  - Use Zod for runtime validation
  - Export all types from src/types/index.ts
blocking: [create-user-api, create-user-components]
blocked_by: []
expected_outcome: Type files exist, export User, AuthContext, and validation schemas
```

### Step 4: Assign Agent and Skills

For each task, assign the appropriate agent type and skills using this decision table:

**Agent Type Selection:**

| Work Type | Agent Type | Rationale |
|-----------|------------|------------|
| Implement API, components, features | engineer | Code creation and implementation |
| Review code quality, standards | reviewer | Code quality and standards enforcement |
| Write tests, test coverage | tester | Testing and validation |
| Plan architecture, design decisions | architect | High-level design and planning |
| Deploy applications, infrastructure | deployer | Deployment and infrastructure |
| Integrate AI/ML services | integrator-ai | AI/ML integration |
| Integrate external services | integrator-services | External service integration |
| Manage state and data flow | integrator-state | State management |
| Coordinate complex workflows | planner | High-level orchestration |

**Skills Assignment:**

All agents receive protocol skills by default:
- discover-plan-batch (DPB loop)
- precision-mastery (tool usage)
- error-recovery (error handling)
- goodvibes-memory (memory integration)

Additional skills by work type:

| Work Type | Additional Skills |
|-----------|-------------------|
| API implementation | trpc, prisma, nextauth, rest-api-design |
| Frontend components | react, nextjs, tailwindcss, shadcn-ui |
| Database schema | prisma, postgresql, drizzle |
| Authentication | clerk, nextauth, lucia |
| Type definitions | (none - protocol skills sufficient) |
| Code review | review-scoring + domain-specific review skills |

See `references/agent-assignment-guide.md` for complete assignment table.

## Agent Prompt Template

When spawning agents, ALWAYS include these elements in the agent prompt:

```markdown
## Task
[Specific, actionable description of what to accomplish]

## Scope
**Files to create:**
- path/to/file.ts - Brief description

**Files to modify:**
- path/to/existing.ts - What changes to make

**Directories in scope:**
- src/features/auth/ - Work within this directory

## Constraints
- [Technical constraint 1]
- [Pattern to follow]
- [Dependency requirement]

## Skills Available
- skill-name - When to use it
- skill-name - When to use it

## Expected Outcome
[Concrete definition of success]

## Blocking/Blocked By
**This task blocks:** [list of downstream tasks waiting for this]
**This task is blocked by:** [list of upstream tasks this waits for]

## WRFC Participation
You are participating in a WRFC loop coordinated by the orchestrator:
- WRITE: Complete your assigned task
- REPORT: Use the structured output format below
- The orchestrator will handle FIX and CONTINUE based on your report

## Output Format
Use this format when reporting completion:

### Summary
[1-2 sentences on what was accomplished]

### Changes Made
- path/to/file.ts - [what was done]

### Decisions Made
- Chose X over Y: [rationale]

### Issues Encountered
- [Issue] -> [resolution or "unresolved"]

### Uncertainties
- [Items for orchestrator to verify with user]

### Next Steps
- [Recommended follow-up actions]
```

**Critical elements:**
1. Scope is explicit (file paths, not vague descriptions)
2. Skills are listed with usage guidance
3. WRFC role is clear (agent does WRITE+REPORT, orchestrator does FIX+CONTINUE)
4. Output format is structured for orchestrator consumption

## Monitoring and Coordination

### Track Active Agents

Maintain a task tracking structure:

```yaml
active_tasks:
  task-1:
    agent_id: agent_abc123
    status: running | completed | blocked | failed
    started_at: ISO-8601 timestamp
    last_update: ISO-8601 timestamp
    blocking: [task-2, task-3]
    blocked_by: []
  task-2:
    agent_id: agent_def456
    status: waiting
    blocked_by: [task-1]
```

### Agent Concurrency Limits

**Hard limit: 6 concurrent agent chains**

When you have more than 6 tasks:
1. Prioritize by dependency order (unblock downstream tasks first)
2. Queue remaining tasks
3. Spawn new agents as slots free up

**Task priority formula:**
```
priority = (number of tasks it blocks) - (number of tasks blocking it)
```

Higher priority = spawn first

### WRFC Loop Coordination

The WRFC loop is the orchestrator's pattern:

**WRITE Phase:**
- Orchestrator spawns agents with task prompts
- Each agent executes their task (discover, plan, batch)
- Agents run in parallel (up to 6 concurrent)

**REPORT Phase:**
- Agents return structured results
- Orchestrator collects all agent reports
- Orchestrator aggregates changes, decisions, issues

**FIX Phase:**
- Orchestrator analyzes reports for issues
- If issues found: spawn fix tasks or escalate to user
- If uncertainties exist: query user for clarification
- If all clear: proceed to CONTINUE

**CONTINUE Phase:**
- Orchestrator spawns next wave of tasks (unblocked by completed tasks)
- Loop back to WRITE
- Exit when all tasks complete successfully

**WRFC Spawn Rules:**

1. Spawn parallel tasks together in WRITE phase
2. Wait for all in-flight tasks to REPORT before FIX
3. Do NOT spawn dependent tasks until blockers complete
4. Do NOT spawn more than 6 concurrent agent chains
5. If agent fails 3 times, escalate to user (don't loop indefinitely)

### Agent Communication

Agents do NOT communicate directly. All coordination flows through the orchestrator:

**Inter-agent dependencies:**
- Task A produces types.ts
- Task B needs types.ts
- Orchestrator: waits for A to complete, then spawns B with reference to types.ts location

**Shared state:**
- All agents read/write .goodvibes/memory/
- Orchestrator checks memory for decisions, patterns, failures before spawning
- Orchestrator logs orchestration decisions to .goodvibes/memory/decisions.json

## Mode-Specific Behavior

### Vibecoding Mode (Default)

In vibecoding mode, the orchestrator has more autonomy:

**Auto-spawn on ambiguity:**
- If task decomposition has multiple valid approaches, pick the most common pattern from memory
- If no pattern exists, make a decision and log it to decisions.json
- Only escalate to user for architectural decisions (auth provider, database choice, etc.)

**Checkpointing:**
- No automatic checkpoints
- Let agents run to completion
- Only checkpoint on user request or before risky operations

**Error handling:**
- Agents retry up to 3 times with error-recovery protocol
- If agent fails 3 times, orchestrator tries alternate approach
- Only escalate after 2 alternate approaches fail

### Justvibes Mode (Strict)

In justvibes mode, the orchestrator asks before acting:

**Confirm before spawn:**
- Show task decomposition plan to user
- Wait for approval before spawning agents
- Allow user to modify task breakdown

**Checkpointing:**
- Checkpoint after each WRFC cycle
- Allow user to review changes before continuing
- Offer rollback if user rejects changes

**Error handling:**
- Escalate to user immediately on first error
- Do not retry without user approval
- Show full error context and proposed fix

## Decomposition Examples

### Example 1: Feature Implementation

**User request:** "Add user profile page with edit capability"

**Classification:** Feature Implementation

**Decomposition:**

```yaml
tasks:
  - task_id: create-profile-types
    agent: engineer
    skills: [discover-plan-batch, precision-mastery, error-recovery, goodvibes-memory]
    description: Create Profile and ProfileUpdate types
    scope:
      files: [src/types/profile.ts]
    blocking: [create-profile-api, create-profile-ui]
    blocked_by: []
    
  - task_id: create-profile-api
    agent: engineer
    skills: [discover-plan-batch, precision-mastery, error-recovery, goodvibes-memory, trpc, prisma]
    description: Implement tRPC routes for profile CRUD
    scope:
      files: [src/server/routers/profile.ts]
    blocking: [create-profile-ui]
    blocked_by: [create-profile-types]
    
  - task_id: create-profile-ui
    agent: engineer
    skills: [discover-plan-batch, precision-mastery, error-recovery, goodvibes-memory, nextjs, react, tailwindcss, shadcn-ui]
    description: Build profile page with edit form
    scope:
      files: [src/app/profile/page.tsx, src/components/ProfileForm.tsx]
    blocking: [review-profile-implementation]
    blocked_by: [create-profile-types]
    
  - task_id: review-profile-implementation
    agent: reviewer
    skills: [discover-plan-batch, precision-mastery, error-recovery, goodvibes-memory, review-scoring, type-safety, error-handling]
    description: Review all profile implementation for code quality
    scope:
      files: [src/types/profile.ts, src/server/routers/profile.ts, src/app/profile/page.tsx, src/components/ProfileForm.tsx]
    blocking: [test-profile-feature]
    blocked_by: [create-profile-api, create-profile-ui]
    
  - task_id: test-profile-feature
    agent: tester
    skills: [discover-plan-batch, precision-mastery, error-recovery, goodvibes-memory]
    description: Create tests for profile feature
    scope:
      files: [src/server/routers/profile.test.ts, src/components/ProfileForm.test.tsx]
    blocking: []
    blocked_by: [review-profile-implementation]
```

**Execution plan:**
1. Spawn create-profile-types (no blockers)
2. Wait for types to complete
3. Spawn create-profile-api and create-profile-ui in parallel (both unblocked)
4. Wait for both to complete
5. Spawn review-profile-implementation (blocked by API + UI)
6. Wait for review to complete
7. Spawn test-profile-feature (blocked by review)
8. Wait for tests to complete
9. Aggregate results and return to user

**Parallelism:** 4 waves (types solo -> API + UI parallel -> review solo -> tests solo)

### Example 2: Bug Fix

**User request:** "Fix login redirect loop on /dashboard"

**Classification:** Bug Fix

**Decomposition:**

```yaml
tasks:
  - task_id: diagnose-redirect-loop
    agent: engineer
    skills: [discover-plan-batch, precision-mastery, error-recovery, goodvibes-memory, nextjs, nextauth]
    description: Identify root cause of redirect loop
    scope:
      files: [src/middleware.ts, src/app/dashboard/page.tsx, src/lib/auth.ts]
    blocking: [fix-redirect-loop]
    blocked_by: []
    
  - task_id: fix-redirect-loop
    agent: engineer
    skills: [discover-plan-batch, precision-mastery, error-recovery, goodvibes-memory, nextjs, nextauth]
    description: Apply fix based on diagnosis
    scope:
      files: [determined by diagnosis]
    blocking: [verify-fix]
    blocked_by: [diagnose-redirect-loop]
    
  - task_id: verify-fix
    agent: reviewer
    skills: [discover-plan-batch, precision-mastery, error-recovery, goodvibes-memory, review-scoring, async-patterns, error-handling]
    description: Verify the fix resolves the redirect loop and doesn't introduce regressions
    scope:
      files: [determined by fix task]
    blocking: []
    blocked_by: [fix-redirect-loop]
```

**Execution plan:**
1. Spawn diagnose-redirect-loop
2. Wait for diagnosis with root cause analysis
3. Spawn fix-redirect-loop with diagnosis context
4. Wait for fix to complete
5. Spawn verify-fix (blocked by fix)
6. Wait for verification to complete
7. Return to user

**Parallelism:** None (fully sequential: diagnose -> fix -> verify)

### Example 3: Refactoring

**User request:** "Extract shared auth logic into reusable hooks"

**Classification:** Refactoring

**Decomposition:**

```yaml
tasks:
  - task_id: plan-refactoring-approach
    agent: architect
    skills: [discover-plan-batch, precision-mastery, error-recovery, goodvibes-memory]
    description: Design the refactoring strategy and hook API
    scope:
      directories: [src/components, src/app]
    blocking: [analyze-auth-patterns]
    blocked_by: []
    
  - task_id: analyze-auth-patterns
    agent: engineer
    skills: [discover-plan-batch, precision-mastery, error-recovery, goodvibes-memory]
    description: Discover all auth usage patterns in components
    scope:
      directories: [src/components, src/app]
    blocking: [create-auth-hooks]
    blocked_by: [plan-refactoring-approach]
    
  - task_id: create-auth-hooks
    agent: engineer
    skills: [discover-plan-batch, precision-mastery, error-recovery, goodvibes-memory, react]
    description: Create hooks based on discovered patterns
    scope:
      files: [src/hooks/useAuth.ts, src/hooks/useRequireAuth.ts]
    blocking: [refactor-components-1, refactor-components-2]
    blocked_by: [analyze-auth-patterns]
    
  - task_id: refactor-components-1
    agent: engineer
    skills: [discover-plan-batch, precision-mastery, error-recovery, goodvibes-memory, react]
    description: Refactor components in src/app to use hooks
    scope:
      directories: [src/app]
    blocking: []
    blocked_by: [create-auth-hooks]
    
  - task_id: refactor-components-2
    agent: engineer
    skills: [discover-plan-batch, precision-mastery, error-recovery, goodvibes-memory, react]
    description: Refactor components in src/components to use hooks
    scope:
      directories: [src/components]
    blocking: []
    blocked_by: [create-auth-hooks]
```

**Execution plan:**
1. Spawn plan-refactoring-approach (architect)
2. Wait for planning to complete
3. Spawn analyze-auth-patterns (blocked by planning)
4. Wait for pattern analysis
5. Spawn create-auth-hooks (blocked by analysis)
6. Wait for hooks to complete
7. Spawn refactor-components-1 and refactor-components-2 in parallel
8. Wait for both to complete
9. Return to user

**Parallelism:** 4 waves (planning -> analysis -> hooks -> 2 refactors parallel)

## Escalation Criteria

Escalate to user immediately when:

1. **Architectural ambiguity** - Multiple valid approaches with significant tradeoffs
   - Example: "Use REST vs GraphQL for new API"
   - Escalation: Present options with pros/cons, request decision

2. **Missing information** - Task cannot be completed without user input
   - Example: "Which auth provider should we use?"
   - Escalation: List options, explain what's needed

3. **Scope expansion** - Task is larger than initially described
   - Example: "Adding profile page requires new database schema and migration"
   - Escalation: Show expanded scope, request approval

4. **Agent failure after alternates** - Agent failed 3 times, alternate approach also failed
   - Example: "Cannot fix type error after trying 2 different approaches"
   - Escalation: Show attempts, request guidance or manual intervention

5. **Conflicting requirements** - Discovered constraints contradict each other
   - Example: "User wants Prisma but codebase uses Drizzle"
   - Escalation: Explain conflict, request resolution

## Summary

**Task orchestration workflow:**
1. Classify request (feature, bug, refactoring, etc.)
2. Identify parallel opportunities (domains, files, research)
3. Define agent tasks (task structure with blocking/blocked_by)
4. Assign agents and skills (use decision table)
5. Spawn agents with structured prompts (include WRFC guidance)
6. Monitor active agents (up to 6 concurrent)
7. Coordinate WRFC loops (WRITE -> REPORT -> FIX -> CONTINUE)
8. Aggregate results and return to user

**Key principles:**
- Explicit > implicit (file paths, not vague descriptions)
- Parallel when possible, sequential when necessary
- WRFC loop is orchestrator's pattern, agents participate in one step
- Escalate on ambiguity in justvibes, decide in vibecoding
- Use memory to inform decisions and avoid repeating failures
