# .mcp.json Reference

Complete reference for MCP (Model Context Protocol) server configuration.

## Location

`.claude-plugin/.mcp.json`

## Purpose

The `.mcp.json` file configures Model Context Protocol servers that provide additional tools and capabilities to Claude Code. These servers run as child processes and expose tools via the MCP protocol.

## Full Schema

```json
{
  "mcpServers": {
    "precision-engine": {
      "command": "node",
      "args": ["${CLAUDE_PLUGIN_ROOT}/tools/implementations/precision-engine/dist/index.cjs"],
      "env": {
        "PLUGIN_ROOT": "${CLAUDE_PLUGIN_ROOT}",
        "NODE_ENV": "production"
      }
    },
    "registry-engine": {
      "command": "node",
      "args": ["${CLAUDE_PLUGIN_ROOT}/tools/implementations/registry-engine/dist/index.cjs"],
      "env": {
        "PLUGIN_ROOT": "${CLAUDE_PLUGIN_ROOT}",
        "NODE_ENV": "production"
      }
    },
    "frontend-engine": {
      "command": "node",
      "args": ["${CLAUDE_PLUGIN_ROOT}/tools/implementations/frontend-engine/dist/index.cjs"],
      "env": {
        "PLUGIN_ROOT": "${CLAUDE_PLUGIN_ROOT}",
        "NODE_ENV": "production"
      }
    },
    "analysis-engine": {
      "command": "node",
      "args": ["${CLAUDE_PLUGIN_ROOT}/tools/implementations/analysis-engine/dist/index.cjs"],
      "env": {
        "PLUGIN_ROOT": "${CLAUDE_PLUGIN_ROOT}",
        "NODE_ENV": "production"
      }
    },
    "project-engine": {
      "command": "node",
      "args": ["${CLAUDE_PLUGIN_ROOT}/tools/implementations/project-engine/dist/index.cjs"],
      "env": {
        "PLUGIN_ROOT": "${CLAUDE_PLUGIN_ROOT}",
        "NODE_ENV": "production"
      }
    }
  }
}
```

## Top-Level Structure

### `mcpServers`
- **Type**: `object`
- **Required**: Yes
- **Description**: Map of server names to server configurations
- **Keys**: Server identifiers (used for namespacing tools as `{server}/{tool}`)
- **Values**: Server configuration objects

## Server Configuration

Each server configuration object has the following fields:

### `command`
- **Type**: `string`
- **Required**: Yes
- **Description**: Executable command to run the MCP server
- **Examples**:
  - `"node"` - Node.js runtime
  - `"python"` - Python interpreter
  - `"uvx"` - Python package runner
  - `"/path/to/binary"` - Custom binary

### `args`
- **Type**: `array<string>`
- **Required**: No (but typically needed)
- **Description**: Command-line arguments passed to the command
- **Variable Substitution**: Supports environment variables and special variables
- **Examples**:
  ```json
  "args": ["${CLAUDE_PLUGIN_ROOT}/tools/implementations/precision-engine/dist/index.cjs"]
  "args": ["-m", "my_mcp_server"]
  "args": ["run", "my-package"]
  ```

### `env`
- **Type**: `object<string, string>`
- **Required**: No
- **Description**: Environment variables to set for the server process
- **Variable Substitution**: Values support environment variable expansion
- **Common Variables**:
  - `PLUGIN_ROOT` - Path to plugin directory
  - `NODE_ENV` - Node.js environment
  - `DEBUG` - Debug flags
  - `LOG_LEVEL` - Logging verbosity
- **Example**:
  ```json
  "env": {
    "PLUGIN_ROOT": "${CLAUDE_PLUGIN_ROOT}",
    "NODE_ENV": "production",
    "DEBUG": "mcp:*",
    "LOG_LEVEL": "info"
  }
  ```

## Variable Substitution

The following variables are automatically substituted at runtime:

### `${CLAUDE_PLUGIN_ROOT}`
- **Description**: Absolute path to the `.claude-plugin/` directory
- **Use Cases**:
  - Referencing plugin scripts and executables
  - Setting `PLUGIN_ROOT` environment variable
  - Locating configuration files
- **Example**:
  ```json
  "args": ["${CLAUDE_PLUGIN_ROOT}/tools/implementations/precision-engine/dist/index.cjs"]
  ```
  Resolves to (Windows): `C:\Users\username\AppData\Roaming\Claude\plugins\goodvibes\.claude-plugin\tools\implementations\precision-engine\dist\index.cjs`

### `${HOME}`, `${USER}`, etc.
- **Description**: Standard environment variables
- **Use Cases**: User-specific paths, credentials
- **Example**:
  ```json
  "env": {
    "CONFIG_PATH": "${HOME}/.config/my-tool"
  }
  ```

## GoodVibes MCP Servers

GoodVibes provides 6 specialized MCP servers:

### 1. precision-engine
**Purpose**: Token-efficient file operations with precision output control

**Tools Provided**:
- `precision_read` - Read files with extract modes (outline, symbols, lines)
- `precision_write` - Write files with validation and templates
- `precision_edit` - Atomic batch edits with transaction support
- `precision_grep` - Search with output modes (count, files, locations, context)
- `precision_glob` - File pattern matching with filters
- `precision_exec` - Execute commands with expectations and output control
- `precision_fetch` - Web fetching with caching and extraction
- `precision_symbols` - Workspace symbol search
- `precision_notebook` - Jupyter notebook cell operations with cell_id targeting
- `precision_config` - Runtime configuration (get/set/reload)
- `discover` - Parallel multi-query discovery (grep + glob + symbols + structural)
- `precision_agent` - Spawn headless Claude sessions with dossier-based context

**Configuration**:
```json
"precision-engine": {
  "command": "node",
  "args": ["${CLAUDE_PLUGIN_ROOT}/tools/implementations/precision-engine/dist/index.cjs"],
  "env": {
    "PLUGIN_ROOT": "${CLAUDE_PLUGIN_ROOT}",
    "NODE_ENV": "production"
  }
}
```

### 2. registry-engine
**Purpose**: Search and discover skills, agents, and tools

**Tools Provided**:
- `search_skills` - Search skill registry
- `search_agents` - Search agent registry
- `search_tools` - Search tool registry
- `recommend_skills` - Get skill recommendations based on context
- `get_skill_content` - Load skill content
- `get_agent_content` - Load agent content
- `skill_dependencies` - Resolve skill dependencies

**Configuration**:
```json
"registry-engine": {
  "command": "node",
  "args": ["${CLAUDE_PLUGIN_ROOT}/tools/implementations/registry-engine/dist/index.cjs"],
  "env": {
    "PLUGIN_ROOT": "${CLAUDE_PLUGIN_ROOT}",
    "NODE_ENV": "production"
  }
}
```

### 3. frontend-engine
**Purpose**: Analyze and debug frontend component hierarchies

**Tools Provided**:
- `get_react_component_tree` - Get React component hierarchy
- `analyze_stacking_context` - Analyze z-index and stacking
- `analyze_responsive_breakpoints` - Check responsive behavior
- `trace_component_state` - Trace state flow
- `analyze_render_triggers` - Find render causes
- `analyze_layout_hierarchy` - Analyze layout structure
- `diagnose_overflow` - Debug overflow issues
- `get_accessibility_tree` - Get a11y tree
- `get_sizing_strategy` - Analyze sizing approach
- `analyze_event_flow` - Trace event propagation
- `analyze_tailwind_conflicts` - Find Tailwind class conflicts

**Configuration**:
```json
"frontend-engine": {
  "command": "node",
  "args": ["${CLAUDE_PLUGIN_ROOT}/tools/implementations/frontend-engine/dist/index.cjs"],
  "env": {
    "PLUGIN_ROOT": "${CLAUDE_PLUGIN_ROOT}",
    "NODE_ENV": "production"
  }
}
```

### 4. analysis-engine
**Purpose**: Codebase analysis, pattern detection, and validation

**Tools Provided**:
- `detect_stack` - Detect tech stack from codebase
- `check_versions` - Check dependency versions
- `scan_patterns` - Scan for code patterns
- `read_config` - Parse configuration files
- `get_conventions` - Extract codebase conventions
- `find_dead_code` - Find unused code
- `identify_tech_debt` - Identify technical debt patterns
- `get_api_surface` - Extract API definitions
- `safe_delete_check` - Check if deletion is safe
- `detect_breaking_changes` - Find breaking changes
- `semantic_diff` - Semantic code comparison
- `validate_implementation` - Validate against spec
- `validate_edits_preview` - Preview edit impact
- `validate_api_contract` - Validate API contracts
- `env_audit` - Audit environment variables
- `scan_for_secrets` - Find hardcoded secrets
- `check_permissions` - Check file permissions
- `parse_error_stack` - Parse error stack traces
- `explain_type_error` - Explain TypeScript errors
- `find_circular_deps` - Find circular dependencies

**Configuration**:
```json
"analysis-engine": {
  "command": "node",
  "args": ["${CLAUDE_PLUGIN_ROOT}/tools/implementations/analysis-engine/dist/index.cjs"],
  "env": {
    "PLUGIN_ROOT": "${CLAUDE_PLUGIN_ROOT}",
    "NODE_ENV": "production"
  }
}
```

### 5. project-engine
**Purpose**: Project scaffolding, management, and operations

**Tools Provided**:
- `scaffold_project` - Create new project from template
- `list_templates` - List available templates
- `plugin_status` - Get plugin status
- `project_issues` - Analyze project issues
- `generate_openapi` - Generate OpenAPI spec
- `get_database_schema` - Get DB schema
- `get_api_routes` - List API routes
- `get_prisma_operations` - List Prisma operations
- `query_database` - Execute database queries
- `upgrade_package` - Upgrade dependencies
- `explain_codebase` - Generate codebase explanation
- `find_tests_for_file` - Find related tests
- `get_test_coverage` - Get coverage report
- `suggest_test_cases` - Suggest test cases
- `generate_types` - Generate TypeScript types
- `generate_fixture` - Generate test fixtures
- `sync_api_types` - Sync API types
- `resolve_merge_conflict` - Help resolve conflicts
- `analyze_bundle` - Analyze bundle size
- `analyze_dependencies` - Analyze dependencies
- `find_circular_deps` - Find circular dependencies

**Configuration**:
```json
"project-engine": {
  "command": "node",
  "args": ["${CLAUDE_PLUGIN_ROOT}/tools/implementations/project-engine/dist/index.cjs"],
  "env": {
    "PLUGIN_ROOT": "${CLAUDE_PLUGIN_ROOT}",
    "NODE_ENV": "production"
  }
}
```

## Common Patterns

### Node.js MCP Server

```json
"my-server": {
  "command": "node",
  "args": ["${CLAUDE_PLUGIN_ROOT}/servers/my-server/index.js"],
  "env": {
    "NODE_ENV": "production"
  }
}
```

### Python MCP Server (uvx)

```json
"python-server": {
  "command": "uvx",
  "args": ["my-mcp-package"]
}
```

### Python MCP Server (module)

```json
"python-server": {
  "command": "python",
  "args": ["-m", "my_mcp_server"],
  "env": {
    "PYTHONPATH": "${CLAUDE_PLUGIN_ROOT}/servers/python"
  }
}
```

### Custom Binary MCP Server

```json
"native-server": {
  "command": "${CLAUDE_PLUGIN_ROOT}/servers/native/server",
  "args": ["--port", "3000"],
  "env": {
    "CONFIG_PATH": "${CLAUDE_PLUGIN_ROOT}/servers/native/config.json"
  }
}
```

## Tool Namespacing

MCP tools are accessed using the format: `{server}/{tool}`

### Examples

With this configuration:
```json
{
  "mcpServers": {
    "precision-engine": { /* ... */ }
  }
}
```

Tools are accessed as:
- `precision-engine/precision_read`
- `precision-engine/precision_write`

## Troubleshooting

### Server Not Starting

1. **Check command exists**: Verify the command is in PATH or use absolute path
   ```bash
   which node
   which python
   ```

2. **Check args path**: Verify the script/module path is correct
   ```json
   "args": ["${CLAUDE_PLUGIN_ROOT}/tools/implementations/precision-engine/dist/index.cjs"]
   ```

3. **Check permissions**: Ensure scripts are executable
   ```bash
   chmod +x path/to/server.js
   ```

4. **Check logs**: Look for server startup errors in Claude Code logs

### Tools Not Available

1. **Verify server name**: Check server is in `.mcp.json`
2. **Check tool namespace**: Use format `{server}/{tool}`
3. **Restart Claude Code**: Changes to `.mcp.json` require restart
4. **Check server implementation**: Verify server actually provides the tool

### Environment Variable Issues

1. **Test substitution**: Check `${CLAUDE_PLUGIN_ROOT}` resolves correctly
2. **Escape special characters**: Use quotes for paths with spaces
3. **Platform differences**: Use forward slashes in paths (works on all platforms)

### Performance Issues

1. **Check server logs**: Look for slow operations
2. **Reduce concurrent servers**: Limit number of active servers
3. **Optimize server code**: Profile and optimize hot paths
4. **Use caching**: Implement caching in server when appropriate

## Best Practices

### Security

- Never hardcode credentials in `.mcp.json`
- Use environment variables for sensitive data
- Validate all inputs in server implementation
- Limit server permissions to minimum required

### Performance

- Keep servers lightweight and fast
- Implement caching for expensive operations
- Use streaming for large data transfers
- Batch operations when possible

### Reliability

- Implement proper error handling in servers
- Add health checks and monitoring
- Use timeouts for long-running operations
- Log errors and warnings appropriately

### Maintainability

- Use clear, descriptive server names
- Document tool parameters and return types
- Version server implementations
- Keep server dependencies minimal

## See Also

- [plugin.json Reference](./plugin-json.md) - Plugin configuration
- [SPEC-v2.md](../../../../SPEC-v2.md) - Complete specification
- [MCP Protocol Specification](https://modelcontextprotocol.io) - Official MCP docs
