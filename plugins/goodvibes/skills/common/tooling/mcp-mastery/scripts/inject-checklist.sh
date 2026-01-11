#!/bin/bash
# inject-checklist.sh
# Injects the compact MCP checklist into agent files after the Filesystem Boundaries section

CHECKLIST='## MCP Tool Checklist (MANDATORY)

**Before ANY task:** `detect_stack`, `recommend_skills`, `project_issues`
**Before edits:** `scan_patterns`, `find_tests_for_file`, `validate_edits_preview`
**After edits:** `check_types`, `get_diagnostics`
**Before deletion:** `safe_delete_check`, `find_references`

**Rule: Tool can do it? USE THE TOOL.**

---'

AGENTS_DIR="${1:-plugins/goodvibes/agents}"

echo "Scanning agents in: $AGENTS_DIR"

find "$AGENTS_DIR" -name "*.md" -type f | while read -r agent_file; do
    # Skip registry files
    if [[ "$agent_file" == *"_registry"* ]]; then
        continue
    fi

    # Check if checklist already exists
    if grep -q "MCP Tool Checklist" "$agent_file"; then
        echo "SKIP: $agent_file (checklist already present)"
        continue
    fi

    # Check if Filesystem Boundaries section exists
    if grep -q "## Filesystem Boundaries" "$agent_file"; then
        echo "UPDATE: $agent_file"
        # Insert checklist after Filesystem Boundaries section
        # This is a placeholder - actual implementation would use sed/awk
    else
        echo "WARN: $agent_file (no Filesystem Boundaries section found)"
    fi
done

echo ""
echo "Done. Review changes before committing."
