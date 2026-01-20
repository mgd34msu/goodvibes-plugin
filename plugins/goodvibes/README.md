# GoodVibes v2.0 Plugin for Claude Code

A token-efficient Claude Code plugin providing batch-first tools, specialist agents, and a comprehensive skills library for enhanced development workflows.

## What's New in v2.0

- **Batch-First Architecture**: All file operations designed to minimize round-trips
- **Output Mode Control**: Four verbosity levels (`count_only`, `minimal`, `standard`, `verbose`) to optimize token usage
- **Precision Tools**: 10 core tools with smart defaults and validation
- **Specialist Agents**: 9 focused agents with strict capability boundaries
- **Hook System**: Automatic context injection at session start, compaction, and subagent lifecycle

## Core Tools

### Precision Engine (Batch-First)

These tools replace native Read/Edit/Glob/Grep for efficient operations:

| Tool | Purpose | Key Feature |
|------|---------|-------------|
| `batch_read` | Read multiple files | Partial reads with offset/limit |
| `smart_glob` | Find files by pattern | Smart exclusions, limit control |
| `grep_with_content` | Search with context | Regex + glob filtering |
| `atomic_multi_edit` | Multi-file edits | All-or-nothing with validation |
| `workspace_symbols` | Find symbols | Function/class/type search |
| `get_document_symbols` | Analyze file structure | Symbol hierarchy extraction |

### Output Modes

Control token usage with `output_mode` parameter:

```
count_only  -> {"files": 42}                    # Just counts
minimal     -> {"files": ["a.ts", "b.ts"]}     # Paths only
standard    -> {"files": [...], "summary": {}}  # Paths + metadata
verbose     -> {"files": [...], "content": {}}  # Full content
```

### Usage Examples

```bash
# Read multiple files efficiently
mcp-cli call goodvibes-tools/batch_read '{
  "files": ["src/index.ts", {"path": "src/large.ts", "offset": 100, "limit": 50}],
  "output_mode": "minimal"
}'

# Find TypeScript files, exclude tests
mcp-cli call goodvibes-tools/smart_glob '{
  "patterns": ["src/**/*.ts"],
  "exclude": ["**/*.test.ts", "**/*.d.ts"],
  "output_mode": "minimal",
  "limit": 100
}'

# Search for patterns with context
mcp-cli call goodvibes-tools/grep_with_content '{
  "pattern": "TODO|FIXME",
  "glob": "**/*.ts",
  "output_mode": "standard",
  "max_matches": 50
}'

# Atomic multi-file edit with validation
mcp-cli call goodvibes-tools/atomic_multi_edit '{
  "edits": [
    {"file": "src/a.ts", "old_text": "foo", "new_text": "bar"},
    {"file": "src/b.ts", "old_text": "foo", "new_text": "bar"}
  ],
  "validation": {"run_typecheck": true},
  "output_mode": "minimal"
}'
```

## Specialist Agents

9 agents with focused expertise and strict boundaries:

| Agent | Focus | Will NOT Do |
|-------|-------|-------------|
| `backend-engineer` | APIs, databases, auth | Frontend UI |
| `frontend-architect` | React, styling, UX | Backend APIs |
| `fullstack-integrator` | API contracts, state | Deep specialization |
| `code-architect` | Refactoring, patterns | Feature implementation |
| `brutally-honest-reviewer` | Code review, quality | Writing new code |
| `test-engineer` | Testing strategies | Production code |
| `devops-deployer` | CI/CD, infrastructure | Application logic |
| `content-platform` | CMS, content modeling | Non-content features |
| `workflow-planner` | Task breakdown | Direct implementation |

## Skills Library

173 skills organized by category:

```
skills/
├── common/           # Cross-cutting concerns
│   ├── development/  # Refactoring, project understanding
│   ├── quality/      # Code quality patterns
│   ├── review/       # Code review patterns
│   ├── tooling/      # Build tools, configs
│   └── workflow/     # Process patterns
├── webdev/           # Web development skills
├── create/           # Project creation skills
└── goodvibes-codebase-review/  # Full codebase audit
```

### Accessing Skills

```bash
# Find skills for your task
mcp-cli call goodvibes-tools/recommend_skills '{"task": "implement OAuth"}'

# Get skill content
mcp-cli call goodvibes-tools/get_skill_content '{"skill_id": "auth-oauth"}'

# Check skill dependencies
mcp-cli call goodvibes-tools/skill_dependencies '{"skill_id": "react-hooks"}'
```

## Mode System

Two output styles for different workflows:

### vibecoding (default)
- Detailed explanations and reasoning
- Step-by-step guidance
- Educational context
- Best for: learning, complex refactoring, debugging

### justvibes
- Minimal output, code-focused
- 50-70% token reduction
- Best for: routine tasks, experienced developers, batch operations

Switch modes mid-session: "Switch to justvibes" or "Switch to vibecoding"

## Hook System

Automatic context injection at key workflow moments:

| Hook | Trigger | Purpose |
|------|---------|---------|
| `session-start` | New conversation | Project detection, tool loading |
| `session-end` | Conversation close | Cleanup, summary |
| `pre-compact` | Before memory compaction | Preserve critical context |
| `subagent-start` | Agent spawn | Inject agent-specific context |
| `subagent-stop` | Agent complete | Result aggregation |

## Directory Structure

```
plugins/goodvibes/
├── agents/           # 9 specialist agent definitions
├── skills/           # 173 skill modules
├── tools/            # MCP server implementations
│   └── implementations/
│       ├── precision-engine/   # Batch-first precision tools
│       └── tool-search-server/ # Skills and analysis tools
├── hooks/            # Workflow hook scripts
├── output-styles/    # vibecoding and justvibes definitions
└── .mcp.json         # MCP server configuration
```

## Token Efficiency Tips

1. **Default to `minimal` output_mode** unless you need content
2. **Use offset/limit** for large files instead of reading everything
3. **Batch operations** - one call with 10 files beats 10 calls with 1 file
4. **Use `count_only`** when you just need to know if something exists
5. **Switch to `justvibes`** for routine tasks

## Best Practices

### MCP Tool Checklist

Before any task:
```bash
mcp-cli call goodvibes-tools/detect_stack '{}'           # Understand project
mcp-cli call goodvibes-tools/recommend_skills '{...}'    # Find relevant skills
mcp-cli call goodvibes-tools/scan_patterns '{}'          # Follow existing patterns
```

Before edits:
```bash
mcp-cli call goodvibes-tools/find_tests_for_file '{...}' # Find related tests
mcp-cli call goodvibes-tools/validate_edits_preview '{}' # Check for errors
```

After edits:
```bash
mcp-cli call goodvibes-tools/check_types '{}'            # Verify TypeScript
mcp-cli call goodvibes-tools/get_diagnostics '{...}'     # Check for issues
```

## License

MIT
