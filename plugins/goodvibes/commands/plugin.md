---
description: goodvibes plugin management — first-run native dependency setup (explicit consent), health status, and optional prompt-chain install
argument-hint: <setup|status|install-prompts|uninstall-prompts>
allowed-tools:
  - Bash
  - Read
---

# GoodVibes Plugin

Manage the goodvibes plugin installation (intel / analytics / connect servers, hooks, and native dependencies).

## Usage

```
/goodvibes:plugin <subcommand>
```

(`/goodvibes:setup` is the direct shortcut for `/goodvibes:plugin setup` — same steps, same
consent point.)

## Subcommands

| Subcommand | Description |
|------------|-------------|
| `setup` | Install each server's native dependencies (intel, analytics, connect) — explicit consent, first run only. |
| `status` | Show plugin health: version, server bundle, hooks, native-dependency install state. |
| `install-prompts` | Opt in: install a compact pointer file (may write to `~/.claude/`). |
| `uninstall-prompts` | Cleanly remove everything `install-prompts` wrote. |

There is no `update` subcommand — updates flow through the marketplace install path, not a
plugin-managed script (v1's `update.sh`/`update.ps1` referenced a nonexistent `update.ps1` and
did not survive the carve-out).

## Instructions

Parse the subcommand from $ARGUMENTS.

### `setup` — Native Dependency Install

Each of the three committed server bundles externalizes a few runtime-only dependencies (native
binaries and WASM loaders that do not bundle cleanly), listed in that server's own
`${CLAUDE_PLUGIN_ROOT}/server/<name>/package.json`:

| Server | Runtime-only dependencies |
|--------|---------------------------|
| `intel` | `@ast-grep/napi`, `@vscode/ripgrep`, `sql.js`, `web-tree-sitter` |
| `analytics` | `ink`, `react`, `react-devtools-core`, `yoga-wasm-web`, `sql.js` |
| `connect` | `sql.js` (database drivers resolve from the target project, not installed here) |

There is no `postinstall` chain — installing them requires this explicit command, which is the
actual consent point (the Setup hook only points here; it never installs anything itself).

Setup runs once: dependencies install into the durable home `~/.claude/.goodvibes/deps/<server>/`
and the plugin's server directories get symlinks. A plugin update replaces the plugin copy but
not the durable home; the SessionStart hook silently relinks at the next session, so setup only
needs re-running when an update changes a server's dependency list. Until setup runs,
native-backed capabilities return an honest "run /goodvibes:setup" message and everything else
keeps working — nothing crashes.

1. Check which servers still need their dependencies (a representative dependency probes each):
   ```bash
   for s in intel analytics connect; do
     case $s in
       intel) probe="@ast-grep/napi" ;;
       analytics) probe="ink" ;;
       connect) probe="sql.js" ;;
     esac
     test -d "${CLAUDE_PLUGIN_ROOT}/server/$s/node_modules/$probe" && echo "$s: INSTALLED" || echo "$s: NEEDS_INSTALL"
   done
   ```
   If every server reports `INSTALLED`, report that and stop.
2. If any server reports `NEEDS_INSTALL`, tell the user exactly what will happen — `npm install`
   runs inside `~/.claude/.goodvibes/deps/<server>/` for each server (intel, analytics, connect),
   installing only the dependencies in that server's `package.json` (native binaries + WASM
   loaders; no other package on the system is touched), and each
   `${CLAUDE_PLUGIN_ROOT}/server/<name>/node_modules` becomes a symlink to that durable
   install — and confirm before proceeding.
3. On confirmation, install into the durable home and symlink each server's `node_modules`
   to it (`npm install` is idempotent — an already-installed server is a fast no-op):
   ```bash
   for s in intel analytics connect; do
     dep_home="$HOME/.claude/.goodvibes/deps/$s"
     mkdir -p "$dep_home"
     cp "${CLAUDE_PLUGIN_ROOT}/server/$s/package.json" "$dep_home/package.json"
     npm install --omit=dev --no-audit --no-fund --prefix "$dep_home"
     rm -rf "${CLAUDE_PLUGIN_ROOT}/server/$s/node_modules"
     ln -sfn "$dep_home/node_modules" "${CLAUDE_PLUGIN_ROOT}/server/$s/node_modules"
   done
   ```
4. Report success or the exact error output per server. On success:
   ```
   Native dependencies installed for intel, analytics, and connect. goodvibes' structure-aware
   search/analysis, the analytics dashboard, and registered service access are ready.
   ```

### `status` — Plugin Health

Gather status directly from the filesystem — there is no `plugin_status` MCP tool (v1 referenced
one that never existed; it does not carry forward):

1. Read `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json` for the version.
2. Check `${CLAUDE_PLUGIN_ROOT}/server/intel/index.cjs`, `.../server/analytics/index.cjs`, and
   `.../server/connect/index.cjs` exist (the three server bundles present).
3. Check `${CLAUDE_PLUGIN_ROOT}/hooks/hooks.json` exists; list its registered event names.
4. Check native-dependency install state per server the same way `setup` does (intel, analytics,
   connect each probed independently).
5. Check the current project's `.goodvibes/.setup-marker.json` — has the Setup hook run here?
6. Check the current project's `.goodvibes/` for `memory/`, `state/`, `cache/` presence.

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
  {if any are "Not installed": "Run /goodvibes:setup to install the missing ones."}
Project setup: {marker present ? "Ran on <date>" : "Not yet run for this project"}
Project state: {.goodvibes/ present ? "Present" : "None yet"}
```

### `install-prompts`

Installing the pointer file is an EXPLICIT OPT-IN and much smaller than v1's chain: one compact
file (~1,500 tokens or less), not seven doctrine files. SessionStart never performs this
installation — it only detects and reports whether it's installed.

**Target directory** (first match wins, resolved by the script below): `~/.claude/` if it exists
and is writable and the project isn't inside it; otherwise the highest ancestor directory of the
project containing a `CLAUDE.md`; otherwise the project root itself.

**Exactly what gets written:**
- `CLAUDE.md` in the target directory — a `<!-- GOODVIBES IMPORTS -->` marker plus the import
  line `@.goodvibes/GOODVIBES.md` is appended (file created if missing; existing content is
  never modified or removed).
- `.goodvibes/GOODVIBES.md` — the compact pointer hub (points at the on-demand skills and
  agents; contains no doctrine itself).

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
  empty (never removes it if other files are present — that directory is shared project state).

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
  setup              - Install native dependencies (explicit consent)
  status             - Show plugin status
  install-prompts    - Opt in: install the compact pointer file
  uninstall-prompts  - Cleanly remove the installed pointer file
```

## Arguments

$ARGUMENTS
