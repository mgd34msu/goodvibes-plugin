---
description: Show GoodVibes plugin status and statistics
---

# Plugin Status

## Usage

```
/goodvibes:plugin-status
```

Display the current status of the GoodVibes plugin including:
- Plugin version
- Number of agents, skills, and tools registered
- MCP server status
- Registry health

## Instructions

1. Read the plugin manifest from `.claude-plugin/plugin.json`
2. Read each registry file to count entries:
   - `agents/_registry.yaml`
   - `skills/_registry.yaml`
   - `tools/_registry.yaml`
3. Check if MCP server files exist in `tools/implementations/tool-search-server/`
4. Read `hooks/hooks.json` and extract the keys from the `hooks` object to list active hook events
5. For each hook event found, check if the corresponding script exists in `hooks/scripts/dist/`

Present a status report showing:
- Plugin version from manifest
- Count of agents, skills, tools from registries
- MCP server status
- Hooks: List each hook event key found in hooks.json
  - Mark with checkmark if the script file exists
  - Mark with X if the script is missing

Example format:
```
GoodVibes Plugin Status
=======================
Version: 1.0.0
Status: Active

Resources:
  Agents: 8 registered
  Skills: 150 registered
  Tools: 17 registered

MCP Server: Installed
Registries: Up to date

Hooks (from hooks/hooks.json):
  SessionStart: session-start.js [exists]
  PreToolUse: pre-tool-use.js [exists]
  ...
```

If registries appear empty but content exists, suggest running the registry builder.
