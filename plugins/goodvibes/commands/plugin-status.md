---
description: Show GoodVibes plugin status and statistics
---

# Plugin Status

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

Present a status report:

```
GoodVibes Plugin Status
=======================
Version: X.X.X
Status: Active

Resources:
  Agents: XX registered
  Skills: XX registered
  Tools: XX registered

MCP Server: [Installed/Not Installed]
Registries: [Up to date/Needs rebuild]
```

If registries appear empty but content exists, suggest running the registry builder.
