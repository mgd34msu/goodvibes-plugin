# GoodVibes Logging Specification

> **CANONICAL SPECIFICATION**
>
> This is the canonical logging specification for the GoodVibes plugin system.
>
> **Plugin Initialization**: When the GoodVibes plugin initializes a project's `.goodvibes/` directory structure, this specification file should be copied to `.goodvibes/logs/LOGGING-SPEC.md` to serve as the reference for that project's logging conventions.
>
> **Core Implementation**: See `src/core/logs.ts` for the logging utility implementation that follows this specification.

---

This document defines the structured logging system for GoodVibes autonomous operations.

---

## Overview

| Log File | Purpose | Write When |
|----------|---------|------------|
| `decisions.md` | Architectural choices, approach selections, trade-off resolutions | Making non-trivial decisions |
| `errors.md` | Failures, blockers, recovery actions | Errors occur or recovery completes |
| `activity.md` | Task completions, file changes, commits | Work passes review |

---

## 1. decisions.md

### Purpose
Record **why** decisions were made, not just what was done. This creates institutional memory for:
- Future sessions understanding past choices
- Avoiding repeated debates on resolved issues
- Understanding constraints that led to specific implementations

### When to Write
- Choosing between multiple valid approaches
- Selecting libraries, patterns, or architectures
- Making trade-offs (performance vs readability, etc.)
- Deviating from standard patterns for a reason
- Resolving ambiguous requirements

### Format

```markdown
## YYYY-MM-DD: [Decision Title]

**Context**: [1-2 sentences on what prompted this decision]

**Options Considered**:
1. **[Option A]**: [Brief description]
   - Pros: [advantages]
   - Cons: [disadvantages]
2. **[Option B]**: [Brief description]
   - Pros: [advantages]
   - Cons: [disadvantages]

**Decision**: [Which option was chosen]

**Rationale**: [Why this option was selected over alternatives]

**Implications**: [What this means for future work]

---
```

### Example Entry

```markdown
## 2026-01-25: Base64 Encoding Strategy

**Context**: JSON escaping issues breaking tool calls with special characters

**Options Considered**:
1. **Double-escape special characters**: Escape at call site
   - Pros: No schema changes
   - Cons: Error-prone, caller burden
2. **Add base64 variants**: New `*_base64` parameters
   - Pros: Clean, reliable, caller chooses
   - Cons: Schema complexity

**Decision**: Add base64 variants

**Rationale**: Eliminates escaping ambiguity entirely. Callers opt-in only when needed.

**Implications**: All content-accepting parameters get `_base64` siblings

---
```

---

## 2. errors.md

### Purpose
Record failures and their resolutions to:
- Track recurring issues for pattern detection
- Document successful recovery strategies
- Provide debugging context for future similar errors

### When to Write
- Tool call fails
- Agent fails or times out
- Build/test failures
- Unexpected blockers encountered
- After successful recovery from any error

### Format

```markdown
## YYYY-MM-DD HH:MM - [Error Category]

**Error**: [Brief error description]

**Context**:
- Task: [What was being attempted]
- Agent: [Which agent, if applicable]
- File(s): [Relevant files]

**Root Cause**: [Why it happened]

**Resolution**: [How it was fixed]

**Prevention**: [How to avoid this in future, if applicable]

**Status**: [RESOLVED | UNRESOLVED | WORKAROUND]

---
```

### Error Categories
- `TOOL_FAILURE` - MCP tool or native tool error
- `AGENT_FAILURE` - Subagent crash, timeout, or bad output
- `BUILD_ERROR` - Compilation or bundling failure
- `TEST_FAILURE` - Test suite failures
- `VALIDATION_ERROR` - Schema or type errors
- `EXTERNAL_ERROR` - API, network, or dependency issues
- `UNKNOWN` - Catch-all for unclassified errors

### Example Entry

```markdown
## 2026-01-25 14:32 - TOOL_FAILURE

**Error**: precision_edit failed with "find string not found"

**Context**:
- Task: Updating handler timeout values
- Agent: goodvibes:engineer
- File(s): precision-engine/src/handlers/precision-exec.ts

**Root Cause**: File was modified by concurrent agent, find string no longer matched

**Resolution**: Re-read file, used updated find string

**Prevention**: Add file locking or sequential edits for same-file changes

**Status**: RESOLVED

---
```

---

## 3. activity.md

### Purpose
Chronological record of **completed work** that passed review. This serves as:
- Session continuity across conversations
- Audit trail of changes
- Quick reference for what was done and when

### When to Write
- Task passes final review (WRFC loop complete)
- Files are committed
- Major phase completes

### Format

```markdown
## YYYY-MM-DD: [Task/Feature Title]

**Task**: [Brief description of what was accomplished]

**Plan**: [Path to plan file, if applicable]

**Status**: [COMPLETE | PARTIAL | IN_PROGRESS]

**Completed Items**:
- [Item 1] [status emoji]
- [Item 2] [status emoji]
- ...

**Files Modified**:
- [file1.ts]
- [file2.ts]
- [new-file.ts] (new)

**Review Score**: [X/10, if reviewed]

**Commit**: [hash, if committed]

---
```

### Status Emojis
- `[check]` - Complete
- `[warning]` - Partial/needs attention
- `[x]` - Failed/blocked

### Example Entry

```markdown
## 2026-01-25: Schema Standardization Implementation

**Task**: Implement all 23 recommendations from schema analysis

**Plan**: .goodvibes/plans/schema-standardization-implementation.md

**Status**: COMPLETE

**Completed Items**:
- Add base64 alternatives to all content fields [check]
- Rename output_mode to verbosity [check]
- Standardize path parameter names [check]
- Add deprecation warning utilities [check]
- Update all tests (272 passing) [check]

**Files Modified**:
- precision-engine/src/schemas/index.ts
- precision-engine/src/handlers/*.ts (8 files)
- precision-engine/src/utils/deprecation.ts (new)
- All test files (34 new tests)

**Review Score**: 9.5/10

**Commit**: abc1234

---
```

---

## Writing Guidelines

### General Rules
1. **Append-only**: Never edit or delete past entries
2. **Newest first**: Most recent entries at the top of each file
3. **Consistent dating**: Always use `YYYY-MM-DD` or `YYYY-MM-DD HH:MM` format
4. **Concise**: Each entry should be scannable in <30 seconds
5. **Actionable**: Include enough context for future sessions to understand and act

### What NOT to Log
- Trivial decisions (variable names, minor formatting)
- Transient errors that self-resolve
- Routine operations (reading files, running builds)
- User conversations or preferences (those go in memory/)

### Cross-Referencing
- Reference plan files: `**Plan**: .goodvibes/plans/[name].md`
- Reference commits: `**Commit**: [hash]`
- Reference related logs: `See: errors.md 2026-01-25 14:32`

---

## Directory Structure

```
.goodvibes/
├── logs/
│   ├── LOGGING-SPEC.md    # This file
│   ├── decisions.md       # Architectural decisions
│   ├── errors.md          # Errors and resolutions
│   └── activity.md        # Completed work log
├── memory/
│   ├── patterns.json      # Learned patterns (long-term)
│   ├── failures.json      # Failure patterns (long-term)
│   └── decisions.json     # Decision summaries (long-term)
└── state/
    └── last-session-summary.md  # Session handoff
```

### logs/ vs memory/
- **logs/**: Detailed, chronological, session-specific
  - Format: Markdown (`.md`) for human-readable, append-only chronological records
- **memory/**: Summarized, categorized, cross-session patterns
  - Format: JSON (`.json`) for structured data enabling programmatic search/query operations

---

## Integration with WRFC Loop

```
1. WORK agent executes task
2. REVIEW agent evaluates
3. If PASS:
   → Write to activity.md (task completed)
   → Write to decisions.md (if decisions were made)
4. If FAIL:
   → Write to errors.md (what failed)
   → FIX agent addresses issues
   → CHECK agent re-evaluates
   → Repeat until PASS
   → Write to activity.md (include fix iterations)
   → Write to errors.md (resolution)
```

---

## Maintenance

### Log Rotation
When log files exceed ~500 entries or 50KB:
1. Archive: `activity.md` → `activity-YYYYMM.md`
2. Create fresh `activity.md` with header
3. Keep last 30 days in primary files

### Summarization
Monthly, extract key patterns from logs into memory/:
- Recurring error types → `memory/failures.md`
- Proven approaches → `memory/patterns.md`
- Major decisions → `memory/decisions.md`
