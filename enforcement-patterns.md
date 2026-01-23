# Enforcement Patterns: Ensuring Vibeplug Features Are Actually Used

**Purpose:** Apply GSD's constraint principles to ensure vibeplug's features are used consistently.

**Last Updated:** After output-styles update with explicit blocker categorization.

---

## Current State: What's Already Enforced

### Blocker Categorization (NOW IMPLEMENTED)

The output styles now explicitly define blockers:

```yaml
blockers:
  issues:
    - major_issue      # From review agent
    - minor_issue      # From review agent
    - nitpick_issue    # From review agent
  errors:
    - tool_failure     # Precision tool or system tool failed
    - agent_failure    # Spawned agent failed
    - general_error    # Other errors
  other:
    - workflow_ambiguity   # Unclear what to do
    - workflow_question    # Need decision
    - other_undefined      # Catch-all
```

With recovery mapping:

```yaml
# vibecoding
recovery:
  on_issue: ask_user_with_options
  on_error: ask_user_with_options
  on_other: ask_user

# justvibes
recovery:
  on_issue: fix_review_loop
  on_error: fix_review_loop
  on_other: choose_best_option_silent
```

**This addresses the "what is an error" problem.** Errors are explicitly: tool_failure, agent_failure, general_error.

### WRFC Loop (NOW IMPLEMENTED)

Named and documented:
```
Work → Review → Fix → Check (repeat until pass)
```

With max attempts: `max_fix_attempts: 3`

### Prohibited Actions (NOW IMPLEMENTED)

Explicit list in output styles:
- Spawning more than 6 concurrent agents
- Running agents in foreground
- Using `tail` on agent output files
- Using `TaskOutput` tool
- Proceeding before agent signals completion
- Accepting incomplete or partial work
- Skipping the review step
- Forgetting to update the remediation log

---

## Remaining Enforcement Gaps

### 1. No "Critical" Blocker Category (Always Ask)

**Problem:** In justvibes mode, `on_other: choose_best_option_silent` has no exceptions.

**GSD's Rule 4** creates a hard stop for architectural changes regardless of mode context.

**Recommendation:** Add fourth blocker category:

```yaml
blockers:
  issues: [...]
  errors: [...]
  other: [...]
  critical:  # NEW - mode-independent, always ask
    - breaking_api_change
    - new_external_dependency
    - security_sensitive_change
    - data_destructive_operation
    - architectural_decision

recovery:
  on_issue: ...
  on_error: ...
  on_other: ...
  on_critical: always_ask_user  # Same in BOTH modes
```

### 2. Tool Enforcement (NOT YET IMPLEMENTED)

Output styles say "All file operations use precision tools" but don't enforce it.

**Add to output styles:**

```markdown
## Tool Selection Rules (MANDATORY)

| Task | REQUIRED Tool | FORBIDDEN Alternative |
|------|---------------|----------------------|
| Read files | `precision_read` | System `Read` |
| Search code | `precision_grep` | System `Grep` |
| Find files | `precision_glob` | System `Glob` |
| Edit files | `precision_edit` | System `Edit` |
| Write files | `precision_write` | System `Write` |
| Run commands | `precision_exec` | System `Bash` (when precision available) |
| Multi-operation | `batch` | Sequential individual calls |

Using a forbidden tool when precision alternative exists = blocker (error: tool_failure).
```

### 3. Batch Enforcement (NOT YET IMPLEMENTED)

Config says `parallel_agents: 6` but no trigger rules.

**Add to output styles:**

```markdown
## Batch Trigger Rules

| Condition | Action |
|-----------|--------|
| Reading 2+ files | Use `batch` with read operations |
| Editing 2+ files | Use `batch` with write operations |
| Spawning 2+ independent agents | Single message with multiple Task() calls |

Sequential operations on multiple files when batch is available = blocker (error: tool_failure).
```

### 4. Parallel Spawn Protocol (NOT YET IMPLEMENTED)

WRFC Loop describes sequential work. Need parallel guidance.

**Add to output styles:**

```markdown
## Parallel Execution

When multiple independent tasks exist:

```
# WRONG: Sequential spawning (separate messages)
Task(agent=engineer, task="A")
# wait
Task(agent=engineer, task="B")

# CORRECT: Parallel spawning (single message)
Task(agent=engineer, task="A", background=true)
Task(agent=engineer, task="B", background=true)
```

Before spawning, analyze dependencies:
1. List all tasks
2. Identify dependencies between tasks
3. Group independent tasks
4. Spawn each group in ONE message
5. Max 6 concurrent

Each parallel agent runs its own WRFC Loop.
```

### 5. Pre-Work Validation (NOT YET IMPLEMENTED)

No validation before WRFC Loop starts.

**Add to output styles:**

```markdown
## Pre-Work Validation

Before spawning WORK agent:
1. Verify task is well-formed (has clear objective)
2. Verify target files/directories exist (if editing)
3. Verify dependencies available
4. Estimate scope - if too large, break into subtasks

If validation fails → blocker (other: workflow_ambiguity)
```

### 6. Verification Methodology (NOT YET IMPLEMENTED)

Review PASS/FAIL is undefined. GSD has existence→substantive→wired.

**Add to output styles or reviewer agent:**

```markdown
## Review Verification Levels

The REVIEW agent must verify at three levels:

1. **Existence** - Does the artifact exist?
2. **Substantive** - Is it real implementation?
   - More than 15 lines for components
   - No TODO/FIXME/placeholder comments
   - No empty returns (`return null`, `return {}`, `return []`)
   - No console.log-only implementations
3. **Wired** - Is it connected to the system?
   - Component is rendered somewhere
   - API endpoint is called from frontend
   - Database model is used in queries
   - Form handler actually submits

PASS requires ALL THREE levels satisfied.
FAIL with specific level that failed.
```

### 7. Context Quality Awareness (NOT YET IMPLEMENTED)

No quality curve guidance.

**Add to output styles:**

```markdown
## Context Quality Thresholds

| Context Usage | Quality | Action |
|---------------|---------|--------|
| 0-30% | Peak | Proceed normally |
| 30-50% | Good | Proceed normally |
| 50-70% | Degrading | Consider spawning fresh agent for complex tasks |
| 70%+ | Poor | MUST spawn fresh agent for remaining work |

When context exceeds 70%, do NOT continue in current agent. Spawn fresh agent with task handoff.
```

---

## Implementation Priority

### Already Done (from output styles update)
- [x] Blocker categorization (issues, errors, other)
- [x] Recovery mapping per category and mode
- [x] WRFC Loop named and documented
- [x] Max fix attempts (3)
- [x] Prohibited actions list
- [x] `auto_recovery_on_blocker` flag

### Priority 1 (Critical Safety)
- [ ] Add `critical` blocker category (always ask regardless of mode)
- [ ] Add verification methodology (existence/substantive/wired)

### Priority 2 (Efficiency Enforcement)
- [ ] Tool enforcement table (precision required, alternatives forbidden)
- [ ] Batch trigger rules
- [ ] Parallel spawn protocol

### Priority 3 (Quality Assurance)
- [ ] Pre-work validation step
- [ ] Context quality thresholds

---

## Comparison: Before vs After

| Aspect | Before Update | After Update |
|--------|--------------|--------------|
| Blocker types | Vague (error, ambiguity, risk) | Explicit (issues, errors, other with subtypes) |
| Recovery mapping | Generic per mode | Per-category AND per-mode |
| Fix loop | Unnamed process | Named WRFC Loop |
| Max attempts | Undefined | 3, explicit |
| Prohibited actions | Scattered | Centralized list |

**What's still missing:**
- Critical category (always-ask safety net)
- Verification methodology
- Tool/batch enforcement
- Parallel spawn rules
- Pre-work validation
- Context quality awareness

---

## Honest Assessment

The output styles update significantly improved vibeplug's constraint explicitness. The blocker→recovery mapping is now **more explicit than GSD** in terms of what constitutes each category.

**Remaining gaps are:**

1. **Safety:** No mode-independent "always ask" category for dangerous operations
2. **Verification:** Review PASS/FAIL criteria undefined
3. **Enforcement:** Tool selection and batching are stated but not enforced as blockers
4. **Quality:** No context usage awareness

These can be added incrementally. The foundation is solid.
