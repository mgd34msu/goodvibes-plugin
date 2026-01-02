# GoodVibes Plugin

Comprehensive Claude Code plugin with agents, skills, tools, hooks, and MCP servers for full-stack development.

## Structure

```
goodvibes-plugin/
├── .claude-plugin/plugin.json    # Plugin manifest
├── .mcp.json                     # MCP server config
├── .lsp.json                     # LSP server config
├── hooks/hooks.json              # Lifecycle hooks
├── agents/                       # 8 agents
├── skills/                       # 150 skills
├── tools/
│   ├── definitions/              # 17 tool definitions (YAML)
│   └── implementations/
│       └── tool-search-server/   # MCP server (TypeScript)
├── commands/                     # 3 slash commands
│   ├── search.md
│   ├── plugin-status.md
│   └── load-skill.md
├── templates/                    # 3 project templates
├── scripts/
│   ├── build-registries.ts
│   ├── migrate-content.ts
│   └── validate.ts
└── package.json
```

## Resources

| Type | Count |
|------|-------|
| Agents | 8 |
| Skills | 150 |
| Tools | 17 |
| Commands | 3 |
| Templates | 3 |

## Setup

1. Install dependencies and build registries:
   ```bash
   cd goodvibes-plugin
   npm install
   npm run build:registries
   ```

2. Build the MCP server:
   ```bash
   cd tools/implementations/tool-search-server
   npm install
   npm run build
   ```

3. Build the hook scripts:
   ```bash
   cd hooks/scripts
   npm install
   npm run build
   ```

## Usage

### Slash Commands

- `/search [skills|agents|tools] <query>` - Search plugin resources
- `/plugin-status` - Show plugin status and statistics
- `/load-skill <skill-name-or-path>` - Load a skill's full content

### MCP Tools (17 total)

**Core Discovery:**
- `search_skills` - Search skill registry by keyword
- `search_agents` - Search agent registry by expertise
- `search_tools` - Search available tools
- `recommend_skills` - Analyze task and recommend skills
- `list_templates` - List available project templates

**Context Gathering:**
- `detect_stack` - Analyze project technology stack
- `check_versions` - Check installed package versions
- `scan_patterns` - Identify code patterns and conventions

**Live Data:**
- `fetch_docs` - Fetch current library documentation
- `get_schema` - Introspect database schema
- `read_config` - Parse configuration files

**Validation:**
- `validate_implementation` - Check code matches skill patterns
- `run_smoke_test` - Quick verification of generated code
- `check_types` - Run TypeScript type checking

**Meta:**
- `skill_dependencies` - Show skill relationships
- `get_skill_content` - Load full skill content
- `scaffold_project` - Create project from template

## Installation

### In a project
```bash
claude plugin install ./goodvibes-plugin --scope project
```

### User-wide
```bash
claude plugin install ./goodvibes-plugin --scope user
```

## Links

- Repository: https://github.com/mgd34msu/goodvibes.sh
- Website: https://goodvibes.sh
