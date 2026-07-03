# Release Notes: v1.10.0

**Release Date:** 2026-03-29

A stabilization release focused on IPC resilience, MCP server crash prevention, WRFC config management, and cross-platform compatibility. 19 commits, 68 files changed, 4,329 insertions, 1,280 deletions.

---

## Highlights

### 1. MCP Server Crash Guards

Crash guards added to all 6 MCP servers (precision-engine, runtime-engine, project-engine, frontend-engine, registry-engine, analytics-engine) to prevent silent disconnections. Long sessions previously suffered from MCP servers silently dying, leaving tools unavailable without any error. Each server now wraps its handler dispatch in a crash guard that catches unhandled exceptions and keeps the server alive.

### 2. IPC Socket Self-Healing

The IPC transport layer received a major resilience overhaul:

- **Self-healing socket watcher** with automatic reconnection on disconnect
- **Socket symlinks replaced with pointer files** to fix Unix socket path length limits (108-char limit on `sun_path`)
- **Improved socket discoverability** with retry resilience for race conditions during daemon startup
- **IPC state cleanup pipeline** consolidating `isPidAlive` checks to properly clean up stale sockets from crashed processes

### 3. WRFC Config & Directive Improvements

- **WRFC config management** — new MCP-accessible config store for WRFC parameters (score threshold, max fix attempts) with session file pruning for stale sessions
- **IPC router WRFC directive handling** — directives now route through the IPC channel for daemon-mode operation
- **wrfcConfigStore seeded at bootstrap** with support for `min_review_score` alias alongside `score_threshold`
- **runtime_config persisted to disk** and seeded into CoreStateStore with WRFC values on startup, ensuring config survives daemon restarts
- **Directive priority enforcement** in output style configuration

### 4. Cross-Platform Compatibility

- **ast-grep lazy-loaded** — the `@ast-grep/napi` native binary is now lazy-loaded at first use rather than eagerly imported, preventing crashes on platforms without pre-built binaries
- **Cross-platform ast-grep binaries** bundled for broader platform support
- **ensureArray hardening** — `ensureArray` now properly coerces single-object args to arrays and handles the MCP serialization edge case where JSON objects arrive unwrapped

---

## Features

- feat: add IPC router WRFC directive handling
- feat: add WRFC config management and session file pruning
- feat: add IPC socket self-healing and update dependencies
- feat: add self-healing IPC socket watcher with auto-reconnect
- feat: add IPC state cleanup pipeline and consolidate isPidAlive utility

---

## Bug Fixes

- fix: add crash guards to all 6 MCP servers to prevent silent disconnections
- fix: persist runtime_config to disk and seed CoreStateStore with WRFC values on startup
- fix: seed wrfcConfigStore at bootstrap and support min_review_score alias
- fix: replace socket symlinks with pointer files to fix path length limit
- fix: improve IPC socket discoverability and retry resilience
- fix: use ensureArray in extractPathsAffected to prevent .map crash on string args
- fix: coerce single-object args to array in ensureArray
- fix: lazy-load ast-grep napi to support platforms without native binaries

---

## Stats

| Metric | Value |
|--------|-------|
| Commits | 19 |
| Files changed | 68 |
| Insertions | +4,329 |
| Deletions | -1,280 |
| Features | 5 |
| Bug fixes | 8 |

---

## Changes Since v1.9.0

- v1.9.1–v1.9.3: Cross-platform ast-grep, ensureArray/parseJsonField fixes for MCP serialization
- v1.9.4–v1.9.6: IPC socket self-healing, state cleanup pipeline, socket watcher with auto-reconnect
- v1.9.7–v1.9.8: WRFC config management, IPC directive routing, socket pointer files
- v1.9.9: Crash guards on all MCP servers, runtime_config persistence, directive priority enforcement

---

## Upgrade Instructions

```bash
/goodvibes:plugin update
```

Then restart your Claude Code session. If running a daemon, restart it to pick up the new IPC pointer file format.

---

## Breaking Changes

- **IPC socket discovery** — Socket symlinks replaced with pointer files. Existing daemon sockets will not be discovered after upgrade. Restart the daemon after updating.
