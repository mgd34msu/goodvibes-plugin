# Project Engine — Atomic Decomposition (v2)

> Every function, variable, type, and constant across all 68 source files, analyzed by what it does, assigned to the correct architectural layer, renamed where appropriate.

## Reference Architecture

| Layer | Name | Purpose | Dependency Direction |
|-------|------|---------|---------------------|
| L0 | `shared/` | Config, logging, constants, generic utilities, reusable types | — (depends on nothing internal) |
| L1 | `core/` | Domain types, interfaces, single-concern domain functions | → shared only |
| L2 | `extensions/` | One dir per domain concern, multi-concern orchestration | → core, shared |
| L3 | `plugins/` | MCP thin dispatchers, external API surface | → extensions, core, shared |

Dependencies flow **downward only**. Never upward, never horizontal between sibling files (only through barrel exports).

**L1 vs L2 distinction:** L1 functions each do exactly one atomic thing (even if that involves I/O — e.g., scanning a directory for source files is one concern). L2 functions compose multiple L1 functions into business workflows (e.g., find dead code by scanning files, extracting exports, counting references, filtering results — that's multi-concern orchestration).

---

## Current File Inventory

```
project-engine/src/
├── index.ts                              (124 lines)  — ProjectEngineServer + main()
├── config.ts                             (50 lines)   — constants, path resolution
├── logging.ts                            (62 lines)   — logger, timer, error helpers
├── types.ts                              (13 lines)   — re-exports + ToolHandler type
├── utils.ts                              (121 lines)  — DUPLICATE of shared/utils + deprecated helpers
├── shared/
│   ├── constants.ts                      (20 lines)   — SOURCE_EXTENSIONS, SKIP_DIRECTORIES
│   ├── response.ts                       (205 lines)  — ToolResponse types + response factory functions
│   └── utils.ts                          (90 lines)   — fileExists, readJsonFile, safeExec, etc.
├── schemas/
│   ├── index.ts                          (52 lines)   — schema aggregator
│   ├── api.ts                            (124 lines)  — API tool schemas
│   ├── code-intelligence.ts              (162 lines)  — code intelligence tool schemas
│   ├── database.ts                       (77 lines)   — database tool schemas
│   ├── deps.ts                           (79 lines)   — dependency tool schemas
│   ├── runtime.ts                        (138 lines)  — runtime tool schemas
│   ├── security.ts                       (89 lines)   — security tool schemas
│   ├── standalone.ts                     (55 lines)   — standalone tool schemas
│   └── testing.ts                        (45 lines)   — testing tool schemas
├── handlers/
│   ├── index.ts                          (139 lines)  — handler registry + asHandler wrapper
│   ├── code-intelligence/
│   │   ├── index.ts                      (20 lines)   — barrel export
│   │   ├── shared/
│   │   │   ├── language-service.ts        (495 lines)  — TS LanguageServiceManager singleton
│   │   │   ├── lsp-utils.ts              (131 lines)  — path normalization, line previews
│   │   │   └── validation.ts             (129 lines)  — position/file validation
│   │   ├── dead-code.ts                  (466 lines)  — find dead/unused exports
│   │   ├── safe-delete.ts                (330 lines)  — safe delete analysis
│   │   ├── preview-edits.ts              (542 lines)  — virtual TS compilation for edit preview
│   │   ├── breaking-changes.ts           (565 lines)  — detect breaking API changes via git diff
│   │   ├── semantic-diff.ts              (621 lines)  — semantic diff with reference tracing
│   │   └── api-surface.ts               (638 lines)  — extract public API surface
│   ├── api/
│   │   ├── index.ts                      (15 lines)   — barrel export
│   │   ├── routes.ts                     (703 lines)  — detect API routes across frameworks
│   │   ├── spec.ts                       (843 lines)  — generate OpenAPI spec
│   │   ├── validate.ts                   (574 lines)  — validate API contracts
│   │   └── sync.ts                       (803 lines)  — sync API types frontend↔backend
│   ├── security/
│   │   ├── index.ts                      (13 lines)   — barrel export
│   │   ├── secrets.ts                    (742 lines)  — scan for hardcoded secrets
│   │   ├── permissions.ts                (708 lines)  — check file/resource permissions
│   │   └── env-audit.ts                  (650 lines)  — audit environment variable usage
│   ├── database/
│   │   ├── index.ts                      (13 lines)   — barrel export
│   │   ├── schema.ts                     (704 lines)  — extract DB schema (Prisma/Drizzle/SQL)
│   │   ├── prisma.ts                     (556 lines)  — analyze Prisma usage patterns
│   │   ├── query.ts                      (5 lines)    — re-export from query-database/
│   │   └── query-database/
│   │       ├── index.ts                  (96 lines)   — query executor orchestrator
│   │       ├── handler.ts                (164 lines)  — MCP handler wrapper
│   │       ├── types.ts                  (101 lines)  — query database types
│   │       ├── drivers.ts                (74 lines)   — driver detection/import
│   │       ├── errors.ts                 (78 lines)   — error classes
│   │       ├── formatters.ts             (70 lines)   — result formatting
│   │       ├── query-analysis.ts         (126 lines)  — SQL query safety analysis
│   │       ├── url-parser.ts             (103 lines)  — connection URL parsing
│   │       └── executors/
│   │           ├── index.ts              (26 lines)   — executor barrel
│   │           ├── mysql.ts              (44 lines)   — MySQL executor
│   │           ├── postgres.ts           (40 lines)   — PostgreSQL executor
│   │           └── sqlite.ts             (57 lines)   — SQLite executor
│   │   └── shared/
│   │       └── sqlite-connection.ts      (392 lines)  — SQLite connection pool
│   ├── deps/
│   │   ├── index.ts                      (13 lines)   — barrel export
│   │   ├── analyze.ts                    (380 lines)  — analyze package dependencies
│   │   ├── circular.ts                   (513 lines)  — find circular imports
│   │   └── upgrade.ts                    (619 lines)  — upgrade dependency analysis
│   ├── runtime/
│   │   ├── index.ts                      (13 lines)   — barrel export
│   │   ├── logs.ts                       (963 lines)  — log file analysis
│   │   ├── memory.ts                     (570 lines)  — memory leak detection
│   │   └── profile.ts                    (567 lines)  — function profiling
│   ├── standalone/
│   │   ├── index.ts                      (11 lines)   — barrel export
│   │   ├── bundle.ts                     (524 lines)  — bundle size analysis
│   │   └── scaffold.ts                   (221 lines)  — project scaffolding
│   └── test/
│       ├── index.ts                      (18 lines)   — barrel export
│       ├── coverage.ts                   (701 lines)  — test coverage parsing
│       └── find-tests.ts                (418 lines)  — find related test files
```

**Total: 68 files, ~15,200 lines**

---

## Atomic Element Inventory

Every exported and internal element, its current location, what it does, its target layer, and its new name (where renamed).

### `config.ts` — 8 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 1 | `SERVER_NAME` | const | config.ts:8 | Server identity string `'project-engine'` | **L0 shared/constants.ts** | — | Static identity constant, no domain logic |
| 2 | `SERVER_VERSION` | const | config.ts:9 | Version string `'2.0.0'` | **L0 shared/constants.ts** | — | Static identity constant |
| 3 | `getEsmDir()` | function (private) | config.ts:14-17 | Resolves current file's directory via `import.meta.url` | **L0 shared/utils.ts** | `resolveEsmDir()` | Verb-first naming; generic path utility |
| 4 | `getConfigDir()` | function | config.ts:19-25 | Resolves config directory handling CJS/ESM contexts | **L0 shared/utils.ts** | `resolveModuleDir()` | Resolves module directory, not "config" dir |
| 5 | `PLUGIN_ROOT` | const | config.ts:27 | Root directory of GoodVibes plugin, from env or relative path | **L0 shared/config.ts** | — | Environment-derived path constant |
| 6 | `PROJECT_ROOT` | const | config.ts:33 | Root directory of user's project, from env or `cwd()` | **L0 shared/config.ts** | — | Environment-derived path constant |
| 7 | `getPluginRoot()` | function | config.ts:40-42 | Dynamic PLUGIN_ROOT getter (re-reads env at call time) | **L0 shared/config.ts** | — | Dynamic config accessor |
| 8 | `getProjectRoot()` | function | config.ts:44-46 | Dynamic PROJECT_ROOT getter | **L0 shared/config.ts** | — | Dynamic config accessor |

### `logging.ts` — 8 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 9 | `LogLevel` | type | logging.ts:6 | Union type `'debug' \| 'info' \| 'warn' \| 'error' \| 'tool'` | **L0 shared/logger.ts** | — (change `'tool'` to `'request'`) | `'tool'` is engine-specific; `'request'` is reusable |
| 10 | `LogEntry` | interface | logging.ts:8-13 | Shape: `{ level, message, data?, timestamp }` | **L0 shared/logger.ts** | — | Co-locate with logger; only used internally |
| 11 | `formatLog(entry)` | function | logging.ts:15-21 | Formats LogEntry into `[timestamp] [LEVEL] message data` string | **L0 shared/logger.ts** | — | Pure formatting, no domain knowledge |
| 12 | `log(level, message, data)` | function (private) | logging.ts:23-31 | Creates LogEntry, formats it, writes to stderr | **L0 shared/logger.ts** | — | Core log function with stderr output (MCP requirement) |
| 13 | `logger` | object | logging.ts:33-39 | Facade: `{ debug, info, warn, error, tool }` | **L0 shared/logger.ts** | `.tool()` → `.request()` | Rename for cross-engine reuse |
| 14 | `startTimer()` | function | logging.ts:44-47 | Returns closure that computes elapsed ms via `performance.now()` | **L0 shared/utils.ts** | — | Generic perf utility, misplaced in logging |
| 15 | `logError(message, error)` | function | logging.ts:51-53 | Logs error with data={error} | **L0 shared/logger.ts** | — | Logging helper |
| 16 | `logWarn(message, data)` | function | logging.ts:57-59 | Logs warning with data | **L0 shared/logger.ts** | — | Logging helper |

### `types.ts` — 3 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 17 | `ToolResponse` | re-export | types.ts:1 | Re-exports from shared/response.ts | **DELETE** | — | Unnecessary indirection; consumers import shared/response directly |
| 18 | `ToolResponseContent` | re-export | types.ts:1 | Re-exports from shared/response.ts | **DELETE** | — | Same reasoning |
| 19 | `ToolHandler` | type | types.ts:9 | `(args: unknown) => Promise<ToolResponse>` — handler signature | **L3 plugins/dispatch.ts** | `ToolDispatcher` | Dispatch signature, not business logic |

### `utils.ts` — 7 elements (ENTIRE FILE IS DUPLICATE/DEPRECATED)

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 20 | `fileExists(filePath)` | function | utils.ts:17-24 | Async file existence check — **DUPLICATE** of shared/utils.ts | **DELETE** | — | Exact duplicate |
| 21 | `readJsonFile(filePath)` | function | utils.ts:29-38 | Reads and parses JSON file — **DUPLICATE** of shared/utils.ts | **DELETE** | — | Exact duplicate |
| 22 | `safeExec(command, options)` | function | utils.ts:43-58 | Async exec wrapper — **DUPLICATE** of shared/utils.ts | **DELETE** | — | Exact duplicate |
| 23 | `detectPackageManager(projectRoot)` | function | utils.ts:63-78 | Detects npm/yarn/pnpm — **DUPLICATE** of shared/utils.ts | **DELETE** | — | Exact duplicate |
| 24 | `fetchUrl(url, options)` | function | utils.ts:83-100 | HTTP fetch wrapper — **DUPLICATE** of shared/utils.ts | **DELETE** | — | Exact duplicate |
| 25 | `success(data)` | function | utils.ts:105-111 | Creates success ToolResponse — **DEPRECATED** | **DELETE** | — | Use shared/response.ts:createSuccessResponse |
| 26 | `error(message)` | function | utils.ts:116-121 | Creates error ToolResponse — **DEPRECATED** | **DELETE** | — | Use shared/response.ts:createErrorResponse |

### `shared/constants.ts` — 2 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 27 | `SOURCE_EXTENSIONS` | const (array) | shared/constants.ts:4-8 | File extensions for source files: `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs` | **L0 shared/constants.ts** | — | Generic constant, no domain logic |
| 28 | `SKIP_DIRECTORIES` | const (array) | shared/constants.ts:13-19 | Directories to skip: `node_modules`, `.git`, `dist`, etc. | **L0 shared/constants.ts** | — | Generic constant |

### `shared/response.ts` — 9 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 29 | `ToolResponseContent` | interface | shared/response.ts:6-11 | MCP response content: `{ type, text?, data?, mimeType? }` | **L0 shared/types.ts** | `McpContent` | Shorter, clearly MCP protocol |
| 30 | `ToolResponse` | interface | shared/response.ts:16-19 | MCP response: `{ content: McpContent[], isError? }` | **L0 shared/types.ts** | `McpResponse` | Pairs with McpContent |
| 31 | `createSuccessResponse(data)` | function | shared/response.ts:24-35 | Creates successful McpResponse with JSON data | **L0 shared/response.ts** | `ok()` | Shorter, idiomatic |
| 32 | `createTextResponse(text)` | function | shared/response.ts:40-50 | Creates McpResponse with text content | **L0 shared/response.ts** | `text()` | Shorter |
| 33 | `createErrorResponse(message)` | function | shared/response.ts:55-65 | Creates error McpResponse with isError flag | **L0 shared/response.ts** | `fail()` | Pairs with ok() |
| 34 | `createErrorFromException(error, context)` | function | shared/response.ts:70-90 | Wraps caught exceptions into McpResponse | **L0 shared/response.ts** | `failFromException()` | Consistent with fail() |
| 35 | `createNotFoundResponse(resource)` | function | shared/response.ts:95-105 | Creates 404-style McpResponse | **L0 shared/response.ts** | `notFound()` | Shorter |
| 36 | `createMissingArgumentResponse(argName)` | function | shared/response.ts:110-120 | Creates missing-arg McpResponse | **L0 shared/response.ts** | `missingArg()` | Shorter |
| 37 | `createInvalidArgumentResponse(argName, reason)` | function | shared/response.ts:125-135 | Creates invalid-arg McpResponse | **L0 shared/response.ts** | `invalidArg()` | Shorter |

### `shared/utils.ts` — 5 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 38 | `fileExists(filePath)` | function | shared/utils.ts:10-17 | Async file existence check via `fsPromises.access()` | **L0 shared/utils.ts** | — | Generic filesystem utility |
| 39 | `readJsonFile(filePath)` | function | shared/utils.ts:22-31 | Reads and parses JSON file async | **L0 shared/utils.ts** | — | Generic filesystem utility |
| 40 | `safeExec(command, options)` | function | shared/utils.ts:36-55 | Async exec with timeout, returns `{ stdout, stderr, exitCode }` | **L0 shared/utils.ts** | — | Generic process utility |
| 41 | `detectPackageManager(projectRoot)` | function | shared/utils.ts:60-75 | Detects npm/yarn/pnpm from lock files | **L0 shared/utils.ts** | — | Generic project utility |
| 42 | `fetchUrl(url, options)` | function | shared/utils.ts:80-90 | HTTP fetch wrapper with timeout | **L0 shared/utils.ts** | — | Generic network utility |

### `handlers/index.ts` — 5 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 43 | `asHandler(fn)` | function | handlers/index.ts:12-30 | Wraps domain functions with error handling + arg extraction | **L3 plugins/dispatch.ts** | `wrapDispatcher()` | Clarifies it wraps for dispatch |
| 44 | `handlerRegistry` | const (Map) | handlers/index.ts:32-100 | Maps 26 tool names to handler functions | **L3 plugins/dispatch.ts** | `DISPATCH_TABLE` | It's a routing table |
| 45 | `getHandler(name)` | function | handlers/index.ts:105-110 | Looks up handler in registry | **L3 plugins/dispatch.ts** | `getDispatcher()` | Matches ToolDispatcher naming |
| 46 | `hasHandler(name)` | function | handlers/index.ts:115-120 | Checks if handler exists | **L3 plugins/dispatch.ts** | `hasDispatcher()` | Consistent |
| 47 | `listHandlers()` | function | handlers/index.ts:125-130 | Returns all registered tool names | **L3 plugins/dispatch.ts** | `listTools()` | Lists tool names, not handlers |

### `index.ts` — 10 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 48 | `ProjectEngineServer` | class | index.ts:20-110 | MCP server: wires request handlers, manages lifecycle | **L3 plugins/server.ts** | — | Name is correct |
| 49 | `.server` | field | index.ts:21 | MCP Server instance | Part of server (L3) | — | |
| 50 | `constructor()` | method | index.ts:23-30 | Creates server, wires handlers | Part of server (L3) | — | |
| 51 | `setupHandlers()` | method | index.ts:32-70 | Registers ListTools + CallTool MCP handlers | Part of server (L3) | `setupRoutes()` | "Routes" better describes MCP request routing |
| 52 | `setupErrorHandling()` | method | index.ts:72-90 | server.onerror, SIGINT/SIGTERM | Part of server (L3) | `setupLifecycle()` | Handles errors + signals |
| 53 | `start()` | method | index.ts:92-105 | init + transport + connect | Part of server (L3) | — | |
| 54 | `stop()` | method | index.ts:107-110 | server.close() | Part of server (L3) | — | |
| 55 | `main()` | function | index.ts:115-124 | Entry point | **L3 plugins/server.ts** | `bootstrap()` | Matches convention |
| 56 | `allSchemas` | import | index.ts:5 | Imports all tool schemas | Part of server (L3) | `TOOL_SCHEMAS` | Consistent naming |
| 57 | `handlerRegistry` | import | index.ts:6 | Imports dispatch table | Part of server (L3) | `DISPATCH_TABLE` | Consistent naming |

### `schemas/index.ts` — 1 element

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 58 | `allSchemas` | const (array) | schemas/index.ts:1-52 | Aggregates schema arrays from 8 domain modules | **L3 plugins/schemas.ts** | `TOOL_SCHEMAS` | Consistent naming |

### `schemas/api.ts` — 1 element

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 59 | `apiSchemas` | const (array) | schemas/api.ts:1-124 | 4 MCP tool schemas for API domain | **L3 plugins/schemas.ts** | — | Merge into single schemas file |

### `schemas/code-intelligence.ts` — 1 element

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 60 | `codeIntelligenceSchemas` | const | schemas/code-intelligence.ts:1-162 | 6 MCP tool schemas for code intelligence domain | **L3 plugins/schemas.ts** | — | Merge into single schemas file |

### `schemas/database.ts` — 1 element

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 61 | `databaseSchemas` | const | schemas/database.ts:1-77 | 3 MCP tool schemas for database domain | **L3 plugins/schemas.ts** | — | Merge |

### `schemas/deps.ts` — 1 element

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 62 | `depsSchemas` | const | schemas/deps.ts:1-79 | 3 MCP tool schemas for dependency domain | **L3 plugins/schemas.ts** | — | Merge |

### `schemas/runtime.ts` — 1 element

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 63 | `runtimeSchemas` | const | schemas/runtime.ts:1-138 | 3 MCP tool schemas for runtime domain | **L3 plugins/schemas.ts** | — | Merge |

### `schemas/security.ts` — 1 element

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 64 | `securitySchemas` | const | schemas/security.ts:1-89 | 3 MCP tool schemas for security domain | **L3 plugins/schemas.ts** | — | Merge |

### `schemas/standalone.ts` — 1 element

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 65 | `standaloneSchemas` | const | schemas/standalone.ts:1-55 | 2 MCP tool schemas for standalone domain | **L3 plugins/schemas.ts** | — | Merge |

### `schemas/testing.ts` — 1 element

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 66 | `testingSchemas` | const | schemas/testing.ts:1-45 | 2 MCP tool schemas for testing domain | **L3 plugins/schemas.ts** | — | Merge |

### Domain Barrel Exports — 8 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 67 | `code-intelligence/index.ts` | barrel | handlers/code-intelligence/index.ts | Re-exports 6 handlers | **DELETE** | — | L3 dispatch table replaces barrel |
| 68 | `api/index.ts` | barrel | handlers/api/index.ts | Re-exports 4 handlers | **DELETE** | — | L3 dispatch table replaces barrel |
| 69 | `security/index.ts` | barrel | handlers/security/index.ts | Re-exports 3 handlers | **DELETE** | — | Same |
| 70 | `database/index.ts` | barrel | handlers/database/index.ts | Re-exports 3 handlers | **DELETE** | — | Same |
| 71 | `database/query.ts` | barrel | handlers/database/query.ts | Re-exports from query-database/ | **DELETE** | — | Same |
| 72 | `deps/index.ts` | barrel | handlers/deps/index.ts | Re-exports 3 handlers | **DELETE** | — | Same |
| 73 | `runtime/index.ts` | barrel | handlers/runtime/index.ts | Re-exports 3 handlers | **DELETE** | — | Same |
| 74 | `standalone/index.ts` | barrel | handlers/standalone/index.ts | Re-exports 2 handlers | **DELETE** | — | Same |
| 75 | `test/index.ts` | barrel | handlers/test/index.ts | Re-exports 2 handlers | **DELETE** | — | Same |

### `code-intelligence/shared/language-service.ts` — 15 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 76 | `LanguageServiceResult` | interface | language-service.ts:8-12 | Shape: `{ service, program, sourceFile }` | **L1 core/code-intel/types.ts** | — | Domain type |
| 77 | `LanguageServiceManager` | interface | language-service.ts:14-22 | Contract: `getServiceForFile`, `getPositionOffset`, `getLineAndColumn`, `cleanup`, `shutdown` | **L1 core/code-intel/types.ts** | — | Domain contract |
| 78 | `CachedService` | interface | language-service.ts:24-30 | Shape: `{ service, host, files, lastAccessed, projectRoot }` | **L1 core/code-intel/types.ts** | — | Internal cache type |
| 79 | `getCacheTTL()` | function | language-service.ts:32-35 | Returns cache TTL from env or default (5min) | **L1 core/code-intel/language-service.ts** | — | Config for language service |
| 80 | `CACHE_TTL_MS` | const | language-service.ts:36 | Default cache TTL (5 * 60 * 1000) | **L1 core/code-intel/language-service.ts** | — | Constant |
| 81 | `DEFAULT_COMPILER_OPTIONS` | const | language-service.ts:38-55 | TypeScript compiler options for analysis | **L1 core/code-intel/constants.ts** | `TS_ANALYSIS_OPTIONS` | Shared by language-service AND preview-edits — single source needed |
| 82 | `LanguageServiceManagerImpl` | class | language-service.ts:57-475 | **Monolithic (418 lines)**. Singleton managing TS language services with caching, tsconfig discovery, file loading | **DECOMPOSE** → see below | — | |
| 83 | `.getServiceForFile(filePath)` | method | language-service.ts:70-120 | Finds/creates TS language service for a file's project | Part of class | — | |
| 84 | `.getPositionOffset(sourceFile, line, column)` | method | language-service.ts:125-140 | Converts line:column to byte offset | **L1 core/code-intel/position.ts** | `toOffset()` | Pure function, extract from class |
| 85 | `.getLineAndColumn(sourceFile, position)` | method | language-service.ts:145-160 | Converts byte offset to line:column | **L1 core/code-intel/position.ts** | `toLineColumn()` | Pure function, extract from class |
| 86 | `.cleanup()` | method | language-service.ts:165-190 | Evicts expired cached services | Part of class | — | |
| 87 | `.shutdown()` | method | language-service.ts:195-210 | Disposes all services, clears cache | Part of class | — | |
| 88 | `.normalizePath(p)` | method (private) | language-service.ts:215-220 | Normalizes file path separators | Extract to **L0 shared/utils.ts** | `normalizePath()` | Generic utility duplicated in lsp-utils.ts and prisma.ts |
| 89 | `.findTsConfig(dir)` | method (private) | language-service.ts:225-260 | Walks up directories to find tsconfig.json — **BLOCKING fs.existsSync** | **L1 core/code-intel/tsconfig.ts** | `findTsConfig()` | Single-concern; shared with preview-edits |
| 90 | `.readTsConfig(configPath)` | method (private) | language-service.ts:265-300 | Reads + parses tsconfig.json with extends resolution | **L1 core/code-intel/tsconfig.ts** | `readTsConfig()` | Single-concern; shared with preview-edits |

### `code-intelligence/shared/lsp-utils.ts` — 7 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 91 | `createSuccessResponse` | re-export | lsp-utils.ts:1 | Re-exports from shared/response.ts | **DELETE** | — | Unnecessary indirection |
| 92 | `createErrorResponse` | re-export | lsp-utils.ts:1 | Re-exports from shared/response.ts | **DELETE** | — | Same |
| 93 | `createErrorFromException` | re-export | lsp-utils.ts:1 | Re-exports from shared/response.ts | **DELETE** | — | Same |
| 94 | `normalizeFilePath(filePath)` | function | lsp-utils.ts:15-25 | Resolves and normalizes file path — **DUPLICATE** of prisma.ts | **L0 shared/utils.ts** | `normalizePath()` | Generic utility; deduplicate |
| 95 | `makeRelativePath(filePath, basePath)` | function | lsp-utils.ts:30-40 | Makes path relative to base — **DUPLICATE** of prisma.ts | **L0 shared/utils.ts** | `toRelativePath()` | Generic utility; deduplicate |
| 96 | `resolveFilePath(filePath)` | function | lsp-utils.ts:45-55 | Resolves file path against PROJECT_ROOT | **L0 shared/utils.ts** | `resolveProjectPath()` | Generic project utility |
| 97 | `MAX_PREVIEW_LENGTH` | const | lsp-utils.ts:60 | Max chars for line preview (200) | **L1 core/code-intel/constants.ts** | — | Domain constant |
| 98 | `getLinePreview(sourceFile, line)` | function | lsp-utils.ts:65-85 | Gets trimmed source line text | **L1 core/code-intel/preview.ts** | — | Domain utility |
| 99 | `getPreviewFromSourceFile(sourceFile, position)` | function | lsp-utils.ts:90-131 | Gets preview text at position in source file | **L1 core/code-intel/preview.ts** | — | Domain utility |

### `code-intelligence/shared/validation.ts` — 5 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 100 | `PositionArgs` | interface | validation.ts:8-14 | Shape: `{ file, line?, column?, symbol? }` | **L1 core/code-intel/types.ts** | — | Domain type |
| 101 | `ValidationResult` | type | validation.ts:16-20 | `{ valid: true, ... }` or `{ valid: false, error: McpResponse }` | **L1 core/code-intel/types.ts** | — | Domain type |
| 102 | `validatePositionArgs(args)` | function | validation.ts:25-60 | Validates file/line/column args — **BLOCKING fs.existsSync** | **L1 core/code-intel/validation.ts** | — | Single-concern validation; fix to async |
| 103 | `validateFilePath(filePath)` | function | validation.ts:65-90 | Validates file exists and is readable — **BLOCKING fs.existsSync** | **L1 core/code-intel/validation.ts** | — | Single-concern; fix to async |
| 104 | `isValidLine(line, sourceFile)` | function | validation.ts:95-105 | Checks line number is in range | **L1 core/code-intel/validation.ts** | — | Pure function |
| 105 | `isValidColumn(column, line, sourceFile)` | function | validation.ts:110-129 | Checks column is in range for line | **L1 core/code-intel/validation.ts** | — | Pure function |

### `code-intelligence/dead-code.ts` — 10 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 106 | `FindDeadCodeArgs` | interface | dead-code.ts:10-15 | Tool input: `{ directory, include_tests?, threshold? }` | **L1 core/code-intel/types.ts** | — | Domain type |
| 107 | `DeadExport` | interface | dead-code.ts:17-24 | Shape: `{ name, file, line, kind, references }` | **L1 core/code-intel/types.ts** | — | Domain type |
| 108 | `ExportInfo` | interface | dead-code.ts:26-32 | Shape: `{ name, line, kind, node }` | **L1 core/code-intel/types.ts** | — | Domain type |
| 109 | `TEST_PATTERNS` | const | dead-code.ts:34-40 | Regex patterns for test files | **L1 core/code-intel/constants.ts** | — | Domain constant |
| 110 | `SOURCE_EXTENSIONS` | const | dead-code.ts:42-48 | **DUPLICATE** of shared/constants.ts | **DELETE** | — | Use shared/constants.ts |
| 111 | `isTestFile(filePath)` | function | dead-code.ts:50-55 | Checks if path matches test patterns | **L1 core/code-intel/file-utils.ts** | — | Single-concern |
| 112 | `isSourceFile(filePath)` | function | dead-code.ts:57-62 | Checks if extension is in SOURCE_EXTENSIONS — **DUPLICATE** across 4+ files | **L1 core/code-intel/file-utils.ts** | — | Deduplicate; single source |
| 113 | `findSourceFiles(directory)` | function | dead-code.ts:64-95 | Recursively finds source files — **DUPLICATE** across 3+ files, **BLOCKING** fs.readdirSync | **L1 core/code-intel/file-utils.ts** | — | Deduplicate; fix to async |
| 114 | `getExportKind(node)` | function | dead-code.ts:100-120 | Determines export type (function/class/type/etc) from TS AST — **DUPLICATE** of api-surface.ts | **L1 core/code-intel/ast-utils.ts** | — | Deduplicate |
| 115 | `findExportsInFile(sourceFile)` | function | dead-code.ts:125-200 | Extracts all exports from a TS source file | **L1 core/code-intel/exports.ts** | — | Single-concern |
| 116 | `countReferences(symbol, program)` | function | dead-code.ts:205-250 | Counts references to a symbol across program | **L1 core/code-intel/references.ts** | — | Single-concern |
| 117 | `handleFindDeadCode(args)` | function | dead-code.ts:255-466 | **Monolithic (210 lines)**. Orchestrates: scan files → extract exports → count refs → filter → format | **L2 extensions/code-intel/dead-code.ts** | `findDeadCode()` | Drop `handle`; multi-concern orchestration |

### `code-intelligence/safe-delete.ts` — 5 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 118 | `SafeDeleteCheckArgs` | interface | safe-delete.ts:8-14 | Tool input: `{ file, symbol, line? }` | **L1 core/code-intel/types.ts** | — | Domain type |
| 119 | `ReferenceLocation` | interface | safe-delete.ts:16-22 | Shape: `{ file, line, column, preview }` | **L1 core/code-intel/types.ts** | — | Domain type |
| 120 | `SafeDeleteCheckResult` | interface | safe-delete.ts:24-30 | Shape: `{ safe, references, dependents }` | **L1 core/code-intel/types.ts** | — | Domain type |
| 121 | `isSameLine(ref, decl)` | function | safe-delete.ts:35-40 | Checks if reference is on same line as declaration | **L1 core/code-intel/references.ts** | — | Pure comparison |
| 122 | `isInSameDeclaration(ref, decl)` | function | safe-delete.ts:45-55 | Checks if reference is within declaration scope | **L1 core/code-intel/references.ts** | — | Pure comparison |
| 123 | `handleSafeDeleteCheck(args)` | function | safe-delete.ts:60-330 | **Monolithic (270 lines)**. Find symbol → find refs → filter self-refs → analyze safety → format | **L2 extensions/code-intel/safe-delete.ts** | `checkSafeDelete()` | Drop `handle`; multi-concern |

### `code-intelligence/preview-edits.ts` — 12 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 124 | `ProposedEdit` | interface | preview-edits.ts:8-14 | Shape: `{ file, find, replace }` | **L1 core/code-intel/types.ts** | — | Domain type |
| 125 | `ValidateEditsPreviewArgs` | interface | preview-edits.ts:16-22 | Tool input: `{ edits: ProposedEdit[] }` | **L1 core/code-intel/types.ts** | — | Domain type |
| 126 | `VirtualFileSystem` | class | preview-edits.ts:30-90 | In-memory FS overlay for virtual TS compilation | **L1 core/code-intel/virtual-fs.ts** | — | Single-concern: virtual filesystem |
| 127 | `applyEdit(content, edit)` | function | preview-edits.ts:95-115 | Applies find/replace to file content string | **L1 core/code-intel/virtual-fs.ts** | — | Pure function |
| 128 | `findTsConfig(dir)` | function | preview-edits.ts:120-150 | **DUPLICATE** of language-service.ts:findTsConfig | **DELETE** | — | Use core/code-intel/tsconfig.ts |
| 129 | `DEFAULT_COMPILER_OPTIONS` | const | preview-edits.ts:155-170 | **DUPLICATE** of language-service.ts | **DELETE** | — | Use core/code-intel/constants.ts:TS_ANALYSIS_OPTIONS |
| 130 | `readTsConfig(configPath)` | function | preview-edits.ts:175-210 | **DUPLICATE** of language-service.ts:readTsConfig | **DELETE** | — | Use core/code-intel/tsconfig.ts |
| 131 | `createVirtualLanguageService(files, options)` | function | preview-edits.ts:215-280 | Creates TS language service from virtual files | **L1 core/code-intel/virtual-fs.ts** | — | Single-concern |
| 132 | `getDiagnosticsForFiles(service, files)` | function | preview-edits.ts:285-320 | Gets TS diagnostics for file set | **L1 core/code-intel/diagnostics.ts** | — | Single-concern |
| 133 | `diagnosticToError(diag, causedBy?)` | function | preview-edits.ts:325-350 | Converts TS diagnostic to error shape | **L1 core/code-intel/diagnostics.ts** | — | Pure function |
| 134 | `diagnosticKey(diag)` | function | preview-edits.ts:355-365 | Creates dedup key for diagnostics | **L1 core/code-intel/diagnostics.ts** | — | Pure function |
| 135 | `handleValidateEditsPreview(args)` | function | preview-edits.ts:370-542 | **Monolithic (170 lines)**. Apply edits virtually → compile → diff diagnostics → format | **L2 extensions/code-intel/preview-edits.ts** | `validateEditsPreview()` | Drop `handle`; multi-concern |

### `code-intelligence/breaking-changes.ts` — 8 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 136 | `DetectBreakingChangesArgs` | interface | breaking-changes.ts:8-14 | Tool input: `{ base_ref?, head_ref?, paths? }` | **L1 core/code-intel/types.ts** | — | Domain type |
| 137 | `BreakingChange` | interface | breaking-changes.ts:16-25 | Shape: `{ file, symbol, kind, before, after, severity }` | **L1 core/code-intel/types.ts** | — | Domain type |
| 138 | `getChangedFiles(baseRef, headRef, paths)` | function | breaking-changes.ts:40-80 | Gets changed files between git refs via `git diff` | **L1 core/git/diff.ts** | — | Single-concern git operation; shared with semantic-diff |
| 139 | `getFileAtRef(filePath, ref)` | function | breaking-changes.ts:85-110 | Gets file content at git ref via `git show` | **L1 core/git/diff.ts** | — | Single-concern git operation |
| 140 | `extractTypeInfo(sourceFile)` | function | breaking-changes.ts:115-180 | Extracts type information from TS AST | **L1 core/code-intel/type-extraction.ts** | — | Single-concern |
| 141 | `extractTypeInfoFromContent(content, fileName)` | function | breaking-changes.ts:185-210 | Creates virtual source file and extracts types | **L1 core/code-intel/type-extraction.ts** | — | Convenience wrapper |
| 142 | `analyzeWithLLM(changes)` | function | breaking-changes.ts:215-280 | Spawns Claude CLI for AI-assisted analysis — **SIMILAR** to semantic-diff | **L1 core/ai/analyze.ts** | `analyzeChangesWithLLM()` | Deduplicate; shared AI analysis |
| 143 | `handleDetectBreakingChanges(args)` | function | breaking-changes.ts:285-565 | **Monolithic (280 lines)**. Get diffs → extract types → compare → AI analysis → format | **L2 extensions/code-intel/breaking-changes.ts** | `detectBreakingChanges()` | Drop `handle`; multi-concern |

### `code-intelligence/semantic-diff.ts` — 7 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 144 | `SemanticDiffArgs` | interface | semantic-diff.ts:8-14 | Tool input: `{ base_ref?, head_ref?, paths?, include_references? }` | **L1 core/code-intel/types.ts** | — | Domain type |
| 145 | `SemanticChange` | interface | semantic-diff.ts:16-28 | Shape: `{ file, symbol, changeType, before, after, references }` | **L1 core/code-intel/types.ts** | — | Domain type |
| 146 | `getChangedFilesWithContent(baseRef, headRef, paths)` | function | semantic-diff.ts:40-100 | Gets changed files with before/after content — **SIMILAR** to breaking-changes:getChangedFiles | **L1 core/git/diff.ts** | `getChangedFilesDetailed()` | Extends getChangedFiles with content |
| 147 | `findReferencingFiles(symbol, program)` | function | semantic-diff.ts:105-150 | Finds files referencing a symbol | **L1 core/code-intel/references.ts** | — | Single-concern |
| 148 | `extractExportedSymbols(sourceFile)` | function | semantic-diff.ts:155-210 | Extracts exported symbol names and types | **L1 core/code-intel/exports.ts** | — | Single-concern; share with dead-code |
| 149 | `analyzeWithLLM(changes)` | function | semantic-diff.ts:215-280 | Spawns Claude CLI for AI analysis — **DUPLICATE** of breaking-changes | **DELETE** | — | Use core/ai/analyze.ts:analyzeChangesWithLLM |
| 150 | `handleSemanticDiff(args)` | function | semantic-diff.ts:285-621 | **Monolithic (336 lines)**. Get diffs → extract symbols → find refs → AI analysis → format | **L2 extensions/code-intel/semantic-diff.ts** | `semanticDiff()` | Drop `handle`; multi-concern |

### `code-intelligence/api-surface.ts` — 11 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 151 | `GetApiSurfaceArgs` | interface | api-surface.ts:8-14 | Tool input: `{ directory?, entry_points?, include_internal? }` | **L1 core/code-intel/types.ts** | `ApiSurfaceArgs` | Drop redundant `Get` prefix |
| 152 | `PublicApiExport` | interface | api-surface.ts:16-26 | Shape: `{ name, file, line, kind, type, jsdoc }` | **L1 core/code-intel/types.ts** | — | Domain type |
| 153 | `ENTRY_POINT_NAMES` | const | api-surface.ts:30-35 | Default entry point file names | **L1 core/code-intel/constants.ts** | — | Domain constant |
| 154 | `SOURCE_EXTENSIONS` | const | api-surface.ts:37-43 | **DUPLICATE** of shared/constants.ts | **DELETE** | — | Use shared/constants.ts |
| 155 | `isSourceFile(filePath)` | function | api-surface.ts:45-50 | **DUPLICATE** of dead-code.ts | **DELETE** | — | Use core/code-intel/file-utils.ts |
| 156 | `findSourceFiles(directory)` | function | api-surface.ts:52-85 | **DUPLICATE** of dead-code.ts | **DELETE** | — | Use core/code-intel/file-utils.ts |
| 157 | `detectEntryPoints(directory)` | function | api-surface.ts:90-120 | Finds package entry points | **L1 core/code-intel/entry-points.ts** | — | Single-concern |
| 158 | `getExportKind(node)` | function | api-surface.ts:125-145 | **DUPLICATE** of dead-code.ts | **DELETE** | — | Use core/code-intel/ast-utils.ts |
| 159 | `getJsDoc(node)` | function | api-surface.ts:150-170 | Extracts JSDoc comment from TS AST node | **L1 core/code-intel/ast-utils.ts** | — | Single-concern |
| 160 | `getTypeString(node, checker)` | function | api-surface.ts:175-195 | Gets type string for AST node | **L1 core/code-intel/ast-utils.ts** | — | Single-concern |
| 161 | `collectPublicExports(files, checker)` | function | api-surface.ts:200-350 | Collects public API exports with type info | **L1 core/code-intel/exports.ts** | — | Single-concern (works on public exports only) |
| 162 | `collectAllExports(files, checker)` | function | api-surface.ts:355-450 | Collects all exports including internal | **L1 core/code-intel/exports.ts** | — | Single-concern |
| 163 | `handleGetApiSurface(args)` | function | api-surface.ts:455-638 | **Monolithic (183 lines)**. Find entry points → create program → collect exports → format | **L2 extensions/code-intel/api-surface.ts** | `getApiSurface()` | Drop `handle`; multi-concern |

### `api/routes.ts` — 14 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 164 | `GetApiRoutesArgs` | interface | routes.ts:8-14 | Tool input: `{ directory?, framework? }` | **L1 core/api/types.ts** | `ApiRoutesArgs` | Drop redundant `Get` prefix |
| 165 | `ApiRoute` | interface | routes.ts:16-26 | Shape: `{ method, path, file, line, handler?, middleware? }` | **L1 core/api/types.ts** | — | Domain type |
| 166 | `ApiRoutesResult` | interface | routes.ts:28-34 | Shape: `{ framework, routes, count }` | **L1 core/api/types.ts** | — | Domain type |
| 167 | `detectFramework(directory)` | function | routes.ts:40-80 | Detects Next.js/Express/Fastify/Hono from package.json + file structure | **L1 core/api/detection.ts** | — | Single-concern |
| 168 | `parseNextJsRoutes(directory)` | function | routes.ts:85-120 | Delegates to app router or pages router parser | **L1 core/api/parsers/nextjs.ts** | — | Single-concern |
| 169 | `parseNextJsAppRouter(directory)` | function | routes.ts:125-180 | Parses Next.js App Router file-based routes | **L1 core/api/parsers/nextjs.ts** | — | Single-concern |
| 170 | `parseNextJsPagesRouter(directory)` | function | routes.ts:185-230 | Parses Next.js Pages Router routes | **L1 core/api/parsers/nextjs.ts** | — | Single-concern |
| 171 | `detectPagesRouterMethods(content)` | function | routes.ts:235-260 | Detects HTTP methods from page handler content | **L1 core/api/parsers/nextjs.ts** | — | Helper for pages router |
| 172 | `extractNextJsRoutePath(filePath)` | function | routes.ts:265-290 | Converts file path to route path for App Router | **L1 core/api/parsers/nextjs.ts** | — | Pure function |
| 173 | `extractNextJsPagesRoutePath(filePath)` | function | routes.ts:295-315 | Converts file path to route path for Pages Router | **L1 core/api/parsers/nextjs.ts** | — | Pure function |
| 174 | `parseExpressRoutes(directory)` | function | routes.ts:320-400 | Parses Express route definitions | **L1 core/api/parsers/express.ts** | — | Single-concern |
| 175 | `parseExpressFileRoutes(filePath)` | function | routes.ts:405-460 | Parses routes from single Express file | **L1 core/api/parsers/express.ts** | — | Single-concern |
| 176 | `extractExpressMiddleware(content)` | function | routes.ts:465-490 | Extracts middleware from Express route definitions | **L1 core/api/parsers/express.ts** | — | Pure function |
| 177 | `parseFastifyRoutes(directory)` | function | routes.ts:495-560 | Parses Fastify route definitions | **L1 core/api/parsers/fastify.ts** | — | Single-concern |
| 178 | `parseFastifyFileRoutes(filePath)` | function | routes.ts:565-620 | Parses routes from single Fastify file | **L1 core/api/parsers/fastify.ts** | — | Single-concern |
| 179 | `parseHonoRoutes(directory)` | function | routes.ts:625-670 | Parses Hono route definitions | **L1 core/api/parsers/hono.ts** | — | Single-concern |
| 180 | `parseHonoFileRoutes(filePath)` | function | routes.ts:675-700 | Parses routes from single Hono file | **L1 core/api/parsers/hono.ts** | — | Single-concern |
| 181 | `findFiles(directory, pattern)` | function | routes.ts:702-710 | Glob wrapper for finding files | **L0 shared/utils.ts** | `globFiles()` | Generic utility misplaced in domain handler |
| 182 | `getLineNumber(content, index)` | function | routes.ts:712-720 | Converts char offset to line number | **L0 shared/utils.ts** | `offsetToLine()` | Generic utility |
| 183 | `handleGetApiRoutes(args)` | function | routes.ts:40-703 | **Monolithic (660+ lines)**. Detect framework → delegate to parser → format | **L2 extensions/api/routes.ts** | `getApiRoutes()` | Drop `handle`; multi-concern |

### `api/spec.ts` — 17 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 184 | `GenerateOpenApiArgs` | interface | spec.ts:8-14 | Tool input: `{ directory?, title?, version?, format? }` | **L1 core/api/types.ts** | `OpenApiArgs` | Shorter |
| 185 | `readPackageJson(directory)` | function | spec.ts:20-40 | Reads package.json for project metadata | **L0 shared/utils.ts** | — | Already exists as readJsonFile; inline |
| 186 | `convertRoutePathToOpenApi(path)` | function | spec.ts:45-65 | Converts `/users/:id` to `/users/{id}` | **L1 core/api/openapi.ts** | — | Pure function |
| 187 | `extractPathParameters(path)` | function | spec.ts:70-85 | Extracts `{id}` params from OpenAPI path | **L1 core/api/openapi.ts** | — | Pure function |
| 188 | `generateOperationId(method, path)` | function | spec.ts:90-105 | Creates `getUsers`, `postUser` style IDs | **L1 core/api/openapi.ts** | — | Pure function |
| 189 | `extractTag(path)` | function | spec.ts:110-120 | Extracts API tag from first path segment | **L1 core/api/openapi.ts** | — | Pure function |
| 190 | `typeToJsonSchema(type)` | function | spec.ts:125-160 | Converts TS type string to JSON Schema | **L1 core/api/openapi.ts** | — | Pure function |
| 191 | `generateExample(schema)` | function | spec.ts:165-200 | Generates example value from JSON Schema | **L1 core/api/openapi.ts** | — | Pure function |
| 192 | `createDefaultRequestSchema(method)` | function | spec.ts:205-230 | Default request body schema per HTTP method | **L1 core/api/openapi.ts** | — | Pure function |
| 193 | `createDefaultResponseSchema()` | function | spec.ts:235-250 | Default 200 response schema | **L1 core/api/openapi.ts** | — | Pure function |
| 194 | `parseHandlerTypes(filePath)` | function | spec.ts:255-320 | Extracts request/response types from handler source | **L1 core/api/type-extraction.ts** | — | Single-concern |
| 195 | `parseInterfaceToSchema(content, name)` | function | spec.ts:325-400 | Parses TS interface into JSON Schema | **L1 core/api/type-extraction.ts** | — | Single-concern |
| 196 | `toYaml(obj)` | function | spec.ts:405-420 | Converts object to YAML string | **L0 shared/utils.ts** | — | Generic utility |
| 197 | `setYamlConverter(fn)` | function | spec.ts:425-430 | Test hook to override YAML converter | **L0 shared/utils.ts** | — | Test utility |
| 198 | `resetYamlConverter()` | function | spec.ts:435-440 | Resets YAML converter to default | **L0 shared/utils.ts** | — | Test utility |
| 199 | `handleGenerateOpenApi(args)` | function | spec.ts:445-843 | **Monolithic (400 lines)**. Get routes → build OpenAPI spec → format YAML/JSON | **L2 extensions/api/spec.ts** | `generateOpenApi()` | Drop `handle`; multi-concern |

### `api/validate.ts` — 6 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 200 | `ValidateApiContractArgs` | interface | validate.ts:8-14 | Tool input: `{ base_url, spec_path?, routes? }` | **L1 core/api/types.ts** | `ApiContractArgs` | Shorter |
| 201 | `makeRequest(method, url, body?)` | function | validate.ts:20-60 | Makes HTTP request for contract testing | **L1 core/api/http.ts** | — | Single-concern |
| 202 | `validateSchema(data, schema)` | function | validate.ts:65-100 | Validates response against JSON Schema | **L1 core/api/validation.ts** | — | Single-concern |
| 203 | `resolvePathParams(path, params)` | function | validate.ts:105-120 | Replaces `{id}` with actual values | **L1 core/api/openapi.ts** | — | Pure function |
| 204 | `buildQueryString(params)` | function | validate.ts:125-140 | Builds URL query string | **L0 shared/utils.ts** | — | Generic utility |
| 205 | `handleValidateApiContract(args)` | function | validate.ts:145-574 | **Monolithic (430 lines)**. Load spec → make requests → validate responses → format | **L2 extensions/api/validate.ts** | `validateApiContract()` | Drop `handle`; multi-concern |

### `api/sync.ts` — 14 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 206 | `SyncApiTypesArgs` | interface | sync.ts:8-14 | Tool input: `{ backend_dir?, frontend_dir? }` | **L1 core/api/types.ts** | — | Domain type |
| 207 | `BackendRoute` | interface | sync.ts:16-26 | Shape: `{ method, path, requestType?, responseType? }` | **L1 core/api/types.ts** | — | Domain type |
| 208 | `FrontendCall` | interface | sync.ts:28-36 | Shape: `{ method, path, file, line }` | **L1 core/api/types.ts** | — | Domain type |
| 209 | `TypeDrift` | interface | sync.ts:38-48 | Shape: `{ endpoint, field, backendType, frontendType, severity }` | **L1 core/api/types.ts** | — | Domain type |
| 210 | `BACKEND_PATHS` | const | sync.ts:55-60 | Default backend source paths to scan | **L1 core/api/constants.ts** | — | Domain constant |
| 211 | `extractTypeText(content, typeName)` | function | sync.ts:65-100 | Extracts type definition text from source | **L1 core/api/type-extraction.ts** | — | Single-concern |
| 212 | `normalizeEndpoint(method, path)` | function | sync.ts:105-120 | Normalizes endpoint for comparison | **L1 core/api/matching.ts** | — | Pure function |
| 213 | `matchEndpoint(backend, frontend)` | function | sync.ts:125-150 | Matches backend route to frontend call | **L1 core/api/matching.ts** | — | Pure function |
| 214 | `compareTypes(backendType, frontendType)` | function | sync.ts:155-200 | Compares TS types for compatibility | **L1 core/api/type-extraction.ts** | — | Single-concern |
| 215 | `normalizeType(type)` | function | sync.ts:205-230 | Normalizes TS type string for comparison | **L1 core/api/type-extraction.ts** | — | Pure function |
| 216 | `generateFixSuggestion(drift)` | function | sync.ts:235-270 | Generates fix suggestion for type drift | **L1 core/api/matching.ts** | — | Pure function |
| 217 | `handleSyncApiTypes(args)` | function | sync.ts:275-803 | **Monolithic (530 lines)**. Scan backend → scan frontend → match → compare types → format | **L2 extensions/api/sync.ts** | `syncApiTypes()` | Drop `handle`; multi-concern |

### `security/secrets.ts` — 9 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 218 | `SecretSeverity` | type | secrets.ts:5-8 | `'critical' \| 'high' \| 'medium' \| 'low'` | **L1 core/security/types.ts** | — | Domain type |
| 219 | `ScanForSecretsArgs` | interface | secrets.ts:10-16 | Tool input: `{ directory?, severity?, max_depth? }` | **L1 core/security/types.ts** | — | Domain type |
| 220 | `SKIP_PATTERNS` | const | secrets.ts:20-30 | Directories/files to skip — **DUPLICATE** of permissions.ts | **L1 core/security/constants.ts** | `SECURITY_SKIP_PATTERNS` | Deduplicate; distinguish from shared/constants SKIP_DIRECTORIES |
| 221 | `SCANNABLE_EXTENSIONS` | const | secrets.ts:35-50 | File extensions to scan — **DUPLICATE** of permissions.ts | **L1 core/security/constants.ts** | — | Deduplicate |
| 222 | `redactSecret(value)` | function | secrets.ts:55-70 | Partially masks secret values for display | **L1 core/security/redaction.ts** | — | Single-concern |
| 223 | `shouldSkip(filePath)` | function | secrets.ts:75-90 | Checks if path should be skipped — **DUPLICATE** of permissions.ts | **L1 core/security/file-utils.ts** | — | Deduplicate |
| 224 | `isScannable(filePath)` | function | secrets.ts:95-105 | Checks if file extension is scannable — **DUPLICATE** of permissions.ts | **L1 core/security/file-utils.ts** | — | Deduplicate |
| 225 | `isLikelyPlaceholder(value)` | function | secrets.ts:110-130 | Detects placeholder values like `YOUR_KEY_HERE` | **L1 core/security/detection.ts** | — | Single-concern |
| 226 | `filterBySeverity(findings, minSeverity)` | function | secrets.ts:135-160 | Filters findings by minimum severity | **L1 core/security/detection.ts** | — | Pure function |
| 227 | `getDefaultMaxDepth()` | function | secrets.ts:165-170 | Returns default scan depth (10) | **L1 core/security/constants.ts** | — | Config constant |
| 228 | `handleScanForSecrets(args)` | function | secrets.ts:175-742 | **Monolithic (567 lines)**. Walk dirs → scan files → detect patterns → filter → format | **L2 extensions/security/secrets.ts** | `scanForSecrets()` | Drop `handle`; multi-concern |

### `security/permissions.ts` — 7 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 229 | `PermissionType` | type | permissions.ts:5-8 | Permission finding types | **L1 core/security/types.ts** | — | Domain type |
| 230 | `RiskLevel` | type | permissions.ts:10-12 | `'critical' \| 'high' \| 'medium' \| 'low'` | **L1 core/security/types.ts** | — | Domain type |
| 231 | `CheckPermissionsArgs` | interface | permissions.ts:14-20 | Tool input: `{ directory?, include_node_modules? }` | **L1 core/security/types.ts** | — | Domain type |
| 232 | `PermissionFinding` | interface | permissions.ts:22-32 | Shape: `{ file, type, risk, detail }` | **L1 core/security/types.ts** | — | Domain type |
| 233 | `SKIP_PATTERNS` | const | permissions.ts:36-46 | **DUPLICATE** of secrets.ts | **DELETE** | — | Use core/security/constants.ts |
| 234 | `SCANNABLE_EXTENSIONS` | const | permissions.ts:50-65 | **DUPLICATE** of secrets.ts | **DELETE** | — | Use core/security/constants.ts |
| 235 | `shouldSkip(filePath)` | function | permissions.ts:70-85 | **DUPLICATE** of secrets.ts | **DELETE** | — | Use core/security/file-utils.ts |
| 236 | `isScannable(filePath)` | function | permissions.ts:90-100 | **DUPLICATE** of secrets.ts | **DELETE** | — | Use core/security/file-utils.ts |
| 237 | `calculateRiskAssessment(findings)` | function | permissions.ts:105-150 | Calculates overall risk from findings | **L1 core/security/risk.ts** | — | Single-concern |
| 238 | `generateRecommendations(findings)` | function | permissions.ts:155-200 | Generates security recommendations | **L1 core/security/risk.ts** | — | Single-concern |
| 239 | `handleCheckPermissions(args)` | function | permissions.ts:205-708 | **Monolithic (503 lines)**. Walk dirs → scan files → detect permissions → assess risk → format | **L2 extensions/security/permissions.ts** | `checkPermissions()` | Drop `handle`; multi-concern |

### `security/env-audit.ts` — 10 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 240 | `EnvAuditArgs` | interface | env-audit.ts:8-14 | Tool input: `{ directory?, env_file? }` | **L1 core/security/types.ts** | — | Domain type |
| 241 | `SCAN_EXTENSIONS` | const | env-audit.ts:18-25 | Extensions to scan for env usage | **L1 core/security/constants.ts** | — | Domain constant |
| 242 | `SKIP_DIRS` | const | env-audit.ts:28-35 | Directories to skip | **DELETE** | — | Use shared/constants.ts:SKIP_DIRECTORIES |
| 243 | `ENV_PATTERNS` | const | env-audit.ts:38-50 | Regex patterns for env var access | **L1 core/security/constants.ts** | — | Domain constant |
| 244 | `parseEnvFile(filePath)` | function | env-audit.ts:55-90 | Parses `.env` file into key-value pairs | **L1 core/security/env-parser.ts** | — | Single-concern |
| 245 | `scanFileForEnvVars(filePath)` | function | env-audit.ts:95-130 | Scans source file for env var references | **L1 core/security/env-parser.ts** | — | Single-concern |
| 246 | `scanDirectory(directory)` | function | env-audit.ts:135-180 | Recursively scans directory for env usage | **L1 core/security/env-parser.ts** | `scanDirectoryForEnv()` | Disambiguate from generic dir scan |
| 247 | `inferExpectedType(value)` | function | env-audit.ts:185-210 | Infers expected type from env var value | **L1 core/security/env-parser.ts** | — | Pure function |
| 248 | `validateValue(key, value, type)` | function | env-audit.ts:215-250 | Validates env var value against expected type | **L1 core/security/env-parser.ts** | `validateEnvValue()` | Disambiguate from generic validation |
| 249 | `formatAsMarkdown(results)` | function | env-audit.ts:255-320 | Formats audit results as markdown | **L1 core/security/formatters.ts** | `formatEnvAudit()` | Disambiguate from generic formatting |
| 250 | `handleEnvAudit(args)` | function | env-audit.ts:325-650 | **Monolithic (325 lines)**. Parse env files → scan source → validate → format | **L2 extensions/security/env-audit.ts** | `auditEnvVars()` | Drop `handle`; multi-concern |

### `database/schema.ts` — 7 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 251 | `DatabaseColumn` | interface | schema.ts:8-16 | Shape: `{ name, type, nullable, default?, primaryKey? }` | **L1 core/database/types.ts** | — | Domain type |
| 252 | `DatabaseTable` | interface | schema.ts:18-26 | Shape: `{ name, columns, indexes, relations }` | **L1 core/database/types.ts** | — | Domain type |
| 253 | `DatabaseRelation` | interface | schema.ts:28-36 | Shape: `{ from, to, type, through? }` | **L1 core/database/types.ts** | — | Domain type |
| 254 | `SchemaSource` | type | schema.ts:38-40 | `'prisma' \| 'drizzle' \| 'sql'` | **L1 core/database/types.ts** | — | Domain type |
| 255 | `GetDatabaseSchemaArgs` | interface | schema.ts:42-48 | Tool input: `{ directory?, source? }` | **L1 core/database/types.ts** | `DatabaseSchemaArgs` | Drop redundant `Get` prefix |
| 256 | `parsePrismaForUnifiedSchema(filePath)` | function | schema.ts:100-250 | Parses Prisma schema into unified format | **L1 core/database/parsers/prisma-schema.ts** | — | Single-concern |
| 257 | `parseDrizzleForUnifiedSchema(directory)` | function | schema.ts:255-420 | Parses Drizzle schemas into unified format | **L1 core/database/parsers/drizzle-schema.ts** | — | Single-concern |
| 258 | `parseSQLForUnifiedSchema(filePath)` | function | schema.ts:425-550 | Parses SQL DDL into unified format | **L1 core/database/parsers/sql-schema.ts** | — | Single-concern |
| 259 | `formatResponse(schema, source)` | function | schema.ts:555-600 | Formats schema result for display | **L1 core/database/formatters.ts** | `formatSchemaResult()` | Disambiguate |
| 260 | `handleGetDatabaseSchema(args)` | function | schema.ts:605-704 | **Monolithic (100 lines)**. Detect source → delegate to parser → format | **L2 extensions/database/schema.ts** | `getDatabaseSchema()` | Drop `handle`; multi-concern |

### `database/prisma.ts` — 12 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 261 | `GetPrismaOperationsArgs` | interface | prisma.ts:8-14 | Tool input: `{ directory?, model? }` | **L1 core/database/types.ts** | `PrismaOpsArgs` | Shorter |
| 262 | `normalizeFilePath(filePath)` | function | prisma.ts:20-30 | **DUPLICATE** of lsp-utils.ts | **DELETE** | — | Use shared/utils.ts:normalizePath |
| 263 | `makeRelativePath(filePath, basePath)` | function | prisma.ts:35-45 | **DUPLICATE** of lsp-utils.ts | **DELETE** | — | Use shared/utils.ts:toRelativePath |
| 264 | `PRISMA_OPERATIONS` | const | prisma.ts:50-65 | Prisma operation names to detect | **L1 core/database/constants.ts** | — | Domain constant |
| 265 | `LOOP_KEYWORDS` | const | prisma.ts:70-75 | Keywords indicating loops (for N+1 detection) | **L1 core/database/constants.ts** | — | Domain constant |
| 266 | `findSourceFiles(directory)` | function | prisma.ts:80-110 | **DUPLICATE** of dead-code.ts/api-surface.ts | **DELETE** | — | Use core/code-intel/file-utils.ts |
| 267 | `fileUsesPrisma(filePath)` | function | prisma.ts:115-130 | Checks if file imports Prisma client | **L1 core/database/prisma-utils.ts** | — | Single-concern |
| 268 | `getCodeSnippet(content, line, context)` | function | prisma.ts:135-155 | Extracts code snippet around a line | **L0 shared/utils.ts** | — | Generic utility |
| 269 | `hasRelationInclusion(content, line)` | function | prisma.ts:160-180 | Checks if Prisma call includes relations | **L1 core/database/prisma-utils.ts** | — | Single-concern |
| 270 | `extractModelFromPrismaCall(content, line)` | function | prisma.ts:185-210 | Extracts Prisma model name from call | **L1 core/database/prisma-utils.ts** | — | Single-concern |
| 271 | `isInsideLoop(content, line)` | function | prisma.ts:215-240 | Checks if code is inside a loop (N+1 detection) | **L1 core/database/prisma-utils.ts** | — | Single-concern |
| 272 | `analyzeFile(filePath)` | function | prisma.ts:245-350 | Analyzes single file for Prisma patterns | **L1 core/database/prisma-utils.ts** | `analyzePrismaFile()` | Disambiguate |
| 273 | `generateRecommendations(findings)` | function | prisma.ts:355-400 | Generates Prisma usage recommendations | **L1 core/database/prisma-utils.ts** | `generatePrismaRecommendations()` | Disambiguate from security |
| 274 | `handleGetPrismaOperations(args)` | function | prisma.ts:405-556 | **Monolithic (150 lines)**. Find files → filter Prisma users → analyze → recommend → format | **L2 extensions/database/prisma.ts** | `getPrismaOperations()` | Drop `handle`; multi-concern |

### `database/shared/sqlite-connection.ts` — 5 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 275 | `SqliteDatabase` | interface | sqlite-connection.ts:8-15 | SQLite database handle type | **L1 core/database/types.ts** | — | Domain type |
| 276 | `SqliteConnectionOptions` | interface | sqlite-connection.ts:17-23 | Options: `{ path, readonly?, timeout? }` | **L1 core/database/types.ts** | — | Domain type |
| 277 | `getConnectionPool()` | function | sqlite-connection.ts:30-80 | Gets/creates SQLite connection pool singleton | **L1 core/database/sqlite-pool.ts** | — | Single-concern |
| 278 | `shutdownConnectionPool()` | function | sqlite-connection.ts:85-120 | Closes all pooled connections | **L1 core/database/sqlite-pool.ts** | — | Single-concern |
| 279 | `withConnection(options, fn)` | function | sqlite-connection.ts:125-392 | Borrows connection, executes fn, returns to pool | **L1 core/database/sqlite-pool.ts** | — | Single-concern (connection lifecycle) |

### `database/query-database/` — 15 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 280 | `QueryDatabaseArgs` | interface | types.ts:8-18 | Tool input: `{ connection_url, query, params?, read_only? }` | **L1 core/database/types.ts** | — | Domain type |
| 281 | `QueryResult` | interface | types.ts:20-30 | Shape: `{ columns, rows, rowCount, executionTime }` | **L1 core/database/types.ts** | — | Domain type |
| 282 | `DatabaseDriver` | type | types.ts:32-35 | `'postgres' \| 'mysql' \| 'sqlite'` | **L1 core/database/types.ts** | — | Domain type |
| 283 | `DatabaseError` | class | errors.ts:5-20 | Custom error for database operations | **L1 core/database/errors.ts** | — | Domain error |
| 284 | `ConnectionError` | class | errors.ts:22-40 | Custom error for connection failures | **L1 core/database/errors.ts** | — | Domain error |
| 285 | `QueryError` | class | errors.ts:42-60 | Custom error for query failures | **L1 core/database/errors.ts** | — | Domain error |
| 286 | `TimeoutError` | class | errors.ts:62-78 | Custom error for query timeouts | **L1 core/database/errors.ts** | — | Domain error |
| 287 | `detectDriver(url)` | function | drivers.ts:5-30 | Detects database driver from connection URL | **L1 core/database/drivers.ts** | — | Single-concern |
| 288 | `loadDriver(driver)` | function | drivers.ts:35-74 | Dynamically imports database driver | **L1 core/database/drivers.ts** | — | Single-concern |
| 289 | `analyzeQuery(sql)` | function | query-analysis.ts:5-60 | Determines query type, safety, estimated impact | **L1 core/database/query-analysis.ts** | — | Single-concern |
| 290 | `isReadOnlyQuery(sql)` | function | query-analysis.ts:65-80 | Checks if SQL query is read-only | **L1 core/database/query-analysis.ts** | — | Pure function |
| 291 | `parseConnectionUrl(url)` | function | url-parser.ts:5-50 | Parses database URL into components | **L1 core/database/url-parser.ts** | — | Single-concern |
| 292 | `formatQueryResult(result)` | function | formatters.ts:5-70 | Formats query result for display | **L1 core/database/formatters.ts** | — | Single-concern |
| 293 | `executeQuery(driver, url, sql, params)` | function | index.ts:5-96 | Orchestrates query execution across drivers | **L2 extensions/database/query.ts** | — | Multi-concern orchestration |
| 294 | `handleQueryDatabase(args)` | function | handler.ts:5-164 | MCP handler: validate → analyze → execute → format | **L2 extensions/database/query.ts** | `queryDatabase()` | Drop `handle`; L2 orchestrator |
| 295 | Executor: `executePostgres(url, sql, params)` | function | executors/postgres.ts | PostgreSQL-specific execution | **L1 core/database/executors/postgres.ts** | — | Single-concern |
| 296 | Executor: `executeMysql(url, sql, params)` | function | executors/mysql.ts | MySQL-specific execution | **L1 core/database/executors/mysql.ts** | — | Single-concern |
| 297 | Executor: `executeSqlite(url, sql, params)` | function | executors/sqlite.ts | SQLite-specific execution | **L1 core/database/executors/sqlite.ts** | — | Single-concern |

### `deps/analyze.ts` — 4 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 298 | `AnalyzeDependenciesArgs` | interface | analyze.ts:8-14 | Tool input: `{ directory?, include_dev? }` | **L1 core/deps/types.ts** | — | Domain type |
| 299 | `extractImports(filePath)` | function | analyze.ts:20-80 | Extracts import statements from source file | **L1 core/deps/import-parser.ts** | — | Single-concern |
| 300 | `isOutdated(current, latest)` | function | analyze.ts:85-100 | Compares semver versions | **L1 core/deps/version-utils.ts** | — | Pure function |
| 301 | `handleAnalyzeDependencies(args)` | function | analyze.ts:105-380 | **Monolithic (275 lines)**. Read package.json → check registry → analyze imports → format | **L2 extensions/deps/analyze.ts** | `analyzeDependencies()` | Drop `handle`; multi-concern |

### `deps/circular.ts` — 12 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 302 | `FindCircularDepsArgs` | interface | circular.ts:8-14 | Tool input: `{ directory?, max_depth? }` | **L1 core/deps/types.ts** | `CircularDepsArgs` | Shorter |
| 303 | `Cycle` | interface | circular.ts:16-22 | Shape: `{ files, length }` | **L1 core/deps/types.ts** | — | Domain type |
| 304 | `SUPPORTED_EXTENSIONS` | const | circular.ts:26-32 | Source extensions — overlaps shared/constants.ts | **DELETE** | — | Use shared/constants.ts:SOURCE_EXTENSIONS |
| 305 | `SKIP_DIRECTORIES` | const | circular.ts:34-42 | **DUPLICATE** of shared/constants.ts | **DELETE** | — | Use shared/constants.ts |
| 306 | `isSourceFile(filePath)` | function | circular.ts:45-50 | **DUPLICATE** across multiple files | **DELETE** | — | Use core/code-intel/file-utils.ts |
| 307 | `shouldSkipDirectory(dir)` | function | circular.ts:55-65 | Checks if directory should be skipped | **L1 core/deps/file-utils.ts** | — | Slight variation from shared skip |
| 308 | `getSourceFiles(directory)` | function | circular.ts:70-100 | Gets source files recursively | **DELETE** | — | Use core/code-intel/file-utils.ts:findSourceFiles |
| 309 | `IMPORT_PATTERNS` | const | circular.ts:105-115 | Regex patterns for import statements | **L1 core/deps/constants.ts** | — | Domain constant |
| 310 | `parseImports(filePath)` | function | circular.ts:120-170 | Parses imports from source file | **L1 core/deps/import-parser.ts** | — | Single-concern |
| 311 | `resolveImportPath(importPath, fromFile)` | function | circular.ts:175-220 | Resolves relative import to absolute path | **L1 core/deps/import-parser.ts** | — | Single-concern |
| 312 | `buildImportGraph(files)` | function | circular.ts:225-260 | Builds directed graph of file imports | **L1 core/deps/graph.ts** | — | Single-concern |
| 313 | `findCycles(graph)` | function | circular.ts:265-330 | DFS cycle detection in import graph | **L1 core/deps/graph.ts** | — | Single-concern (algorithm) |
| 314 | `extractCycle(stack, target)` | function | circular.ts:335-350 | Extracts cycle from DFS stack | **L1 core/deps/graph.ts** | — | Helper for findCycles |
| 315 | `createCycleSignature(cycle)` | function | circular.ts:355-370 | Creates dedup key for a cycle | **L1 core/deps/graph.ts** | — | Pure function |
| 316 | `handleFindCircularDeps(args)` | function | circular.ts:375-513 | **Monolithic (138 lines)**. Get files → build graph → find cycles → format | **L2 extensions/deps/circular.ts** | `findCircularDeps()` | Drop `handle`; multi-concern |

### `deps/upgrade.ts` — 10 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 317 | `UpgradePackageArgs` | interface | upgrade.ts:8-14 | Tool input: `{ package, directory? }` | **L1 core/deps/types.ts** | — | Domain type |
| 318 | `getCurrentVersion(pkgName, directory)` | function | upgrade.ts:20-50 | Reads current version from package.json | **L1 core/deps/version-utils.ts** | — | Single-concern |
| 319 | `isDevDependency(pkgName, directory)` | function | upgrade.ts:55-75 | Checks if package is devDependency | **L1 core/deps/version-utils.ts** | — | Single-concern |
| 320 | `cleanVersion(version)` | function | upgrade.ts:80-90 | Strips semver prefixes (^, ~) | **L1 core/deps/version-utils.ts** | — | Pure function |
| 321 | `parseVersion(version)` | function | upgrade.ts:95-110 | Parses semver into `{ major, minor, patch }` | **L1 core/deps/version-utils.ts** | — | Pure function |
| 322 | `isMajorBump(current, latest)` | function | upgrade.ts:115-125 | Checks if upgrade is a major version bump | **L1 core/deps/version-utils.ts** | — | Pure function |
| 323 | `extractGitHubRepo(packageJson)` | function | upgrade.ts:130-155 | Extracts GitHub repo URL from package metadata | **L1 core/deps/registry.ts** | — | Single-concern |
| 324 | `parseBreakingChanges(changelog)` | function | upgrade.ts:160-200 | Extracts breaking changes from changelog text | **L1 core/deps/changelog.ts** | — | Single-concern |
| 325 | `summarizeChangelog(changelog)` | function | upgrade.ts:205-240 | Creates summary of changelog entries | **L1 core/deps/changelog.ts** | — | Single-concern |
| 326 | `generateWarnings(current, latest, breaking)` | function | upgrade.ts:245-290 | Generates upgrade warnings and risk assessment | **L1 core/deps/changelog.ts** | `generateUpgradeWarnings()` | Disambiguate |
| 327 | `handleUpgradePackage(args)` | function | upgrade.ts:295-619 | **Monolithic (324 lines)**. Get current → fetch latest → fetch changelog → analyze → format | **L2 extensions/deps/upgrade.ts** | `analyzeUpgrade()` | Drop `handle`; verb clarifies intent |

### `runtime/logs.ts` — 16 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 328 | `LogAnalyzerArgs` | interface | logs.ts:8-14 | Tool input: `{ file, time_window?, pattern?, level? }` | **L1 core/runtime/types.ts** | — | Domain type |
| 329 | `LogAnalyzerResult` | interface | logs.ts:16-30 | Shape: `{ entries, stats, anomalies, patterns }` | **L1 core/runtime/types.ts** | — | Domain type |
| 330 | `parseTimeWindow(window)` | function | logs.ts:35-55 | Parses time window string (e.g., "1h", "30m") | **L1 core/runtime/time-utils.ts** | — | Pure function |
| 331 | `detectLevel(line)` | function | logs.ts:60-85 | Detects log level from line content | **L1 core/runtime/log-parser.ts** | — | Single-concern |
| 332 | `TIMESTAMP_PATTERNS` | const | logs.ts:90-105 | Regex patterns for timestamp formats | **L1 core/runtime/constants.ts** | — | Domain constant |
| 333 | `parseTimestamp(text)` | function | logs.ts:110-140 | Parses timestamp from various formats | **L1 core/runtime/log-parser.ts** | — | Single-concern |
| 334 | `extractTimestamp(line)` | function | logs.ts:145-170 | Extracts timestamp from log line | **L1 core/runtime/log-parser.ts** | — | Single-concern |
| 335 | `detectStructured(line)` | function | logs.ts:175-195 | Detects if log line is structured (JSON) | **L1 core/runtime/log-parser.ts** | — | Single-concern |
| 336 | `parseLogLine(line)` | function | logs.ts:200-240 | Parses single log line into structured format | **L1 core/runtime/log-parser.ts** | — | Single-concern |
| 337 | `normalizeMessage(message)` | function | logs.ts:245-270 | Normalizes log message for grouping | **L1 core/runtime/log-parser.ts** | — | Pure function |
| 338 | `groupMessages(entries)` | function | logs.ts:275-320 | Groups log entries by normalized message | **L1 core/runtime/log-analysis.ts** | — | Single-concern |
| 339 | `detectAnomalies(entries)` | function | logs.ts:325-400 | Detects anomalous patterns in log entries | **L1 core/runtime/log-analysis.ts** | — | Single-concern |
| 340 | `calculateRateAnalysis(entries, window)` | function | logs.ts:405-450 | Calculates log rate statistics | **L1 core/runtime/log-analysis.ts** | — | Single-concern |
| 341 | `tailFile(filePath, lines)` | function | logs.ts:455-490 | Reads last N lines of file | **L0 shared/utils.ts** | — | Generic utility |
| 342 | `matchPatterns(entries, patterns)` | function | logs.ts:495-530 | Filters entries matching regex patterns | **L1 core/runtime/log-analysis.ts** | — | Single-concern |
| 343 | `formatResult(analysis)` | function | logs.ts:535-600 | Formats analysis result for display | **L1 core/runtime/formatters.ts** | `formatLogAnalysis()` | Disambiguate |
| 344 | `handleLogAnalyzer(args)` | function | logs.ts:605-963 | **Monolithic (358 lines)**. Read file → parse lines → filter → analyze → detect anomalies → format | **L2 extensions/runtime/logs.ts** | `analyzeLogs()` | Drop `handle`; multi-concern |

### `runtime/memory.ts` — 13 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 345 | `DetectMemoryLeaksArgs` | interface | memory.ts:8-14 | Tool input: `{ pid?, command?, duration?, interval? }` | **L1 core/runtime/types.ts** | — | Domain type |
| 346 | `MemorySnapshot` | interface | memory.ts:16-22 | Shape: `{ timestamp, rss, heapUsed, heapTotal }` | **L1 core/runtime/types.ts** | — | Domain type |
| 347 | `MemoryAnalysis` | interface | memory.ts:30-42 | Shape: `{ trend, regression, suspects, leaking }` | **L1 core/runtime/types.ts** | — | Domain type |
| 348 | `sleep(ms)` | function | memory.ts:48-50 | Promise-based delay | **L0 shared/utils.ts** | — | Generic utility |
| 349 | `isProcessAlive(pid)` | function | memory.ts:55-70 | Checks if process is running | **L1 core/runtime/process-utils.ts** | — | Single-concern |
| 350 | `getWindowsMemory(pid)` | function | memory.ts:75-110 | Gets process memory on Windows via tasklist | **L1 core/runtime/process-utils.ts** | — | Platform-specific |
| 351 | `getUnixMemory(pid)` | function | memory.ts:115-150 | Gets process memory on Unix via /proc or ps | **L1 core/runtime/process-utils.ts** | — | Platform-specific |
| 352 | `getProcessMemory(pid)` | function | memory.ts:155-175 | Cross-platform process memory getter | **L1 core/runtime/process-utils.ts** | — | Facade over platform implementations |
| 353 | `linearRegression(points)` | function | memory.ts:180-220 | Calculates linear regression for memory trend | **L1 core/runtime/statistics.ts** | — | Pure math function |
| 354 | `analyzeTrend(snapshots)` | function | memory.ts:225-280 | Analyzes memory trend from snapshots | **L1 core/runtime/statistics.ts** | `analyzeMemoryTrend()` | Disambiguate |
| 355 | `generateSuspects(snapshots)` | function | memory.ts:285-340 | Generates leak suspect list | **L1 core/runtime/statistics.ts** | `generateLeakSuspects()` | Disambiguate |
| 356 | `generateRecommendations(analysis)` | function | memory.ts:345-390 | Generates memory management recommendations | **L1 core/runtime/statistics.ts** | `generateMemoryRecommendations()` | Disambiguate from security/deps |
| 357 | `spawnCommand(command)` | function | memory.ts:395-430 | Spawns process and returns PID | **L1 core/runtime/process-utils.ts** | — | Single-concern |
| 358 | `handleDetectMemoryLeaks(args)` | function | memory.ts:435-570 | **Monolithic (135 lines)**. Start/find process → sample memory → analyze → format | **L2 extensions/runtime/memory.ts** | `detectMemoryLeaks()` | Drop `handle`; multi-concern |

### `runtime/profile.ts` — 8 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 359 | `ProfileFunctionArgs` | interface | profile.ts:8-14 | Tool input: `{ file, function_name, iterations? }` | **L1 core/runtime/types.ts** | — | Domain type |
| 360 | `TimingStats` | interface | profile.ts:16-24 | Shape: `{ min, max, mean, median, p95, p99, stddev }` | **L1 core/runtime/types.ts** | — | Domain type |
| 361 | `calculateStats(times)` | function | profile.ts:30-80 | Calculates timing statistics from measurements | **L1 core/runtime/statistics.ts** | `calculateTimingStats()` | Disambiguate |
| 362 | `roundTo(n, decimals)` | function | profile.ts:85-90 | Rounds number to N decimal places | **L0 shared/utils.ts** | — | Generic utility |
| 363 | `bytesToMb(bytes)` | function | profile.ts:95-100 | Converts bytes to megabytes | **L0 shared/utils.ts** | — | Generic utility |
| 364 | `isPromise(value)` | function | profile.ts:105-110 | Checks if value is a Promise | **L0 shared/utils.ts** | — | Generic utility |
| 365 | `formatResult(stats, memory)` | function | profile.ts:115-180 | Formats profiling result for display | **L1 core/runtime/formatters.ts** | `formatProfileResult()` | Disambiguate |
| 366 | `extractFunction(filePath, funcName)` | function | profile.ts:185-250 | Extracts function from file for profiling | **L1 core/runtime/profiler.ts** | — | Single-concern |
| 367 | `handleProfileFunction(args)` | function | profile.ts:255-567 | **Monolithic (312 lines)**. Extract function → run iterations → measure → calculate stats → format | **L2 extensions/runtime/profile.ts** | `profileFunction()` | Drop `handle`; multi-concern |

### `standalone/bundle.ts` — 5 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 368 | `BundleFormat` | type | bundle.ts:5-8 | `'esm' \| 'cjs' \| 'umd' \| 'iife'` | **L1 core/standalone/types.ts** | — | Domain type |
| 369 | `AnalyzeBundleArgs` | interface | bundle.ts:10-16 | Tool input: `{ directory?, entry? }` | **L1 core/standalone/types.ts** | — | Domain type |
| 370 | `formatBytes(bytes)` | function | bundle.ts:22-35 | Formats bytes to human-readable size | **L0 shared/utils.ts** | — | Generic utility |
| 371 | `extractModules(content)` | function | bundle.ts:40-100 | Extracts module info from bundle content | **L1 core/standalone/bundle-parser.ts** | — | Single-concern |
| 372 | `extractPackageName(modulePath)` | function | bundle.ts:105-120 | Extracts npm package name from module path | **L1 core/standalone/bundle-parser.ts** | — | Pure function |
| 373 | `generateRecommendations(analysis)` | function | bundle.ts:125-180 | Generates bundle size recommendations | **L1 core/standalone/bundle-parser.ts** | `generateBundleRecommendations()` | Disambiguate |
| 374 | `handleAnalyzeBundle(args)` | function | bundle.ts:185-524 | **Monolithic (339 lines)**. Find bundles → parse → analyze modules → recommend → format | **L2 extensions/standalone/bundle.ts** | `analyzeBundle()` | Drop `handle`; multi-concern |

### `standalone/scaffold.ts` — 2 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 375 | `ScaffoldProjectArgs` | interface | scaffold.ts:8-14 | Tool input: `{ template, name, directory? }` | **L1 core/standalone/types.ts** | — | Domain type |
| 376 | `handleScaffoldProject(args)` | function | scaffold.ts:20-221 | **Monolithic (200 lines)**. Validate template → create dirs → write files → init git → install deps | **L2 extensions/standalone/scaffold.ts** | `scaffoldProject()` | Drop `handle`; multi-concern |

### `test/coverage.ts` — 8 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 377 | `GetTestCoverageArgs` | interface | coverage.ts:8-14 | Tool input: `{ directory?, format? }` | **L1 core/testing/types.ts** | `TestCoverageArgs` | Drop redundant `Get` prefix |
| 378 | `COVERAGE_PATHS` | const | coverage.ts:18-25 | Default paths for coverage reports | **L1 core/testing/constants.ts** | — | Domain constant |
| 379 | `findCoverageReport(directory)` | function | coverage.ts:30-60 | Searches for coverage report files | **L1 core/testing/coverage-parser.ts** | — | Single-concern |
| 380 | `detectCoverageType(filePath)` | function | coverage.ts:65-85 | Detects coverage format (lcov/istanbul/c8) | **L1 core/testing/coverage-parser.ts** | — | Single-concern |
| 381 | `parseLcov(content)` | function | coverage.ts:90-170 | Parses LCOV format coverage data | **L1 core/testing/coverage-parser.ts** | — | Single-concern |
| 382 | `parseIstanbul(content)` | function | coverage.ts:175-260 | Parses Istanbul JSON format coverage | **L1 core/testing/coverage-parser.ts** | — | Single-concern |
| 383 | `calculateMetrics(data)` | function | coverage.ts:265-330 | Calculates coverage percentages and stats | **L1 core/testing/coverage-parser.ts** | `calculateCoverageMetrics()` | Disambiguate |
| 384 | `extractUncoveredLines(data)` | function | coverage.ts:335-380 | Extracts uncovered line ranges | **L1 core/testing/coverage-parser.ts** | — | Single-concern |
| 385 | `extractUncoveredFunctions(data)` | function | coverage.ts:385-420 | Extracts uncovered function names | **L1 core/testing/coverage-parser.ts** | — | Single-concern |
| 386 | `handleGetTestCoverage(args)` | function | coverage.ts:425-701 | **Monolithic (276 lines)**. Find report → detect format → parse → calculate metrics → format | **L2 extensions/testing/coverage.ts** | `getTestCoverage()` | Drop `handle`; multi-concern |

### `test/find-tests.ts` — 8 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 387 | `FindTestsForFileArgs` | interface | find-tests.ts:8-14 | Tool input: `{ file, directory? }` | **L1 core/testing/types.ts** | `FindTestsArgs` | Shorter |
| 388 | `TestType` | type | find-tests.ts:16-18 | `'unit' \| 'integration' \| 'e2e'` | **L1 core/testing/types.ts** | — | Domain type |
| 389 | `TEST_PATTERNS` | const | find-tests.ts:22-35 | Glob patterns for test files | **L1 core/testing/constants.ts** | — | Domain constant |
| 390 | `findTestFiles(directory, patterns)` | function | find-tests.ts:40-80 | Finds test files matching patterns | **L1 core/testing/test-finder.ts** | — | Single-concern |
| 391 | `determineTestType(filePath)` | function | find-tests.ts:85-110 | Classifies test file by type | **L1 core/testing/test-finder.ts** | — | Single-concern |
| 392 | `parseImports(filePath)` | function | find-tests.ts:115-155 | Parses imports from test file | **L1 core/testing/test-finder.ts** | `parseTestImports()` | Disambiguate from deps/import-parser |
| 393 | `resolveModulePath(importPath, fromFile)` | function | find-tests.ts:160-200 | Resolves module import path | **DELETE** | — | Duplicate of deps/circular.ts:resolveImportPath |
| 394 | `checkImportRelationship(testFile, sourceFile)` | function | find-tests.ts:205-240 | Checks if test imports source file | **L1 core/testing/test-finder.ts** | — | Single-concern |
| 395 | `calculatePatternConfidence(testFile, sourceFile)` | function | find-tests.ts:245-290 | Calculates naming pattern confidence | **L1 core/testing/test-finder.ts** | — | Single-concern |
| 396 | `handleFindTestsForFile(args)` | function | find-tests.ts:295-418 | **Monolithic (123 lines)**. Find tests → classify → check imports → score confidence → format | **L2 extensions/testing/find-tests.ts** | `findTestsForFile()` | Drop `handle`; multi-concern |

---

## Issues Found

### Duplicated Code

| Issue | Locations | Resolution |
|-------|----------|------------|
| `utils.ts` — entire file duplicates `shared/utils.ts` (5 functions) + deprecated `success()`/`error()` | `utils.ts` vs `shared/utils.ts` | **Delete** `utils.ts` entirely. All consumers use `shared/utils.ts` and `shared/response.ts` |
| `SOURCE_EXTENSIONS` — identical constant in 4 files | `shared/constants.ts`, `dead-code.ts`, `api-surface.ts`, `circular.ts` | **Delete** 3 copies. Single source: `shared/constants.ts` |
| `SKIP_DIRECTORIES` — identical constant in 2+ files | `shared/constants.ts`, `circular.ts` | **Delete** copy. Single source: `shared/constants.ts` |
| `isSourceFile()` — identical function in 4+ files | `dead-code.ts`, `api-surface.ts`, `circular.ts`, `prisma.ts` | **Delete** copies. Single source: `core/code-intel/file-utils.ts` |
| `findSourceFiles()` — identical recursive dir scan in 3+ files | `dead-code.ts`, `api-surface.ts`, `prisma.ts` | **Delete** copies. Single source: `core/code-intel/file-utils.ts` |
| `getExportKind()` — identical AST helper in 2 files | `dead-code.ts`, `api-surface.ts` | **Delete** copy. Single source: `core/code-intel/ast-utils.ts` |
| `DEFAULT_COMPILER_OPTIONS` — identical TS options in 2 files | `language-service.ts`, `preview-edits.ts` | **Delete** copy. Single source: `core/code-intel/constants.ts` as `TS_ANALYSIS_OPTIONS` |
| `findTsConfig()` — identical tsconfig finder in 2 files | `language-service.ts`, `preview-edits.ts` | **Delete** copy. Single source: `core/code-intel/tsconfig.ts` |
| `readTsConfig()` — identical tsconfig reader in 2 files | `language-service.ts`, `preview-edits.ts` | **Delete** copy. Single source: `core/code-intel/tsconfig.ts` |
| `normalizeFilePath()` — identical path normalizer in 2 files | `lsp-utils.ts`, `prisma.ts` | **Delete** copies. Single source: `shared/utils.ts:normalizePath()` |
| `makeRelativePath()` — identical relative path in 2 files | `lsp-utils.ts`, `prisma.ts` | **Delete** copies. Single source: `shared/utils.ts:toRelativePath()` |
| `shouldSkip()` / `isScannable()` — identical filter functions | `secrets.ts`, `permissions.ts` | **Delete** copies. Single source: `core/security/file-utils.ts` |
| `SKIP_PATTERNS` / `SCANNABLE_EXTENSIONS` — identical constants | `secrets.ts`, `permissions.ts` | **Delete** copies. Single source: `core/security/constants.ts` |
| `analyzeWithLLM()` — similar AI analysis in 2 files | `breaking-changes.ts`, `semantic-diff.ts` | **Merge** into `core/ai/analyze.ts:analyzeChangesWithLLM()` |
| `resolveModulePath()` — duplicate of `resolveImportPath()` | `find-tests.ts`, `circular.ts` | **Delete** from find-tests. Use `core/deps/import-parser.ts` |
| Re-export chains (ToolResponse, createSuccessResponse, etc.) | `types.ts`, `lsp-utils.ts` | **Delete** re-exports. Import directly from `shared/` |
| `generateRecommendations()` — same name, different logic in 4 files | `permissions.ts`, `prisma.ts`, `memory.ts`, `bundle.ts` | **Rename** each to domain-specific name |

### Blocking I/O

| Issue | Location | Fix |
|-------|----------|-----|
| `fs.existsSync()` in language service | `language-service.ts` (findTsConfig, normalizePath) | Replace with async `fileExists()` |
| `fs.readFileSync()` in language service | `language-service.ts` (readTsConfig, createLanguageService) | Replace with `fsPromises.readFile()` |
| `fs.existsSync()` in validation | `validation.ts` (validatePositionArgs, validateFilePath) | Replace with async `fileExists()` |
| `fs.readdirSync()` / `fs.statSync()` in dead-code | `dead-code.ts` (findSourceFiles) | Replace with `fsPromises.readdir()` + `fsPromises.stat()` |
| `fs.readdirSync()` / `fs.statSync()` in api-surface | `api-surface.ts` (findSourceFiles) | Same fix; will be deduplicated anyway |
| `fs.existsSync()` in env-audit | `env-audit.ts` (scanDirectory) | Replace with async `fileExists()` |

### Monolithic Functions

| Function | Lines | Concerns Mixed | Decomposition |
|----------|-------|----------------|---------------|
| `LanguageServiceManagerImpl` | 418 | Cache management, tsconfig discovery, file loading, TS service creation, position math | → Extract pure functions, split tsconfig into own module |
| `handleFindDeadCode()` | 210 | File scanning, export extraction, reference counting, filtering, formatting | → 5 L1 functions + 1 L2 orchestrator |
| `handleSafeDeleteCheck()` | 270 | Symbol finding, reference finding, self-ref filtering, safety analysis, formatting | → 4 L1 functions + 1 L2 orchestrator |
| `handleValidateEditsPreview()` | 170 | Virtual FS, edit application, compilation, diagnostic diff, formatting | → 4 L1 functions + 1 L2 orchestrator |
| `handleDetectBreakingChanges()` | 280 | Git diff, type extraction, comparison, AI analysis, formatting | → 4 L1 functions + 1 L2 orchestrator |
| `handleSemanticDiff()` | 336 | Git diff, symbol extraction, reference tracing, AI analysis, formatting | → 4 L1 functions + 1 L2 orchestrator |
| `handleGetApiSurface()` | 183 | Entry point detection, program creation, export collection, formatting | → 3 L1 functions + 1 L2 orchestrator |
| `handleGetApiRoutes()` | 660+ | Framework detection, 4 framework parsers, path extraction, formatting | → 10 L1 parsers + 1 L2 orchestrator |
| `handleGenerateOpenApi()` | 400 | Route reading, path conversion, schema generation, YAML output | → 8 L1 functions + 1 L2 orchestrator |
| `handleValidateApiContract()` | 430 | Spec loading, request making, schema validation, formatting | → 3 L1 functions + 1 L2 orchestrator |
| `handleSyncApiTypes()` | 530 | Backend scanning, frontend scanning, matching, type comparison, formatting | → 5 L1 functions + 1 L2 orchestrator |
| `handleScanForSecrets()` | 567 | Dir walking, file scanning, pattern detection, filtering, formatting | → 4 L1 functions + 1 L2 orchestrator |
| `handleCheckPermissions()` | 503 | Dir walking, file scanning, permission detection, risk assessment, formatting | → 3 L1 functions + 1 L2 orchestrator |
| `handleEnvAudit()` | 325 | Env parsing, source scanning, validation, formatting | → 4 L1 functions + 1 L2 orchestrator |
| `handleGetDatabaseSchema()` | 100 | Source detection, parser delegation, formatting | → 3 L1 parsers + 1 L2 orchestrator |
| `handleGetPrismaOperations()` | 150 | File finding, Prisma detection, analysis, recommendations | → 5 L1 functions + 1 L2 orchestrator |
| `handleQueryDatabase()` | 164 | Validation, analysis, execution, formatting | → already partially decomposed; finalize |
| `handleAnalyzeDependencies()` | 275 | Package.json reading, registry checking, import analysis, formatting | → 3 L1 functions + 1 L2 orchestrator |
| `handleFindCircularDeps()` | 138 | File scanning, graph building, cycle detection, formatting | → 3 L1 functions + 1 L2 orchestrator |
| `handleUpgradePackage()` | 324 | Version checking, registry fetching, changelog analysis, formatting | → 4 L1 functions + 1 L2 orchestrator |
| `handleLogAnalyzer()` | 358 | File reading, line parsing, filtering, anomaly detection, formatting | → 6 L1 functions + 1 L2 orchestrator |
| `handleDetectMemoryLeaks()` | 135 | Process management, memory sampling, trend analysis, formatting | → 4 L1 functions + 1 L2 orchestrator |
| `handleProfileFunction()` | 312 | Function extraction, execution, measurement, statistics, formatting | → 3 L1 functions + 1 L2 orchestrator |
| `handleAnalyzeBundle()` | 339 | Bundle finding, module parsing, analysis, recommendations | → 3 L1 functions + 1 L2 orchestrator |
| `handleScaffoldProject()` | 200 | Template validation, dir creation, file writing, git init, dep install | → 4 L1 functions + 1 L2 orchestrator |
| `handleGetTestCoverage()` | 276 | Report finding, format detection, parsing, metric calculation | → 4 L1 functions + 1 L2 orchestrator |
| `handleFindTestsForFile()` | 123 | Test finding, classification, import checking, confidence scoring | → 3 L1 functions + 1 L2 orchestrator |

### Misplaced Elements

| Element | Current File | Problem | Correct Location |
|---------|-------------|---------|------------------|
| `startTimer()` | logging.ts | Perf utility, not logging | `shared/utils.ts` |
| `findFiles()` | api/routes.ts | Generic glob wrapper in domain handler | `shared/utils.ts:globFiles()` |
| `getLineNumber()` | api/routes.ts | Generic offset converter in domain handler | `shared/utils.ts:offsetToLine()` |
| `buildQueryString()` | api/validate.ts | Generic URL utility in domain handler | `shared/utils.ts` |
| `sleep()` | runtime/memory.ts | Generic async utility in domain handler | `shared/utils.ts` |
| `roundTo()` | runtime/profile.ts | Generic math utility in domain handler | `shared/utils.ts` |
| `bytesToMb()` | runtime/profile.ts | Generic conversion utility in domain handler | `shared/utils.ts` |
| `isPromise()` | runtime/profile.ts | Generic type guard in domain handler | `shared/utils.ts` |
| `formatBytes()` | standalone/bundle.ts | Generic formatting utility in domain handler | `shared/utils.ts` |
| `tailFile()` | runtime/logs.ts | Generic file utility in domain handler | `shared/utils.ts` |
| `getCodeSnippet()` | database/prisma.ts | Generic code utility in domain handler | `shared/utils.ts` |
| `toYaml()` / `setYamlConverter()` / `resetYamlConverter()` | api/spec.ts | Generic serialization in domain handler | `shared/utils.ts` |
| `ToolResponseContent`, `ToolResponse` | shared/response.ts | MCP protocol types in response module | `shared/types.ts` as `McpContent`, `McpResponse` |

### Naming Inconsistencies

| Pattern | Examples | Fix |
|---------|----------|-----|
| `handle*` prefix on L2 functions | All 26 handlers | Drop `handle` prefix; L2 functions are business logic, not dispatch |
| `Get*Args` prefix on input types | `GetApiRoutesArgs`, `GetDatabaseSchemaArgs`, `GetTestCoverageArgs`, `GetApiSurfaceArgs`, `GetPrismaOperationsArgs` | Drop redundant `Get`; the function name provides the verb |
| `generateRecommendations()` name collision | 4 different files | Domain-prefix each: `generatePrismaRecommendations`, `generateBundleRecommendations`, etc. |
| `formatResult()` name collision | `runtime/logs.ts`, `runtime/profile.ts` | Domain-prefix each: `formatLogAnalysis`, `formatProfileResult` |
| `analyzeFile()` name collision | `database/prisma.ts` | Domain-prefix: `analyzePrismaFile` |

---

## Target File Structure

```
project-engine/src/
├── shared/                                    # L0 — Zero domain knowledge
│   ├── index.ts                               # Barrel export
│   ├── constants.ts                           # SERVER_NAME, SERVER_VERSION, SOURCE_EXTENSIONS,
│   │                                          #   SKIP_DIRECTORIES
│   ├── config.ts                              # PLUGIN_ROOT, PROJECT_ROOT, getPluginRoot(),
│   │                                          #   getProjectRoot()
│   ├── logger.ts                              # LogLevel, LogEntry, formatLog, log, logger,
│   │                                          #   logError, logWarn
│   ├── types.ts                               # McpContent, McpResponse
│   ├── response.ts                            # ok(), text(), fail(), failFromException(),
│   │                                          #   notFound(), missingArg(), invalidArg()
│   └── utils.ts                               # fileExists(), resolveEsmDir(), resolveModuleDir(),
│                                              #   startTimer(), normalizePath(), toRelativePath(),
│                                              #   resolveProjectPath(), readJsonFile(), safeExec(),
│                                              #   detectPackageManager(), fetchUrl(),
│                                              #   buildQueryString(), sleep(), roundTo(), bytesToMb(),
│                                              #   isPromise(), formatBytes(), tailFile(),
│                                              #   getCodeSnippet(), globFiles(), offsetToLine(),
│                                              #   toYaml(), setYamlConverter(), resetYamlConverter()
│
├── core/                                      # L1 — Single-concern domain functions
│   ├── index.ts                               # Barrel export
│   ├── code-intel/
│   │   ├── index.ts                           # Barrel export
│   │   ├── types.ts                           # All code-intel domain types
│   │   ├── constants.ts                       # TS_ANALYSIS_OPTIONS, TEST_PATTERNS,
│   │   │                                      #   ENTRY_POINT_NAMES, MAX_PREVIEW_LENGTH
│   │   ├── language-service.ts                 # LanguageServiceManagerImpl (refactored)
│   │   ├── tsconfig.ts                        # findTsConfig(), readTsConfig()
│   │   ├── position.ts                        # toOffset(), toLineColumn()
│   │   ├── validation.ts                      # validatePositionArgs(), validateFilePath(),
│   │   │                                      #   isValidLine(), isValidColumn()
│   │   ├── file-utils.ts                      # isTestFile(), isSourceFile(), findSourceFiles()
│   │   ├── ast-utils.ts                       # getExportKind(), getJsDoc(), getTypeString()
│   │   ├── exports.ts                         # findExportsInFile(), collectPublicExports(),
│   │   │                                      #   collectAllExports(), extractExportedSymbols()
│   │   ├── references.ts                      # countReferences(), isSameLine(),
│   │   │                                      #   isInSameDeclaration(), findReferencingFiles()
│   │   ├── preview.ts                         # getLinePreview(), getPreviewFromSourceFile()
│   │   ├── virtual-fs.ts                      # VirtualFileSystem, applyEdit(),
│   │   │                                      #   createVirtualLanguageService()
│   │   ├── diagnostics.ts                     # getDiagnosticsForFiles(), diagnosticToError(),
│   │   │                                      #   diagnosticKey()
│   │   ├── type-extraction.ts                 # extractTypeInfo(), extractTypeInfoFromContent()
│   │   └── entry-points.ts                    # detectEntryPoints()
│   ├── ai/
│   │   └── analyze.ts                         # analyzeChangesWithLLM()
│   ├── git/
│   │   └── diff.ts                            # getChangedFiles(), getFileAtRef(),
│   │                                          #   getChangedFilesDetailed()
│   ├── api/
│   │   ├── index.ts                           # Barrel export
│   │   ├── types.ts                           # All API domain types
│   │   ├── constants.ts                       # BACKEND_PATHS
│   │   ├── detection.ts                       # detectFramework()
│   │   ├── openapi.ts                         # convertRoutePathToOpenApi(), extractPathParameters(),
│   │   │                                      #   generateOperationId(), extractTag(),
│   │   │                                      #   typeToJsonSchema(), generateExample(),
│   │   │                                      #   createDefaultRequestSchema(),
│   │   │                                      #   createDefaultResponseSchema(), resolvePathParams()
│   │   ├── http.ts                            # makeRequest()
│   │   ├── validation.ts                      # validateSchema()
│   │   ├── type-extraction.ts                 # parseHandlerTypes(), parseInterfaceToSchema(),
│   │   │                                      #   extractTypeText(), compareTypes(), normalizeType()
│   │   ├── matching.ts                        # normalizeEndpoint(), matchEndpoint(),
│   │   │                                      #   generateFixSuggestion()
│   │   └── parsers/
│   │       ├── nextjs.ts                      # parseNextJsRoutes(), parseNextJsAppRouter(),
│   │       │                                  #   parseNextJsPagesRouter(), detectPagesRouterMethods(),
│   │       │                                  #   extractNextJsRoutePath(),
│   │       │                                  #   extractNextJsPagesRoutePath()
│   │       ├── express.ts                     # parseExpressRoutes(), parseExpressFileRoutes(),
│   │       │                                  #   extractExpressMiddleware()
│   │       ├── fastify.ts                     # parseFastifyRoutes(), parseFastifyFileRoutes()
│   │       └── hono.ts                        # parseHonoRoutes(), parseHonoFileRoutes()
│   ├── security/
│   │   ├── index.ts                           # Barrel export
│   │   ├── types.ts                           # All security domain types
│   │   ├── constants.ts                       # SECURITY_SKIP_PATTERNS, SCANNABLE_EXTENSIONS,
│   │   │                                      #   SCAN_EXTENSIONS, ENV_PATTERNS
│   │   ├── file-utils.ts                      # shouldSkip(), isScannable()
│   │   ├── redaction.ts                       # redactSecret()
│   │   ├── detection.ts                       # isLikelyPlaceholder(), filterBySeverity(),
│   │   │                                      #   getDefaultMaxDepth()
│   │   ├── risk.ts                            # calculateRiskAssessment(),
│   │   │                                      #   generateRecommendations()
│   │   ├── env-parser.ts                      # parseEnvFile(), scanFileForEnvVars(),
│   │   │                                      #   scanDirectoryForEnv(), inferExpectedType(),
│   │   │                                      #   validateEnvValue()
│   │   └── formatters.ts                      # formatEnvAudit()
│   ├── database/
│   │   ├── index.ts                           # Barrel export
│   │   ├── types.ts                           # All database domain types
│   │   ├── constants.ts                       # PRISMA_OPERATIONS, LOOP_KEYWORDS
│   │   ├── errors.ts                          # DatabaseError, ConnectionError, QueryError,
│   │   │                                      #   TimeoutError
│   │   ├── drivers.ts                         # detectDriver(), loadDriver()
│   │   ├── query-analysis.ts                  # analyzeQuery(), isReadOnlyQuery()
│   │   ├── url-parser.ts                      # parseConnectionUrl()
│   │   ├── formatters.ts                      # formatQueryResult(), formatSchemaResult()
│   │   ├── sqlite-pool.ts                     # getConnectionPool(), shutdownConnectionPool(),
│   │   │                                      #   withConnection()
│   │   ├── prisma-utils.ts                    # fileUsesPrisma(), hasRelationInclusion(),
│   │   │                                      #   extractModelFromPrismaCall(), isInsideLoop(),
│   │   │                                      #   analyzePrismaFile(),
│   │   │                                      #   generatePrismaRecommendations()
│   │   ├── parsers/
│   │   │   ├── prisma-schema.ts               # parsePrismaForUnifiedSchema()
│   │   │   ├── drizzle-schema.ts              # parseDrizzleForUnifiedSchema()
│   │   │   └── sql-schema.ts                  # parseSQLForUnifiedSchema()
│   │   └── executors/
│   │       ├── index.ts                       # Barrel export
│   │       ├── postgres.ts                    # executePostgres()
│   │       ├── mysql.ts                       # executeMysql()
│   │       └── sqlite.ts                      # executeSqlite()
│   ├── deps/
│   │   ├── index.ts                           # Barrel export
│   │   ├── types.ts                           # All deps domain types
│   │   ├── constants.ts                       # IMPORT_PATTERNS
│   │   ├── import-parser.ts                   # extractImports(), parseImports(),
│   │   │                                      #   resolveImportPath()
│   │   ├── version-utils.ts                   # isOutdated(), getCurrentVersion(),
│   │   │                                      #   isDevDependency(), cleanVersion(),
│   │   │                                      #   parseVersion(), isMajorBump()
│   │   ├── graph.ts                           # buildImportGraph(), findCycles(),
│   │   │                                      #   extractCycle(), createCycleSignature()
│   │   ├── registry.ts                        # extractGitHubRepo()
│   │   ├── changelog.ts                       # parseBreakingChanges(), summarizeChangelog(),
│   │   │                                      #   generateUpgradeWarnings()
│   │   └── file-utils.ts                      # shouldSkipDirectory()
│   ├── runtime/
│   │   ├── index.ts                           # Barrel export
│   │   ├── types.ts                           # All runtime domain types
│   │   ├── constants.ts                       # TIMESTAMP_PATTERNS
│   │   ├── time-utils.ts                      # parseTimeWindow()
│   │   ├── log-parser.ts                      # detectLevel(), parseTimestamp(),
│   │   │                                      #   extractTimestamp(), detectStructured(),
│   │   │                                      #   parseLogLine(), normalizeMessage()
│   │   ├── log-analysis.ts                    # groupMessages(), detectAnomalies(),
│   │   │                                      #   calculateRateAnalysis(), matchPatterns()
│   │   ├── process-utils.ts                   # isProcessAlive(), getWindowsMemory(),
│   │   │                                      #   getUnixMemory(), getProcessMemory(),
│   │   │                                      #   spawnCommand()
│   │   ├── statistics.ts                      # linearRegression(), analyzeMemoryTrend(),
│   │   │                                      #   generateLeakSuspects(),
│   │   │                                      #   generateMemoryRecommendations(),
│   │   │                                      #   calculateTimingStats()
│   │   ├── profiler.ts                        # extractFunction()
│   │   └── formatters.ts                      # formatLogAnalysis(), formatProfileResult()
│   ├── standalone/
│   │   ├── index.ts                           # Barrel export
│   │   ├── types.ts                           # All standalone domain types
│   │   └── bundle-parser.ts                   # extractModules(), extractPackageName(),
│   │                                          #   generateBundleRecommendations()
│   └── testing/
│       ├── index.ts                           # Barrel export
│       ├── types.ts                           # All testing domain types
│       ├── constants.ts                       # COVERAGE_PATHS, TEST_PATTERNS
│       ├── coverage-parser.ts                 # findCoverageReport(), detectCoverageType(),
│       │                                      #   parseLcov(), parseIstanbul(),
│       │                                      #   calculateCoverageMetrics(),
│       │                                      #   extractUncoveredLines(),
│       │                                      #   extractUncoveredFunctions()
│       └── test-finder.ts                     # findTestFiles(), determineTestType(),
│                                              #   parseTestImports(), checkImportRelationship(),
│                                              #   calculatePatternConfidence()
│
├── extensions/                                # L2 — Multi-concern orchestration
│   ├── index.ts                               # Barrel export
│   ├── code-intel/
│   │   ├── index.ts                           # Barrel export
│   │   ├── dead-code.ts                       # findDeadCode()
│   │   ├── safe-delete.ts                     # checkSafeDelete()
│   │   ├── preview-edits.ts                   # validateEditsPreview()
│   │   ├── breaking-changes.ts                # detectBreakingChanges()
│   │   ├── semantic-diff.ts                   # semanticDiff()
│   │   └── api-surface.ts                     # getApiSurface()
│   ├── api/
│   │   ├── index.ts                           # Barrel export
│   │   ├── routes.ts                          # getApiRoutes()
│   │   ├── spec.ts                            # generateOpenApi()
│   │   ├── validate.ts                        # validateApiContract()
│   │   └── sync.ts                            # syncApiTypes()
│   ├── security/
│   │   ├── index.ts                           # Barrel export
│   │   ├── secrets.ts                         # scanForSecrets()
│   │   ├── permissions.ts                     # checkPermissions()
│   │   └── env-audit.ts                       # auditEnvVars()
│   ├── database/
│   │   ├── index.ts                           # Barrel export
│   │   ├── schema.ts                          # getDatabaseSchema()
│   │   ├── prisma.ts                          # getPrismaOperations()
│   │   └── query.ts                           # executeQuery(), queryDatabase()
│   ├── deps/
│   │   ├── index.ts                           # Barrel export
│   │   ├── analyze.ts                         # analyzeDependencies()
│   │   ├── circular.ts                        # findCircularDeps()
│   │   └── upgrade.ts                         # analyzeUpgrade()
│   ├── runtime/
│   │   ├── index.ts                           # Barrel export
│   │   ├── logs.ts                            # analyzeLogs()
│   │   ├── memory.ts                          # detectMemoryLeaks()
│   │   └── profile.ts                         # profileFunction()
│   ├── standalone/
│   │   ├── index.ts                           # Barrel export
│   │   ├── bundle.ts                          # analyzeBundle()
│   │   └── scaffold.ts                        # scaffoldProject()
│   └── testing/
│       ├── index.ts                           # Barrel export
│       ├── coverage.ts                        # getTestCoverage()
│       └── find-tests.ts                      # findTestsForFile()
│
└── plugins/                                   # L3 — MCP interface, thin dispatch
    ├── index.ts                               # Barrel export
    ├── server.ts                              # ProjectEngineServer class, bootstrap()
    ├── dispatch.ts                            # ToolDispatcher type, wrapDispatcher(),
    │                                          #   DISPATCH_TABLE, getDispatcher(),
    │                                          #   hasDispatcher(), listTools()
    └── schemas.ts                             # TOOL_SCHEMAS (merged from 8 schema files)
```

**Total: ~105 files** (from 68). Each has a single responsibility. The increase reflects proper separation of concerns — 8 monolithic domain modules decomposed into focused single-concern files.

---

## Dependency Graph

```
                          ┌─────────────────────────────────────────────────────────┐
                          │                     L3: plugins/                        │
                          │                                                         │
                          │  server.ts ──→ dispatch.ts ──→ schemas.ts              │
                          │     │              │                                    │
                          └─────┼──────────────┼──────────────────────────────────────┘
                                │              │
                                │              ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│                        L2: extensions/                                           │
│                                                                                  │
│  code-intel/           api/              security/          database/             │
│    dead-code.ts          routes.ts          secrets.ts         schema.ts          │
│    safe-delete.ts        spec.ts            permissions.ts     prisma.ts          │
│    preview-edits.ts      validate.ts        env-audit.ts       query.ts           │
│    breaking-changes.ts   sync.ts                                                 │
│    semantic-diff.ts                                                               │
│    api-surface.ts                                                                 │
│                                                                                  │
│  deps/                 runtime/           standalone/        testing/             │
│    analyze.ts            logs.ts            bundle.ts          coverage.ts        │
│    circular.ts           memory.ts          scaffold.ts        find-tests.ts      │
│    upgrade.ts            profile.ts                                               │
└────────┼────────────┼──────────────┼──────────────┼───────────────────────────┘
         │            │              │              │
         ▼            ▼              ▼              ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│                        L1: core/                                                 │
│                                                                                  │
│  code-intel/           api/              security/          database/             │
│    language-service.ts    types.ts           types.ts           types.ts          │
│    tsconfig.ts           detection.ts       constants.ts       constants.ts       │
│    types.ts              openapi.ts         file-utils.ts      errors.ts          │
│    constants.ts          parsers/           redaction.ts       drivers.ts         │
│    validation.ts           nextjs.ts        detection.ts       query-analysis.ts  │
│    position.ts             express.ts       risk.ts            url-parser.ts      │
│    file-utils.ts           fastify.ts       env-parser.ts      formatters.ts      │
│    ast-utils.ts            hono.ts          formatters.ts      sqlite-pool.ts     │
│    exports.ts            http.ts                               prisma-utils.ts    │
│    references.ts         validation.ts    deps/                parsers/           │
│    preview.ts            type-extraction.ts types.ts             prisma-schema.ts │
│    virtual-fs.ts         matching.ts        import-parser.ts     drizzle-schema.ts│
│    diagnostics.ts                           version-utils.ts     sql-schema.ts    │
│    type-extraction.ts  runtime/             graph.ts           executors/         │
│    entry-points.ts       types.ts           registry.ts          postgres.ts      │
│                          constants.ts       changelog.ts         mysql.ts         │
│  ai/                    time-utils.ts      file-utils.ts        sqlite.ts        │
│    analyze.ts            log-parser.ts                                            │
│  git/                   log-analysis.ts  standalone/          testing/            │
│    diff.ts               process-utils.ts   types.ts           types.ts           │
│                          statistics.ts      bundle-parser.ts   constants.ts       │
│                          profiler.ts                           coverage-parser.ts │
│                          formatters.ts                         test-finder.ts     │
└───────────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│                        L0: shared/                                               │
│                                                                                  │
│  constants.ts  config.ts  logger.ts  types.ts  response.ts  utils.ts             │
└───────────────────────────────────────────────────────────────────────────────┘
```

### Cross-Domain Dependencies (L1 → L1)

```
code-intel/breaking-changes ─→ git/diff        (getChangedFiles, getFileAtRef)
code-intel/semantic-diff    ─→ git/diff        (getChangedFilesDetailed)
code-intel/breaking-changes ─→ ai/analyze      (analyzeChangesWithLLM)
code-intel/semantic-diff    ─→ ai/analyze      (analyzeChangesWithLLM)
deps/circular               ─→ code-intel/file-utils (findSourceFiles)
database/prisma             ─→ code-intel/file-utils (findSourceFiles)
testing/find-tests          ─→ deps/import-parser    (resolveImportPath)
```

These cross-domain L1 dependencies are acceptable because they flow through `core/` barrel exports. The `code-intel/file-utils` module is particularly reusable across domains.

---

## Complete Rename Map

Quick reference for every name that changes:

| Old Name | New Name | Reason |
|----------|----------|--------|
| `getEsmDir()` | `resolveEsmDir()` | Verb-first |
| `getConfigDir()` | `resolveModuleDir()` | Was misleading — resolves module dir |
| `LogLevel: 'tool'` | `LogLevel: 'request'` | Generic for cross-engine reuse |
| `logger.tool()` | `logger.request()` | Consistent with LogLevel change |
| `ToolResponseContent` | `McpContent` | Shorter, clearly MCP protocol |
| `ToolResponse` | `McpResponse` | Pairs with McpContent |
| `ToolHandler` | `ToolDispatcher` | Dispatch signature, not business logic |
| `createSuccessResponse()` | `ok()` | Shorter, idiomatic |
| `createTextResponse()` | `text()` | Shorter |
| `createErrorResponse()` | `fail()` | Pairs with ok() |
| `createErrorFromException()` | `failFromException()` | Consistent with fail() |
| `createNotFoundResponse()` | `notFound()` | Shorter |
| `createMissingArgumentResponse()` | `missingArg()` | Shorter |
| `createInvalidArgumentResponse()` | `invalidArg()` | Shorter |
| `asHandler()` | `wrapDispatcher()` | Clarifies wrapping for dispatch |
| `handlerRegistry` | `DISPATCH_TABLE` | It's a routing table |
| `getHandler()` | `getDispatcher()` | Consistent |
| `hasHandler()` | `hasDispatcher()` | Consistent |
| `listHandlers()` | `listTools()` | Lists tool names, not handlers |
| `allSchemas` | `TOOL_SCHEMAS` | Consistent naming |
| `setupHandlers()` | `setupRoutes()` | MCP request routing |
| `setupErrorHandling()` | `setupLifecycle()` | Handles errors + signals |
| `main()` | `bootstrap()` | Matches convention |
| `DEFAULT_COMPILER_OPTIONS` | `TS_ANALYSIS_OPTIONS` | Shared constant, decouple from "default" |
| `.getPositionOffset()` | `toOffset()` | Shorter, extracted as pure function |
| `.getLineAndColumn()` | `toLineColumn()` | Shorter, extracted as pure function |
| `normalizeFilePath()` | `normalizePath()` | Generic utility |
| `makeRelativePath()` | `toRelativePath()` | More idiomatic |
| `resolveFilePath()` | `resolveProjectPath()` | Clarifies PROJECT_ROOT basis |
| `GetApiSurfaceArgs` | `ApiSurfaceArgs` | Drop redundant `Get` prefix |
| `GetApiRoutesArgs` | `ApiRoutesArgs` | Drop redundant `Get` prefix |
| `GenerateOpenApiArgs` | `OpenApiArgs` | Shorter |
| `ValidateApiContractArgs` | `ApiContractArgs` | Shorter |
| `GetDatabaseSchemaArgs` | `DatabaseSchemaArgs` | Drop redundant `Get` prefix |
| `GetPrismaOperationsArgs` | `PrismaOpsArgs` | Shorter |
| `FindCircularDepsArgs` | `CircularDepsArgs` | Shorter |
| `GetTestCoverageArgs` | `TestCoverageArgs` | Drop redundant `Get` prefix |
| `FindTestsForFileArgs` | `FindTestsArgs` | Shorter |
| `SKIP_PATTERNS` (security) | `SECURITY_SKIP_PATTERNS` | Disambiguate from shared SKIP_DIRECTORIES |
| `scanDirectory()` (env) | `scanDirectoryForEnv()` | Disambiguate |
| `validateValue()` (env) | `validateEnvValue()` | Disambiguate |
| `formatAsMarkdown()` (env) | `formatEnvAudit()` | Disambiguate |
| `formatResponse()` (schema) | `formatSchemaResult()` | Disambiguate |
| `analyzeFile()` (prisma) | `analyzePrismaFile()` | Disambiguate |
| `generateRecommendations()` (prisma) | `generatePrismaRecommendations()` | Disambiguate |
| `generateRecommendations()` (memory) | `generateMemoryRecommendations()` | Disambiguate |
| `generateRecommendations()` (bundle) | `generateBundleRecommendations()` | Disambiguate |
| `generateWarnings()` (upgrade) | `generateUpgradeWarnings()` | Disambiguate |
| `analyzeTrend()` | `analyzeMemoryTrend()` | Disambiguate |
| `generateSuspects()` | `generateLeakSuspects()` | Disambiguate |
| `calculateStats()` (profile) | `calculateTimingStats()` | Disambiguate |
| `calculateMetrics()` (coverage) | `calculateCoverageMetrics()` | Disambiguate |
| `formatResult()` (logs) | `formatLogAnalysis()` | Disambiguate |
| `formatResult()` (profile) | `formatProfileResult()` | Disambiguate |
| `parseImports()` (find-tests) | `parseTestImports()` | Disambiguate from deps/import-parser |
| `findFiles()` (routes) | `globFiles()` | Generic utility |
| `getLineNumber()` (routes) | `offsetToLine()` | Generic utility |
| `analyzeWithLLM()` | `analyzeChangesWithLLM()` | Clarifies scope |
| `getChangedFilesWithContent()` | `getChangedFilesDetailed()` | Shorter, clearer |
| `handleFindDeadCode()` | `findDeadCode()` | Drop `handle` |
| `handleSafeDeleteCheck()` | `checkSafeDelete()` | Drop `handle` |
| `handleValidateEditsPreview()` | `validateEditsPreview()` | Drop `handle` |
| `handleDetectBreakingChanges()` | `detectBreakingChanges()` | Drop `handle` |
| `handleSemanticDiff()` | `semanticDiff()` | Drop `handle` |
| `handleGetApiSurface()` | `getApiSurface()` | Drop `handle` |
| `handleGetApiRoutes()` | `getApiRoutes()` | Drop `handle` |
| `handleGenerateOpenApi()` | `generateOpenApi()` | Drop `handle` |
| `handleValidateApiContract()` | `validateApiContract()` | Drop `handle` |
| `handleSyncApiTypes()` | `syncApiTypes()` | Drop `handle` |
| `handleScanForSecrets()` | `scanForSecrets()` | Drop `handle` |
| `handleCheckPermissions()` | `checkPermissions()` | Drop `handle` |
| `handleEnvAudit()` | `auditEnvVars()` | Drop `handle`; verb clarifies |
| `handleGetDatabaseSchema()` | `getDatabaseSchema()` | Drop `handle` |
| `handleGetPrismaOperations()` | `getPrismaOperations()` | Drop `handle` |
| `handleQueryDatabase()` | `queryDatabase()` | Drop `handle` |
| `handleAnalyzeDependencies()` | `analyzeDependencies()` | Drop `handle` |
| `handleFindCircularDeps()` | `findCircularDeps()` | Drop `handle` |
| `handleUpgradePackage()` | `analyzeUpgrade()` | Drop `handle`; verb clarifies |
| `handleLogAnalyzer()` | `analyzeLogs()` | Drop `handle`; verb clarifies |
| `handleDetectMemoryLeaks()` | `detectMemoryLeaks()` | Drop `handle` |
| `handleProfileFunction()` | `profileFunction()` | Drop `handle` |
| `handleAnalyzeBundle()` | `analyzeBundle()` | Drop `handle` |
| `handleScaffoldProject()` | `scaffoldProject()` | Drop `handle` |
| `handleGetTestCoverage()` | `getTestCoverage()` | Drop `handle` |
| `handleFindTestsForFile()` | `findTestsForFile()` | Drop `handle` |

---

## Element Migration Summary

| Target File | Elements (by #) | Count |
|-------------|----------------|-------|
| **L0 shared/constants.ts** | 1, 2, 27, 28 | 4 |
| **L0 shared/config.ts** | 5, 6, 7, 8 | 4 |
| **L0 shared/logger.ts** | 9, 10, 11, 12, 13, 15, 16 | 7 |
| **L0 shared/types.ts** | 29, 30 | 2 |
| **L0 shared/response.ts** | 31, 32, 33, 34, 35, 36, 37 | 7 |
| **L0 shared/utils.ts** | 3, 4, 14, 38, 39, 40, 41, 42, 88, 94, 95, 96, 181, 182, 185, 196, 197, 198, 204, 268, 341, 348, 362, 363, 364, 370 | 26 |
| **L1 core/code-intel/types.ts** | 76, 77, 78, 100, 101, 106, 107, 108, 118, 119, 120, 124, 125, 136, 137, 144, 145, 151, 152 | 19 |
| **L1 core/code-intel/constants.ts** | 81, 97, 109, 153 | 4 |
| **L1 core/code-intel/language-service.ts** | 79, 80, 82, 83, 86, 87 | 6 |
| **L1 core/code-intel/tsconfig.ts** | 89, 90 | 2 |
| **L1 core/code-intel/position.ts** | 84, 85 | 2 |
| **L1 core/code-intel/validation.ts** | 102, 103, 104, 105 | 4 |
| **L1 core/code-intel/file-utils.ts** | 111, 112, 113 | 3 |
| **L1 core/code-intel/ast-utils.ts** | 114, 159, 160 | 3 |
| **L1 core/code-intel/exports.ts** | 115, 148, 161, 162 | 4 |
| **L1 core/code-intel/references.ts** | 116, 121, 122, 147 | 4 |
| **L1 core/code-intel/preview.ts** | 98, 99 | 2 |
| **L1 core/code-intel/virtual-fs.ts** | 126, 127, 131 | 3 |
| **L1 core/code-intel/diagnostics.ts** | 132, 133, 134 | 3 |
| **L1 core/code-intel/type-extraction.ts** | 140, 141 | 2 |
| **L1 core/code-intel/entry-points.ts** | 157 | 1 |
| **L1 core/ai/analyze.ts** | 142 | 1 |
| **L1 core/git/diff.ts** | 138, 139, 146 | 3 |
| **L1 core/api/types.ts** | 164, 165, 166, 184, 200, 206, 207, 208, 209 | 9 |
| **L1 core/api/constants.ts** | 210 | 1 |
| **L1 core/api/detection.ts** | 167 | 1 |
| **L1 core/api/openapi.ts** | 186, 187, 188, 189, 190, 191, 192, 193, 203 | 9 |
| **L1 core/api/http.ts** | 201 | 1 |
| **L1 core/api/validation.ts** | 202 | 1 |
| **L1 core/api/type-extraction.ts** | 194, 195, 211, 214, 215 | 5 |
| **L1 core/api/matching.ts** | 212, 213, 216 | 3 |
| **L1 core/api/parsers/nextjs.ts** | 168, 169, 170, 171, 172, 173 | 6 |
| **L1 core/api/parsers/express.ts** | 174, 175, 176 | 3 |
| **L1 core/api/parsers/fastify.ts** | 177, 178 | 2 |
| **L1 core/api/parsers/hono.ts** | 179, 180 | 2 |
| **L1 core/security/types.ts** | 218, 219, 229, 230, 231, 232, 240 | 7 |
| **L1 core/security/constants.ts** | 220, 221, 227, 241, 243 | 5 |
| **L1 core/security/file-utils.ts** | 223, 224 | 2 |
| **L1 core/security/redaction.ts** | 222 | 1 |
| **L1 core/security/detection.ts** | 225, 226 | 2 |
| **L1 core/security/risk.ts** | 237, 238 | 2 |
| **L1 core/security/env-parser.ts** | 244, 245, 246, 247, 248 | 5 |
| **L1 core/security/formatters.ts** | 249 | 1 |
| **L1 core/database/types.ts** | 251, 252, 253, 254, 255, 261, 275, 276, 280, 281, 282 | 11 |
| **L1 core/database/constants.ts** | 264, 265 | 2 |
| **L1 core/database/errors.ts** | 283, 284, 285, 286 | 4 |
| **L1 core/database/drivers.ts** | 287, 288 | 2 |
| **L1 core/database/query-analysis.ts** | 289, 290 | 2 |
| **L1 core/database/url-parser.ts** | 291 | 1 |
| **L1 core/database/formatters.ts** | 259, 292 | 2 |
| **L1 core/database/sqlite-pool.ts** | 277, 278, 279 | 3 |
| **L1 core/database/prisma-utils.ts** | 267, 269, 270, 271, 272, 273 | 6 |
| **L1 core/database/parsers/** | 256, 257, 258 | 3 |
| **L1 core/database/executors/** | 295, 296, 297 | 3 |
| **L1 core/deps/types.ts** | 298, 302, 303, 317 | 4 |
| **L1 core/deps/constants.ts** | 309 | 1 |
| **L1 core/deps/import-parser.ts** | 299, 310, 311 | 3 |
| **L1 core/deps/version-utils.ts** | 300, 318, 319, 320, 321, 322 | 6 |
| **L1 core/deps/graph.ts** | 312, 313, 314, 315 | 4 |
| **L1 core/deps/registry.ts** | 323 | 1 |
| **L1 core/deps/changelog.ts** | 324, 325, 326 | 3 |
| **L1 core/deps/file-utils.ts** | 307 | 1 |
| **L1 core/runtime/types.ts** | 328, 329, 345, 346, 347, 359, 360 | 7 |
| **L1 core/runtime/constants.ts** | 332 | 1 |
| **L1 core/runtime/time-utils.ts** | 330 | 1 |
| **L1 core/runtime/log-parser.ts** | 331, 333, 334, 335, 336, 337 | 6 |
| **L1 core/runtime/log-analysis.ts** | 338, 339, 340, 342 | 4 |
| **L1 core/runtime/process-utils.ts** | 349, 350, 351, 352, 357 | 5 |
| **L1 core/runtime/statistics.ts** | 353, 354, 355, 356, 361 | 5 |
| **L1 core/runtime/profiler.ts** | 366 | 1 |
| **L1 core/runtime/formatters.ts** | 343, 365 | 2 |
| **L1 core/standalone/types.ts** | 368, 369, 375 | 3 |
| **L1 core/standalone/bundle-parser.ts** | 371, 372, 373 | 3 |
| **L1 core/testing/types.ts** | 377, 387, 388 | 3 |
| **L1 core/testing/constants.ts** | 378, 389 | 2 |
| **L1 core/testing/coverage-parser.ts** | 379, 380, 381, 382, 383, 384, 385 | 7 |
| **L1 core/testing/test-finder.ts** | 390, 391, 392, 394, 395 | 5 |
| **L2 extensions/code-intel/** | 117, 123, 135, 143, 150, 163 | 6 |
| **L2 extensions/api/** | 183, 199, 205, 217 | 4 |
| **L2 extensions/security/** | 228, 239, 250 | 3 |
| **L2 extensions/database/** | 260, 274, 293, 294 | 4 |
| **L2 extensions/deps/** | 301, 316, 327 | 3 |
| **L2 extensions/runtime/** | 344, 358, 367 | 3 |
| **L2 extensions/standalone/** | 374, 376 | 2 |
| **L2 extensions/testing/** | 386, 396 | 2 |
| **L3 plugins/server.ts** | 48-55 | 1 class + bootstrap |
| **L3 plugins/dispatch.ts** | 19, 43, 44, 45, 46, 47 | 6 |
| **L3 plugins/schemas.ts** | 58-66 | 1 (merged from 9) |
| **DELETED (duplicates)** | 17, 18, 20-26, 67-75, 91-93, 110, 128-130, 149, 154-156, 158, 233-236, 242, 262, 263, 266, 304-306, 308, 393 | 39 |

**396 elements inventoried. ~85 renamed. 39 deleted (duplicates/re-exports). 68 → ~105 files.**

---

## Rewiring: Import Path Changes

| Current Import | New Import |
|---------------|------------|
| `'./config.js'` → SERVER_NAME, SERVER_VERSION | `'../shared/constants.js'` |
| `'./config.js'` → PLUGIN_ROOT, PROJECT_ROOT | `'../shared/config.js'` |
| `'./logging.js'` → logger | `'../shared/logger.js'` |
| `'./types.js'` → ToolResponse | `'../shared/types.js'` → McpResponse |
| `'./types.js'` → ToolHandler | `'./dispatch.js'` → ToolDispatcher (within plugins) |
| `'./utils.js'` → fileExists, readJsonFile, safeExec | `'../shared/utils.js'` |
| `'./utils.js'` → success, error | `'../shared/response.js'` → ok, fail |
| `'../shared/response.js'` → createSuccessResponse | `'../../shared/response.js'` → ok |
| `'../shared/response.js'` → createErrorResponse | `'../../shared/response.js'` → fail |
| `'../shared/response.js'` → createTextResponse | `'../../shared/response.js'` → text |
| `'../shared/constants.js'` → SOURCE_EXTENSIONS | `'../../shared/constants.js'` (deeper nesting) |
| `'./shared/language-service.js'` | `'../../core/code-intel/language-service.js'` |
| `'./shared/lsp-utils.js'` → normalizeFilePath | `'../../shared/utils.js'` → normalizePath |
| `'./shared/lsp-utils.js'` → getLinePreview | `'../../core/code-intel/preview.js'` |
| `'./shared/lsp-utils.js'` → createSuccessResponse | `'../../shared/response.js'` → ok |
| `'./shared/validation.js'` | `'../../core/code-intel/validation.js'` |
| Handler imports from domain barrels | Direct imports from `'../../extensions/{domain}/{tool}.js'` |
| `'./schemas/index.js'` | `'./schemas.js'` (within plugins) |
| `'./handlers/index.js'` → handlerRegistry | `'./dispatch.js'` → DISPATCH_TABLE |
| `'../config.js'` → PROJECT_ROOT | `'../../shared/config.js'` |
| `'fs'` (sync methods) | `'../../shared/utils.js'` (async equivalents) |
| Internal dead-code SOURCE_EXTENSIONS | `'../../shared/constants.js'` → SOURCE_EXTENSIONS |
| Internal dead-code isSourceFile/findSourceFiles | `'../../core/code-intel/file-utils.js'` |
| Internal dead-code getExportKind | `'../../core/code-intel/ast-utils.js'` |
| Internal preview-edits findTsConfig/readTsConfig | `'../../core/code-intel/tsconfig.js'` |
| Internal preview-edits DEFAULT_COMPILER_OPTIONS | `'../../core/code-intel/constants.js'` → TS_ANALYSIS_OPTIONS |
| Internal breaking-changes analyzeWithLLM | `'../../core/ai/analyze.js'` → analyzeChangesWithLLM |
| Internal breaking-changes getChangedFiles | `'../../core/git/diff.js'` |
| Internal prisma normalizeFilePath/makeRelativePath | `'../../shared/utils.js'` → normalizePath/toRelativePath |
| Internal prisma findSourceFiles | `'../../core/code-intel/file-utils.js'` |
| Internal secrets/permissions shouldSkip/isScannable | `'../../core/security/file-utils.js'` |
| Internal find-tests resolveModulePath | `'../../core/deps/import-parser.js'` → resolveImportPath |
