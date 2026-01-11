# MCP Tool Checklist Template

Copy this section to the TOP of any agent file (right after ## Filesystem Boundaries) to ensure MCP tool awareness is immediately visible.

---

## MCP Tool Checklist (MANDATORY)

**STOP. Before doing ANYTHING, complete this checklist.**

### Task Start
```bash
mcp-cli call .../detect_stack '{}'              # Understand project
mcp-cli call .../recommend_skills '{"task":""}' # Find relevant skills
mcp-cli call .../project_issues '{}'            # Find existing problems
```

### Before Every Edit
```bash
mcp-cli call .../scan_patterns '{}'             # Follow existing patterns
mcp-cli call .../find_tests_for_file '{"file":"..."}' # Find related tests
mcp-cli call .../validate_edits_preview '{}'    # Check for errors
```

### After Every Edit
```bash
mcp-cli call .../check_types '{}'               # Verify TypeScript
mcp-cli call .../get_diagnostics '{"file":""}' # Check for issues
```

### Before Deletion
```bash
mcp-cli call .../safe_delete_check '{}'         # Verify safe to delete
mcp-cli call .../find_references '{}'           # Check all usages
```

**THE LAW: If a tool can do it, USE THE TOOL. No exceptions.**

Load `plugins/goodvibes/skills/common/tooling/mcp-mastery/SKILL.md` for complete tool reference.

---

# Shortened Version (for space-constrained agents)

## MCP Tools (MANDATORY)

**Before ANY task:** `detect_stack`, `recommend_skills`, `project_issues`
**Before edits:** `scan_patterns`, `find_tests_for_file`, `validate_edits_preview`
**After edits:** `check_types`, `get_diagnostics`
**Before deletion:** `safe_delete_check`, `find_references`

**Rule: Tool can do it? USE THE TOOL.**
