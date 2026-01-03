---
description: Show GoodVibes plugin status and statistics
---

# Plugin Status

## Usage

```
/goodvibes:plugin-status
```

## Instructions

Call the `plugin_status` MCP tool to get programmatic health check results.

Format the JSON response as a readable status report:

```
GoodVibes Plugin Status
=======================
Version: {version}
Status: {status} (healthy/degraded/error)

Manifest: {exists} {valid}
MCP Server: Running

Registries:
  Agents: {count} registered
  Skills: {count} registered
  Tools: {count} registered

Hooks ({count} configured):
  {event}: {script} [{exists ? "OK" : "MISSING"}]
  ...

Issues:
  - {issue}
  ...
```
