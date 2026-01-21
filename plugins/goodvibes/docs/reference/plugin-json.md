# plugin.json Reference

Complete reference for the GoodVibes plugin configuration file.

## Location

`.claude-plugin/plugin.json`

## Purpose

The `plugin.json` file defines the metadata, capabilities, and entry points for the GoodVibes plugin. It tells Claude Code what features the plugin provides and where to find them.

## Full Schema

```json
{
  "name": "goodvibes",
  "version": "1.0.0",
  "description": "Comprehensive Claude Code plugin with agents, skills, tools, hooks, and MCP servers for full-stack development.",
  "author": {
    "name": "Mike Davis",
    "email": "mgd34msu@gmail.com"
  },
  "homepage": "https://goodvibes.sh",
  "repository": "https://github.com/mgd34msu/goodvibes.sh",
  "license": "MIT",
  "keywords": ["fullstack", "development", "mcp", "agents", "skills"],
  "commands": "./commands/",
  "agents": [
    "./agents/agent-factory.md",
    "./agents/skill-factory.md",
    "./agents/engineer.md",
    "./agents/reviewer.md",
    "./agents/tester.md",
    "./agents/architect.md",
    "./agents/deployer.md",
    "./agents/integrator.md"
  ],
  "skills": "./skills/",
  "hooks": "./hooks/hooks.json",
  "mcpServers": "./.mcp.json",
  "lspServers": "./.lsp.json"
}
```

## Field Reference

### Metadata Fields

#### `name`
- **Type**: `string`
- **Required**: Yes
- **Description**: Unique identifier for the plugin. Used for namespacing agents, skills, and commands.
- **Example**: `"goodvibes"`
- **Convention**: Lowercase, no spaces, URL-safe

#### `version`
- **Type**: `string`
- **Required**: Yes
- **Description**: Semantic version number following semver (major.minor.patch)
- **Example**: `"1.0.0"`

#### `description`
- **Type**: `string`
- **Required**: Yes
- **Description**: Brief description of the plugin's purpose and capabilities
- **Example**: `"Comprehensive Claude Code plugin with agents, skills, tools, hooks, and MCP servers for full-stack development."`

#### `author`
- **Type**: `object` or `string`
- **Required**: No
- **Description**: Plugin author information
- **Object Format**:
  ```json
  {
    "name": "Mike Davis",
    "email": "mgd34msu@gmail.com"
  }
  ```
- **String Format**: `"Mike Davis <mgd34msu@gmail.com>"`

#### `homepage`
- **Type**: `string` (URL)
- **Required**: No
- **Description**: URL to plugin homepage or documentation
- **Example**: `"https://goodvibes.sh"`

#### `repository`
- **Type**: `string` (URL)
- **Required**: No
- **Description**: URL to plugin source code repository
- **Example**: `"https://github.com/mgd34msu/goodvibes.sh"`

#### `license`
- **Type**: `string`
- **Required**: No
- **Description**: SPDX license identifier
- **Example**: `"MIT"`, `"Apache-2.0"`, `"GPL-3.0"`

#### `keywords`
- **Type**: `array<string>`
- **Required**: No
- **Description**: Keywords for plugin discovery and search
- **Example**: `["fullstack", "development", "mcp", "agents", "skills"]`

### Entry Point Fields

#### `agents`
- **Type**: `array<string>` or `string`
- **Required**: No
- **Description**: List of agent markdown files or directory containing agents
- **Array Format** (explicit list):
  ```json
  "agents": [
    "./agents/engineer.md",
    "./agents/reviewer.md",
    "./agents/tester.md"
  ]
  ```
- **String Format** (directory):
  ```json
  "agents": "./agents/"
  ```
- **Path Resolution**: Relative to `.claude-plugin/` directory
- **Agent Namespacing**: Agents are accessible as `{plugin-name}:{agent-name}` (e.g., `goodvibes:engineer`)

#### `skills`
- **Type**: `string`
- **Required**: No
- **Description**: Directory containing skill files
- **Example**: `"./skills/"`
- **Path Resolution**: Relative to `.claude-plugin/` directory
- **Directory Structure**: Skills organized in subdirectories (e.g., `skills/frontend/react.md`)
- **Skill Namespacing**: Skills are accessible as `{plugin-name}:{category}/{skill}` (e.g., `goodvibes:frontend/react`)

#### `commands`
- **Type**: `string`
- **Required**: No
- **Description**: Directory containing command files
- **Example**: `"./commands/"`
- **Path Resolution**: Relative to `.claude-plugin/` directory
- **File Format**: Each command is a separate markdown file
- **Command Namespacing**: Commands are accessible as `/{command-name}` (e.g., `/commit`)

#### `hooks`
- **Type**: `string`
- **Required**: No
- **Description**: Path to hooks configuration file
- **Example**: `"./hooks/hooks.json"`
- **Path Resolution**: Relative to `.claude-plugin/` directory
- **Referenced File**: See [hooks.json Reference](./hooks-json.md)

#### `mcpServers`
- **Type**: `string`
- **Required**: No
- **Description**: Path to MCP servers configuration file
- **Example**: `"./.mcp.json"`
- **Path Resolution**: Relative to `.claude-plugin/` directory
- **Referenced File**: See [.mcp.json Reference](./mcp-json.md)

#### `lspServers`
- **Type**: `string`
- **Required**: No
- **Description**: Path to LSP servers configuration file
- **Example**: `"./.lsp.json"`
- **Path Resolution**: Relative to `.claude-plugin/` directory
- **Note**: LSP server configuration follows the same format as `.mcp.json`

#### `outputStyles`
- **Type**: `string`
- **Required**: No
- **Description**: Directory containing output style definitions
- **Example**: `"./output-styles/"`
- **Path Resolution**: Relative to `.claude-plugin/` directory
- **Referenced Files**: See [Mode Configuration Reference](./mode-config.md)

### SPEC-v2 Capabilities Field (Future)

The SPEC-v2 specification defines a `capabilities` object for explicit feature declaration:

```json
{
  "capabilities": {
    "agents": true,
    "skills": true,
    "tools": true,
    "hooks": true,
    "output_styles": true,
    "commands": true,
    "templates": true
  },
  "entry_points": {
    "agents": "agents/",
    "skills": "skills/",
    "tools": "tools/",
    "hooks": "hooks/",
    "output_styles": "output-styles/",
    "commands": "commands/",
    "templates": "templates/"
  }
}
```

This format is part of the v2.0 specification and may be adopted in future plugin versions.

## Path Resolution Rules

All paths in `plugin.json` are resolved relative to the `.claude-plugin/` directory:

- **Absolute paths**: Not recommended, breaks portability
- **Relative paths**: Should start with `./` for clarity
- **Directory paths**: Should end with `/` for clarity (optional but recommended)

### Examples

```json
{
  "agents": "./agents/",              // Directory: All .md files in agents/
  "skills": "./skills/",              // Directory: Organized in subdirectories
  "hooks": "./hooks/hooks.json",      // File: Single configuration file
  "mcpServers": "./.mcp.json"         // File: Root of .claude-plugin/
}
```

## Validation

### Required Fields

Minimum valid `plugin.json`:

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "description": "My plugin description"
}
```

### Recommended Fields

Production-ready `plugin.json`:

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "description": "My plugin description",
  "author": {
    "name": "Your Name",
    "email": "you@example.com"
  },
  "license": "MIT",
  "repository": "https://github.com/username/my-plugin",
  "agents": "./agents/",
  "skills": "./skills/",
  "hooks": "./hooks/hooks.json",
  "mcpServers": "./.mcp.json"
}
```

## Common Patterns

### Single Agent Plugin

```json
{
  "name": "specialist",
  "version": "1.0.0",
  "description": "Specialized agent for a specific task",
  "agents": ["./agents/specialist.md"]
}
```

### Skill Library Plugin

```json
{
  "name": "awesome-skills",
  "version": "1.0.0",
  "description": "Collection of useful skills",
  "skills": "./skills/"
}
```

### Tool Plugin with MCP Servers

```json
{
  "name": "dev-tools",
  "version": "1.0.0",
  "description": "Development tools and utilities",
  "mcpServers": "./.mcp.json"
}
```

### Full-Featured Plugin

```json
{
  "name": "fullstack",
  "version": "1.0.0",
  "description": "Complete full-stack development plugin",
  "agents": "./agents/",
  "skills": "./skills/",
  "hooks": "./hooks/hooks.json",
  "mcpServers": "./.mcp.json",
  "commands": "./commands/",
  "outputStyles": "./output-styles/"
}
```

## Troubleshooting

### Plugin Not Loading

1. Check `plugin.json` is valid JSON (use a JSON validator)
2. Verify all paths exist and are relative to `.claude-plugin/`
3. Check file permissions (files must be readable)
4. Verify plugin name is unique and URL-safe

### Agents Not Found

1. Verify `agents` path points to correct directory or files
2. Check agent files are valid markdown with frontmatter
3. Ensure agent files have `.md` extension
4. Verify agent frontmatter includes required `name` field

### MCP Servers Not Starting

1. Check `.mcp.json` path is correct
2. Verify MCP server executables exist
3. Check MCP server configuration is valid
4. See [.mcp.json Reference](./mcp-json.md) for details

## See Also

- [.mcp.json Reference](./mcp-json.md) - MCP server configuration
- [hooks.json Reference](./hooks-json.md) - Hook configuration
- [Mode Configuration Reference](./mode-config.md) - Output style configuration
- [SPEC-v2.md](../../../../SPEC-v2.md) - Complete specification
