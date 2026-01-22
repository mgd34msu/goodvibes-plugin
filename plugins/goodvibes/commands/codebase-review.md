---
description: |
  Full codebase review with parallel goodvibes agent remediation.
  Analyzes 10 quality dimensions, generates master report, creates
  prioritized remediation plan, executes fixes with max 6 parallel
  goodvibes background agents (one task per agent, fresh context).
allowed_tools: []
---

# Codebase Review & Parallel Remediation

Comprehensive codebase analysis with automated parallel remediation using goodvibes agents.
## Usage

```
/goodvibes:codebase-review
```

## MCP Tool Checklist (MANDATORY)

**STOP. Before doing ANYTHING, run these tools:**

```bash
# 1. Understand the project
mcp-cli call plugin_goodvibes_analysis-engine/detect_stack '{}'

# 2. Find relevant skills for review
mcp-cli call plugin_goodvibes_registry-engine/recommend_skills '{"task":"codebase review and quality audit"}'

# 3. Identify existing issues
mcp-cli call plugin_goodvibes_project-engine/project_issues '{}'
```

**THE LAW: If a goodvibes tool can do it, USE THE TOOL. No bash fallbacks without checking first.**

---

## Phase 1: Comprehensive Review

### Pre-Review Tool Calls

```bash
# Find circular dependencies
mcp-cli call plugin_goodvibes_analysis-engine/find_circular_deps '{}'

# Scan for secrets
mcp-cli call plugin_goodvibes_analysis-engine/scan_for_secrets '{}'

# Analyze dependencies
mcp-cli call plugin_goodvibes_project-engine/analyze_dependencies '{}'

# Find dead code
mcp-cli call plugin_goodvibes_analysis-engine/find_dead_code '{}'

# Get test coverage
mcp-cli call plugin_goodvibes_project-engine/get_test_coverage '{}'
```

### Review Categories

Analyze ALL code for these 10 dimensions (no area skipped):

| Category | MCP Tools to Use | Check For |
|----------|------------------|-----------|
| **Quality** | `plugin_goodvibes_analysis-engine/find_dead_code`, `plugin_goodvibes_analysis-engine/scan_patterns` | Anti-patterns, dead code, duplication, cognitive complexity |
| **Architecture** | `plugin_goodvibes_analysis-engine/find_circular_deps` | Coupling, cohesion, module boundaries, dependency violations |
| **Security** | `plugin_goodvibes_analysis-engine/scan_for_secrets`, `plugin_goodvibes_analysis-engine/check_permissions` | Hardcoded secrets, injection vectors, auth gaps, input validation |
| **Performance** | `plugin_goodvibes_project-engine/get_prisma_operations` | N+1 queries, memory leaks, algorithm efficiency |
| **Documentation** | `plugin_goodvibes_project-engine/explain_codebase` | Missing docs, stale comments, API coverage |
| **Testing** | `plugin_goodvibes_project-engine/get_test_coverage`, `plugin_goodvibes_project-engine/find_tests_for_file` | Coverage gaps, missing edge cases, fragile tests |
| **Config** | `plugin_goodvibes_analysis-engine/env_audit` | Hardcoded values, env drift, missing vars |
| **Dependencies** | `plugin_goodvibes_project-engine/analyze_dependencies` | Outdated, unused, security vulnerabilities |
| **Errors** | `plugin_goodvibes_analysis-engine/parse_error_stack` | Unhandled exceptions, empty catches, logging gaps |
| **Style** | `plugin_goodvibes_analysis-engine/scan_patterns`, `plugin_goodvibes_analysis-engine/get_conventions` | Naming violations, formatting, organization |

---

## Phase 2: Master Report

Generate `codebase-review-report.md` with this structure:

```markdown
# Codebase Review Report

**Project**: [name from detect_stack]
**Generated**: [ISO timestamp]
**Overall Score**: [X/10]

## Executive Summary

- 🔴 Critical: [N] issues
- 🟠 High: [N] issues  
- 🟡 Medium: [N] issues
- 🔵 Low: [N] issues

## Score Breakdown

| Category | Weight | Score | Grade | Key Issues |
|----------|--------|-------|-------|------------|
| Quality | 15% | X/10 | [A-F] | [summary] |
| Architecture | 15% | X/10 | [A-F] | [summary] |
| Security | 20% | X/10 | [A-F] | [summary] |
| Performance | 10% | X/10 | [A-F] | [summary] |
| Documentation | 5% | X/10 | [A-F] | [summary] |
| Testing | 15% | X/10 | [A-F] | [summary] |
| Config | 5% | X/10 | [A-F] | [summary] |
| Dependencies | 5% | X/10 | [A-F] | [summary] |
| Errors | 5% | X/10 | [A-F] | [summary] |
| Style | 5% | X/10 | [A-F] | [summary] |

## Detailed Findings

### [Category]

#### Finding: [Title]

| Field | Value |
|-------|-------|
| **Severity** | critical\|high\|medium\|low |
| **Location** | `file:line` or `file:startLine-endLine` |
| **Measurement** | [exact count/percentage] |
| **Threshold** | [what it should be] |
| **Impact** | [why this matters] |
| **Remediation** | [specific fix] |

[repeat for all findings, grouped by category]
```

**BANNED PHRASES**: "some", "many", "various", "several", "a few", "often", "tends to"  
**REQUIRED**: Every finding MUST have file:line reference and numeric measurement.

---

## Phase 3: Remediation Plan

Generate `remediation-plan.md`:

```markdown
# Remediation Plan

**Total Tasks**: [N]
**Estimated Agents**: [ceil(N/wave_size)]

## Execution Rules

- **Max concurrent agents**: 6
- **Agent type**: goodvibes background ONLY
- **Context**: Fresh context per task (no accumulated state)
- **Tool priority**: MCP tools > bash (mandatory)
- **Monitoring**: None - agents self-report via SubagentStop hook

## Task Checklist

### Wave 1: Critical [P0]

- [ ] TASK-001: [description] | Severity: critical | Files: `file1`, `file2`
- [ ] TASK-002: [description] | Severity: critical | Files: `file3`

### Wave 2: High [P1]

- [ ] TASK-003: [description] | Severity: high | Files: `file4`, `file5`

### Wave 3: Medium [P2]

[continue pattern]

### Wave 4: Low [P3]

[continue pattern]
```

---

## Phase 4: Parallel Agent Execution

### WORK-REVIEW-FIX-CHECK Workflow

For each remediation task:

1. **WORK**: Spawn `goodvibes:engineer` agent (background) to implement fix
2. **REVIEW**: Spawn `goodvibes:reviewer` agent (background) to verify
3. **If PASS**: Commit changes, update remediation-log.md, proceed to next task
4. **If FAIL**: Enter FIX-CHECK loop
   - **FIX**: Spawn `goodvibes:engineer` agent to address issues
   - **CHECK**: Spawn `goodvibes:reviewer` agent to re-verify
   - Repeat until PASS

### Agent Constraints

| Rule | Value |
|------|-------|
| Max concurrent agents | 6 |
| Completion requirement | 100% (no partial) |
| Polling | PROHIBITED (no tail, no TaskOutput) |
| Waiting | SubagentStop hook notifies on completion |

### Spawn Protocol

```
WHILE tasks_remaining:
    active = count_active_goodvibes_agents()

    IF active < 6:
        task = get_next_unclaimed_task()

        # WORK: Spawn engineer agent to implement fix
        Task(
            description="WORK: {task.id} - {task.description}",
            agent="goodvibes:engineer",
            prompt=ENGINEER_PROMPT.format(task),
            background=true
        )

        mark_in_progress(task)
        log_start(task)

    # SubagentStop hook handles completion notification
    # No polling - agents self-report
```

### Engineer Agent Prompt

Each spawned engineer agent receives:

```markdown
# Goodvibes Engineer: Remediation Task

## MCP Tool Checklist (MANDATORY)

Before ANY edit:
```bash
mcp-cli call plugin_goodvibes_analysis-engine/scan_patterns '{}'
mcp-cli call plugin_goodvibes_project-engine/find_tests_for_file '{"file":"TARGET_FILE"}'
```

After EVERY edit:
```bash
mcp-cli call plugin_goodvibes_analysis-engine/validate_edits_preview '{"files":["EDITED_FILE"]}'
```

## Assignment

**Task ID**: {TASK_ID}
**Severity**: {SEVERITY}
**Description**: {DESCRIPTION}

**Target Files**:
{FILE_LIST}

## Context from Report

{RELEVANT_FINDING_DETAILS}

## Instructions

1. Complete ONLY this assigned task
2. Use MCP tools via `mcp-cli call` before falling back to bash
3. Run validation tools after every edit
4. Report completion status when done
5. Do NOT accept additional tasks

## Tool Priority (MANDATORY)

Check in this order:
1. `mcp-cli call plugin_goodvibes_*` - Use if applicable
2. `bash` - Only if no MCP tool exists

## Completion

When done, output:
```
TASK_COMPLETE: {TASK_ID}
STATUS: success|failed
CHANGES: [list of files modified]
NOTES: [any relevant context]
```
```

### Reviewer Agent Prompt

Each spawned reviewer agent receives:

```markdown
# Goodvibes Reviewer: Verify Remediation

## Assignment

**Task ID**: {TASK_ID}
**Engineer Changes**: {FILES_MODIFIED}

## Instructions

1. Review ONLY the changes for this task
2. Use MCP tools for validation
3. Check against original finding
4. Report PASS or FAIL with specific issues

## MCP Tool Checklist (MANDATORY)

```bash
mcp-cli call plugin_goodvibes_analysis-engine/validate_implementation '{"files":{FILES_MODIFIED},"requirements":{REQUIREMENTS}}'
mcp-cli call plugin_goodvibes_project-engine/find_tests_for_file '{"file":"CHANGED_FILE"}'
```

## Completion

When done, output:
```
REVIEW_COMPLETE: {TASK_ID}
STATUS: PASS|FAIL
ISSUES: [list of specific problems if FAIL]
```
```

### Completion Logging

Maintain `remediation-log.md`:

```markdown
# Remediation Log

| Task ID | Description | Status | Started | Completed | Duration | Changes |
|---------|-------------|--------|---------|-----------|----------|---------|
| TASK-001 | Fix SQL injection | ✅ | 10:00:00 | 10:15:32 | 15m32s | `api/users.ts` |
| TASK-002 | Remove hardcoded secrets | 🔄 | 10:05:00 | - | - | - |
| TASK-003 | Add input validation | ⏳ | - | - | - | - |

## Summary

- **Completed**: N/M tasks
- **In Progress**: N agents active
- **Remaining**: N tasks queued
- **Success Rate**: X%
```

### Phase 5: Cleanup

After ALL remediation tasks pass, archive the output files:

```bash
# Archive completed review files
mkdir -p .goodvibes/completed
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
mv codebase-review-report.md .goodvibes/completed/code-review-${TIMESTAMP}.md
mv remediation-plan.md .goodvibes/completed/remediation-plan-${TIMESTAMP}.md
mv remediation-log.md .goodvibes/completed/remediation-log-${TIMESTAMP}.md
```

**Cleanup Checklist:**
- [ ] All tasks completed in remediation-log.md
- [ ] Memory files updated
- [ ] Files archived to `.goodvibes/completed/`

---

## Constraints

| Rule | Value | Rationale |
|------|-------|-----------|
| Max concurrent agents | 6 | Prevent resource exhaustion |
| Agent type | goodvibes background | Proper telemetry via SubagentStart/SubagentStop hooks |
| Tasks per agent | 1 | Clean context, no accumulated state |
| Workflow | WORK-REVIEW-FIX-CHECK | Engineer implements, reviewer verifies, loop on failures |
| Monitoring | None | Agents self-report, SubagentStop hook logs completion |
| Tool priority | MCP > bash | Leverage goodvibes tooling for consistency |

---

## Output Artifacts

| File | Description | Post-Completion |
|------|-------------|-----------------|
| `codebase-review-report.md` | Complete findings with scores and file:line references | Archived to `.goodvibes/completed/code-review-{timestamp}.md` |
| `remediation-plan.md` | Prioritized task checklist by severity wave | Archived to `.goodvibes/completed/remediation-plan-{timestamp}.md` |
| `remediation-log.md` | Real-time execution tracking | Archived to `.goodvibes/completed/remediation-log-{timestamp}.md` |

---

## Memory Integration

After completion, update `.goodvibes/memory/`:

- `decisions.md` - Add architectural decisions from remediation
- `patterns.md` - Document patterns discovered/enforced
- `failures.md` - Log any failed remediation attempts with root cause
