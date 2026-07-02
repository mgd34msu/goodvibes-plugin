---
description: GoodVibes plugin management commands (update, status, config, prompt install)
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
| `install-prompts` | Opt in: install the GoodVibes prompt chain (may write to `~/.claude/`) |
| `uninstall-prompts` | Cleanly remove everything `install-prompts` wrote |

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

Additionally, report the prompt-chain installation state:

```bash
node "${CLAUDE_PLUGIN_ROOT}/hooks/scripts/dist/prompt-installer.js" status
```

### `install-prompts`

Installing the prompt chain is an EXPLICIT OPT-IN: it writes files outside the
current project when a global target directory is available. Session start
never performs this installation — it only detects and reports the state.

**Target directory** (first match wins):
1. `~/.claude/` — if it exists, is writable, and the project is not inside it
2. The highest ancestor directory of the project containing a `CLAUDE.md`
3. The project root itself

**Exactly what gets written to the target directory:**
- `CLAUDE.md` — a `<!-- GOODVIBES IMPORTS -->` marker plus the import line
  `@.goodvibes/GOODVIBES.md` is appended (the file is created if it does not
  exist; existing content is never modified or removed)
- `.goodvibes/GOODVIBES.md` — import hub referencing the prompt files below
- `.goodvibes/prompt/UPGRADE-NOTIFICATIONS.md`
- `.goodvibes/prompt/PRIMARY-GOALS.md`
- `.goodvibes/prompt/CORE-PRINCIPLES.md`
- `.goodvibes/prompt/SUBAGENT-PROTOCOL.md`
- `.goodvibes/prompt/PRECISION-MASTERY.md`
- `.goodvibes/prompt/GATHER-PLAN-APPLY.md`
- `.goodvibes/prompt/SKILLS.md`

Prompt file contents come from the plugin's `templates/prompt/` directory
(minimal built-in fallbacks are used if the templates are unreadable).

**Steps:**
1. Show the user the target directory resolution and the exact file list above
   and confirm they want to proceed
2. Execute:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/hooks/scripts/dist/prompt-installer.js" install
   ```
3. Report the JSON result (`targetDir`, `installed`)

### `uninstall-prompts`

Performs a clean removal of everything `install-prompts` (or a legacy
session-start installation) wrote:

- Drops the `<!-- GOODVIBES IMPORTS -->` block and its
  `@.goodvibes/GOODVIBES.md` import line from `CLAUDE.md` in the install
  directory; the `CLAUDE.md` file itself is deleted only when nothing else
  remains in it
- Deletes `.goodvibes/GOODVIBES.md`
- Deletes the installed `.goodvibes/prompt/*.md` files listed under
  `install-prompts`
- Removes the `.goodvibes/prompt/` and `.goodvibes/` directories only if they
  are left empty
- Never touches files the installer did not write

**Steps:**
1. Execute:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/hooks/scripts/dist/prompt-installer.js" uninstall
   ```
2. Report the JSON result (`removed`, `targetDir`, `importRemoved`, `removedFiles`)

### Unknown subcommand

If the subcommand is not recognized, show available subcommands:
```
Unknown subcommand: <subcommand>

Available subcommands:
  update             - Check for and install plugin updates
  status             - Show plugin status
  install-prompts    - Opt in: install the GoodVibes prompt chain
  uninstall-prompts  - Cleanly remove the installed prompt chain
```

## Arguments

$ARGUMENTS
