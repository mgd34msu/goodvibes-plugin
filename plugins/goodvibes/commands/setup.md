---
description: Install the goodvibes native dependencies (explicit consent, once) — installs land in a durable home and survive plugin updates
allowed-tools:
  - Bash
---

# GoodVibes Setup

Install the native dependencies for the three goodvibes servers (native binaries and WASM
loaders that do not bundle cleanly, listed per server in
`${CLAUDE_PLUGIN_ROOT}/server/<name>/package.json`):

| Server | Runtime-only dependencies |
|--------|---------------------------|
| `intel` | `@ast-grep/napi`, `@vscode/ripgrep`, `sql.js`, `web-tree-sitter` |
| `analytics` | `ink`, `react`, `react-devtools-core`, `yoga-wasm-web`, `sql.js` |
| `connect` | `sql.js` (database drivers resolve from the target project, not installed here) |

This command is the consent point: nothing is ever installed automatically — not by hooks, not
by a postinstall chain. It runs **once**: dependencies install into the durable home
`~/.claude/.goodvibes/deps/<server>/` and the plugin's server directories get symlinks to it.
A plugin update replaces the plugin copy (dropping the symlinks) but not the durable home —
the SessionStart hook silently relinks at the next session, so setup never needs re-running
unless an update actually changes a server's dependency list (the nudge will say so). Until
setup runs, native-backed capabilities return an honest "run /goodvibes:setup" message and
everything else keeps working; nothing crashes.

## Instructions

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

`/goodvibes:plugin status` shows overall plugin health, including per-server install state.
