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
mcp__plugin_goodvibes_goodvibes-tools__detect_stack '{}'

# 2. Find relevant skills for review
mcp__plugin_goodvibes_goodvibes-tools__recommend_skills '{"task":"codebase review and quality audit"}'

# 3. Identify existing issues
mcp__plugin_goodvibes_goodvibes-tools__project_issues '{}'
```

**THE LAW: If a goodvibes tool can do it, USE THE TOOL. No bash fallbacks without checking first.**

---

## Phase 1: Comprehensive Review

### Pre-Review Tool Calls

```bash
# Type checking
mcp__plugin_goodvibes_goodvibes-tools__check_types '{}'

# Find circular dependencies
mcp__plugin_goodvibes_goodvibes-tools__find_circular_deps '{}'

# Scan for secrets
mcp__plugin_goodvibes_goodvibes-tools__scan_for_secrets '{}'

# Analyze dependencies
mcp__plugin_goodvibes_goodvibes-tools__analyze_dependencies '{}'

# Identify tech debt
mcp__plugin_goodvibes_goodvibes-tools__identify_tech_debt '{}'

# Find dead code
mcp__plugin_goodvibes_goodvibes-tools__find_dead_code '{}'

# Get test coverage
mcp__plugin_goodvibes_goodvibes-tools__get_test_coverage '{}'
```

### Review Categories

Analyze ALL code for these 10 dimensions (no area skipped):

| Category | MCP Tools to Use | Check For |
|----------|------------------|-----------|
| **Quality** | `find_dead_code`, `scan_patterns` | Anti-patterns, dead code, duplication, cognitive complexity |
| **Architecture** | `find_circular_deps`, `get_call_hierarchy` | Coupling, cohesion, module boundaries, dependency violations |
| **Security** | `scan_for_secrets`, `check_permissions` | Hardcoded secrets, injection vectors, auth gaps, input validation |
| **Performance** | `get_prisma_operations`, `profile_function` | N+1 queries, memory leaks, algorithm efficiency |
| **Documentation** | `explain_codebase`, `get_document_symbols` | Missing docs, stale comments, API coverage |
| **Testing** | `get_test_coverage`, `find_tests_for_file` | Coverage gaps, missing edge cases, fragile tests |
| **Config** | `get_env_config`, `validate_env_complete` | Hardcoded values, env drift, missing vars |
| **Dependencies** | `analyze_dependencies` | Outdated, unused, security vulnerabilities |
| **Errors** | `get_diagnostics`, `parse_error_stack` | Unhandled exceptions, empty catches, logging gaps |
| **Style** | `scan_patterns`, `get_conventions` | Naming violations, formatting, organization |

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

## Phase 4: Parallel Execution

### Spawn Protocol

```
WHILE tasks_remaining:
    active = count_active_goodvibes_agents()
    
    IF active < 6:
        task = get_next_unclaimed_task()
        
        # Spawn goodvibes background agent with Task tool
        Task(
            description="REMEDIATION: {task.id} - {task.description}",
            prompt=AGENT_PROMPT.format(task),
            background=true
        )
        
        mark_in_progress(task)
        log_start(task)
    
    # SubagentStop hook handles completion notification
    # No polling - agents self-report
```

### Agent Task Prompt

Each spawned agent receives:

```markdown
# Goodvibes Remediation Agent

## MCP Tool Checklist (MANDATORY)

Before ANY edit:
```bash
mcp__plugin_goodvibes_goodvibes-tools__scan_patterns '{}'
mcp__plugin_goodvibes_goodvibes-tools__find_tests_for_file '{"file":"TARGET_FILE"}'
```

After EVERY edit:
```bash
mcp__plugin_goodvibes_goodvibes-tools__check_types '{}'
mcp__plugin_goodvibes_goodvibes-tools__get_diagnostics '{"file":"EDITED_FILE"}'
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
2. Use goodvibes MCP tools before falling back to bash
3. Run validation tools after every edit
4. Report completion status when done
5. Do NOT accept additional tasks
6. Use ONLY goodvibes agents

## Tool Priority (MANDATORY)

Check in this order:
1. `mcp__plugin_goodvibes_goodvibes-tools__*` - Use if applicable
2. `bash` - Only if no MCP tool exists

## Completion

When done, output:
```
TASK_COMPLETE: {TASK_ID}
STATUS: success|failed|partial
CHANGES: [list of files modified]
NOTES: [any relevant context]
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

---

## Constraints

| Rule | Value | Rationale |
|------|-------|-----------|
| Max concurrent agents | 6 | Prevent resource exhaustion |
| Agent type | goodvibes background | Proper telemetry via SubagentStart/SubagentStop hooks |
| Tasks per agent | 1 | Clean context, no accumulated state |
| Monitoring | None | Agents self-report, SubagentStop hook logs completion |
| Tool priority | MCP > bash | Leverage goodvibes tooling for consistency |

---

## Output Artifacts

| File | Description |
|------|-------------|
| `codebase-review-report.md` | Complete findings with scores and file:line references |
| `remediation-plan.md` | Prioritized task checklist by severity wave |
| `remediation-log.md` | Real-time execution tracking |

---

## Memory Integration

After completion, update `.goodvibes/memory/`:

- `decisions.md` - Add architectural decisions from remediation
- `patterns.md` - Document patterns discovered/enforced
- `failures.md` - Log any failed remediation attempts with root cause
