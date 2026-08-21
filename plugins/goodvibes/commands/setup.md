---
description: Re-run the goodvibes native dependency install in the foreground. The manual repair path when the automatic background install did not finish
allowed-tools:
  - Bash
  - Read
---

# GoodVibes setup (manual repair)

Native dependencies normally install automatically: the first session after a plugin install
(or after an update that changes a server's dependency list) spawns a detached background
installer, and the tools are ready by the next session. This command is the repair path for
when that did not work. It re-runs the same installer in the foreground so the output is
visible.

Per-server runtime-only dependencies (native binaries and WASM loaders that do not bundle
cleanly, listed in `${CLAUDE_PLUGIN_ROOT}/server/<name>/package.json`):

| Server | Runtime-only dependencies |
|--------|---------------------------|
| `intel` | `@ast-grep/napi`, `@vscode/ripgrep`, `sql.js`, `web-tree-sitter` |
| `analytics` | `sql.js` |
| `connect` | `sql.js` (database drivers resolve from the target project, not installed here) |

Installs land in the durable home `~/.claude/.goodvibes/deps/<server>/`, and each
`${CLAUDE_PLUGIN_ROOT}/server/<name>/node_modules` is a link to it, so installs survive
plugin updates (the SessionStart hook relinks after an update). Until an install lands, the
servers still boot and every non-native capability works; native-backed capabilities return an
honest pointer here instead of crashing.

## Instructions

1. Check the install state per server (a representative dependency probes each):
   ```bash
   for s in intel analytics connect; do
     case $s in
       intel) probe="@ast-grep/napi" ;;
       analytics) probe="sql.js" ;;
       connect) probe="sql.js" ;;
     esac
     test -d "${CLAUDE_PLUGIN_ROOT}/server/$s/node_modules/$probe" && echo "$s: INSTALLED" || echo "$s: NEEDS_INSTALL"
   done
   ```
   If every server reports `INSTALLED`, report that and stop.
2. Run the installer in the foreground (safe to run repeatedly: servers that are already
   installed are skipped, and a stale lock older than 10 minutes is ignored):
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/hooks/lib/deps-install.mjs" "${CLAUDE_PLUGIN_ROOT}"
   ```
3. Read `~/.claude/.goodvibes/deps/.last-result.json` and report the outcome. On success:
   ```
   Native dependencies installed for intel, analytics, and connect. goodvibes' structure-aware
   search/analysis, the analytics report, and registered service access are ready.
   ```
   On failure, name the failing servers and show the relevant tail of
   `~/.claude/.goodvibes/deps/install.log`.

`/goodvibes:plugin status` shows overall plugin health, including per-server install state.
