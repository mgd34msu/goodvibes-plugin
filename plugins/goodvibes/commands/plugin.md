---
description: GoodVibes plugin management commands (update, status, config)
argument-hint: <subcommand> [options]
---

# GoodVibes Plugin

Manage the GoodVibes plugin installation and configuration.

## Usage

```
/goodvibes:plugin <subcommand>
```

## Subcommands

| Subcommand | Description |
|------------|-------------|
| `update` | Check for and install plugin updates |
| `status` | Show plugin health, registries, hooks, and version |

## Instructions

Parse the subcommand from $ARGUMENTS:

### `update`

1. Detect the operating system
2. Execute the appropriate update script from the plugin root:
   - **Windows**: Run `plugins/goodvibes/update/update.ps1` via PowerShell
   - **Linux/macOS**: Run `plugins/goodvibes/update/update.sh` via bash
3. Run the script verbosely so the user can see all output
4. After completion, inform the user:
   ```
   Update complete. Please restart your Claude Code session for changes to take effect.
   ```

**Windows execution:**
```bash
powershell -ExecutionPolicy Bypass -File "plugins/goodvibes/update/update.ps1"
```

**Linux/macOS execution:**
```bash
bash plugins/goodvibes/update/update.sh
```

### `status`

Call the `plugin_status` MCP tool and format the response:

```
GoodVibes Plugin Status
=======================
Version: {version}
Status: {status} (healthy/degraded/error)

Manifest: {exists ? "Found" : "Missing"} {valid ? "Valid" : "Invalid"}
MCP Server: {running ? "Running" : "Stopped"}

Registries:
  Agents: {count} registered
  Skills: {count} registered
  Tools: {count} registered

Hooks ({count} configured):
  {event}: {script} [{exists ? "OK" : "MISSING"}]
  ...

Issues:
  - {issue}
  ... (or "None" if empty)
```

### Unknown subcommand

If the subcommand is not recognized, show available subcommands:
```
Unknown subcommand: <subcommand>

Available subcommands:
  update  - Check for and install plugin updates
  status  - Show plugin status
```

## Arguments

$ARGUMENTS
