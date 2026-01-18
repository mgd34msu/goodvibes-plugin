# Tool Priority Reference

**THE LAW: If a goodvibes MCP tool can do it, USE THE TOOL. No bash fallbacks without checking first.**

All tools use prefix: `mcp__plugin_goodvibes_goodvibes-tools__`

---

## Quick Reference Table

| Need | ✅ Use This MCP Tool | ❌ NOT This |
|------|----------------------|-------------|
| Type checking | `check_types` | `npx tsc --noEmit` |
| Find usages | `find_references` | `grep -r "pattern"` |
| Safe rename | `rename_symbol` | find-and-replace |
| Check errors | `get_diagnostics` | compile output |
| Dead code | `find_dead_code` | manual search |
| Circular deps | `find_circular_deps` | madge, deptree |
| Scan secrets | `scan_for_secrets` | grep for keys/tokens |
| Test coverage | `get_test_coverage` | jest --coverage |
| Bundle analysis | `analyze_bundle` | webpack-bundle-analyzer |
| DB schema | `get_schema` | manual inspection |
| API routes | `get_api_routes` | manual inspection |
| Go to definition | `go_to_definition` | manual navigation |
| Find implementations | `get_implementations` | grep interface name |
| Call hierarchy | `get_call_hierarchy` | manual tracing |
| Document outline | `get_document_symbols` | manual reading |
| Code actions | `get_code_actions` | manual fixes |
| Inferred types | `get_inlay_hints` | hover in editor |
| Workspace search | `workspace_symbols` | grep across files |
| Pattern detection | `scan_patterns` | manual analysis |
| Convention check | `get_conventions` | style guide reading |
| Dependency audit | `analyze_dependencies` | npm audit |
| Tech debt | `identify_tech_debt` | manual assessment |
| Project issues | `project_issues` | manual tracking |
| Explain code | `explain_codebase` | manual documentation |
| Related tests | `find_tests_for_file` | file naming convention |
| Suggest tests | `suggest_test_cases` | manual thinking |
| Parse errors | `parse_error_stack` | manual reading |
| Type error help | `explain_type_error` | manual research |
| Memory leaks | `detect_memory_leaks` | chrome devtools |
| Env config | `get_env_config` | grep for process.env |
| Validate env | `validate_env_complete` | manual checking |
| Read config | `read_config` | file reading |
| N+1 queries | `get_prisma_operations` | query logging |
| Profile perf | `profile_function` | manual profiling |
| OpenAPI gen | `generate_openapi` | swagger tools |
| Safe delete | `safe_delete_check` | manual checking |
| Breaking changes | `detect_breaking_changes` | manual review |
| Validate edits | `validate_edits_preview` | test after edit |
| Smoke test | `run_smoke_test` | manual testing |

---

## Complete Tool List by Category

### Discovery & Search

| Tool | Purpose | Input |
|------|---------|-------|
| `search_skills` | Search skill registry | `{"query": "keyword"}` |
| `search_agents` | Search agent registry | `{"query": "expertise"}` |
| `search_tools` | Search available tools | `{"query": "capability"}` |
| `recommend_skills` | Get task-relevant skills | `{"task": "description"}` |
| `get_skill_content` | Load full skill | `{"path": "skill/path"}` |
| `get_agent_content` | Load full agent | `{"path": "agent/path"}` |
| `skill_dependencies` | Skill relationships | `{"skill": "name"}` |

### Context Gathering

| Tool | Purpose | Input |
|------|---------|-------|
| `detect_stack` | Analyze tech stack | `{}` |
| `check_versions` | Package versions | `{}` |
| `scan_patterns` | Code patterns | `{}` |
| `fetch_docs` | Library docs | `{"library": "name"}` |
| `read_config` | Parse config files | `{"file": "path"}` |
| `get_conventions` | Convention analysis | `{}` |

### Schema & API

| Tool | Purpose | Input |
|------|---------|-------|
| `generate_openapi` | Generate OpenAPI spec | `{}` |
| `get_schema` | DB schema introspection | `{}` |
| `get_database_schema` | Auto-detect DB schema | `{}` |
| `get_api_routes` | Extract API routes | `{}` |
| `get_prisma_operations` | Find Prisma N+1 | `{}` |

### LSP Code Navigation

| Tool | Purpose | Input |
|------|---------|-------|
| `find_references` | Find all references | `{"file": "path", "line": N, "column": N}` |
| `go_to_definition` | Jump to definition | `{"file": "path", "line": N, "column": N}` |
| `get_implementations` | Find implementations | `{"file": "path", "line": N, "column": N}` |
| `rename_symbol` | Safe rename | `{"file": "path", "line": N, "column": N, "newName": "name"}` |
| `get_code_actions` | Quick fixes | `{"file": "path", "line": N}` |
| `apply_code_action` | Apply code action | `{"file": "path", "action": "id"}` |
| `get_symbol_info` | Symbol details | `{"file": "path", "line": N, "column": N}` |
| `get_call_hierarchy` | Call graph | `{"file": "path", "line": N, "column": N}` |
| `get_type_hierarchy` | Type inheritance | `{"file": "path", "line": N, "column": N}` |
| `get_document_symbols` | File outline | `{"file": "path"}` |
| `get_signature_help` | Function signatures | `{"file": "path", "line": N, "column": N}` |
| `get_diagnostics` | TypeScript errors | `{"file": "path"}` |
| `find_dead_code` | Unused code | `{}` |
| `get_api_surface` | Public API analysis | `{}` |
| `safe_delete_check` | Verify deletable | `{"file": "path"}` |
| `get_inlay_hints` | Inferred types | `{"file": "path"}` |
| `workspace_symbols` | Symbol search | `{"query": "pattern"}` |
| `semantic_diff` | Type-aware diff | `{"before": "content", "after": "content"}` |

### Frontend Analysis

| Tool | Purpose | Input |
|------|---------|-------|
| `get_react_component_tree` | Component hierarchy | `{}` |
| `analyze_stacking_context` | Z-index analysis | `{"file": "path"}` |
| `analyze_responsive_breakpoints` | Tailwind breakpoints | `{"file": "path"}` |
| `trace_component_state` | State flow | `{"component": "name"}` |
| `analyze_render_triggers` | Re-render causes | `{"component": "name"}` |
| `analyze_layout_hierarchy` | CSS layout | `{"file": "path"}` |
| `diagnose_overflow` | Overflow issues | `{"file": "path"}` |
| `get_accessibility_tree` | A11y analysis | `{}` |
| `get_sizing_strategy` | Size strategy | `{"selector": "css"}` |
| `analyze_event_flow` | Event handling | `{"file": "path"}` |
| `analyze_tailwind_conflicts` | CSS conflicts | `{"file": "path"}` |

### Validation & Testing

| Tool | Purpose | Input |
|------|---------|-------|
| `validate_implementation` | Check patterns | `{"file": "path", "skill": "name"}` |
| `run_smoke_test` | Quick verify | `{}` |
| `check_types` | TypeScript check | `{}` |
| `validate_edits_preview` | Preview impact | `{"edits": [...]}` |
| `find_tests_for_file` | Find tests | `{"file": "path"}` |
| `get_test_coverage` | Coverage report | `{}` |
| `suggest_test_cases` | Test suggestions | `{"file": "path"}` |

### Error & Debugging

| Tool | Purpose | Input |
|------|---------|-------|
| `parse_error_stack` | Analyze stack | `{"error": "stack"}` |
| `explain_type_error` | TS error help | `{"error": "message"}` |
| `detect_memory_leaks` | Memory analysis | `{}` |
| `log_analyzer` | Log patterns | `{"logs": "content"}` |

### Dependency Analysis

| Tool | Purpose | Input |
|------|---------|-------|
| `analyze_dependencies` | Dep health | `{}` |
| `find_circular_deps` | Circular imports | `{}` |
| `detect_breaking_changes` | Breaking changes | `{"package": "name", "from": "v1", "to": "v2"}` |

### Security

| Tool | Purpose | Input |
|------|---------|-------|
| `scan_for_secrets` | Find credentials | `{}` |
| `check_permissions` | Access analysis | `{}` |

### Environment & Package

| Tool | Purpose | Input |
|------|---------|-------|
| `get_env_config` | Env var usage | `{}` |
| `validate_env_complete` | Env validation | `{}` |
| `upgrade_package` | Safe upgrade | `{"package": "name", "version": "X.Y.Z"}` |
| `query_database` | Execute SQL | `{"query": "SQL", "type": "postgres|mysql|sqlite"}` |

### Build & Performance

| Tool | Purpose | Input |
|------|---------|-------|
| `analyze_bundle` | Bundle analysis | `{}` |
| `profile_function` | Perf profiling | `{"file": "path", "function": "name"}` |

### Project Management

| Tool | Purpose | Input |
|------|---------|-------|
| `project_issues` | Issue tracking | `{}` |
| `identify_tech_debt` | Tech debt grade | `{}` |
| `plugin_status` | Plugin health | `{}` |

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
- Type checking (use `check_types`)
- Finding references (use `find_references`)
- Renaming (use `rename_symbol`)
- Dependency analysis (use `analyze_dependencies`)
- Secret scanning (use `scan_for_secrets`)
- Test coverage (use `get_test_coverage`)
