# Temporary Fix: Telemetry / better-sqlite3

## Problem

`better-sqlite3` is a native C++ addon. When esbuild bundles it, the JS code is included but the compiled `.node` binary cannot be bundled. At runtime, the bundled code cannot locate the native binding, crashing `PrecisionRuntime.initialize()` and preventing the MCP server from starting.

Making it an esbuild `external` fixes local dev (node_modules present) but breaks marketplace installs (node_modules gitignored).

## Temporary Fix Applied

1. **build.mjs** — `better-sqlite3` kept as bundled (NOT external). The JS bundles fine; the native binding fails at runtime but is now caught.
2. **precision-runtime.ts** — `Telemetry.getInstance()` call wrapped in try/catch. On failure, a minimal stub is injected that generates precision_ids but does not persist call records to SQLite.

## Effect

- Server starts normally
- All precision tools work
- Telemetry calls (`precision_config action=telemetry`) return empty results
- precision_ids are generated but not persisted

## Permanent Fix Needed

Replace `better-sqlite3` with `sql.js` (pure WebAssembly SQLite). This bundles cleanly with esbuild — no native binaries, works in all environments.

### Files to change:
- `package.json` — swap `better-sqlite3` / `@types/better-sqlite3` for `sql.js`
- `build.mjs` — no changes needed (sql.js bundles fine)
- `src/state/telemetry.ts` — rewrite DB layer for sql.js async API
- `src/__tests__/state/telemetry.test.ts` — update mocks
- `src/state/precision-runtime.ts` — remove try/catch once sql.js is in place

### Other pending fixes (reverted with git checkout, need to be re-applied):
- `src/handlers/precision-agent.ts` — strip CLAUDECODE env var from child processes
- `src/__tests__/state/dossier.test.ts` — update stale test assertions (readFile call counts)
