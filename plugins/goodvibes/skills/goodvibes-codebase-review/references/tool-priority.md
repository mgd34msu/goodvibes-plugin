# Tool Priority Reference

**THE LAW: If a goodvibes MCP tool can do it, USE THE TOOL. No bash fallbacks without checking first.**

All tools use format: `mcp-cli call plugin_goodvibes_{engine}/{tool_name}`

Available engines: `analysis-engine`, `registry-engine`, `project-engine`, `precision-engine`, `batch-engine`, `frontend-engine`

## Tool Priority Order

When implementing features or fixing issues, follow this priority:

1. **Precision Tools First** - Use `precision-engine` for file operations, code search, and command execution
2. **Discovery Phase** - Use `precision-engine/discover` to understand scope before batch operations
3. **Analysis Tools** - Use `analysis-engine` for code analysis, validation, and security checks
4. **Project Tools** - Use `project-engine` for schema, API, testing, and build operations
5. **Frontend Tools** - Use `frontend-engine` for React/CSS analysis
6. **Registry Tools** - Use `registry-engine` for skill/agent discovery
7. **Batch Operations** - Use `batch-engine` for complex multi-file operations
8. **Bash Fallback** - Only when no MCP tool exists (document why)

## Usage Format

```bash
# STEP 1: ALWAYS CHECK SCHEMA FIRST (MANDATORY)
mcp-cli info plugin_goodvibes_{engine}/{tool_name}

# STEP 2: Make the call with correct parameters
mcp-cli call plugin_goodvibes_{engine}/{tool_name} '{"param": "value"}'
```

---

## Quick Reference Table

| Need | ✅ Use This MCP Tool | ❌ NOT This |
|------|----------------------|-------------|
| Dead code | `analysis-engine/find_dead_code` | manual search |
| Circular deps | `analysis-engine/find_circular_deps` | madge, deptree |
| Scan secrets | `analysis-engine/scan_for_secrets` | grep for keys/tokens |
| Test coverage | `project-engine/get_test_coverage` | jest --coverage |
| Bundle analysis | `project-engine/analyze_bundle` | webpack-bundle-analyzer |
| DB schema | `project-engine/get_database_schema` | manual inspection |
| API routes | `project-engine/get_api_routes` | manual inspection |
| Pattern detection | `analysis-engine/scan_patterns` | manual analysis |
| Convention check | `analysis-engine/get_conventions` | style guide reading |
| Dependency audit | `project-engine/analyze_dependencies` | npm audit |
| Project issues | `project-engine/project_issues` | manual tracking |
| Explain code | `project-engine/explain_codebase` | manual documentation |
| Related tests | `project-engine/find_tests_for_file` | file naming convention |
| Suggest tests | `project-engine/suggest_test_cases` | manual thinking |
| Parse errors | `analysis-engine/parse_error_stack` | manual reading |
| Type error help | `analysis-engine/explain_type_error` | manual research |
| Read config | `analysis-engine/read_config` | file reading |
| N+1 queries | `project-engine/get_prisma_operations` | query logging |
| OpenAPI gen | `project-engine/generate_openapi` | swagger tools |
| Safe delete | `analysis-engine/safe_delete_check` | manual checking |
| Breaking changes | `analysis-engine/detect_breaking_changes` | manual review |
| Validate edits | `analysis-engine/validate_edits_preview` | test after edit |
| Validate implementation | `analysis-engine/validate_implementation` | manual testing |
| Env audit | `analysis-engine/env_audit` | manual checking |
| Check permissions | `analysis-engine/check_permissions` | manual inspection |
| Semantic diff | `analysis-engine/semantic_diff` | manual diff review |
| Validate API contract | `analysis-engine/validate_api_contract` | manual testing |

---

## Complete Tool List by Category

### Precision Tools (High Priority)

| Tool | Purpose | Input |
|------|---------|-------|
| `precision-engine/precision_read` | Read files with extract modes | `{"files": ["path"], "extract": "outline\|symbols\|content"}` |
| `precision-engine/precision_write` | Write files atomically | `{"files": [{"path": "...", "content": "..."}]}` |
| `precision-engine/precision_edit` | Edit files with validation | `{"edits": [{"file": "...", "find": "...", "replace": "..."}]}` |
| `precision-engine/precision_grep` | Search with output control | `{"queries": [{"pattern": "...", "glob": "..."}], "output": {"mode": "..."}}` |
| `precision-engine/precision_glob` | Find files with filters | `{"patterns": ["**/*.ts"], "output": {"mode": "..."}}` |
| `precision-engine/precision_symbols` | Symbol search | `{"query": "pattern", "kinds": ["function", "class"]}` |
| `precision-engine/precision_exec` | Execute commands with expectations | `{"commands": [{"cmd": "...", "expect": {...}}]}` |
| `precision-engine/precision_fetch` | Fetch URLs with control | `{"url": "...", "output": {"mode": "..."}}` |
| `precision-engine/discover` | Parallel discovery queries | `{"queries": [{"type": "glob\|grep\|symbols", ...}]}` |

### Batch Operations

| Tool | Purpose | Input |
|------|---------|-------|
| `batch-engine/batch` | Execute multi-file operations | `{"id": "...", "operations": {...}}` |
| `batch-engine/batch_status` | Get batch status | `{"batch_id": "..."}` |
| `batch-engine/batch_list` | List all batches | `{}` |
| `batch-engine/batch_recover` | Recovery operations for failed batches | `{"batch_id": "..."}` |
| `batch-engine/batch_checkpoints` | Checkpoint management | `{"batch_id": "..."}` |
| `batch-engine/batch_state` | Get current batch state | `{"batch_id": "..."}` |

### Discovery & Search (Registry)

| Tool | Purpose | Input |
|------|---------|-------|
| `registry-engine/search_skills` | Search skill registry | `{"query": "keyword"}` |
| `registry-engine/search_agents` | Search agent registry | `{"query": "expertise"}` |
| `registry-engine/search_tools` | Search available tools | `{"query": "capability"}` |
| `registry-engine/recommend_skills` | Get task-relevant skills | `{"task": "description"}` |
| `registry-engine/get_skill_content` | Load full skill | `{"path": "skill/path"}` |
| `registry-engine/get_agent_content` | Load full agent | `{"path": "agent/path"}` |
| `registry-engine/skill_dependencies` | Skill relationships | `{"skill": "name"}` |

### Context Gathering (Analysis)

| Tool | Purpose | Input |
|------|---------|-------|
| `analysis-engine/detect_stack` | Analyze tech stack | `{}` |
| `analysis-engine/check_versions` | Package versions | `{}` |
| `analysis-engine/scan_patterns` | Code patterns | `{}` |
| `analysis-engine/read_config` | Parse config files | `{"file": "path"}` |
| `analysis-engine/get_conventions` | Convention analysis | `{}` |

### Schema & API (Project)

| Tool | Purpose | Input |
|------|---------|-------|
| `project-engine/generate_openapi` | Generate OpenAPI spec | `{}` |
| `project-engine/get_database_schema` | Auto-detect DB schema | `{}` |
| `project-engine/get_api_routes` | Extract API routes | `{}` |
| `project-engine/get_prisma_operations` | Find Prisma N+1 | `{}` |
| `project-engine/query_database` | Execute SQL | `{"query": "SQL", "type": "postgres\|mysql\|sqlite"}` |

### Code Analysis (Analysis Engine)

| Tool | Purpose | Input |
|------|---------|-------|
| `analysis-engine/find_dead_code` | Unused code | `{}` |
| `analysis-engine/get_api_surface` | Public API analysis | `{}` |
| `analysis-engine/safe_delete_check` | Verify deletable | `{"file": "path"}` |
| `analysis-engine/semantic_diff` | Type-aware diff | `{"before": "content", "after": "content"}` |
| `analysis-engine/find_circular_deps` | Circular imports | `{}` |

### Frontend Analysis (Frontend Engine)

| Tool | Purpose | Input |
|------|---------|-------|
| `frontend-engine/get_react_component_tree` | Component hierarchy | `{}` |
| `frontend-engine/analyze_stacking_context` | Z-index analysis | `{"file": "path"}` |
| `frontend-engine/analyze_responsive_breakpoints` | Tailwind breakpoints | `{"file": "path"}` |
| `frontend-engine/trace_component_state` | State flow | `{"component": "name"}` |
| `frontend-engine/analyze_render_triggers` | Re-render causes | `{"component": "name"}` |
| `frontend-engine/analyze_layout_hierarchy` | CSS layout | `{"file": "path"}` |
| `frontend-engine/diagnose_overflow` | Overflow issues | `{"file": "path"}` |
| `frontend-engine/get_accessibility_tree` | A11y analysis | `{}` |
| `frontend-engine/get_sizing_strategy` | Size strategy | `{"selector": "css"}` |
| `frontend-engine/analyze_event_flow` | Event handling | `{"file": "path"}` |
| `frontend-engine/analyze_tailwind_conflicts` | CSS conflicts | `{"file": "path"}` |

### Validation & Testing

| Tool | Purpose | Input |
|------|---------|-------|
| `analysis-engine/validate_implementation` | Check patterns | `{"file": "path", "skill": "name"}` |
| `analysis-engine/validate_edits_preview` | Preview impact | `{"edits": [...]}` |
| `analysis-engine/validate_api_contract` | API contract validation | `{"file": "path"}` |
| `project-engine/find_tests_for_file` | Find tests | `{"file": "path"}` |
| `project-engine/get_test_coverage` | Coverage report | `{}` |
| `project-engine/suggest_test_cases` | Test suggestions | `{"file": "path"}` |

### Error & Debugging (Analysis)

| Tool | Purpose | Input |
|------|---------|-------|
| `analysis-engine/parse_error_stack` | Analyze stack | `{"error": "stack"}` |
| `analysis-engine/explain_type_error` | TS error help | `{"error": "message"}` |

### Dependency Analysis

| Tool | Purpose | Input |
|------|---------|-------|
| `project-engine/analyze_dependencies` | Dep health | `{}` |
| `analysis-engine/find_circular_deps` | Circular imports | `{}` |
| `analysis-engine/detect_breaking_changes` | Breaking changes | `{"package": "name", "from": "v1", "to": "v2"}` |

### Security (Analysis)

| Tool | Purpose | Input |
|------|---------|-------|
| `analysis-engine/scan_for_secrets` | Find credentials | `{}` |
| `analysis-engine/check_permissions` | Access analysis | `{}` |
| `analysis-engine/env_audit` | Environment audit | `{}` |

### Environment & Package (Project)

| Tool | Purpose | Input |
|------|---------|-------|
| `project-engine/upgrade_package` | Safe upgrade | `{"package": "name", "version": "X.Y.Z"}` |
| `project-engine/query_database` | Execute SQL | `{"query": "SQL", "type": "postgres\|mysql\|sqlite"}` |

### Build & Performance (Project)

| Tool | Purpose | Input |
|------|---------|-------|
| `project-engine/analyze_bundle` | Bundle analysis | `{}` |

### Project Management (Project)

| Tool | Purpose | Input |
|------|---------|-------|
| `project-engine/project_issues` | Issue tracking | `{}` |
| `project-engine/plugin_status` | Plugin health | `{}` |
| `project-engine/scaffold_project` | Create from template | `{"template": "name"}` |
| `project-engine/list_templates` | List templates | `{}` |
| `project-engine/explain_codebase` | Codebase docs | `{}` |
| `project-engine/resolve_merge_conflict` | Merge help | `{"file": "path"}` |
| `project-engine/generate_types` | Type generation | `{"source": "path"}` |
| `project-engine/generate_fixture` | Test fixture gen | `{"type": "..."}` |
| `project-engine/sync_api_types` | API type sync | `{}` |
| `project-engine/create_pull_request` | Create GitHub PR | `{"title": "...", "body": "...", "base": "main"}` |

---

## Decision Tree

```
Need to do something?
│
├─ Is there an MCP tool for it?
│   │
│   ├─ YES → Use the MCP tool
│   │
│   └─ NO → Is it a common operation?
│       │
│       ├─ YES → Check if a combination of tools works
│       │
│       └─ NO → Fall back to bash (document why)
│
└─ When using bash fallback:
    │
    ├─ Comment explaining why MCP tool wasn't suitable
    │
    └─ Create issue to add MCP tool for this use case
```

---

## Common Bash Fallbacks (When MCP Tools Don't Apply)

| Task | Acceptable Bash | Reason |
|------|-----------------|--------|
| File watching | `nodemon`, `chokidar` | No MCP equivalent |
| Package install | `npm install` | Package management |
| Build commands | `npm run build` | Project-specific |
| Custom scripts | `npm run X` | Project-specific |
| Git operations | `git commit`, `git push` | VCS operations |
| Process management | `pm2`, `forever` | Runtime management |

**NEVER use bash for:**
- Dependency analysis (use `project-engine/analyze_dependencies`)
- Secret scanning (use `analysis-engine/scan_for_secrets`)
- Test coverage (use `project-engine/get_test_coverage`)
- Finding dead code (use `analysis-engine/find_dead_code`)
- Pattern detection (use `analysis-engine/scan_patterns`)
- File operations (use `precision-engine/precision_read`, `precision_write`, `precision_edit`)
- Code search (use `precision-engine/precision_grep`, `precision_glob`, `precision_symbols`)
