# Project Engine — Deep Dive

Version: 2.0.0 | 26 tools | 68 source files

---

## Overview

The project-engine is the largest and most comprehensive MCP server in the GoodVibes plugin. It is the **project-wide intelligence layer** — providing deep, cross-cutting analysis of TypeScript/JavaScript projects that requires understanding the entire codebase rather than individual files.

The server consolidates what were previously two separate engines (`project-engine` and `analysis-engine`) into a single MCP server with a consistent `project_*` naming convention and domain-based organization. It exposes 26 tools across 8 domains covering everything from dead code detection and breaking-change analysis to live database queries, secret scanning, and runtime memory profiling.

Key capabilities:
- **Code intelligence**: Uses the TypeScript Language Service API to perform compiler-grade analysis — finding unused exports, checking safe deletion, detecting type errors introduced by proposed edits before they are written to disk
- **API analysis**: Discovers routes across Next.js, Express, Fastify, and Hono; generates OpenAPI 3.0 specs; validates live API contracts against specs; detects frontend/backend type drift
- **Database tools**: Parses Prisma/Drizzle/SQL schemas into a unified model; executes queries against PostgreSQL, MySQL, and SQLite; analyzes Prisma usage for N+1 patterns
- **Security scanning**: Regex-based secret detection with severity tiers; permission/API surface auditing; `.env` consistency analysis
- **Runtime analysis**: Live memory profiling via process metrics with linear-regression trend detection; function benchmarking with statistical timing; log parsing and anomaly detection
- **Dependency management**: Import graph analysis; DFS-based circular dependency detection; npm upgrade intelligence with changelog parsing
- **Testing**: Coverage report parsing (LCOV, Istanbul/c8); test-to-source file relationship mapping
- **Scaffolding**: Template-based project generation; bundle size analysis with gzip estimation

---

## Architecture

### MCP Server Structure

```
project-engine/
  src/
    index.ts                    # ProjectEngineServer class, MCP SDK wiring
    config.ts                   # SERVER_NAME, SERVER_VERSION, path resolution
    logging.ts                  # stderr logger, startTimer()
    types.ts                    # ToolHandler type alias
    utils.ts                    # Legacy utils (kept for compatibility)
    schemas/                    # MCP tool schemas (generated from YAML definitions)
      index.ts                  # allSchemas barrel export
      api.ts, code-intelligence.ts, database.ts, deps.ts,
      runtime.ts, security.ts, standalone.ts, testing.ts
    shared/
      constants.ts              # SOURCE_EXTENSIONS, SKIP_DIRECTORIES
      response.ts               # createSuccessResponse, createErrorResponse, etc.
      utils.ts                  # fileExists, readJsonFile, safeExec, detectPackageManager, fetchUrl
    handlers/
      index.ts                  # Handler registry Map<string, ToolHandler> — 26 entries
      api/                      # 4 handlers
      code-intelligence/        # 6 handlers + shared/language-service.ts
      database/                 # 3 handlers + query-database/ subdirectory
      deps/                     # 3 handlers
      runtime/                  # 3 handlers
      security/                 # 3 handlers
      standalone/               # 2 handlers
      test/                     # 2 handlers
```

### Server Bootstrap

`ProjectEngineServer` wraps the `@modelcontextprotocol/sdk` `Server` class. On startup it registers two request handlers:

1. **`ListToolsRequestSchema`** — returns `allSchemas` (the compiled array of 26 MCP tool definitions)
2. **`CallToolRequestSchema`** — dispatches to the handler registry via `getHandler(name)`, wraps all handler calls in try/catch, re-throws as `McpError`

All logging goes to **stderr** (not stdout) to keep the MCP stdio transport clean.

### Handler Registry

The registry is a `Map<string, ToolHandler>` in `handlers/index.ts`. Each handler function is wrapped by `asHandler()` which normalizes sync/async return values to `Promise<ToolResponse>`. Tool names are the string keys exactly matching the YAML definition `name` fields.

### Response Protocol

All handlers return `ToolResponse: { content: [{ type: 'text', text: string }], isError?: boolean }`. Five helpers in `shared/response.ts`:

| Helper | Purpose |
|--------|---------|
| `createSuccessResponse(data)` | Serialize `data` as pretty-printed JSON |
| `createTextResponse(text)` | Return raw text (markdown, formatted output) |
| `createErrorResponse(message, context?)` | Set `isError: true`, serialize error JSON |
| `createErrorFromException(error, prefix?)` | Extract `.message` from unknown error |
| `createNotFoundResponse(type, id)` | Convenience not-found error |

---

## Tools by Category

### Code Intelligence (6 tools)

All six tools leverage the TypeScript Language Service (via `shared/language-service.ts`) for compiler-grade analysis.

#### `project_code_dead`
**Find dead/unused exports across the project.**

Params: `path?` (directory to scan), `include_tests?` (default false)

Return: `{ dead_exports: DeadExport[], count, files_analyzed }`

Each `DeadExport` includes: `file`, `name`, `kind` (function/class/interface/etc.), `line`, `exported_from`.

**Implementation**: Traverses source files with `findSourceFiles()`, calls `findExportsInFile()` to collect all exported symbols using the TS AST (`ts.ScriptElementKind`), then calls `countReferences()` via `languageServiceManager.getServiceForFile()` + `service.getReferencesAtPosition()`. An export is dead when its reference count (excluding the declaration itself and test files when `include_tests=false`) is zero.

---

#### `project_code_safe_delete`
**Check if a specific symbol at file:line:column can be safely deleted.**

Params: `file` (required), `line` (1-based), `column` (0-based)

Return: `{ safe: boolean, external_references: ReferenceLocation[], self_references: ReferenceLocation[], reason: string, symbol? }`

**Implementation**: Resolves the symbol at position using `service.getReferencesAtPosition()`. References in the same file and on the same line as the declaration are classified as `self_references`; all others are `external_references`. Safe = `external_references.length === 0`. Each reference includes file, line, column, and a 120-char line preview.

---

#### `project_code_preview_edits`
**Validate proposed code edits without writing to disk — TypeScript error checking in a virtual filesystem.**

Params: `edits: ProposedEdit[]` where each edit has `{ file, old_text?, new_text?, content? }`

Return: `{ safe: boolean, summary: string, new_errors: NewError[], edit_results: EditResult[] }`

**Implementation highlight**: Uses a `VirtualFileSystem` class that stores modified file content in memory. Creates a `ts.LanguageServiceHost` backed by the VFS for all file reads. Runs diagnostics on the baseline (unmodified) files, then applies each edit in sequence and re-runs diagnostics. New errors are those present after edits but not before — each is attributed to the `edit_index` that introduced it. This means AI agents can validate TypeScript correctness before committing any changes to disk.

```typescript
class VirtualFileSystem {
  private files = new Map<string, string>();
  getContent(filePath: string): string | undefined // reads from VFS or real FS
  setContent(filePath: string, content: string): void
  getModifiedFiles(): string[]
}
```

---

#### `project_code_breaking`
**Detect breaking API changes between two git refs.**

Params: `before_ref` (required), `after_ref?` (default HEAD), `path?`, `timeout?`, `model?` (haiku/sonnet/opus)

Return: `{ breaking_changes: BreakingChange[], non_breaking_changes: NonBreakingChange[], severity: 'none'|'minor'|'major' }`

Each `BreakingChange`: `file`, `symbol`, `change_type`, `before`, `after`, `impact`, `migration`.

**Implementation**: Gets changed files via `git diff --name-status` between the two refs, fetches per-file diffs with `git show`, extracts type signatures from both versions using the TS compiler, then passes the diff + type information to an LLM (Anthropic API via `analyzeWithLLM()`) to classify changes as breaking/non-breaking with migration guidance. Supports configurable timeout and model selection.

---

#### `project_code_semantic_diff`
**Summarize the semantic meaning of code changes between git refs using LLM analysis.**

Params: `before_ref`, `after_ref?`, `file?` (filter to specific file), `timeout?`, `model?`

Return: `{ changes: SemanticChange[], overall_summary: string }`

Each `SemanticChange`: `file`, `summary`, `semantic_impact`, `affected_callers: string[]`, `risk_level: 'low'|'medium'|'high'`.

**Implementation**: Similar pipeline to `project_code_breaking` but focused on semantic understanding rather than type-level breaking changes. Additionally calls `findReferencingFiles()` which uses the TS language service to find files that import the changed files — these are included as `affected_callers` in the prompt context for more accurate impact assessment.

---

#### `project_code_surface`
**Extract the public and internal API surface of a project.**

Params: `path?`, `entry_points?` (explicit list of entry files)

Return: `{ public_api: PublicApiExport[], internal_api: InternalApiExport[], entry_points: string[] }`

**Implementation**: Detects entry points by looking for `index.ts/js`, `main.ts/js`, `mod.ts/js` files, or by checking `package.json` `exports`/`main` fields. Public API = exports reachable from entry points (traced via `collectPublicExports()`). Internal API = all other exported symbols (from `collectAllExports()`). Uses `ts.TypeChecker.typeToString()` for type signatures, extracts JSDoc comments via AST traversal, classifies symbols by `ts.ScriptElementKind`.

---

### API Tools (4 tools)

#### `project_api_routes`
**Discover all HTTP routes from framework files.**

Params: `path?`, `framework?` (nextjs | express | fastify | hono | auto)

Return: `{ framework: string, routes: ApiRoute[], count: number }`

Each `ApiRoute`: `method`, `path`, `handler_file`, `handler_line`, `middleware?`.

**Implementation**: Auto-detection reads `package.json` dependencies to identify the framework. Per-framework parsers:
- **Next.js App Router**: Scans `app/**/route.ts` files, detects exported `GET`, `POST`, etc. functions, converts file paths to URL paths (handling `[param]` → `{param}` and `(group)` notation)
- **Next.js Pages Router**: Scans `pages/api/**`, detects HTTP methods via regex patterns on file content
- **Express**: Scans for `router.get/post/put/delete/patch()` and `app.*()` patterns, extracts middleware array from call arguments
- **Fastify**: Scans for `fastify.route()`, `fastify.get/post()` patterns
- **Hono**: Scans for `app.get/post/put/delete/patch()` patterns

---

#### `project_api_spec`
**Generate OpenAPI 3.0.3 specification from discovered routes.**

Params: `output_path?`, `title?`, `version?`, `description?`, `server_url?`, `include_examples?`, `format?` (json | yaml)

Return: `{ success, output_path, spec_version, routes_documented, endpoints: EndpointSummary[], missing_types, warnings }`

**Implementation**: Calls the routes handler internally, then for each route calls `parseHandlerTypes()` which reads the handler file and uses regex to extract TypeScript interface definitions for request/response bodies. The `typeToJsonSchema()` function converts TypeScript type strings (primitives, arrays, `Record<K,V>`, unions) to JSON Schema objects. Extracts path parameters from route patterns (e.g. `[id]` → required path param). A custom `toYaml()` serializer handles YAML output without external dependencies.

---

#### `project_api_validate`
**Validate a live API against an OpenAPI spec by making real HTTP requests.**

Params: `spec_path` (required), `base_url` (required), `endpoints?`, `include_examples?`, `timeout?`, `auth_header?`

Return: `{ valid, endpoints_validated, endpoints_passed, endpoints_failed, issues: ValidationIssue[], summary }`

Each `ValidationIssue`: `endpoint`, `method`, `type` (status_code | schema | network | timeout), `message`, `expected?`, `actual?`, `json_path?`.

**Implementation**: Reads and parses the OpenAPI spec (JSON or YAML via `js-yaml`), iterates over path/operation pairs, makes HTTP requests using a custom `makeRequest()` function with timeout support, validates response status codes and body schemas against spec definitions using a recursive `validateSchema()` function that handles `$ref` resolution, `oneOf/anyOf/allOf`, enums, and nested objects.

---

#### `project_api_sync`
**Detect type drift between backend API route handlers and frontend fetch calls.**

Params: `backend_path?`, `frontend_path?`, `api_pattern?`, `auto_fix?`

Return: `{ in_sync: boolean, backend_routes: BackendRoute[], frontend_calls: FrontendCall[], drifts: TypeDrift[], summary: SyncSummary }`

Each `TypeDrift`: `endpoint`, `backend_file`, `frontend_file`, `frontend_line`, `issue` (missing_type | type_mismatch | endpoint_not_found), `backend_type?`, `frontend_type?`, `diff?`, `suggested_fix?`.

**Implementation**: Parses backend routes with TypeScript AST to extract request/response type annotations from handler function signatures. Scans frontend files for `fetch()`, `axios`, or custom API client calls using pattern matching, then uses the TS language service at each call site to infer the expected type. `compareTypes()` normalizes type strings before comparison to reduce false positives from whitespace/alias differences.

---

### Database Tools (3 tools)

#### `project_db_schema`
**Extract database schema from Prisma, Drizzle, or SQL migration files.**

Params: `path?`

Return: `{ source: 'prisma'|'drizzle'|'sql'|'unknown', tables: DatabaseTable[], relations: DatabaseRelation[], raw_path: string }`

Each `DatabaseTable`: `name`, `columns: DatabaseColumn[]`, `indexes: DatabaseIndex[]`.
Each `DatabaseColumn`: `name`, `type`, `nullable`, `primary_key`, `references?`.
Each `DatabaseRelation`: `from_table`, `from_column`, `to_table`, `to_column`, `type` (one-to-one | one-to-many | many-to-many).

**Implementation — three parsers:**

- **Prisma** (`parsePrismaForUnifiedSchema`): Parses `.prisma` file text with regex to find `model` blocks, extract field definitions, and detect `@relation()` annotations. Maps Prisma types (String, Int, DateTime, etc.) to standard SQL types.
- **Drizzle** (`parseDrizzleForUnifiedSchema`): Parses TypeScript schema files, detecting `pgTable()`, `mysqlTable()`, `sqliteTable()` calls and their column definitions. Extracts foreign key references from `references()` calls.
- **SQL** (`parseSQLForUnifiedSchema`): Parses raw SQL migration files using regex to extract `CREATE TABLE` statements, column definitions with `NOT NULL`, `PRIMARY KEY`, `REFERENCES` clauses, and `CREATE INDEX` statements.

Auto-detection probes: `prisma/schema.prisma`, Drizzle schema files (`drizzle.config.ts`, `src/db/schema.*`), SQL migration directories.

---

#### `project_db_query`
**Execute SQL queries against PostgreSQL, MySQL, or SQLite databases.**

Params: `query` (required), `database_url?`, `readonly?` (default true), `limit?` (default 100), `format?` (json | table), `explain?`, `params?`

Return: `{ success, database_type, rows, row_count, columns: ColumnInfo[], execution_time_ms, query_executed, explain_output?, truncated?, error?, changes?, last_insert_rowid? }`

**Implementation — query analysis layer:**

`query-analysis.ts` provides safety functions:
- `isWriteOperation(query)` — detects INSERT/UPDATE/DELETE/DROP/CREATE/ALTER/TRUNCATE/etc. against query text stripped of comments
- `isSelectQuery(query)` — validates query is a SELECT/WITH/EXPLAIN/PRAGMA/SHOW
- `addLimitClause(query, limit)` — appends LIMIT clause to SELECT queries that don't already have one

**Three database executors:**

| Executor | Driver | Notes |
|----------|--------|-------|
| PostgreSQL | `pg` (dynamic import) | Maps OID type codes to SQL type names via `getPostgresTypeName()` |
| MySQL | `mysql2/promise` (dynamic import) | |
| SQLite | `sql.js` (bundled) | Supports parameterized queries; returns `changes` + `lastInsertRowid` for writes |

The `url-parser.ts` module parses connection URLs (`postgresql://`, `mysql://`, `sqlite:`) into `DatabaseConnectionInfo` structs. The `drivers.ts` module handles dynamic driver imports with graceful error messages when drivers are not installed.

---

#### `project_db_prisma`
**Analyze Prisma client usage — operations, model usage statistics, and N+1 detection.**

Params: `path?`, `include_n1_detection?` (default true)

Return: `{ operations: PrismaOperation[], models_used: ModelUsage[], n1_patterns: N1Pattern[], recommendations: string[] }`

Each `N1Pattern`: `file`, `line`, `description`, `suggestion`, `severity` (low | medium | high).

**Implementation**: Uses the TypeScript compiler to parse source files that `import` or `require` Prisma. Walks the AST looking for `CallExpression` nodes matching `prisma.MODEL.OPERATION()` patterns (24 Prisma operations tracked: `findUnique`, `findMany`, `create`, `update`, `delete`, `upsert`, etc.). `isInsideLoop()` walks up the AST ancestor chain to detect query calls inside `for`, `forEach`, `map`, `filter`, etc. loops — the primary N+1 signal. `hasRelationInclusion()` checks for `include:` or `select:` with nested objects, which can also trigger N+1 if not batched. Generates actionable recommendations based on detected patterns.

---

### Dependencies Tools (3 tools)

#### `project_deps_analyze`
**Analyze package dependencies — usage, outdated status, and unused packages.**

Params: `path?`, `check_updates?` (default false, hits npm registry), `include_dev?` (default false)

Return: `{ dependencies: DependencyInfo[], summary: { total, used, unused, outdated } }`

Each `DependencyInfo`: `name`, `declared_version`, `used: boolean`, `import_count`, `latest_version?`, `outdated?`.

**Implementation**: Reads `package.json` to get declared dependencies, scans all source files to extract import statements via regex (handles `import ... from`, `require()`, dynamic `import()`, and `export ... from`). Cross-references to determine which packages are actually imported. When `check_updates=true`, fetches latest versions from `registry.npmjs.org/-/package/{name}/dist-tags` and compares using `semver`-style major/minor comparison.

---

#### `project_deps_circular`
**Find circular import dependencies using depth-first search.**

Params: `path?`, `include_node_modules?` (default false)

Return: `{ cycles: Cycle[], count, affected_files: string[] }`

Each `Cycle`: `path: string[]` (the cycle as ordered file array), `length`.

**Implementation**: Builds an import graph `Map<file, string[]>` by parsing all source files with four regex patterns covering ES6 imports, re-exports, `require()`, and dynamic `import()`. `resolveImportPath()` handles relative paths and TypeScript path aliases, trying all supported extensions. Uses a **DFS with three-color marking** (`Color.White/Gray/Black`) — Gray nodes are currently on the stack, so a back-edge to a Gray node is a cycle. `createCycleSignature()` normalizes cycles by rotation to canonical form for deduplication.

---

#### `project_deps_upgrade`
**Analyze and optionally apply package upgrades with changelog and breaking change detection.**

Params: `package` (required), `target_version?` (default 'latest'), `include_changelog?`, `dry_run?`, `run_tests_after?`, `path?`

Return: `{ package, current_version, target_version, is_major_bump, changelog_summary?, release_notes_url?, breaking_changes, dependencies_affected, upgrade_applied, test_results?, rollback_command, warnings }`

**Implementation**: Fetches npm metadata from `registry.npmjs.org/{package}` to get version list and repository info. Attempts to fetch CHANGELOG.md from the GitHub repository. `parseBreakingChanges()` scans the changelog between current and target versions for section headers containing "breaking", "BREAKING CHANGE", "MIGRATION", or "incompatible". `summarizeChangelog()` extracts the relevant version section. `findDependents()` scans `node_modules` for packages that depend on the target package. `executeUpgrade()` runs the appropriate package manager install command. Provides rollback command using the original version.

---

### Runtime Tools (3 tools)

#### `project_runtime_memory`
**Profile memory usage of a running process or command over time.**

Params: `target` ('pid' | 'command'), `pid?`, `command?`, `duration_seconds?` (default 30), `snapshot_interval_ms?` (default 1000), `threshold_mb?` (default 50), `cwd?`

Return: `{ leak_detected, target, duration_seconds, snapshots: MemorySnapshot[], analysis: MemoryAnalysis, suspects?, recommendations }`

`MemoryAnalysis`: `initial_heap_mb`, `final_heap_mb`, `heap_growth_mb`, `growth_rate_mb_per_minute`, `trend` (stable | growing | declining), `linear_regression: { slope, intercept, r_squared }`.

**Implementation**: For PID targets, reads memory via OS-specific commands:
- **Unix/Linux**: `ps -o rss= -p {pid}` (RSS in KB)
- **Windows**: `wmic process where processid={pid} get WorkingSetSize`

For command targets, spawns the process with `child_process.spawn()` and polls its PID. Takes snapshots at the specified interval, then runs **linear regression** (`linearRegression()` implements ordinary least squares) on the heap_used series. Leak detection: `growth_rate > threshold_mb/minute` and `r_squared > 0.6` and `heap_growth > threshold_mb`. `generateSuspects()` maps growth patterns to likely causes (event listeners, closures, caches, etc.).

---

#### `project_runtime_profile`
**Benchmark a specific function with statistical timing analysis.**

Params: `file` (required), `function_name` (required), `inputs: unknown[]` (required), `iterations?` (default 1000), `warmup?` (default 10), `capture_memory?`, `timeout?`

Return: `{ function_name, file, iterations, warmup_iterations, timing: TimingStats, memory?, result_sample?, error? }`

`TimingStats`: `mean_ms`, `median_ms`, `p95_ms`, `p99_ms`, `min_ms`, `max_ms`, `std_dev_ms`, `total_ms`.

**Implementation**: `importModule()` uses ESM dynamic `import()` to load the target file, falling back to CJS `require()`. `extractFunction()` traverses the module export graph (supporting named exports, default exports, and nested paths like `module.utils.fn`). Runs `warmup` iterations discarded from stats, then `iterations` timed with `performance.now()`. `calculateStats()` sorts timing array and computes percentiles, standard deviation. Memory capture snapshots `process.memoryUsage()` before/after the run.

---

#### `project_runtime_logs`
**Parse and analyze log files or command output with pattern matching and anomaly detection.**

Params: `source` ('file' | 'command'), `path?`, `command?`, `duration_seconds?`, `tail_lines?`, `structured?`, `patterns?`, `time_window?`, `cwd?`

Return: `{ entries_analyzed, time_range, format_detected, levels: {debug, info, warn, error, unknown}, errors: GroupedMessage[], warnings: GroupedMessage[], patterns_matched, anomalies: Anomaly[], rate_analysis?, source_info }`

**Implementation**: Detects whether logs are JSON-structured or plain text by sampling the first 50 lines. Parses timestamps using 5 regex patterns (ISO 8601, syslog, Apache/Nginx, Unix epoch, custom bracket formats). For plain-text logs, extracts level from common patterns like `[LEVEL]`, `LEVEL:`, `- LEVEL -`. `groupMessages()` normalizes messages by stripping dynamic parts (UUIDs, numbers, timestamps) then groups identical normalized forms, tracking first/last occurrence and preserving a sample stack trace. `detectAnomalies()` identifies spikes (sudden error rate increase), gaps (time periods with no log entries), and new error types. For command sources, `captureCommand()` spawns the process with a timeout and collects stdout/stderr.

---

### Security Tools (3 tools)

#### `project_security_secrets`
**Scan files for hardcoded secrets, API keys, and sensitive credentials.**

Params: `path?`, `include_staged?`, `severity_threshold?` (low | medium | high, default low), `max_depth?`, `check_presence_only?`

Return: `{ findings: SecretFinding[], count, files_scanned, severity_summary, has_secrets }`

Each `SecretFinding`: `file`, `line`, `column`, `secret_type`, `severity`, `preview` (redacted), `recommendation`.

**Implementation — 40+ secret patterns** covering:

| Category | Examples | Severity |
|----------|---------|----------|
| Cloud credentials | AWS Access Key, AWS Secret Key, GCP service account JSON | High |
| API keys | Stripe live/test keys, Twilio, SendGrid, Mailgun, Slack, GitHub PAT | High |
| Auth tokens | JWT secrets, OAuth tokens, private keys (RSA/EC/DSA) | High |
| Database URLs | PostgreSQL/MySQL URLs with passwords embedded | Medium |
| Generic patterns | Assignments to `*_KEY`, `*_SECRET`, `*_TOKEN`, `*_PASSWORD` with non-placeholder values | Low/Medium |

`isLikelyPlaceholder()` suppresses false positives by checking if the matched value is a well-known placeholder string (e.g. `your_api_key`, `<TOKEN>`, `xxxx`, `1234567890`) or clearly a test/example value. `redactSecret()` shows only the first 4 characters when `check_presence_only=false`. When `include_staged=true`, additionally scans files from `git diff --cached --name-only`.

---

#### `project_security_permissions`
**Detect sensitive API usage — filesystem, network, process, and crypto operations.**

Params: `file?` (single file) or `path?` (directory scan)

Return: `{ permissions: PermissionFinding[], summary: {filesystem, network, process, crypto}, risk_assessment: 'low'|'medium'|'high', recommendations, files_scanned? }`

Each `PermissionFinding`: `type`, `api`, `file`, `line`, `risk_level`, `description`.

**Implementation — 330+ permission patterns** organized by type and risk:

| Type | High Risk | Medium Risk |
|------|-----------|-------------|
| Filesystem | `fs.rmSync` with recursive, `fs.writeFileSync` to system paths | `fs.readFileSync`, `createWriteStream` |
| Network | Raw socket creation, `net.createServer` | `http.get`, `fetch`, `axios` |
| Process | `child_process.exec`, `spawn`, `execSync` | `process.exit`, `process.env` writes |
| Crypto | Custom PRNG, weak hash (MD5/SHA1) | `crypto.createHash`, `crypto.randomBytes` |

Scans only TypeScript/JavaScript files (`.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`).

---

#### `project_security_env`
**Audit environment variable usage — missing, unused, undocumented, and type mismatches.**

Params: `path?`, `env_file?` (default `.env`), `example_file?` (default `.env.example`), `ignore?`, `check_values?`, `scan_code?`

Return: `{ valid, env_file_exists, example_file_exists, variables, missing, unused, undocumented, type_issues?, summary }`

Categories:
- **missing**: defined in `.env.example` or used in code but absent from `.env`
- **unused**: defined in `.env` or `.env.example` but never referenced in code
- **undocumented**: used in code but not in `.env.example`
- **type_issues**: value in `.env` doesn't match inferred expected type (URL, boolean, number, port)

**Implementation**: `parseEnvFile()` parses KEY=VALUE pairs supporting quoted values and inline comments. `scanFileForEnvVars()` extracts `process.env.VAR_NAME` references using 4 regex patterns covering bracket notation, `import.meta.env`, and Vite-style `VITE_*` variables. `inferExpectedType()` uses naming conventions (`*_URL` → URL, `*_PORT` → port, `ENABLE_*`/`IS_*` → boolean). `scanDirectory()` recursively walks source files. Formats output as readable markdown with section headers.

---

### Standalone Tools (2 tools)

#### `scaffold`
**Generate a new project from a template.**

Params: `template` (required), `output_dir` (required), `variables?`, `run_install?`, `run_git_init?`

Return: `{ success, output_dir, files_created, template_used, install_output?, git_initialized }`

**Implementation**: Reads template config from `{PLUGIN_ROOT}/templates/{tier}/{name}/template.json`. Copies files recursively from the template `files/` directory, performing variable substitution (`{{VARIABLE_NAME}}` syntax) in both file contents and file names. Optionally runs `npm install` and `git init` in the output directory using `safeExec()`.

---

#### `bundle_analyze`
**Analyze build output for bundle size, large modules, duplicates, and optimization opportunities.**

Params: `path?`, `format?` (summary | detailed)

Return: `{ total_size: SizeInfo, chunks: ChunkInfo[], largest_modules: ModuleInfo[], duplicates: DuplicateInfo[], recommendations, build_directory?, files_analyzed? }`

`SizeInfo`: `raw` (bytes), `gzip` (bytes), `formatted` (human-readable).

**Implementation**: Auto-detects build directory by probing `dist/`, `.next/`, `build/`, `out/`, `.output/`. `findBundleFiles()` recursively finds `.js` files excluding source maps. `estimateGzipSize()` uses Node.js `zlib.gzip()` for accurate gzip estimation. `extractModules()` scans bundle content for webpack/rollup module path patterns (e.g. `/* ./node_modules/lodash/... */`) to identify which packages contribute to each chunk. `detectDuplicates()` reads `node_modules/.package-lock.json` or runs `npm ls --json` to find packages with multiple installed versions. `checkTreeShakingIssues()` checks for `import *` patterns and CommonJS modules in `package.json` `main` field without ESM `module` field. `PACKAGE_ALTERNATIVES` map suggests lighter alternatives (e.g. `moment` → `day.js`, `lodash` → `lodash-es`).

---

### Test Tools (2 tools)

#### `project_test_coverage`
**Parse test coverage reports and return coverage metrics.**

Params: `file?` (filter to specific source file), `coverage_path?`, `path?`

Return: `{ coverage: { lines, branches, functions, statements }, uncovered_lines, uncovered_functions, report_path, report_type }`

**Implementation**: Probes standard coverage paths (`coverage/lcov.info`, `coverage/coverage-final.json`, `.nyc_output/coverage-final.json`, `coverage.lcov`). Supports four formats:
- **LCOV** (`.info` files): Line-by-line `DA:line,count` records, function records `FN:` / `FNDA:`, branch records `BRH:`
- **Istanbul/c8 JSON** (`coverage-final.json`): `statementMap`, `fnMap`, `branchMap` with execution counts in `s`, `f`, `b` fields
- **Coverage summary JSON** (`coverage-summary.json`): Pre-aggregated percentages

`calculateMetrics()` computes percentage from `covered/total` across all files or filtered to a single file. Reports uncovered line ranges and function names.

---

#### `project_test_find`
**Find test files that test a given source file.**

Params: `file` (required), `include_indirect?` (default false)

Return: `{ tests: TestFile[], count }`

Each `TestFile`: `file`, `type` (unit | integration | e2e), `imports_source_directly`, `confidence: number` (0–1).

**Implementation**: `findTestFiles()` walks the project looking for files matching `*.test.*`, `*.spec.*`, or paths containing `__tests__/`, `e2e/`, `cypress/`. `determineTestType()` classifies by path: `e2e/` or `cypress/` → e2e; `integration/` → integration; otherwise unit. `checkImportRelationship()` parses imports in each test file to see if the source file is directly imported; when `include_indirect=true` recursively follows the import graph. `calculatePatternConfidence()` scores 0.0–1.0 based on: file name similarity (same base name = 0.5), same directory (0.2), direct import (0.3).

---

## TypeScript Language Service Integration

All six code-intelligence tools rely on a shared `LanguageServiceManager` defined in `handlers/code-intelligence/shared/language-service.ts`.

### Architecture

```typescript
interface LanguageServiceManager {
  getServiceForFile(filePath: string): Promise<LanguageServiceResult>
  getPositionOffset(service, fileName, line, column): number
  getLineAndColumn(service, fileName, offset): { line, column }
  cleanup(): void      // evict stale cache entries
  shutdown(): void     // dispose all services
  startCleanupInterval(): void
}
```

### Caching Strategy

The `LanguageServiceManagerImpl` maintains a `Map<string, CachedService>` keyed by the **tsconfig directory** (not individual files). This means all files within the same TypeScript project share one language service instance, avoiding redundant compiler setup.

Cache TTL is configurable via environment:
- `PROJECT_ENGINE_TS_CACHE_TTL_MS` — explicit millisecond value
- `CI=true` — uses 5-minute TTL
- Default — 10-minute TTL

### Service Creation

`createLanguageService()` implements `ts.LanguageServiceHost` with:
- `getScriptFileNames()` — returns discovered source files
- `getScriptVersion()` — tracks file modification timestamps for cache invalidation
- `getScriptSnapshot()` — reads file content via `ts.ScriptSnapshot.fromString()`
- `getCompilationSettings()` — returns parsed `tsconfig.json` compiler options, falling back to sensible defaults (`strict: true`, `moduleResolution: Node`, `target: ESNext`)

A `createServiceProxy()` wraps the language service in a `Proxy` that wraps all method calls in try/catch, preventing a single compiler error from crashing the handler.

### Position Utilities (`shared/lsp-utils.ts`)

- `normalizeFilePath()` — resolves to absolute path
- `resolveFilePath()` — joins relative paths against project root
- `getLinePreview()` — extracts a line from the language service's source file, truncated to 120 chars
- `getPreviewFromSourceFile()` — same but from a `ts.SourceFile` directly

### Validation (`shared/validation.ts`)

Provides `validatePositionArgs()` (validates `file`, `line ≥ 1`, `column ≥ 0`) used by `project_code_safe_delete` and any other tool taking file positions.

---

## Database Abstraction

### Multi-Database Query Execution

The `project_db_query` handler uses a layered architecture:

```
handler.ts → url-parser.ts → drivers.ts → executors/{postgres,mysql,sqlite}.ts
```

**URL Parser** (`url-parser.ts`): Parses connection URLs into `DatabaseConnectionInfo { type, host, port, database, user, password, filepath }`. Handles:
- `postgresql://` / `postgres://` URLs
- `mysql://` URLs
- `sqlite:./path`, `sqlite3:./path`, bare `.db` file paths
- Falls back to `DATABASE_URL` environment variable

**Drivers** (`drivers.ts`): Manages dynamic imports of optional native drivers:
- `pg` for PostgreSQL (not bundled — must be installed in project)
- `mysql2` for MySQL (not bundled — must be installed in project)
- `sql.js` for SQLite (bundled as a production dependency)

**Safety layer**: Before execution, `isWriteOperation()` is checked. When `readonly=true` (default), write operations are rejected with a clear error message. SELECT queries automatically get LIMIT appended if not already present.

### ORM Detection (Schema Tool)

Priority order for schema source detection:
1. `prisma/schema.prisma` — Prisma
2. `drizzle.config.ts` / `drizzle.config.js` + schema file discovery — Drizzle
3. `src/db/schema.*`, `db/schema.*` — Drizzle
4. `migrations/` directory with `.sql` files — Raw SQL
5. Returns `source: 'unknown'` if nothing found

---

## Security Scanning

### Secret Pattern Taxonomy

The `project_security_secrets` handler defines 40+ `SecretPattern` objects, each with a `RegExp`, severity, and recommendation string:

```typescript
interface SecretPattern {
  name: string
  pattern: RegExp
  severity: 'low' | 'medium' | 'high'
  recommendation: string
}
```

**High severity patterns** match formats like:
- `AKIA[0-9A-Z]{16}` — AWS Access Key IDs
- `(?:secret|private)_key.*?['"]([A-Za-z0-9+/]{32,})['"]` — Generic private keys
- `sk_live_[A-Za-z0-9]{24,}` — Stripe live secret keys
- RSA/EC private key PEM blocks

**Placeholder suppression** (`isLikelyPlaceholder()`) checks for:
- Length too short (< 8 chars)
- All same character (`aaaaaaa`)
- Well-known placeholder strings (`your_key_here`, `<TOKEN>`, `REPLACE_ME`, `xxx*`)
- Test/example markers (`test`, `example`, `sample`, `fake`, `mock`, `demo`)
- Hex strings that are obviously sequential

### Permission Pattern Coverage

`project_security_permissions` covers 330+ patterns across four categories. Pattern objects include:

```typescript
interface PermissionPattern {
  type: 'filesystem' | 'network' | 'process' | 'crypto'
  api: string              // e.g. 'fs.writeFileSync'
  pattern: RegExp
  risk: 'low' | 'medium' | 'high'
  description: string
  recommendation?: string
}
```

---

## Key Implementation Details

### LLM Integration (Breaking Changes + Semantic Diff)

Both `project_code_breaking` and `project_code_semantic_diff` call the Anthropic API directly via `https.request()` (no SDK dependency). The `analyzeWithLLM()` functions:
1. Build a structured prompt containing file diffs, type signatures before/after, and referencing files
2. POST to `https://api.anthropic.com/v1/messages` with `anthropic-version: 2023-06-01` header
3. Parse the response and extract JSON from the text using regex (the model is prompted to return JSON)
4. Apply a configurable timeout (default 120s) with `Promise.race()`
5. Support model selection: `haiku` (fast, cheap), `sonnet` (balanced), `opus` (most capable)

### Bundle Size: SQLite Bundled, Others Dynamic

Only `sql.js` is a production dependency — it provides SQLite without native bindings (uses WebAssembly). PostgreSQL (`pg`) and MySQL (`mysql2`) are dynamically imported at runtime, so projects that don't use those databases don't pay the dependency cost. Missing drivers produce clear error messages.

### Circular Dependency Algorithm

The DFS in `project_deps_circular` uses a textbook three-color approach:

```typescript
enum Color { White, Gray, Black }
// White = unvisited, Gray = in-progress (on stack), Black = done
// Back edge to Gray node = cycle detected
```

Cycle deduplication uses `createCycleSignature()` which rotates the cycle array to start at the lexicographically smallest file, making `[A→B→C]` and `[B→C→A]` the same signature.

### Virtual FS for Edit Previews

The `VirtualFileSystem` in `preview-edits.ts` intercepts `readFileSync`-equivalent calls in the TS language service host. When a file has a virtual edit applied, the host returns the modified content; otherwise it reads from disk. This allows the TypeScript compiler to type-check proposed changes without touching the filesystem.

### Package Manager Detection

`shared/utils.ts` `detectPackageManager()` probes for lock files in priority order:
1. `pnpm-lock.yaml` → pnpm
2. `yarn.lock` → yarn  
3. `bun.lockb` → bun
4. Default → npm

---

## Dependencies

| Package | Version | Purpose |
|---------|---------|--------|
| `@modelcontextprotocol/sdk` | ^1.25.1 | MCP server/transport/schema types |
| `fast-glob` | ^3.3.2 | File globbing (used in some handlers) |
| `js-yaml` | ^4.1.1 | Parse YAML OpenAPI specs in `project_api_validate` |
| `sql.js` | ^1.13.0 | SQLite execution via WebAssembly (no native bindings) |
| `typescript` | ^5.3.0 | Language Service API for code intelligence tools (dev + bundled) |
| `esbuild` | ^0.20.0 | Build tool — produces single `dist/index.cjs` bundle |
| `vitest` | ^2.0.0 | Test runner |

Notable **absent** runtime dependencies:
- No `pg`, `mysql2` — dynamically imported at runtime from user's `node_modules`
- No Anthropic SDK — raw HTTPS calls for LLM features
- No `semver` library — version comparison implemented inline
- No `yaml` library beyond `js-yaml` for spec parsing

---

## YAML Tool Definitions

Each of the 26 tools has a corresponding YAML definition in `plugins/goodvibes/tools/definitions/project-engine/`. All definitions specify:

```yaml
mcp:
  server: project-engine
  method: <tool_name>
  defer_loading: true   # deferred = not loaded until first use
```

The `defer_loading: true` flag means these tools are not registered with the MCP client at startup — they are loaded lazily on first invocation. This improves startup performance for the overall plugin.
