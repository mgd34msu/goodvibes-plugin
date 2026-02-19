# Configuration Reference Documentation

Complete reference documentation for all GoodVibes configuration files.

## Overview

GoodVibes uses multiple configuration files to define plugin metadata, server connections, lifecycle hooks, execution modes, and batch operation behavior. This directory contains comprehensive reference documentation for each configuration format.

## Configuration Files

### Core Configuration

#### [plugin.json Reference](./plugin-json.md)
**Location**: `.claude-plugin/plugin.json`

Defines plugin metadata, capabilities, and entry points.

**Key Topics**:
- Plugin metadata (name, version, description, author)
- Entry points (agents, skills, hooks, commands)
- Path resolution rules
- Validation and troubleshooting

**When to Use**: When creating or modifying plugin structure.

#### [.mcp.json Reference](./mcp-json.md)
**Location**: `.claude-plugin/.mcp.json`

Configures Model Context Protocol servers that provide tools.

**Key Topics**:
- MCP server configuration (command, args, env)
- Variable substitution (`${CLAUDE_PLUGIN_ROOT}`)
- GoodVibes MCP servers (5 specialized engines)
- Tool namespacing and access
- Common patterns and troubleshooting

**When to Use**: When adding or configuring MCP servers.

#### [hooks.json Reference](./hooks-json.md)
**Location**: `.claude-plugin/hooks/hooks.json`

Defines lifecycle hooks that run at specific execution points.

**Key Topics**:
- Hook events (SessionStart, SubagentStart, PreToolUse, etc.)
- Hook matchers and patterns
- Hook handlers (command, timeout)
- Environment variables in hook scripts
- Example implementations

**When to Use**: When implementing lifecycle hooks or event handlers.

### Execution Configuration

#### [Batch Configuration Reference](./batch-config.md)
**Scope**: Batch operation configuration (inline with batch definitions)

Controls transaction behavior, execution modes, validation, recovery, and output.

**Key Topics**:
- Transaction modes (atomic, partial, none)
- Execution strategies (parallel, sequential, adaptive)
- Retry and backoff strategies
- Preview and dry-run options
- Validation before/after operations
- Recovery and checkpointing
- Output verbosity levels

**When to Use**: When defining batch operations or workflows.

#### [Mode Configuration Reference](./mode-config.md)
**Location**: `.claude-plugin/output-styles/*.md`

Defines execution modes that control communication, autonomy, and output.

**Key Topics**:
- vibecoding mode (communicative, interactive)
- justvibes mode (silent, fully autonomous)
- Communication settings
- Execution and recovery behavior
- Output and logging configuration
- Creating custom modes

**When to Use**: When selecting or creating output styles/modes.

## Quick Reference

### File Locations

```
.claude-plugin/
├── plugin.json              # Plugin metadata and entry points
├── .mcp.json                # MCP server configuration
├── hooks/
│   └── hooks.json           # Lifecycle hook configuration
└── output-styles/
    ├── vibecoding.md        # Communicative mode
    └── justvibes.md         # Silent mode
```

### Configuration Hierarchy

```
plugin.json
  ├── defines → agents, skills, hooks, commands
  ├── references → .mcp.json (MCP servers)
  ├── references → hooks.json (lifecycle hooks)
  └── references → output-styles/ (execution modes)

.mcp.json
  └── defines → MCP servers that provide tools

hooks.json
  └── defines → hooks that run at lifecycle events

output-styles/*.md
  └── defines → modes that control behavior

batch operations
  └── inline config → transaction, execution, validation, recovery, output
```

### Common Tasks

#### Adding a New Agent

1. Create agent markdown file: `agents/my-agent.md`
2. Update `plugin.json`:
   ```json
   "agents": [
     "./agents/my-agent.md"
   ]
   ```
3. Reference: [plugin.json Reference](./plugin-json.md)

#### Adding an MCP Server

1. Implement MCP server (Node.js, Python, etc.)
2. Update `.mcp.json`:
   ```json
   "my-server": {
     "command": "node",
     "args": ["${CLAUDE_PLUGIN_ROOT}/servers/my-server/index.js"]
   }
   ```
3. Reference: [.mcp.json Reference](./mcp-json.md)

#### Adding a Lifecycle Hook

1. Implement hook script: `hooks/scripts/src/my-hook.ts`
2. Build: `npm run build` (in hooks/scripts/)
3. Update `hooks.json`:
   ```json
   "MyEvent": [
     {
       "matcher": "*",
       "hooks": [
         {
           "type": "command",
           "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/scripts/dist/my-hook.js\""
         }
       ]
     }
   ]
   ```
4. Reference: [hooks.json Reference](./hooks-json.md)

#### Creating a Custom Mode

1. Create mode file: `output-styles/my-mode.md`
2. Define frontmatter and configuration:
   ```yaml
   ---
   name: my-mode
   description: Custom execution mode
   ---

   # My Mode

   ## Mode Configuration

   ```yaml
   communication:
     show_progress: true
     # ... other settings
   ```
   ```
3. Reference: [Mode Configuration Reference](./mode-config.md)

#### Configuring a Batch Operation

1. Define batch with inline config:
   ```yaml
   operations:
     read: [...]
     write: [...]

   config:
     transaction:
       mode: atomic
     execution:
       mode: parallel
     validation:
       after: [typecheck, test]
   ```
2. Reference: [Batch Configuration Reference](./batch-config.md)

## Configuration Examples

### Minimal Plugin

```json
// plugin.json
{
  "name": "minimal-plugin",
  "version": "1.0.0",
  "description": "Minimal plugin example"
}
```

### Plugin with Everything

```json
// plugin.json
{
  "name": "fullstack-plugin",
  "version": "2.0.0",
  "description": "Full-featured plugin",
  "author": {
    "name": "Your Name",
    "email": "you@example.com"
  },
  "license": "MIT",
  "agents": "./agents/",
  "skills": "./skills/",
  "hooks": "./hooks/hooks.json",
  "mcpServers": "./.mcp.json",
  "commands": "./commands/",
  "outputStyles": "./output-styles/"
}
```

### Safe Batch Operation

```yaml
# For critical refactoring
config:
  transaction:
    mode: atomic
    isolation: strict
  execution:
    mode: parallel
    retry:
      attempts: 3
      backoff: exponential
  validation:
    after:
      - typecheck
      - test
    on_fail: rollback
  recovery:
    checkpoint: true
    rollback_on_fail: true
output:
  mode: standard
```

### Fast Batch Operation

```yaml
# For bulk updates
config:
  transaction:
    mode: partial
  execution:
    mode: parallel
    max_workers: 8
    fail_fast: false
output:
  mode: minimal
```

## Validation

### plugin.json Validation

```bash
# Check valid JSON
cat .claude-plugin/plugin.json | jq .

# Verify paths exist
ls .claude-plugin/agents/
ls .claude-plugin/skills/
```

### .mcp.json Validation

```bash
# Check valid JSON
cat .claude-plugin/.mcp.json | jq .

# Test server manually
node .claude-plugin/tools/implementations/precision-engine/dist/index.cjs
```

### hooks.json Validation

```bash
# Check valid JSON
cat .claude-plugin/hooks/hooks.json | jq .

# Test hook script
node .claude-plugin/hooks/scripts/dist/session-start.js
```

## Troubleshooting

### Configuration Not Loading

1. **Check JSON syntax**: Use `jq` or JSON validator
2. **Verify paths**: Ensure all referenced files exist
3. **Check permissions**: Files must be readable
4. **Restart Claude Code**: Configuration loaded at startup

### MCP Server Not Starting

1. **Check command exists**: `which node`, `which python`
2. **Test script directly**: Run command manually
3. **Check logs**: Look for startup errors
4. **Verify environment**: Check `${CLAUDE_PLUGIN_ROOT}` resolves

### Hooks Not Firing

1. **Check event name**: Must match exactly
2. **Verify matcher**: Pattern must match event
3. **Test script**: Run hook script manually
4. **Check timeout**: May need to increase

### Mode Not Working

1. **Check file exists**: Verify `.md` file in `output-styles/`
2. **Verify frontmatter**: Must be valid YAML
3. **Check syntax**: Review configuration block
4. **Restart**: Mode changes require restart

## Best Practices

### Organization

- Keep configuration files in version control
- Document custom configurations
- Use consistent naming conventions
- Group related configurations

### Security

- Never commit credentials
- Use environment variables for secrets
- Validate all inputs in hooks and servers
- Set appropriate file permissions

### Performance

- Use minimal output modes when possible
- Optimize hook scripts for speed
- Use appropriate parallelism settings
- Cache expensive operations

### Maintainability

- Comment complex configurations
- Use descriptive names
- Follow established patterns
- Keep configurations DRY

## Additional Resources

### External Documentation

- [Claude Code Plugin System](https://docs.anthropic.com/claude-code/plugins)
- [MCP Protocol Specification](https://modelcontextprotocol.io)
- [JSON Schema](https://json-schema.org)

### Internal Documentation

- [SPEC-v2.md](../../../../SPEC-v2.md) - Complete GoodVibes specification
- [README.md](../../README.md) - Plugin overview
- [Plugin Features](../../plugin-features.md) - Feature documentation

### Examples

- [examples/](../../examples/) - Example configurations and workflows
- [templates/](../../templates/) - Project templates

## Contributing

When adding new configuration options:

1. Update relevant reference documentation
2. Add examples and use cases
3. Document defaults and edge cases
4. Update this README with new sections
5. Test thoroughly across platforms

## Version History

- **v1.0** (2024-01) - Initial reference documentation
  - plugin.json reference
  - .mcp.json reference
  - hooks.json reference
  - batch-config reference
  - mode-config reference

---

**Need Help?**

- Check [Troubleshooting](#troubleshooting) sections in each reference
- Review [examples/](../../examples/) for working configurations
- See [SPEC-v2.md](../../../../SPEC-v2.md) for complete specification
- Open an issue on GitHub for bugs or unclear documentation
