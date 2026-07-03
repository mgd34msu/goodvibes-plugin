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

## Subcommands

| Subcommand | Description |
|------------|-------------|
| `setup` | Install native dependencies (`@ast-grep/napi`, `@vscode/ripgrep`) — explicit consent, first run only. |
| `status` | Show plugin health: version, server bundle, hooks, native-dependency install state. |
| `install-prompts` | Opt in: install a compact pointer file (may write to `~/.claude/`). |
| `uninstall-prompts` | Cleanly remove everything `install-prompts` wrote. |

There is no `update` subcommand — updates flow through the marketplace install path, not a
plugin-managed script (v1's `update.sh`/`update.ps1` referenced a nonexistent `update.ps1` and
did not survive the carve-out).

## Instructions

Parse the subcommand from $ARGUMENTS.

### `setup` — Native Dependency Install

The committed intel server bundle (`${CLAUDE_PLUGIN_ROOT}/server/intel/index.cjs`) externalizes
three runtime-only dependencies listed in `${CLAUDE_PLUGIN_ROOT}/server/intel/package.json`:
`@ast-grep/napi`, `@vscode/ripgrep`, `sql.js`. There is no `postinstall` chain — installing them
requires this explicit command, which is the actual consent point (the Setup hook only points
here; it never installs anything itself).

1. Check whether they're already installed:
   ```bash
   test -d "${CLAUDE_PLUGIN_ROOT}/server/intel/node_modules/@ast-grep/napi" && test -d "${CLAUDE_PLUGIN_ROOT}/server/intel/node_modules/@vscode/ripgrep" && echo ALREADY_INSTALLED || echo NEEDS_INSTALL
   ```
   If `ALREADY_INSTALLED`, report that and stop.
2. If `NEEDS_INSTALL`, tell the user exactly what will happen — `npm install` will run inside
   `${CLAUDE_PLUGIN_ROOT}/server/intel/`, installing `@ast-grep/napi`, `@vscode/ripgrep`, and `sql.js`
   (native binaries + one WASM loader; no other package on the system is touched) — and confirm
   before proceeding.
3. On confirmation, run:
   ```bash
   npm install --omit=dev --no-audit --no-fund --prefix "${CLAUDE_PLUGIN_ROOT}/server/intel"
   ```
   (The analytics and connect servers under `${CLAUDE_PLUGIN_ROOT}/server/analytics` and
   `${CLAUDE_PLUGIN_ROOT}/server/connect` carry their own runtime-only `package.json`; install
   those the same way with the matching `--prefix` if their tools report a missing dependency.)
4. Report success or the exact error output. On success:
   ```
   Native dependencies installed. goodvibes' structure-aware search/analysis tools are ready.
   ```

### `status` — Plugin Health

Gather status directly from the filesystem — there is no `plugin_status` MCP tool (v1 referenced
one that never existed; it does not carry forward):

1. Read `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json` for the version.
2. Check `${CLAUDE_PLUGIN_ROOT}/server/intel/index.cjs`, `.../server/analytics/index.cjs`, and
   `.../server/connect/index.cjs` exist (the three server bundles present).
3. Check `${CLAUDE_PLUGIN_ROOT}/hooks/hooks.json` exists; list its registered event names.
4. Check native-dependency install state the same way `setup` does.
5. Check the current project's `.goodvibes/v2/.setup-marker.json` — has the Setup hook run here?
6. Check the current project's `.goodvibes/v2/` for `memory/`, `state/`, `cache/` presence.

Present as:
```
goodvibes Status
=======================
Version: {version}
Server bundle: {present ? "Found" : "MISSING"}
Hooks registered: {event list, or "MISSING hooks.json"}
Native dependencies: {installed ? "Installed" : "Not installed — run /goodvibes:plugin setup"}
Project setup: {marker present ? "Ran on <date>" : "Not yet run for this project (runs on next `claude init`)"}
Project state: {.goodvibes/v2/ present ? "Present" : "None yet"}
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
