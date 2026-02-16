# GoodVibes Skill Library: Complete Redesign Proposal (Refined)

## Date: 2026-02-15 (Refined)
## Status: Proposal — Ready for Review

---

## Design Philosophy

### The Core Insight

The most impactful skills aren't about WHAT to build (auth, database, etc.) — they're about HOW to work within GoodVibes. The system has incredible infrastructure:

- 6 MCP engines with 70+ precision tools
- 11 agents (9 specialized + 2 factories)
- WRFC loops for quality enforcement
- DPB loops for token efficiency
- Memory system for cross-session learning
- Batch engine for multi-operation orchestration
- 3-phase error escalation

But none of it reaches its potential because agents interpret instructions inconsistently. The precision engine exists but agents fall back to native tools. WRFC exists but review scoring is subjective. Memory exists but agents don't check it. The batch engine exists but agents don't use it.

**Skills are the missing enforcement layer.** Not technology reference docs — operational protocols with deterministic validation scripts that ensure agents actually follow GoodVibes patterns.

### Three Design Principles

**1. Skills teach agents how to use YOUR tools, not technologies they already know.**
Claude knows Prisma. Claude doesn't know how to combine \`discover\` + \`get_database_schema\` + \`generate_types\` + \`get_prisma_operations\` in the optimal sequence with the right verbosity settings. THAT's what the skill teaches.

**2. Scripts enforce what language cannot.**
Anthropic: "Code is deterministic; language interpretation isn't." WRFC compliance fails because agents interpret "follow WRFC" differently. A validation script that checks whether a review has a numeric score, categorized issues, and action items is deterministic. You either have those things or you don't.

**3. Protocol skills are the force multiplier.**
Without protocol skills: 11 independent agents that each interpret instructions differently.
With protocol skills: 11 agents that all use precision tools with optimal verbosity, follow WRFC with deterministic scoring, check memory before starting, follow DPB loops, and handle errors with consistent escalation.

This is the difference between a group of individuals and a team with shared operating procedures.

---

## Architecture

### Four Tiers

\`\`\`
Tier 1: Protocol Skills (5)      — HOW to work within GoodVibes
Tier 2: Orchestration Skills (2)  — HOW to coordinate agents and work
Tier 3: Outcome Skills (11)      — HOW to accomplish specific development goals
Tier 4: Quality Skills (7)       — HOW to maintain and improve code
                                   ──────
                                   25 total
\`\`\`

### Tier Relationships

\`\`\`
┌─────────────────────────────────────────────────────────┐
│                   ORCHESTRATOR                          │
│  Uses: task-orchestration, fullstack-feature             │
│  References: ALL skills for agent assignment             │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │ ENGINEER │  │ REVIEWER │  │ TESTER   │  ...agents   │
│  │          │  │          │  │          │              │
│  │ Protocol │  │ Protocol │  │ Protocol │  ALL agents  │
│  │ Skills   │  │ Skills   │  │ Skills   │  load these  │
│  │ (Tier 1) │  │ (Tier 1) │  │ (Tier 1) │              │
│  │          │  │          │  │          │              │
│  │ Outcome  │  │ Quality  │  │ Quality  │  Agents load │
│  │ Skills   │  │ Skills   │  │ Skills   │  relevant    │
│  │ (Tier 3) │  │ (Tier 4) │  │ (Tier 4) │  tier 3/4    │
│  └──────────┘  └──────────┘  └──────────┘              │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │              MEMORY SYSTEM                       │   │
│  │  decisions.json | patterns.json | failures.json  │   │
│  │  All agents read before work, write after work   │   │
│  │  Enforced by: goodvibes-memory skill             │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
\`\`\`

### Progressive Disclosure (per Anthropic's guide)

Each skill follows the three-level system:

1. **Skill names + descriptions** — Injected into agent context via SubagentStart hook. Agents know what skills exist and when to load them.
2. **SKILL.md body** — Loaded when relevant. Core workflow steps. Under 5,000 words.
3. **references/ and scripts/** — Loaded only when needed. Decision trees, validation scripts, templates.

### Directory Structure

\`\`\`
skills/
├── _registry.yaml              # Auto-generated index
├── protocol/                   # Tier 1: Loaded by ALL agents
│   ├── precision-mastery/
│   │   ├── SKILL.md
│   │   ├── scripts/
│   │   │   └── validate-precision-usage.sh
│   │   └── references/
│   │       └── tool-reference.md
│   ├── review-scoring/
│   ├── discover-plan-batch/
│   ├── goodvibes-memory/
│   └── error-recovery/
├── orchestration/              # Tier 2: For orchestrator
│   ├── task-orchestration/
│   └── fullstack-feature/
├── outcome/                    # Tier 3: Domain workflows
│   ├── authentication/
│   ├── database-layer/
│   ├── api-design/
│   ├── component-architecture/
│   ├── styling-system/
│   ├── state-management/
│   ├── testing-strategy/
│   ├── deployment/
│   ├── payment-integration/
│   ├── ai-integration/
│   └── service-integration/
├── quality/                    # Tier 4: Maintenance & review
│   ├── code-review/
│   ├── security-audit/
│   ├── performance-audit/
│   ├── accessibility-audit/
│   ├── refactoring/
│   ├── debugging/
│   └── project-onboarding/
└── _registry.yaml              # Auto-generated (rebuilt after migration)
\`\`\`

### Script Strategy

Protocol and quality skills include \`scripts/\` with deterministic validation:

\`\`\`
skill-name/
├── SKILL.md
├── scripts/
│   ├── validate.sh      # Deterministic quality gate
│   └── check.py         # Programmatic verification
├── references/
│   ├── decision-tree.md  # Framework selection guidance
│   └── examples.md       # Real-world patterns
└── assets/
    └── checklist.md      # Quality gate checklist
\`\`\`

Critical insight: scripts make quality gates PASS/FAIL, not vibes-based. A review either has all required sections or it doesn't. An implementation either passes the checklist or it doesn't.

### Frontmatter Schema (Anthropic Spec)

Every skill follows this YAML frontmatter format:

\`\`\`yaml
---
name: skill-name-in-kebab-case
description: "What it does and when to use it. Include trigger phrases. Under 1024 chars."
metadata:
  version: 1.0.0
  category: protocol | orchestration | outcome | quality
  tags: [searchable, terms]
---
\`\`\`

**Required fields:** name (kebab-case), description (WHAT + WHEN + triggers, <1024 chars)
**Optional fields:** metadata (version, category, tags, author)
**Omitted by design:** allowed-tools — skills should not restrict tool access

---

## The 25 Skills

---

### TIER 1: Protocol Skills

These are loaded by ALL agents. They define how to work within GoodVibes. The SubagentStart hook should inject: "Available protocol skills: precision-mastery, review-scoring, discover-plan-batch, goodvibes-memory, error-recovery. Load relevant ones before starting work."

---

#### 1. \`precision-mastery\`

\`\`\`yaml
---
name: precision-mastery
description: "Teaches optimal usage of GoodVibes precision engine tools for maximum token efficiency. Use when performing any file operations, searches, or command execution. Covers extract modes, verbosity settings, batching patterns, and discover tool orchestration."
metadata:
  version: 1.0.0
  category: protocol
  tags: [precision, tools, verbosity, batching, token-efficiency, extract-modes]
---
\`\`\`

**Replaces**: mcp-mastery (1 skill) + implicit knowledge agents don't have

**Why this matters**: The precision engine saves 75-95% on tokens, but only when used correctly. Agents frequently use wrong verbosity, don't batch operations, don't use discover for parallel queries, and fall back to native tools. This skill is the single highest-impact change.

**SKILL.md body**:

\`\`\`markdown
# Precision Mastery

## Verbosity Cheat Sheet
| Operation | Default | Why |
|-----------|---------|-----|
| precision_write | count_only | You provided the content; just confirm success |
| precision_edit | minimal | Confirm applied; skip diffs unless debugging |
| precision_read | standard | You need the content |
| precision_grep | files_only (discovery), matches (content) | Two common use cases |
| precision_glob | paths_only | You need file paths, not stats |
| precision_exec | minimal | Unless you need stdout/stderr |
| precision_fetch | standard | You need the content |
| discover | files_only | Discovery phase, not content phase |
| precision_symbols | locations | File:line is usually enough |

## Extract Mode Selection (precision_read)
- \`content\` — When you need to read and understand the full file
- \`outline\` — When you need structure without content (function/class names)
- \`symbols\` — When you need exported symbols for import/usage analysis
- \`ast\` — When you need structural patterns for refactoring
- \`lines\` — When you need specific line ranges (use with range param)

## Batching Patterns

### Multi-file read (single call)
Read 5-10 files in one precision_read call instead of 5-10 separate calls.

### Multi-query discover (single call)
Run grep + glob + symbols queries simultaneously in one discover call.
Use this BEFORE implementation to understand scope.

### Multi-edit atomic transaction (single call)
Apply multiple edits across files in one precision_edit call with atomic transaction.
If any edit fails, all roll back.

### Multi-file write (single call)
Create multiple files in one precision_write call.

## Anti-Patterns (NEVER DO THESE)
- Using Read/Edit/Write/Glob/Grep native tools (blocked by PreToolUse hook)
- Setting verbosity to "verbose" for writes/edits (wastes tokens)
- Reading entire files when you only need outline/symbols
- Running discover queries one at a time instead of batching
- Using precision_read when precision_grep would find what you need faster
- Reading a file you just wrote (you already know the content)

## Escalation
If a precision tool fails:
1. Check the error — is it user error (wrong path, bad syntax)? Fix and retry.
2. If tool genuinely fails: use native tool for THAT SPECIFIC TASK only.
3. Return to precision tools for the next operation.
4. Log the failure to goodvibes memory.
\`\`\`

**Scripts:**

\`scripts/validate-precision-usage.sh\`
- **Input**: Agent session transcript (JSONL or text)
- **Checks**: 
  - No native tool calls (Read, Edit, Write, Glob, Grep, WebFetch) present
  - Precision tool verbosity not set to "verbose" for writes/edits
  - discover tool used before implementation (DPB compliance)
  - Operations batched where possible (no sequential single-item calls)
- **Output**: PASS/FAIL with list of violations
- **Exit codes**: 0 = pass, 1 = violations found

**references/**: \`tool-reference.md\` — Complete parameter reference for all precision tools.

---

#### 2. \`review-scoring\`

\`\`\`yaml
---
name: review-scoring
description: "Defines the quantified scoring rubric and review format for WRFC loops. Use when reviewing code, scoring implementations, or validating that work meets quality standards. Includes deterministic validation scripts for review output."
metadata:
  version: 1.0.0
  category: protocol
  tags: [review, scoring, rubric, wrfc, quality, validation]
---
\`\`\`

**Replaces**: review-scoring-rubric, code-scoring, code-critique (3 skills)

**Why this matters**: This is the direct fix for WRFC compliance. Reviews are inconsistent because there's no deterministic scoring rubric. This skill provides one, with a validation script that checks whether a review meets the required format.

**SKILL.md body**:

\`\`\`markdown
# Review Scoring Protocol

## Scoring Rubric (1-10 scale)

### Dimensions (each scored 1-10)
1. **Correctness** — Does it work? Logic errors, edge cases, null handling
2. **Completeness** — Is everything implemented? No TODOs, no stubs, no placeholders
3. **Security** — No secrets exposed, input validated, auth checked, injection-safe
4. **Performance** — No N+1, no unnecessary re-renders, appropriate caching
5. **Conventions** — Follows project patterns, naming, file structure, imports
6. **Testability** — Tests exist, meaningful assertions, edge cases covered
7. **Readability** — Clear naming, appropriate abstraction, documented decisions
8. **Error Handling** — Errors caught, logged, user-facing messages appropriate
9. **Type Safety** — Types correct, no \`any\`, generics used appropriately
10. **Integration** — Works with existing code, doesn't break other features

### Overall Score Calculation
Overall = weighted average:
- Correctness: 20%
- Completeness: 15%
- Security: 15%
- Performance: 10%
- Conventions: 10%
- Testability: 10%
- Readability: 5%
- Error Handling: 5%
- Type Safety: 5%
- Integration: 5%

### Pass/Fail Thresholds
- **9.5+**: PASS — Ship it
- **8.0-9.4**: CONDITIONAL PASS — Minor issues, fix and re-check
- **6.0-7.9**: FAIL — Significant issues, fix and full re-review
- **Below 6.0**: FAIL — Major rework needed

## Required Review Output Format

Every review MUST produce this structure:

\`\`\`
## Review Summary
- **Overall Score**: X.X/10
- **Verdict**: PASS | CONDITIONAL PASS | FAIL
- **Files Reviewed**: [list]

## Dimension Scores
| Dimension | Score | Notes |
|-----------|-------|-------|
| Correctness | X/10 | [specific findings] |
| ... | ... | ... |

## Issues Found
### Critical (must fix)
- [FILE:LINE] Description. Fix: [specific fix]

### Major (should fix)
- [FILE:LINE] Description. Fix: [specific fix]

### Minor (nice to fix)
- [FILE:LINE] Description. Fix: [specific fix]

## What Was Done Well
- [specific positive observations]
\`\`\`

## Fix Agent Requirements
When fixing issues from a review:
1. Address ALL critical issues — no exceptions
2. Address ALL major issues — no exceptions
3. Address minor issues unless explicitly deprioritized by orchestrator
4. After fixing, list what was fixed and what was not (with reason)
5. Do NOT mark issues as fixed without actually fixing them

## Re-Review Requirements
After fixes are applied, the re-reviewer must:
1. Verify EACH previously flagged issue is resolved
2. Check that fixes didn't introduce new issues
3. Re-score all dimensions
4. New issues found during re-review are NEW findings, not regressions
\`\`\`

**Scripts:**

\`scripts/validate-review.sh\`
- **Input**: Review output (markdown text)
- **Checks**:
  - Overall numeric score present (X.X/10 format)
  - All 10 dimension scores present with numeric values
  - Issues categorized as Critical/Major/Minor
  - Each issue has FILE:LINE reference
  - Each issue has a specific fix suggestion
  - "What Was Done Well" section exists
  - Verdict matches score thresholds (9.5+ = PASS, 8.0-9.4 = CONDITIONAL, <8.0 = FAIL)
- **Output**: PASS/FAIL with list of missing elements
- **Exit codes**: 0 = valid review, 1 = invalid format

\`scripts/validate-fix.sh\`
- **Input**: Fix agent output + original review issues list
- **Checks**:
  - Each critical issue from review is addressed
  - Each major issue from review is addressed
  - Fix descriptions reference specific files and changes
  - No issues marked "fixed" without corresponding code changes
- **Output**: PASS/FAIL with unaddressed issue count
- **Exit codes**: 0 = all issues addressed, 1 = issues remaining

**references/**: \`scoring-examples.md\` — Real examples of 9.5/10 reviews vs 6/10 reviews showing what quality looks like.

---

#### 3. \`discover-plan-batch\`

\`\`\`yaml
---
name: discover-plan-batch
description: "Defines the Discover-Plan-Batch loop for all GoodVibes agents. Use before starting any development task. Covers discovery patterns using the discover tool, work planning for token efficiency, and batch execution strategies."
metadata:
  version: 1.0.0
  category: protocol
  tags: [dpb, discover, plan, batch, workflow, token-efficiency]
---
\`\`\`

**Replaces**: (no predecessor — fills a gap)

**Why this matters**: Agents waste tokens by diving into implementation without discovery, planning without structure, or executing operations one at a time. DPB is mentioned in the output style but agents don't follow it consistently.

**SKILL.md body**:

\`\`\`markdown
# Discover-Plan-Batch Protocol

## Phase 1: DISCOVER
Before writing a single line of code, understand the landscape.

Use the \`discover\` tool with parallel queries:
- Query 1 (glob): Find files matching the area you'll work in
- Query 2 (grep): Find existing patterns similar to what you'll build
- Query 3 (symbols): Find exported functions/types you'll need to use/integrate with

Then use \`precision_read\` with \`extract: outline\` on key files to understand structure without consuming full content tokens.

Check goodvibes memory:
- \`failures.json\` — Has this been attempted before? What went wrong?
- \`patterns.json\` — Are there proven approaches for this type of work?
- \`decisions.json\` — Have relevant architectural decisions been made?

## Phase 2: PLAN
Before executing, plan your work for token efficiency.

Structure your plan:
1. Files to create (list paths)
2. Files to modify (list paths + what changes)
3. Files to read fully (only those you need content from)
4. Commands to run (build, test, lint)
5. Order of operations (dependencies between steps)
6. Batch opportunities (which operations can be combined)

Rule: If your plan has more than 3 sequential precision tool calls that could be batched into 1, revise the plan.

## Phase 3: BATCH
Execute with maximum batching.

Preferred execution patterns:
- batch_engine wrapping precision_engine calls (maximum efficiency)
- precision_engine calls with built-in batching (good efficiency)
- Sequential precision_engine calls without batching (acceptable when necessary)
- Native tools (NEVER — blocked by PreToolUse hook)

After execution:
- Verify results match plan expectations
- If unexpected results: loop back to DISCOVER with new information
- If successful: report results to orchestrator

## LOOP
If discovery reveals the scope is different than expected, or if execution
results don't match the plan, loop back. Discovery is cheap (outline + symbols).
Bad implementation is expensive (full rewrite).
```

**Scripts:**

`scripts/validate-dpb-compliance.sh`
- **Input**: Agent session transcript (JSONL or text)
- **Checks**:
  - discover tool called before any precision_write/precision_edit calls
  - Plan step present (structured list of files to create/modify/read)
  - Batch operations used where 3+ sequential calls to same tool could be combined
  - Memory files checked before implementation started
- **Output**: PASS/FAIL with list of DPB violations
- **Exit codes**: 0 = compliant, 1 = violations found

---
#### 4. \`goodvibes-memory\`

\`\`\`yaml
---
name: goodvibes-memory
description: "Defines how all GoodVibes agents read from and write to the persistent memory and logging system. Use at the start of any task (read) and after completing any task (write). Covers decisions.json, patterns.json, failures.json, preferences.json, and session logs."
metadata:
  version: 1.0.0
  category: protocol
  tags: [memory, logging, decisions, patterns, failures, cross-session]
---
\`\`\`

**Replaces**: (no predecessor — fills a critical gap)

**Why this matters**: The memory system exists but session data shows it's underutilized. Agents don't check for known patterns or failures before starting work, and logging after completion is inconsistent.

**SKILL.md body**:

\`\`\`markdown
# GoodVibes Memory Protocol

## BEFORE Starting Work (Read Phase)

1. Check \`.goodvibes/memory/failures.json\`
   - Search for keywords matching your current task
   - If a similar failure exists: read the resolution and prevention fields
   - Avoid repeating known failures

2. Check \`.goodvibes/memory/patterns.json\`
   - Search for patterns matching your task type
   - If a proven pattern exists: follow it unless there's reason not to
   - Note the example_files for reference

3. Check \`.goodvibes/memory/decisions.json\`
   - Look for active decisions in your scope
   - Respect prior architectural decisions
   - If a decision conflicts with your task: flag to orchestrator

4. Check \`.goodvibes/memory/preferences.json\`
   - Apply project-specific preferences (naming, style, patterns)

## AFTER Completing Work (Write Phase)

### After a task passes review:
- Log to \`.goodvibes/logs/activity.md\` (append, newest first)
- If a new pattern was established: add to \`patterns.json\`
- If an architectural decision was made: add to \`decisions.json\`

### After an error is resolved:
- Log to \`.goodvibes/logs/errors.md\` (append, newest first)
- Add to \`failures.json\` with: error, context, root_cause, resolution, prevention, keywords

### After choosing between approaches:
- Log to \`.goodvibes/logs/decisions.md\` (append, newest first)
- Add to \`decisions.json\` with: category, what, why, scope, confidence

## ID Format
Use timestamp-based IDs to avoid needing to read existing entries:
- Decisions: \`dec_YYYYMMDD_HHMMSS\`
- Patterns: \`pat_YYYYMMDD_HHMMSS\`
- Failures: \`fail_YYYYMMDD_HHMMSS\`

## First Write Check
Before first write to any file, check if it exists. If not, create with
appropriate header/structure (empty JSON array for .json files, markdown
header for .md files).
\`\`\`

**Scripts:**

`scripts/validate-memory-usage.sh`
- **Input**: Agent session transcript (JSONL or text) + .goodvibes/memory/ directory
- **Checks**:
  - Memory files read at task start (failures.json, patterns.json, decisions.json checked)
  - Activity logged to logs/activity.md after task completion
  - New failures logged to memory/failures.json when errors were encountered and resolved
  - New patterns logged to memory/patterns.json when reusable approaches were discovered
- **Output**: PASS/FAIL with list of memory protocol violations
- **Exit codes**: 0 = compliant, 1 = violations found

**references/**: \`schemas.md\` — Complete JSON schemas for each memory file with examples.

---

#### 5. \`error-recovery\`

\`\`\`yaml
---
name: error-recovery
description: "Defines error recovery procedures for all GoodVibes agents. Use when encountering tool failures, build errors, test failures, or unexpected results during task execution. Covers 3-phase escalation, memory-informed recovery, and when to escalate to the orchestrator."
metadata:
  version: 1.0.0
  category: protocol
  tags: [error, recovery, escalation, debugging, failure, retry]
---
\`\`\`

**Replaces**: debugging skill (partial)

**Why this matters**: The PostToolUseFailure hook provides 3-phase escalation, but agents encountering errors MID-TASK don't follow a consistent recovery pattern. They either give up too easily or waste tokens on blind retries.

**SKILL.md body**:

\`\`\`markdown
# Error Recovery Protocol

## Immediate Response
1. DO NOT retry blindly. Read the error message.
2. Categorize: TOOL_FAILURE | BUILD_ERROR | TEST_FAILURE | TYPE_ERROR | RUNTIME_ERROR | EXTERNAL_ERROR
3. Check \`.goodvibes/memory/failures.json\` for matching keywords
   - If found: apply the documented resolution
   - If not found: proceed to recovery phases

## Recovery Phases (One-Shot Strategy)
All four knowledge sources are used simultaneously, not in escalation stages:

1. **Internal knowledge** — Precision tools, project context, goodvibes memory
2. **First-party docs** — Official framework/library documentation
3. **Community docs** — Stack Overflow, GitHub issues, blog posts
4. **Open internet** — WebSearch for recent solutions

Apply the best solution found across all sources.

## After Resolution
- Log to \`.goodvibes/memory/failures.json\` with full context
- Log to \`.goodvibes/logs/errors.md\`
- Continue with the task

## After Max Attempts (3)
- Log the unresolved failure to memory
- Report to orchestrator with:
  - What was attempted
  - What failed and why
  - Suggested next steps
- Do NOT mark the task as complete

## When to Escalate Immediately (Skip Recovery)
- Permission errors (need user intervention)
- Missing credentials/secrets (need user input)
- Architectural ambiguity (need design decision)
- Scope change discovered (need orchestrator guidance)
\`\`\`

**Scripts:**

`scripts/validate-error-recovery.sh`
- **Input**: Agent session transcript (JSONL or text) + .goodvibes/memory/failures.json
- **Checks**:
  - Error was categorized (TOOL_FAILURE, BUILD_ERROR, etc.) before retry
  - failures.json checked for known patterns before attempting fix
  - Resolution logged to failures.json after successful recovery
  - Escalation to orchestrator attempted before marking task incomplete (if max attempts reached)
- **Output**: PASS/FAIL with list of recovery protocol violations
- **Exit codes**: 0 = compliant, 1 = violations found

---

### TIER 2: Orchestration Skills

These are primarily for the ORCHESTRATOR (main conversation context). They define how to decompose work and coordinate agents.

---

#### 6. \`task-orchestration\`

\`\`\`yaml
---
name: task-orchestration
description: "Guides the GoodVibes orchestrator in decomposing feature requests into parallel agent tasks, assigning appropriate agents and skills, managing dependencies, and coordinating WRFC loops across up to 6 concurrent agent chains. Use when receiving a new user request that requires multiple agents."
metadata:
  version: 1.0.0
  category: orchestration
  tags: [orchestration, decomposition, agents, parallel, wrfc, coordination]
---
\`\`\`

**Replaces**: planning/task-decomposition, planning/dependency-mapping, agent-monitoring (3 skills)

**Why this matters**: The orchestrator often decomposes tasks poorly — spawning agents with insufficient context, not identifying dependencies, or not utilizing all available agent slots. This skill teaches systematic task decomposition and agent coordination.

**SKILL.md body**:

\`\`\`markdown
# Task Orchestration

## Decomposition Process

### Step 1: Classify the Request
- **Single-domain**: One agent type can handle it (e.g., "fix this CSS bug" → engineer)
- **Multi-domain**: Multiple agent types needed (e.g., "add auth" → engineer + tester + reviewer)
- **Full-feature**: End-to-end workflow needed (load fullstack-feature skill)

### Step 2: Identify Parallel Opportunities
Which tasks have NO dependencies between them? These run simultaneously.
Which tasks MUST be sequential? These queue.

Example:
- "Add user profile page with tests"
  - Parallel: engineer (component) + engineer (API endpoint) — no dependency
  - Sequential: tester (tests) — depends on both engineers completing
  - Sequential: reviewer (review) — depends on tester completing

### Step 3: Assign Agents + Skills
| Work Type | Agent | Outcome Skill |
|-----------|-------|---------------|
| Auth setup | engineer + integrator-services | authentication |
| Database schema | engineer | database-layer |
| API endpoints | engineer | api-design |
| UI components | engineer | component-architecture |
| Styling | engineer | styling-system |
| State management | engineer + integrator-state | state-management |
| Tests | tester | testing-strategy |
| Deployment | deployer | deployment |
| Payments | engineer + integrator-services | payment-integration |
| AI features | engineer + integrator-ai | ai-integration |
| Code review | reviewer | code-review |
| Security check | reviewer | security-audit |
| Performance | reviewer | performance-audit |
| Accessibility | reviewer | accessibility-audit |

### Step 4: Craft Agent Prompts
Every agent prompt MUST include:
1. The specific task with clear acceptance criteria
2. Which skills to load (protocol + relevant outcome/quality)
3. Instruction to check goodvibes memory before starting
4. Instruction to use precision tools with appropriate verbosity
5. Instruction to report results in structured format

### Step 5: Monitor and Coordinate
- Track active agents (never exceed max_parallel_agent_chains)
- When an agent completes: spawn reviewer for WRFC
- When review passes: commit, log, spawn next queued task
- When review fails: spawn fix agent, then re-review
- Maintain WRFC loops as close to max_parallel_agent_chains as possible

**WRFC is the orchestrator's pattern, not individual agents'.** Agents participate in one step (Work, Review, Fix, or Check). The orchestrator coordinates the loop. Never instruct an agent to manage its own WRFC loop — that's this skill's job.

## Agent Prompt Template
"You are a [role] agent. Your task: [specific task with acceptance criteria].

Before starting:
- Load skills: precision-mastery, [relevant outcome skill]
- Check .goodvibes/memory/ for known patterns and failures related to [keywords]
- Use discover tool to understand the codebase scope

Execution:
- Follow DPB loop: Discover → Plan → Batch
- Use precision tools with appropriate verbosity
- Batch operations where possible

When complete:
- Report: summary, files changed, decisions made, issues encountered
- Update goodvibes memory if new patterns or failures discovered"
\`\`\`

---

#### 7. \`fullstack-feature\`

\`\`\`yaml
---
name: fullstack-feature
description: "End-to-end feature development workflow that orchestrates multiple agents across the full stack. Use when the user requests a complete feature that spans backend, frontend, and testing. Sequences work across database, API, UI, tests, and review."
metadata:
  version: 1.0.0
  category: orchestration
  tags: [fullstack, feature, end-to-end, workflow, multi-agent]
---
\`\`\`

**Replaces**: (no predecessor — addresses the end-to-end workflow gap)

**Why this matters**: When a user says "add authentication" or "build the payment system," the orchestrator needs to know how to sequence multiple agents across the full stack. This is the meta-workflow that connects outcome skills together.

**SKILL.md body**:

\`\`\`markdown
# Full-Stack Feature Workflow

## Phase 1: Understand
- Clarify requirements with user (vibecoding) or infer from request (justvibes)
- Load relevant outcome skill(s) for the feature domain
- Identify all layers affected: database, API, UI, state, tests

## Phase 2: Foundation (sequential)
These must happen first — other work depends on them.
1. Database schema/migrations (database-layer skill)
2. Type generation from schema

## Phase 3: Core Implementation (parallel)
These can happen simultaneously:
- API endpoints (api-design skill) — engineer agent
- UI components (component-architecture skill) — engineer agent
- State management (state-management skill) — engineer agent

Max parallel agents: fill available slots

## Phase 4: Integration (sequential)
- Wire UI to API
- Wire state to UI
- Verify end-to-end data flow

## Phase 5: Quality (parallel)
- Tests (testing-strategy skill) — tester agent
- Security check (security-audit skill) — reviewer agent
- Accessibility check (accessibility-audit skill) — reviewer agent

## Phase 6: Review (WRFC)
- Full code review (code-review skill) — reviewer agent
- Fix any issues
- Re-review until score >= 9.5

## Phase 7: Commit + Log
- Git commit all related files
- Update goodvibes memory (patterns, decisions)
- Update goodvibes logs (activity)
- Report to user

## Mode-Specific Behavior
- **vibecoding**: Checkpoint after each phase, ask user before continuing
- **justvibes**: Auto-chain all phases, report at end
\`\`\`

---

### TIER 3: Outcome Skills

These define development workflows for specific domains. Each orchestrates GoodVibes MCP tools for that domain's outcomes. Loaded by agents when the orchestrator assigns domain-specific work.

---

#### 8. \`authentication\`

\`\`\`yaml
---
name: authentication
description: "Authentication setup workflow using GoodVibes precision tools. Use when implementing login, sign-up, session management, JWT, OAuth, protected routes, middleware auth, or role-based access control. Orchestrates discovery, implementation, security verification, and testing."
metadata:
  version: 1.0.0
  category: outcome
  tags: [auth, login, sign-up, session, jwt, oauth, middleware, rbac]
---
\`\`\`

**Replaces**: clerk, nextauth, lucia, auth0, firebase-auth, supabase-auth, passport (7 skills)

**Workflow**:
1. \`discover\` — Find existing auth patterns, middleware, session handling
2. \`detect_stack\` — Identify framework to determine auth approach
3. Decision tree (in references/) — Managed (Clerk/Auth0) vs self-hosted (NextAuth/Lucia) vs serverless (Supabase Auth)
4. \`precision_write\` — Auth configuration, middleware, route protection
5. \`precision_exec\` — Install dependencies, run migrations
6. \`scan_for_secrets\` — Verify no API keys/secrets in source
7. \`env_audit\` — Verify environment variables are documented
8. \`suggest_test_cases\` — Auth-specific edge cases (expired tokens, invalid credentials, session hijacking)

**Scripts:**

\`scripts/auth-checklist.sh\`
- **Input**: Project root path
- **Checks**:
  - Auth middleware file exists and exports handler
  - At least one protected route configured
  - No API keys/secrets in source files (grep for common patterns)
  - Auth-related environment variables documented in .env.example
  - Session/token configuration present
- **Output**: PASS/FAIL per check item
- **Exit codes**: 0 = all checks pass, 1 = failures present

**references/**: \`decision-tree.md\` — When to use managed vs self-hosted vs serverless, with trade-off analysis.

---

#### 9. \`database-layer\`

\`\`\`yaml
---
name: database-layer
description: "Database and ORM setup workflow using GoodVibes precision tools. Use when creating schemas, running migrations, setting up database connections, defining models, writing queries, or optimizing database performance. Covers relational and document databases."
metadata:
  version: 1.0.0
  category: outcome
  tags: [database, orm, schema, migration, query, prisma, drizzle, sql]
---
\`\`\`

**Replaces**: prisma, drizzle, kysely, postgresql, mongodb, redis, supabase-db, planetscale, turso, sqlite (10 skills)

**Workflow**:
1. \`detect_stack\` — Identify existing database technology
2. \`get_database_schema\` — Map current schema (if exists)
3. Decision tree — ORM selection based on project needs
4. \`precision_write\` — Schema files, migration files, seed data
5. \`precision_exec\` — Run migrations, verify connection
6. \`generate_types\` — Type-safe database access
7. \`get_prisma_operations\` — Check for N+1 query patterns
8. \`query_database\` — Verify data integrity

**references/**: \`orm-comparison.md\` — Prisma vs Drizzle vs Kysely decision tree.

---

#### 10. \`api-design\`

\`\`\`yaml
---
name: api-design
description: "API endpoint design and implementation workflow using GoodVibes precision tools. Use when building REST endpoints, GraphQL resolvers, tRPC procedures, API middleware, request validation, or response formatting. Covers route design, error handling, and documentation."
metadata:
  version: 1.0.0
  category: outcome
  tags: [api, rest, graphql, trpc, endpoint, route, middleware, validation]
---
\`\`\`

**Replaces**: trpc, graphql, rest-api, express, fastify, hono, apollo, openapi (8 skills)

**Workflow**:
1. \`get_api_routes\` — Map existing endpoints and patterns
2. \`discover\` — Find middleware, validation, error handling patterns
3. Decision tree — REST vs GraphQL vs tRPC based on needs
4. \`precision_write\` — Route handlers, middleware, validation schemas
5. \`generate_openapi\` — Auto-generate API documentation
6. \`validate_api_contract\` — Verify responses match spec
7. \`sync_api_types\` — Check frontend/backend type alignment

**references/**: \`api-style-guide.md\` — REST vs GraphQL vs tRPC decision tree with trade-offs.

---

#### 11. \`component-architecture\`

\`\`\`yaml
---
name: component-architecture
description: "UI component design and implementation workflow using GoodVibes precision and frontend engine tools. Use when building components, pages, layouts, forms, modals, tables, or any user interface elements. Covers component structure, props, state, accessibility, and performance."
metadata:
  version: 1.0.0
  category: outcome
  tags: [component, ui, react, page, layout, form, modal, accessibility]
---
\`\`\`

**Replaces**: react, vue, svelte, solidjs, preact, web-components, and related component/UI skills (15+ skills)

**Workflow**:
1. \`get_react_component_tree\` — Understand existing component hierarchy
2. \`discover\` — Find similar components, shared patterns, design tokens
3. \`precision_write\` — Component files following project conventions
4. \`analyze_layout_hierarchy\` — Verify layout constraints are correct
5. \`get_accessibility_tree\` — Verify a11y compliance
6. \`analyze_render_triggers\` — Check for unnecessary re-renders
7. \`analyze_tailwind_conflicts\` — Catch styling issues
8. \`analyze_event_flow\` — Verify event handling is correct

---

#### 12. \`styling-system\`

\`\`\`yaml
---
name: styling-system
description: "CSS and styling workflow using GoodVibes frontend engine tools. Use when working with Tailwind, CSS modules, styled-components, themes, dark mode, responsive design, or fixing layout and overflow issues. Covers conflict detection, responsive auditing, and sizing analysis."
metadata:
  version: 1.0.0
  category: outcome
  tags: [css, tailwind, styling, theme, responsive, dark-mode, overflow]
---
\`\`\`

**Replaces**: tailwind, styled-components, css-modules, sass, panda-css, vanilla-extract, unocss (7+ skills)

**Workflow**:
1. \`detect_stack\` — Identify styling approach
2. \`analyze_tailwind_conflicts\` — Find class conflicts and redundancies
3. \`analyze_responsive_breakpoints\` — Audit responsive coverage
4. \`get_sizing_strategy\` — Understand how dimensions are computed
5. \`diagnose_overflow\` — Find and fix overflow causes
6. \`analyze_stacking_context\` — Debug z-index issues

---

#### 13. \`state-management\`

\`\`\`yaml
---
name: state-management
description: "State management workflow using GoodVibes precision and frontend engine tools. Use when implementing global state, server state, form state, optimistic updates, cache invalidation, or real-time synchronization. Covers state architecture decisions and performance optimization."
metadata:
  version: 1.0.0
  category: outcome
  tags: [state, store, zustand, jotai, tanstack-query, cache, optimistic]
---
\`\`\`

**Replaces**: zustand, jotai, redux-toolkit, tanstack-query, valtio, nanostores, pinia (7 skills)

**Workflow**:
1. \`discover\` — Find existing state patterns (stores, contexts, hooks)
2. \`trace_component_state\` — Map current state flow and prop drilling
3. \`analyze_render_triggers\` — Identify state-caused re-renders
4. Decision tree — Client state (Zustand/Jotai) vs server state (TanStack Query) vs form state (React Hook Form)
5. \`precision_write\` — Store/hook implementation
6. \`validate_implementation\` — Verify state patterns are correct

**references/**: \`state-decision-tree.md\` — When to use which state approach.

---

#### 14. \`testing-strategy\`

\`\`\`yaml
---
name: testing-strategy
description: "Test planning and implementation workflow using GoodVibes precision and project engine tools. Use when writing tests, improving coverage, creating fixtures, setting up mocking, or planning test strategy. Covers unit, integration, and E2E testing with 100% coverage target."
metadata:
  version: 1.0.0
  category: outcome
  tags: [test, coverage, vitest, playwright, fixture, mock, tdd, e2e]
---
\`\`\`

**Replaces**: vitest, playwright, jest, testing-library, cypress, storybook, msw, chromatic (8 skills)

**Workflow**:
1. \`find_tests_for_file\` — Discover existing test coverage
2. \`get_test_coverage\` — Identify coverage gaps quantitatively
3. \`suggest_test_cases\` — AI-powered test case generation
4. \`generate_fixture\` — Create realistic test data from schemas
5. Decision tree — Unit vs integration vs E2E based on what's being tested
6. \`precision_write\` — Test files with meaningful assertions
7. \`precision_exec\` with expectations — Run tests, verify pass

**Scripts:**

\`scripts/coverage-check.sh\`
- **Input**: Coverage report path (lcov or json)
- **Checks**:
  - Line coverage >= configured threshold (default: 100%, configurable via args)
  - Branch coverage >= configured threshold (default: 95%, configurable via args)
  - No test files contain .skip() or .only()
  - No test files contain empty test bodies
  - All test files have at least one assertion
- **Output**: Coverage summary + PASS/FAIL
- **Exit codes**: 0 = coverage met, 1 = below threshold

---

#### 15. \`deployment\`

\`\`\`yaml
---
name: deployment
description: "Deployment and CI/CD workflow using GoodVibes precision and analysis engine tools. Use when deploying to production, setting up CI/CD pipelines, configuring Docker, or preparing for release. Covers pre-flight security checks, bundle analysis, and environment validation."
metadata:
  version: 1.0.0
  category: outcome
  tags: [deploy, ci-cd, docker, vercel, railway, production, environment]
---
\`\`\`

**Replaces**: vercel, netlify, railway, fly-io, aws, docker, kubernetes (7+ skills)

**Workflow**:
1. \`detect_stack\` — Identify framework and deployment requirements
2. \`read_config\` — Parse existing deployment configuration
3. \`env_audit\` — Verify all environment variables documented and valid
4. \`scan_for_secrets\` — Pre-deployment security sweep
5. \`analyze_bundle\` — Check build output size and issues
6. \`analyze_dependencies\` — Verify no unused/missing packages
7. \`precision_exec\` — Build and deploy commands
8. Decision tree — Platform selection based on project needs

**Scripts:**

\`scripts/pre-flight.sh\`
- **Input**: Project root path
- **Checks**:
  - All required env vars in .env.example have values in current environment
  - No secrets in source (scan_for_secrets equivalent)
  - Build command succeeds (npm run build or equivalent)
  - Test suite passes
  - No TypeScript errors (tsc --noEmit)
  - Bundle size within configured limits (if set)
- **Output**: Pre-flight report with PASS/FAIL per check
- **Exit codes**: 0 = ready to deploy, 1 = blockers found

**references/**: \`platform-guide.md\` — Vercel vs Railway vs Fly.io vs AWS decision tree.

---

#### 16. \`payment-integration\`

\`\`\`yaml
---
name: payment-integration
description: "Payment processing integration workflow using GoodVibes precision tools. Use when implementing checkout, subscriptions, billing, invoices, webhooks, or payment provider setup. Covers Stripe, LemonSqueezy, and Paddle with security-first approach."
metadata:
  version: 1.0.0
  category: outcome
  tags: [payment, stripe, checkout, subscription, billing, webhook]
---
\`\`\`

**Replaces**: stripe, lemonsqueezy, paddle (3 skills)

**Workflow**:
1. \`discover\` — Find existing payment patterns
2. Decision tree — Provider selection based on needs
3. \`precision_write\` — Webhook handlers, checkout flows, billing logic
4. \`scan_for_secrets\` — Verify API keys not exposed
5. \`env_audit\` — Verify payment-related env vars
6. \`suggest_test_cases\` — Payment edge cases (failed charges, refunds, subscription changes, webhook retries)
7. \`validate_implementation\` — Security review for payment handling

---

#### 17. \`ai-integration\`

\`\`\`yaml
---
name: ai-integration
description: "AI and LLM integration workflow using GoodVibes precision tools. Use when implementing chat interfaces, streaming responses, RAG pipelines, embeddings, vector search, function calling, or AI agent features. Covers OpenAI, Anthropic, and Vercel AI SDK patterns."
metadata:
  version: 1.0.0
  category: outcome
  tags: [ai, llm, chat, streaming, rag, embeddings, openai, anthropic]
---
\`\`\`

**Replaces**: openai, vercel-ai-sdk, langchain, and AI-related skills (5+ skills)

**Workflow**:
1. \`discover\` — Find existing AI integration patterns
2. \`detect_stack\` — Identify existing AI libraries
3. Decision tree — Chat vs completion vs embedding vs RAG based on use case
4. \`precision_write\` — AI integration code (streaming, tool use, etc.)
5. \`env_audit\` — Verify API keys configured
6. \`scan_for_secrets\` — No API keys in source
7. \`suggest_test_cases\` — AI-specific edge cases (rate limits, token limits, timeout, streaming errors)

---

#### 18. \`service-integration\`

\`\`\`yaml
---
name: service-integration
description: "Third-party service integration workflow for email, CMS, file uploads, and notifications. Use when integrating Resend, SendGrid, Sanity, Contentful, S3, Cloudinary, UploadThing, or similar external services. Covers setup, type generation, and testing."
metadata:
  version: 1.0.0
  category: outcome
  tags: [email, cms, upload, resend, sanity, s3, cloudinary, integration]
---
\`\`\`

**Replaces**: resend, sendgrid, postmark, react-email, sanity, contentful, strapi, payload, directus, uploadthing, cloudinary, s3 (12 skills)

**Workflow**:
1. \`discover\` — Find existing service integrations
2. Decision tree (in references/) — Provider selection per service category
3. \`precision_write\` — Integration code, type definitions, utility functions
4. \`precision_exec\` — Install SDKs, run setup commands
5. \`env_audit\` — Verify service credentials configured
6. \`scan_for_secrets\` — No credentials in source
7. \`generate_types\` — Type-safe service access
8. \`suggest_test_cases\` — Service-specific edge cases

**references/**:
- \`email-providers.md\` — Resend vs SendGrid vs Postmark decision tree
- \`cms-providers.md\` — Sanity vs Contentful vs Payload decision tree
- \`upload-providers.md\` — UploadThing vs S3 vs Cloudinary decision tree

---

### TIER 4: Quality Skills

These define maintenance, review, and improvement workflows. Loaded by reviewer, tester, and architect agents during quality-focused work.

---

#### 19. \`code-review\`

\`\`\`yaml
---
name: code-review
description: "Multi-agent parallel code review workflow with quantified scoring. Use when reviewing PRs, auditing code changes, performing quality assessments, or running full codebase reviews. Orchestrates parallel reviewer agents across correctness, security, performance, and conventions."
metadata:
  version: 1.0.0
  category: quality
  tags: [review, audit, pr, quality, scoring, codebase]
---
\`\`\`

**Replaces**: (no direct predecessor — reviews are now handled by WRFC loops)

**Workflow:**
1. Scope determination — \`precision_grep\` for changed files, \`discover\` for affected modules
2. \`precision_read\` with \`extract: content\` — Read all changed files
3. \`precision_read\` with \`extract: symbols\` — Understand structure of modified modules
4. Apply \`review-scoring\` rubric — Score all 10 dimensions with specific findings
5. \`precision_grep\` for common issues — Security patterns, error handling gaps, type safety
6. Produce structured review output — Follows review-scoring required format exactly
7. Report to orchestrator — Score, verdict, categorized issues with FILE:LINE references

**Note:** Multi-agent review parallelism and fix-review loops are managed by the orchestrator via the \`task-orchestration\` skill. This skill teaches a single reviewer how to conduct a thorough, scored review.

---

#### 20. \`security-audit\`

\`\`\`yaml
---
name: security-audit
description: "Security audit workflow using GoodVibes analysis engine tools. Use when auditing for vulnerabilities, checking for exposed secrets, reviewing permissions, or performing pre-deployment security review. Covers OWASP top 10, credential scanning, and environment validation."
metadata:
  version: 1.0.0
  category: quality
  tags: [security, audit, owasp, secrets, vulnerability, permissions]
---
\`\`\`

**Replaces**: security-audit-checklist (1 skill)

**Workflow**:
1. \`scan_for_secrets\` — Full credential scan
2. \`env_audit\` — Environment variable validation
3. \`check_permissions\` — File/network/system access audit
4. \`detect_breaking_changes\` — API security implications
5. \`find_dead_code\` — Attack surface reduction
6. \`precision_grep\` — Search for common vulnerability patterns (eval, innerHTML, SQL concatenation, etc.)

**Scripts:**

\`scripts/security-checklist.sh\`
- **Input**: Project root path
- **Checks**:
  - OWASP Top 10 pattern scan (SQL injection, XSS, CSRF, etc.)
  - No eval(), innerHTML, dangerouslySetInnerHTML without sanitization
  - No hardcoded credentials (API keys, passwords, tokens)
  - Dependencies have no known critical CVEs (npm audit)
  - HTTP-only cookies for session tokens (if applicable)
  - CORS configuration present and restrictive
  - Rate limiting configured on auth endpoints
- **Output**: Security report with severity ratings
- **Exit codes**: 0 = no critical/high findings, 1 = critical issues found

---

#### 21. \`performance-audit\`

\`\`\`yaml
---
name: performance-audit
description: "Performance audit workflow using GoodVibes analysis and frontend engine tools. Use when investigating slow performance, large bundle sizes, unnecessary re-renders, N+1 queries, or circular dependencies. Provides quantified analysis with actionable fixes."
metadata:
  version: 1.0.0
  category: quality
  tags: [performance, bundle, re-render, n+1, circular-deps, optimization]
---
\`\`\`

**Replaces**: (no direct predecessor)

**Workflow**:
1. \`analyze_bundle\` — Bundle size and chunk analysis
2. \`analyze_render_triggers\` — React re-render detection
3. \`get_prisma_operations\` — N+1 query detection
4. \`find_circular_deps\` — Circular dependency detection
5. \`analyze_dependencies\` — Unused package detection
6. \`analyze_responsive_breakpoints\` — Responsive audit
7. Report with quantified metrics and prioritized fixes

---

#### 22. \`accessibility-audit\`

\`\`\`yaml
---
name: accessibility-audit
description: "Accessibility audit workflow using GoodVibes frontend engine tools. Use when checking WCAG compliance, keyboard navigation, screen reader support, ARIA patterns, or focus management. Provides issue-by-issue WCAG criterion references."
metadata:
  version: 1.0.0
  category: quality
  tags: [accessibility, a11y, wcag, aria, keyboard, screen-reader, focus]
---
\`\`\`

**Replaces**: (no direct predecessor)

**Workflow**:
1. \`get_accessibility_tree\` — Full a11y tree with WCAG issue detection
2. \`analyze_event_flow\` — Keyboard interaction audit
3. \`get_react_component_tree\` — Semantic structure check
4. \`analyze_stacking_context\` — Focus trap and modal z-index verification
5. Report with WCAG criterion references per issue

---

#### 23. \`refactoring\`

\`\`\`yaml
---
name: refactoring
description: "Safe refactoring workflow using GoodVibes analysis engine tools. Use when cleaning up code, removing dead code, resolving circular dependencies, extracting modules, or reorganizing file structure. Provides safety checks before destructive operations."
metadata:
  version: 1.0.0
  category: quality
  tags: [refactor, dead-code, circular-deps, extract, reorganize, cleanup]
---
\`\`\`

**Replaces**: refactoring, code-organization (2 skills)

**Workflow**:
1. \`find_dead_code\` — Identify unused exports and functions
2. \`find_circular_deps\` — Detect circular dependencies
3. \`safe_delete_check\` — Pre-deletion safety verification (zero external references)
4. \`detect_breaking_changes\` — Impact analysis before changes
5. \`semantic_diff\` — Type-aware verification after changes
6. \`analyze_dependencies\` — Dependency cleanup opportunities

---

#### 24. \`debugging\`

\`\`\`yaml
---
name: debugging
description: "Error investigation and debugging workflow using GoodVibes analysis engine tools. Use when encountering errors, stack traces, TypeScript type errors, runtime exceptions, or build failures. Provides structured analysis with memory-informed resolution."
metadata:
  version: 1.0.0
  category: quality
  tags: [debug, error, stack-trace, type-error, runtime, build-failure]
---
\`\`\`

**Replaces**: debugging (1 skill)

**Workflow**:
1. \`parse_error_stack\` — Structured stack trace analysis
2. \`explain_type_error\` — TypeScript error code explanation
3. Check \`.goodvibes/memory/failures.json\` — Known pattern lookup
4. \`precision_grep\` with context expansion — Find error source in codebase
5. \`find_tests_for_file\` — Locate relevant tests for the failing area
6. Resolution → log to \`failures.json\` for future sessions

---

#### 25. \`project-onboarding\`

\`\`\`yaml
---
name: project-onboarding
description: "Project setup and onboarding workflow for new or existing codebases. Use when starting a new project, generating CLAUDE.md, understanding an unfamiliar codebase, or setting up the development environment. Produces persistent project documentation."
metadata:
  version: 1.0.0
  category: quality
  tags: [onboard, setup, project, claude-md, codebase, environment]
---
\`\`\`

**Replaces**: project-understanding, architecture-assessment (2 skills)

**Workflow**:
1. \`detect_stack\` — Technology stack analysis
2. \`explain_codebase\` — High-level architecture explanation
3. \`read_config\` — Parse all configuration files
4. \`get_conventions\` — Discover coding conventions
5. \`get_api_routes\` — Map API surface
6. \`get_database_schema\` — Map data layer
7. \`project_issues\` — Identify health issues
8. \`env_audit\` — Environment setup verification
9. Output: generate or update CLAUDE.md with findings

---

## Integration Points

### How Skills Connect to Agents

All agents load ALL 5 protocol skills (precision-mastery, review-scoring, discover-plan-batch, goodvibes-memory, error-recovery). Outcome/Quality skills are loaded per task as needed.

| Agent | Protocol Skills (always) | Outcome/Quality Skills (per task) |
|-------|-------------------------|----------------------------------|
| engineer | precision-mastery, review-scoring, discover-plan-batch, goodvibes-memory, error-recovery | authentication, database-layer, api-design, component-architecture, styling-system, state-management, payment-integration, ai-integration, service-integration |
| reviewer | precision-mastery, review-scoring, discover-plan-batch, goodvibes-memory, error-recovery | code-review, security-audit, performance-audit, accessibility-audit |
| tester | precision-mastery, review-scoring, discover-plan-batch, goodvibes-memory, error-recovery | testing-strategy |
| architect | precision-mastery, review-scoring, discover-plan-batch, goodvibes-memory, error-recovery | Any outcome skill (for design phase) |
| deployer | precision-mastery, review-scoring, discover-plan-batch, goodvibes-memory, error-recovery | deployment |
| integrator-ai | precision-mastery, review-scoring, discover-plan-batch, goodvibes-memory, error-recovery | ai-integration |
| integrator-services | precision-mastery, review-scoring, discover-plan-batch, goodvibes-memory, error-recovery | payment-integration, service-integration, authentication |
| integrator-state | precision-mastery, review-scoring, discover-plan-batch, goodvibes-memory, error-recovery | state-management |
| planner | precision-mastery, review-scoring, discover-plan-batch, goodvibes-memory, error-recovery | task-orchestration, fullstack-feature |

### How Skills Connect to Hooks

| Hook | Skill Interaction |
|------|-------------------|
| SessionStart | Announces available skills to orchestrator |
| SubagentStart | Injects protocol skill recommendations into agent context |
| PreToolUse | Enforces precision tool usage (precision-mastery patterns) |
| PostToolUseFailure | Triggers error-recovery skill patterns |
| Stop | N/A (iteration control is orthogonal to skills) |

### How Skills Connect to Engines

| Engine | Skills That Use It |
|--------|-------------------|
| precision-engine | ALL skills (via precision-mastery) |
| batch-engine | task-orchestration, fullstack-feature |
| analysis-engine | security-audit, performance-audit, refactoring, debugging, deployment, database-layer, project-onboarding |
| project-engine | testing-strategy, database-layer, api-design, project-onboarding, deployment |
| frontend-engine | component-architecture, styling-system, accessibility-audit, performance-audit, state-management |
| registry-engine | task-orchestration (skill lookup for agent assignment) |

---

## Implementation Priority

### Phase 1: Protocol Foundation (Highest Impact)
Build these first — they affect ALL agent behavior:
1. \`precision-mastery\` — Token efficiency across all agents
2. \`review-scoring\` — WRFC compliance fix (with validation scripts)
3. \`discover-plan-batch\` — Agent execution consistency
4. \`goodvibes-memory\` — Cross-session learning activation
5. \`error-recovery\` — Failure handling consistency

### Phase 2: Orchestration Layer
6. \`task-orchestration\` — Better task decomposition
7. \`fullstack-feature\` — End-to-end workflow

### Phase 3: Most-Used Outcome Skills
Build based on what users actually build most:
8. \`component-architecture\` — Every project has UI
9. \`api-design\` — Every project has endpoints
10. \`database-layer\` — Most projects have data
11. \`testing-strategy\` — Every project needs tests
12. \`authentication\` — Most projects need auth

### Phase 4: Quality Skills
13. \`code-review\` — Enhanced existing
14. \`security-audit\` — Critical for production
15. \`debugging\` — Most common daily task
16. \`refactoring\` — Code maintenance

### Phase 5: Remaining Outcome Skills
17-25. Build remaining outcome skills based on user demand.

---

## Metrics for Success

After implementation, measure:

1. **Skill load rate** — Target: >50% of sessions load at least one skill (vs current 0.05%)
2. **Review score consistency** — Standard deviation of review scores should decrease
3. **WRFC compliance** — Validation script pass rate should be >95%
4. **Token efficiency** — Per-session token consumption should decrease 10-20%
5. **Memory utilization** — Memory read/write operations per session should increase from near-zero to 2+ per task
6. **Agent quality** — Average review score for agent output should be >=9.0

---

## What Gets Deleted

**173 technology-specific skills** in common/, webdev/ categories → permanently deleted.

These skills duplicated Claude's training data and had zero loads across 4,186 sessions. They are not archived — they provided no value.

�*ill existing skills have been deleted.** Clean slate — only `_registry.yaml` remains. This includes `create/`, `personal/`, and `goodvibes-codebase-review/`.

**Registry engine simplification:**
With 25 skills (well within the 20-50 range), the registry engine tools (\`search_skills\`, \`recommend_skills\`, \`skill_dependencies\`) may be unnecessary. Evaluate post-migration:
- If SubagentStart hook injection + orchestrator embedding works well → simplify registry to just \`get_skill_content\`
- If agents still need discovery → keep \`search_skills\` with improved descriptions

---

## Implementation Spec

### Phase 0: Directory Setup

All existing skills have been deleted (clean slate). Only `_registry.yaml` remains.
1. Create tier directories: `protocol/`, `orchestration/`, `outcome/`, `quality/`

### Phase 1: Write Skill Files (Protocol Foundation)

Create SKILL.md files for the 5 protocol skills. Each follows the directory structure:

\`\`\`
skill-name/
├── SKILL.md              # Frontmatter + body
├── scripts/              # Validation scripts (where specified)
│   └── *.sh / *.py
└── references/           # Decision trees, examples (where specified)
    └── *.md
\`\`\`

Priority order: precision-mastery → review-scoring → discover-plan-batch → goodvibes-memory → error-recovery

### Phase 2: SubagentStart Hook Changes

**File:** \`plugins/goodvibes/hooks/scripts/src/subagent-start/context-injection.ts\`

**Changes needed:**

1. Add skill recommendation mapping:
\`\`\`typescript
const PROTOCOL_SKILLS = [
  'precision-mastery',
  'review-scoring', 
  'discover-plan-batch',
  'goodvibes-memory',
  'error-recovery'
];

const AGENT_SKILL_MAP: Record<string, string[]> = {
  'engineer': ['authentication', 'database-layer', 'api-design', 'component-architecture', 'styling-system', 'state-management', 'payment-integration', 'ai-integration', 'service-integration'],
  'reviewer': ['code-review', 'security-audit', 'performance-audit', 'accessibility-audit'],
  'tester': ['testing-strategy'],
  'architect': [], // Uses outcome skills as needed per task
  'deployer': ['deployment'],
  'integrator-ai': ['ai-integration'],
  'integrator-services': ['payment-integration', 'service-integration', 'authentication'],
  'integrator-state': ['state-management'],
  'planner': ['task-orchestration', 'fullstack-feature'],
};
\`\`\`

2. In \`buildSubagentContext()\`, inject skill recommendations:
\`\`\`
Available protocol skills (load before starting work): \${PROTOCOL_SKILLS.join(', ')}
Relevant outcome/quality skills for your role: \${AGENT_SKILL_MAP[agentType]?.join(', ') || 'none — load as needed'}
Load skills with: search_skills or get_skill_content from the registry engine.
\`\`\`

3. This does NOT auto-load skill content — it tells agents which skills are available so they can load them when relevant (progressive disclosure level 1 → 2 transition).

### Phase 3: Registry Regeneration

**File:** \`plugins/goodvibes/skills/_registry.yaml\`

The registry auto-generation script needs to:
1. Walk the new tier-based directory structure
2. Parse YAML frontmatter from each SKILL.md
3. Generate registry entries with: name, path, description, triggers (extracted from description + tags), category (from metadata)
4. Include create/ and personal/ categories as before
5. Total should be ~30 skills (25 new + 5 create + personal)

### Phase 4: Write Remaining Skills

Order by implementation priority:
1. Orchestration skills (task-orchestration, fullstack-feature)
2. Most-used outcome skills (component-architecture, api-design, database-layer, testing-strategy, authentication)
3. Quality skills (code-review, security-audit, debugging, refactoring)
4. Remaining outcome skills (styling-system, state-management, deployment, payment-integration, ai-integration, service-integration)
5. Remaining quality skills (performance-audit, accessibility-audit, project-onboarding)

### Phase 5: Validation Scripts

Write the shell/python scripts specified in each skill's scripts/ directory. These are the deterministic enforcement layer — they must:
- Accept well-defined input (file path, text content, or stdin)
- Produce structured output (PASS/FAIL + details)
- Use standard exit codes (0 = pass, non-zero = fail)
- Be executable via \`precision_exec\`
- Have no external dependencies beyond standard Unix tools + Python 3

### Phase 6: Integration Testing

1. **Trigger testing**: Run 10-20 test queries per skill to verify Claude loads the right skill for the right task
2. **Script validation**: Run each validation script against known-good and known-bad inputs
3. **Token measurement**: Compare per-session token consumption before and after
4. **Agent behavior**: Verify SubagentStart hook correctly injects skill recommendations
5. **Registry verification**: Confirm \`_registry.yaml\` indexes all 25+ skills correctly

### Migration Checklist

- [x] Delete all existing skills (clean slate — done)
- [ ] Create protocol/, orchestration/, outcome/, quality/ directories
- [ ] Write all 25 SKILL.md files with frontmatter
- [ ] Write all validation scripts
- [ ] Write all reference documents (decision trees, examples)
- [ ] Update SubagentStart hook context-injection.ts
- [ ] Regenerate _registry.yaml
- [ ] Test skill triggering (10-20 queries per skill)
- [ ] Test validation scripts (known-good + known-bad inputs)
- [ ] Measure token consumption change

---

## Source Material

- Anthropic: [The Complete Guide to Building Skills for Claude](https://resources.anthropic.com/hubfs/The-Complete-Guide-to-Building-Skill-for-Claude.pdf) (January 2026)
- Session audit: 4,186 JSONL files scanned across 11 projects (February 2026)
- Competitive analysis: ucai, GSD, BMAD, Ralph, SuperClaude, Claude-Flow, Spec Kit
- GoodVibes plugin deep dive: 6 engines, 11 agents (9 specialized + 2 factories), 10 hooks, 172 skills analyzed
