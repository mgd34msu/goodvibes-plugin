---
description: goodvibes plugin management. Native dependency repair, health status, and optional prompt-chain install
argument-hint: <setup|status|install-prompts|uninstall-prompts>
allowed-tools:
  - Bash
  - Read
---

# GoodVibes plugin

Manage the goodvibes plugin installation (intel / analytics / connect servers, hooks, and native dependencies).

## Usage

```
/goodvibes:plugin <subcommand>
```

(`/goodvibes:setup` is the direct shortcut for `/goodvibes:plugin setup`, same steps.)

## Subcommands

| Subcommand | Description |
|------------|-------------|
| `setup` | Re-run the native dependency install in the foreground. The repair path when the automatic background install did not finish. |
| `status` | Show plugin health: version, server bundle, hooks, native-dependency install state. |
| `install-prompts` | Opt in: install a compact pointer file (may write to `~/.claude/`). |
| `uninstall-prompts` | Cleanly remove everything `install-prompts` wrote. |

There is no `update` subcommand. Updates flow through the marketplace install path, not a
plugin-managed script (v1's `update.sh`/`update.ps1` referenced a nonexistent `update.ps1` and
did not survive the carve-out).

## Instructions

Parse the subcommand from $ARGUMENTS.

### `setup`: native dependency repair

Each of the three committed server bundles externalizes a few runtime-only dependencies (native
binaries and WASM loaders that do not bundle cleanly), listed in that server's own
`${CLAUDE_PLUGIN_ROOT}/server/<name>/package.json`:

| Server | Runtime-only dependencies |
|--------|---------------------------|
| `intel` | `@ast-grep/napi`, `@vscode/ripgrep`, `sql.js`, `web-tree-sitter` |
| `analytics` | `sql.js` |
| `connect` | `sql.js` (database drivers resolve from the target project, not installed here) |

Installation is automatic: the first session after a plugin install (or after an update that
changes a server's dependency list) spawns a detached background installer, which writes into
the durable home `~/.claude/.goodvibes/deps/<server>/` and links each
`${CLAUDE_PLUGIN_ROOT}/server/<name>/node_modules` to it. A plugin update replaces the plugin
copy but not the durable home; the SessionStart hook silently relinks at the next session.
Until an install lands, native-backed capabilities return an honest "run /goodvibes:setup"
message and everything else keeps working. Nothing crashes.

This subcommand is the repair path: it re-runs the same installer in the foreground with
visible output. Follow the steps in `/goodvibes:setup` (probe each server, run
`node "${CLAUDE_PLUGIN_ROOT}/hooks/lib/deps-install.mjs" "${CLAUDE_PLUGIN_ROOT}"`, then report
the outcome from `~/.claude/.goodvibes/deps/.last-result.json` and, on failure, the relevant
tail of `~/.claude/.goodvibes/deps/install.log`).

### `status`: plugin health

Gather status directly from the filesystem. There is no `plugin_status` MCP tool (v1 referenced
one that never existed; it does not carry forward):

1. Read `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json` for the version.
2. Check `${CLAUDE_PLUGIN_ROOT}/server/intel/index.cjs`, `.../server/analytics/index.cjs`, and
   `.../server/connect/index.cjs` exist (the three server bundles present).
3. Check `${CLAUDE_PLUGIN_ROOT}/hooks/hooks.json` exists; list its registered event names.
4. Check native-dependency install state per server the same way `setup` does (intel, analytics,
   connect each probed independently).
5. Check the current project's `.goodvibes/` for `memory/`, `state/`, `cache/` presence.

Present as:
```
goodvibes Status
=======================
Version: {version}
Server bundles: intel {Found|MISSING} | analytics {Found|MISSING} | connect {Found|MISSING}
Hooks registered: {event list, or "MISSING hooks.json"}
Native dependencies:
  intel:     {Installed | Not installed}
  analytics: {Installed | Not installed}
  connect:   {Installed | Not installed}
  {if any are "Not installed": "The background installer may still be running. Check
   ~/.claude/.goodvibes/deps/.last-result.json, or run /goodvibes:setup to repair."}
Project state: {.goodvibes/ present ? "Present" : "None yet"}
```

### `install-prompts`

Installing the pointer file is an EXPLICIT OPT-IN and much smaller than v1's chain: one compact
file (~1,500 tokens or less), not seven doctrine files. SessionStart never performs this
installation. It only detects and reports whether it's installed.

**Target directory** (first match wins, resolved by the script below): `~/.claude/` if it exists
and is writable and the project isn't inside it; otherwise the highest ancestor directory of the
project containing a `CLAUDE.md`; otherwise the project root itself.

**Exactly what gets written:**
- `CLAUDE.md` in the target directory: a `<!-- GOODVIBES IMPORTS -->` marker plus the import
  line `@.goodvibes/GOODVIBES.md` is appended (file created if missing; existing content is
  never modified or removed).
- `.goodvibes/GOODVIBES.md`: the compact tool-introduction card (~500 tokens). One
  when-to-reach-for-it line per tool, with the measured numbers. Content updates with
  plugin releases; the CLAUDE.md import line never changes.

**Steps:**
1. Show the user the target-directory resolution rule and the exact file list above; confirm.
2. Run:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/commands/lib/prompt-installer.mjs" install "$(pwd)"
   ```
3. Report the JSON result (`targetDir`, `installed`).

### `uninstall-prompts`

Removes exactly what `install-prompts` wrote and nothing else:
- Drops the `<!-- GOODVIBES IMPORTS -->` block and its import line from the target `CLAUDE.md`;
  the file itself is deleted only when nothing else remains in it.
- Deletes `.goodvibes/GOODVIBES.md`; removes the now-empty `.goodvibes/` directory if it is left
  empty (never removes it if other files are present; that directory is shared project state).

**Steps:**
1. Run:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/commands/lib/prompt-installer.mjs" uninstall "$(pwd)"
   ```
2. Report the JSON result (`removed`, `targetDir`, `importRemoved`, `removedFiles`).

### Unknown subcommand

```
Unknown subcommand: <subcommand>

Available subcommands:
  setup              - Re-run the native dependency install in the foreground (repair)
  status             - Show plugin status
  install-prompts    - Opt in: install the compact pointer file
  uninstall-prompts  - Cleanly remove the installed pointer file
```

## Arguments

$ARGUMENTS
