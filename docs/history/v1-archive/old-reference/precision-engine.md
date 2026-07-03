# Precision Engine — Deep-Dive Reference

Version 3.0.0 | MCP Server | SPEC-v2

---

## Overview

The precision-engine is an MCP (Model Context Protocol) server that provides a suite of **token-efficient file, code, and process tools** for AI agents. It replaces the native Claude tools (Read, Write, Edit, Grep, Glob, WebFetch) with higher-fidelity equivalents that offer batching, output mode control, caching, telemetry, and hooks.

Its primary design goal is to minimize LLM token consumption without sacrificing correctness or capability. Every tool exposes a `verbosity` or `output.mode` parameter with options ranging from `count_only` (~0.05x tokens) to `verbose` (1.0x tokens), letting the LLM pay exactly for what it needs.

The server exposes **12 tools** over stdio using the MCP SDK. It is spawned as a subprocess by the Claude plugin system and communicates using the `@modelcontextprotocol/sdk` protocol.

---

## Architecture

### Entry Point (`src/index.ts`)

The server is a single-process Node.js MCP application implemented in the `PrecisionEngineServer` class. At startup:

1. An `@modelcontextprotocol/sdk` `Server` instance is created with `capabilities: { tools: {} }`.
2. Two request handlers are registered:
   - `ListToolsRequestSchema` — returns all tool schemas from `src/schemas/index.ts`
   - `CallToolRequestSchema` — dispatches to the appropriate handler via `handlerRegistry`
3. `PrecisionRuntime.initialize()` is called non-blocking. If it fails, the server runs in **degraded mode** with no telemetry, no hooks, and no precision IDs.

On shutdown (SIGINT/SIGTERM), the server clears the `FileStateCache`, resets session state, kills background processes, flushes the project index, and closes the telemetry database.

### Handler Registry (`src/handlers/index.ts`)

Handlers are registered in a `Map<string, ToolHandler>` at module load time. The registry maps tool names to async functions:

```typescript
export const handlerRegistry = new Map<string, ToolHandler>([
  ['precision_write', handlePrecisionWrite],
  ['precision_exec',  handlePrecisionExec],
  ['precision_fetch', handlePrecisionFetch],
  ['discover',        handleDiscover],
  ['precision_grep',  handlePrecisionGrep],
  ['precision_read',  handlePrecisionRead],
  ['precision_glob',  handlePrecisionGlob],
  ['precision_symbols', handlePrecisionSymbols],
  ['precision_edit',  handlePrecisionEdit],
  ['precision_config', handlePrecisionConfig],
  ['precision_notebook', handlePrecisionNotebook],
  ['precision_agent', handlePrecisionAgent],
]);
```

### Handler Dispatch (`executeHandler` in `src/index.ts`)

Every tool call goes through `executeHandler`, which wraps the underlying handler with:

1. **Pre-hooks** (`PrePrecisionTool`) — can abort the call before it executes
2. **Handler execution** — the actual tool logic
3. **Telemetry recording** — tokens in/out, duration, cache hit status
4. **`precision_id` injection** — a unique correlation ID prepended to every response text block (`[read_abc123_def456]`)
5. **KVState auto-population** — `session.tokens_used`, `session.files_modified`, `session.commands_run`, `session.agents_spawned` are updated in a single batch read-modify-write
6. **Post-hooks** (`PostPrecisionTool`) — run after success
7. **Mutation hooks** (`OnPrecisionMutation`) — run for write, edit, exec, and notebook operations
8. **Error hooks** (`OnPrecisionError`) — run on failure

All hook failures are non-fatal and logged as warnings — they never block the tool response.

### Configuration (`src/runtime-config.ts`)

Configuration is loaded from `.goodvibes/goodvibes.json` in `process.cwd()`. The file is read synchronously at module import time (eager initialization). Defaults are merged and any missing default keys are persisted back to the file (fire-and-forget).

Key configuration values:

| Key | Default | Description |
|-----|---------|-------------|
| `sandbox` | `false` | Path boundary enforcement (write-local) |
| `cache_mode` | `with_content` | `hash_only` (low memory) or `with_content` (enables diffs) |
| `cache_max_mb` | `200` | Max memory budget for FileStateCache |
| `safe_overwrite` | `true` | Auto-backup before first overwrite |
| `max_file_bytes` | `524288` (512KB) | File size gate for pagination |
| `max_token_estimate` | `50000` | Token estimate gate for pagination |
| `exec_default_timeout_ms` | `120000` | Default command timeout |
| `exec_max_output_chars` | `50000` | Output truncation threshold |
| `exec_max_background` | `5` | Max concurrent background processes |
| `discover_symbol_timeout_ms` | `120000` | Symbol search timeout in discover |
| `verbosity_defaults` | `undefined` | Per-tool verbosity overrides |

The `ALLOW_EXTERNAL_PATHS=true` environment variable disables sandbox mode at runtime without persisting the change.

---

## Tools (12)

### 1. `precision_read`

**Description:** Token-efficient file reading with extraction modes. Supports full content, structural outlines, exported symbols, AST representations, and line ranges. Also handles images (PNG, JPG, GIF, SVG), PDFs, and Jupyter notebooks.

**Key Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `files` | `(string \| FileReadSpec)[]` | Files to read — strings or per-file specs |
| `extract` | `content \| outline \| symbols \| ast \| lines` | Global extraction mode |
| `output.format` | `count_only \| minimal \| standard \| verbose` | Response verbosity |
| `symbol_filter` | `SymbolKind[]` | Filter to specific symbol types |
| `token_budget` | `number` | Enable batch token-budget pagination |
| `page` | `number` | Page to return when using `token_budget` |
| `force` | `boolean` | Bypass the file cache |

Per-file overrides (`range`, `extract`, `pages`, `force`) can be set on each entry in the `files` array.

**Notable Implementation Details:**

- **File cache**: On every read, the file content is hashed (SHA-256 prefix) and compared against the `FileStateCache`. A cache hit returns `status: 'unchanged'` with token savings metadata. The cache tracks read count, tokens saved, version history, and modification log per file.
- **TypeScript/JavaScript extraction**: Uses the TypeScript compiler API (`ts.createSourceFile`) to parse AST and extract symbols (`extractSymbols`), structural outlines (`extractOutline`), and AST patterns (`extractAst`). Handles `.ts`, `.tsx`, `.js`, `.jsx`, `.mts`, `.cts`.
- **Python extraction**: Regex-based symbol extraction (`extractPythonSymbols`) covers `class`, `def`, `async def`, and module-level assignments.
- **Image handling**: Detects image files by extension and magic bytes (`isValidImageBuffer`). Returns them as base64 in `image_base64`, rendered as vision content blocks for multimodal LLMs.
- **PDF handling**: Uses `pdf-parse` to extract text. Supports page range syntax like `"1-5"` or `"3"`.
- **Notebook handling**: Parses `.ipynb` JSON and formats cells with cell-type headers and outputs into readable text.
- **Token-budget pagination**: When `token_budget` is set, the handler bins files into pages that fit within the budget. The response includes `pagination.total_pages`, `pagination.pending_files`, and a hint to call with `page: N`.
- **Size gate**: Files exceeding `max_file_bytes` (512KB) or `max_token_estimate` (50K tokens) trigger a size gate warning and suggest pagination instead of reading the full file.
- **Slow filesystem detection**: Tracks `stat()` call duration. If it exceeds `slow_fs_stat_threshold_ms` (50ms) or the path matches a `slow_fs_known_prefixes` (e.g., `/mnt/`), the file is tagged as `filesystem: 'slow'`.

---

### 2. `precision_edit`

**Description:** Atomic file editing with multiple match modes. Finds a `find` string in a file and replaces it with `replace`. Supports batching multiple edits across multiple files with transaction support and rollback.

**Key Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `edits` | `EditSpec[]` | Array of find-replace edit specs |
| `transaction.mode` | `atomic \| partial \| none` | Whether to roll back on failure |
| `match.mode` | `exact \| fuzzy \| regex \| ast \| ast_pattern` | How to locate the target text |
| `match.case_sensitive` | `boolean` | Case sensitivity |
| `match.whitespace_sensitive` | `boolean` | Exact or normalized whitespace |
| `occurrence` | `first \| last \| all \| number` | Which occurrence to replace |
| `hints.near_line` | `number` | Disambiguation hint — prefer match near this line |
| `hints.in_function` | `string` | Prefer match inside this function name |
| `dry_run` | `boolean` | Preview changes without writing |
| `output.mode` | `count_only \| minimal \| with_diff \| verbose` | Response detail |

**Notable Implementation Details:**

- **5 match modes**:
  - `exact`: Literal string match with optional whitespace normalization
  - `fuzzy`: Levenshtein-based substring match (default 70% similarity threshold via `findBestSubstringMatch`)
  - `regex`: Full regex match using JavaScript `RegExp`
  - `ast`: TypeScript AST-based matching using `ts.createSourceFile` — finds semantically equivalent code structures regardless of whitespace
  - `ast_pattern`: Uses `@ast-grep/napi` for structural pattern matching across supported languages
- **Context hints** (`findInContext`): When `hints` are provided, the match candidates are scored by proximity to `near_line`, containment in `in_function`/`in_class` (using TreeSitter to find enclosing scopes), or relative position via `after`/`before`.
- **Ambiguity detection**: If multiple occurrences are found and `occurrence` is not specified, the edit returns `status: 'ambiguous'` with a `ClosestMatch[]` list showing the top matches for debugging.
- **Transaction rollback**: In `atomic` mode, backups of all affected files are taken before any edits are applied. On failure, `performRollback` restores all files.
- **Unified diff**: After applying edits, a unified diff is generated using the `diff` library. The diff is truncated at `max_diff_chars` (configurable). In `minimal` mode, only a `diff_preview` (first 5 lines of diff) is returned.
- **Safe overwrite integration**: When writing the modified file back, calls the `SafeOverwrite` utility which creates a timestamped backup in `.goodvibes/.backups/` before the first overwrite (if the file isn't clean in git).

---

### 3. `precision_write`

**Description:** Create or overwrite files with multiple content sources, template rendering, and transaction support.

**Key Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `files` | `WriteSpec[]` | Files to write — each with path + content |
| `content` | `string` | Raw content to write |
| `content_base64` | `string` | Base64-encoded content (for binary-safe transfer) |
| `content_file` | `string` | Path to read content from |
| `mode` | `fail_if_exists \| overwrite \| backup` | File collision strategy |
| `template.engine` | `handlebars \| ejs \| none` | Template rendering engine |
| `transaction.mode` | `atomic \| partial \| none` | Rollback strategy |
| `dry_run` | `boolean` | Preview without writing |
| `output.mode` | `count_only \| minimal \| with_preview \| verbose` | Response detail |

**Notable Implementation Details:**

- **Template rendering**: Supports both Handlebars (`renderHandlebars`) and EJS (`renderEjs`) inline template engines. Useful for scaffolding files from reusable templates with data injection.
- **Atomic transactions**: A `rollbackStore` Map tracks rollback info (original content or "new file" marker) per transaction ID. If any write fails in `atomic` mode, all previous writes are reverted.
- **Safe overwrite**: Before overwriting an existing file, `SafeOverwrite` checks if the file is tracked by git and clean. If not clean, a backup is created at `backup_dir/<timestamp>/<path>`. Configurable via `backup_git_clean_skip`.
- **Auto-directory creation**: Creates parent directories via `fs.promises.mkdir(..., { recursive: true })` before writing.
- **Write result tracking**: Each file returns `status: 'created' | 'overwritten' | 'skipped' | 'failed'` plus optional `safety` metadata showing backup path and git status.

---

### 4. `precision_exec`

**Description:** Execute shell commands with expectations, retry, background mode, file operations (copy/move/delete), and output overflow handling.

**Key Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `commands` | `CommandSpec[]` | Commands to run |
| `cmd` | `string` | Command string (or `args[]` for exec-file mode) |
| `expect.exit_code` | `number \| number[]` | Expected exit code(s) |
| `expect.stdout_contains` | `string` | Required substring in stdout |
| `expect.stderr_empty` | `boolean` | Fail if stderr is non-empty |
| `background` | `boolean` | Run without waiting for completion |
| `until.pattern` | `string` | Poll regex until matched in output |
| `retry.max` | `number` | Max retries on failure |
| `retry.delay_ms` | `number` | Delay between retries |
| `file_ops` | `FileOpSpec[]` | Copy/move/delete file operations |
| `parallel` | `boolean` | Run commands concurrently |
| `output.mode` | `count_only \| exit_codes \| minimal \| standard \| verbose` | Response detail |

**Notable Implementation Details:**

- **Destructive command detection**: A set of regex patterns (`DESTRUCTIVE_PATTERNS`) blocks dangerous commands like `rm -rf /`, `sudo rm`, `chmod 777 /`, `mkfs`, `:(){:|:&};:` (fork bomb). Checked when `safe_mode: true`.
- **Output overflow**: When stdout/stderr exceeds `exec_max_output_chars` (50KB), the overflow is written to `.goodvibes/.exec-output/<id>.txt` and a reference is returned in the response. The LLM can then read the overflow file with `precision_read`.
- **Progress milestones**: With `progress: true`, the handler samples output every `PROGRESS_SILENCE_GAP_MS` (2s) during execution, recording up to 20 milestone snapshots. This provides visibility into long-running commands without streaming.
- **`until` polling**: Spawns the process and continuously checks stdout/stderr against a regex pattern, resolving as soon as the pattern matches. Uses the same child process machinery as regular commands.
- **Background processes**: `ProcessManager` (`src/state/process-manager.ts`) tracks all background child processes. On server shutdown, `killAll()` sends SIGTERM followed by SIGKILL after `KILL_SIGNAL_DELAY_MS` (5s).
- **Import update on move**: When `file_ops` includes a `move` operation with `update_imports: true`, the handler scans all TypeScript/JavaScript files for import statements referencing the old path and rewrites them to point to the new location. Uses `fast-glob` to find files and `resolveImportToAbsolute`/`computeRelativeImport` for path calculations.
- **Exit code interpretation**: Unknown non-zero exit codes are mapped to human-readable explanations via the `exit-codes` utility (e.g., exit 1 = general error, exit 124 = timeout, exit 130 = SIGINT).
- **Retry engine**: `executeWithRetry` wraps `executeCommand` with configurable max attempts, delay, and exponential backoff. Each retry result is recorded.

---

### 5. `precision_grep`

**Description:** Pattern search with batch queries, multiple output formats, result ranking, relationship analysis, and find-and-replace preview.

**Key Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `queries` | `GrepQuery[]` | Array of search queries (run in parallel by default) |
| `queries[].id` | `string` | Query identifier (appears in results) |
| `queries[].pattern` | `string` | Regex pattern |
| `queries[].glob` | `string` | File type filter (`"**/*.ts"`) |
| `queries[].negate` | `boolean` | Return files WITHOUT this pattern |
| `queries[].include_hidden` | `boolean` | Search hidden/dot files |
| `output.format` | `count_only \| files_only \| locations \| matches \| context \| stats` | Output granularity |
| `output.context_before/after` | `number` | Context lines around matches |
| `output.expand_to` | `line \| block \| function \| class` | Expand match context to enclosing scope |
| `output.max_results` | `number` | Cap on file results |
| `output.offset` | `number` | Pagination offset |
| `ranked` | `boolean` | Rank by relevance (exact match, exports, recency) |
| `relationships` | `boolean` | Show cross-file import/export relationships |
| `preview_replace` | `string` | Preview what a find-and-replace would produce |

**Notable Implementation Details:**

- **Backed by ripgrep**: Uses `@vscode/ripgrep` (the binary from VS Code) via `RipgrepCore`. Ripgrep is invoked as a subprocess with `--json` output format for machine-parseable results.
- **Parallel batch**: All queries in `queries[]` run concurrently via `Promise.all` (unless `parallel: false`).
- **Search cache**: A `SearchCache` singleton stores recent ripgrep results. Before invoking ripgrep, the cache is checked. Cache key includes pattern, path, glob, and options.
- **Negation search**: When `negate: true`, `grep-negation.ts` implements a two-phase strategy — first finding all files matching the glob, then subtracting files that DO match the pattern.
- **Ranking** (`grep-ranking.ts`): Files are scored by: exact match (word boundary), whether the match is in an export statement, and file recency (last modified time).
- **Relationships** (`grep-relationships.ts`): For each matched file, parses import/export declarations to show what the file imports from and what imports it.
- **Replace preview** (`grep-replace-preview.ts`): Applies the replacement string (with capture group references) to matched lines and returns a before/after diff without writing anything.
- **Stats mode** (`grep-stats.ts`): Aggregates match counts, unique files, matches per file distribution, and top-N most-matched files.
- **`expand_to`**: Reads the matched file and uses `RipgrepCore` plus content parsing to expand the match context to the enclosing block, function, or class.

---

### 6. `precision_glob`

**Description:** Token-efficient file discovery with filtering by size, date, and content, plus sorting and preset patterns.

**Key Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `patterns` | `string[]` | Glob patterns |
| `preset` | `typescript \| javascript \| styles \| config \| tests \| all` | Pre-defined pattern sets |
| `filters.min_size` | `number` | Minimum file size in bytes |
| `filters.max_size` | `number` | Maximum file size in bytes |
| `filters.modified_after` | `string` | ISO date filter |
| `filters.has_content` | `string` | Quick-grep filter on file content |
| `filters.is_empty` | `boolean` | Match only empty files |
| `output.format` | `count_only \| paths_only \| with_stats \| with_preview` | Output detail |
| `output.sort_by` | `name \| size \| modified` | Sort field |
| `backend` | `fast-glob \| ripgrep \| auto` | Listing engine |
| `respect_gitignore` | `boolean` | Apply `.gitignore` rules (default: true) |
| `include_hidden` | `boolean` | Include dot files (default: true) |

**Notable Implementation Details:**

- **Dual backend**: Supports `fast-glob` (JavaScript) and `ripgrep` (native binary). In `auto` mode, ripgrep is preferred for speed. The `listFilesWithRipgrep` function uses `rg --files` mode for pure file listing.
- **Preset patterns**: Built-in presets map to glob arrays. For example, `typescript` expands to `['**/*.ts', '**/*.tsx', '**/*.d.ts']`, `tests` to `['**/*.test.*', '**/*.spec.*', '**/__tests__/**']`.
- **Content filter**: The `has_content` filter runs a ripgrep files-with-matches pass first, then intersects with the glob results — a two-phase filter that avoids reading all file contents.
- **Preview**: In `with_preview` mode, the first N lines of each file are read and included inline. Useful for quick inspection without a separate read call.

---

### 7. `precision_symbols`

**Description:** Code symbol search across workspace or within specific files. Supports TypeScript (via TS compiler API), Python (regex), and other languages (via TreeSitter WASM).

**Key Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `mode` | `workspace \| document` | Search scope |
| `query` | `string` | Symbol name to search (substring match) |
| `files` | `string[]` | Specific files to analyze |
| `kinds` | `SymbolKind[]` | Filter by kind (function, class, interface, etc.) |
| `exported_only` | `boolean` | Only return exported symbols |
| `language` | `auto \| typescript \| python \| rust \| go` | Override language detection |
| `output.mode` | `count_only \| names_only \| locations \| signatures \| full` | Detail level |
| `output.group_by` | `file \| kind \| none` | Result grouping |

**Notable Implementation Details:**

- **TypeScript extraction**: `extractSymbols` uses `ts.createSourceFile` and walks the AST. Tracks exported names separately (handles `export { foo }` re-exports) for accurate `exported` flag. Extracts signatures for functions, methods, classes, and interfaces.
- **JSDoc extraction**: `getJsDocComment` reads leading JSDoc comments from the AST node and returns them as `documentation`.
- **Python extraction**: `extractPythonSymbols` uses line-by-line regex matching with indentation tracking to determine if a symbol is module-level (exported) or nested. Handles decorators, `async def`, and type annotations.
- **Workspace mode**: Uses ripgrep to find all files matching the language's glob patterns, then processes each file through `processFile`. Results are streamed and aggregated.
- **Private/public filtering**: `isPrivate` checks for TypeScript `private` keyword and underscore-prefixed identifiers.

---

### 8. `precision_fetch`

**Description:** HTTP/HTTPS URL fetching with content extraction, service registry authentication, parallel batch fetching, and a 15-minute self-cleaning cache.

**Key Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `urls` | `(string \| FetchSpec)[]` | URLs to fetch |
| `extract` | `raw \| text \| json \| markdown \| structured \| summary \| code_blocks \| tables \| links \| metadata \| readable \| pdf` | Content extraction mode |
| `service` | `string` | Named service from registry (auto-applies auth) |
| `auth` | `RequestAuth` | Explicit auth config |
| `method` | `GET \| POST \| PUT \| DELETE \| PATCH` | HTTP method |
| `body_type` | `json \| form \| multipart \| raw` | Request body encoding |
| `selectors` | `string[]` | CSS selectors for structured extraction |
| `cache_ttl_seconds` | `number` | Cache lifetime (default: 900s = 15 min) |
| `parallel` | `boolean` | Fetch URLs concurrently |

**Notable Implementation Details:**

- **15-minute cache**: A `Map<string, {content, timestamp}>` keyed by URL. Cache TTL is configurable per call. `clearFetchCache()` is exported for the config handler to invoke.
- **Service registry**: Services are defined in `goodvibes.json` under `fetch.services`. Each service has `base_url`, `auth_type` (bearer, basic, api-key, oauth2, session, custom-headers), `rate_limit_rps`, and `timeout_ms`. URL-to-service matching uses `url_patterns` for hostname-based auto-resolution.
- **Auth orchestration** (`utils/fetch/auth/`): A multi-strategy auth system:
  - `StaticAuth`: API key or bearer token from config
  - `OAuth2Refresh`: Handles token refresh for OAuth2 flows
  - `OAuth2Browser`: Browser-based OAuth2 (opens system browser)
  - `SessionAuth`: Cookie-based session management via `CookieJar`
- **Content extraction pipeline** (`processContent`):
  - `raw` — raw response body
  - `text` — strip HTML tags
  - `markdown` — HTML-to-Markdown via `turndown` + `turndown-plugin-gfm` (GitHub Flavored Markdown tables, strikethrough)
  - `readable` — Mozilla Readability extraction (article/blog main content)
  - `structured` — CSS selector extraction returns `{ selector: [matches] }` map
  - `code_blocks` — extracts `<pre><code>` blocks with language detection
  - `tables` — parses HTML tables into structured data
  - `links` — extracts all `<a href>` with link text
  - `metadata` — OpenGraph, Twitter Card, JSON-LD structured data
  - `pdf` — routes to `pdf-parse` for PDF URL responses
- **Redirect tracking** (`redirect-tracker.ts`): Records the redirect chain and sets `final_url` and `redirected` in the result.
- **Rate limiting** (`rate-limiter.ts`): Per-service token bucket limiter that enforces `rate_limit_rps`.
- **Cookie jar** (`cookie-jar.ts`): Persistent cookie storage per service for session-based auth.

---

### 9. `discover`

**Description:** Lightweight parallel multi-query execution. A single call runs grep, glob, symbol, structural (AST pattern), and project-index queries concurrently. The primary discovery tool in the GPA loop.

**Key Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `queries` | `QuerySpec[]` | Array of discovery queries |
| `queries[].type` | `grep \| glob \| symbols \| structural \| index` | Query type |
| `queries[].id` | `string` | Identifier for result correlation |
| `queries[].pattern` | `string` | Regex pattern (for grep/structural) |
| `queries[].patterns` | `string[]` | Glob patterns (for glob) |
| `queries[].query` | `string` | Symbol name (for symbols) |
| `queries[].structural_pattern` | `string` | AST grep pattern (for structural) |
| `verbosity` | `count_only \| files_only \| locations` | Global output detail |
| `base_path` | `string` | Override search root |

**Notable Implementation Details:**

- **All query types run in parallel** via `Promise.allSettled`. Each failed query returns an error in its result without aborting others.
- **Query type dispatch**: `executeQuery` routes to `executeGrepQuery`, `executeGlobQuery`, `executeSymbolsQuery`, `executeStructuralQuery`, or `executeIndexQuery`.
- **`index` query type**: Queries the in-memory `ProjectIndex` without hitting the filesystem. Returns file counts by type, file paths by prefix, and directory listings. Zero I/O cost.
- **`structural` query type**: Uses `@ast-grep/napi` (AstGrep NAPI bindings) to run tree-sitter pattern matching. Patterns like `console.log($X)` match any call with that structure.
- **Lazy-initialized core instances**: `ripgrepInstance`, `treeSitterInstance`, and `astGrepInstance` are created on first use (lazy singletons) to avoid startup overhead when those engines aren't needed.
- **`verbosity` parameter**: Controls how much data is returned per query result — `count_only` returns just the count, `files_only` returns file paths, `locations` returns file:line:column for each match.

---

### 10. `precision_agent`

**Description:** Spawns a headless AI agent (Claude, Gemini, or Codex) as a subprocess. Assembles a dossier (task context, constraints, memory, project index) and passes it to the agent via stdin.

**Key Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `prompt` | `string` | Task description for the agent |
| `context_files` | `string[]` | Files to read and inject as context |
| `scope` | `string[]` | File paths/dirs defining the agent's scope |
| `acceptance_criteria` | `string[]` | Success criteria injected into dossier |
| `options.provider` | `claude \| gemini \| codex` | Agent provider |
| `options.model` | `string` | Model ID override |
| `options.cli_flags` | `Record<string, unknown>` | Additional CLI flags (filtered) |
| `options.dossier.include` | `boolean` | Include memory+index dossier |
| `options.dossier.extra_reminders` | `string[]` | Additional reminders for the agent |

**Notable Implementation Details:**

- **Forbidden flags**: The following CLI flags are blocked to prevent misuse: `model`, `m`, `dangerously-skip-permissions`, `print`, `p`, `stdin`. Passing them is silently filtered.
- **Dossier assembly** (`DossierGenerator.generate`): The dossier contains:
  - `task`: description, acceptance criteria, scope
  - `constraints`: tool requirements (must use precision tools), quality bar, token budget
  - `context`: decisions, patterns, failures pulled from `.goodvibes/memory/`
  - `project`: tech stack (detected from package.json), project index summary, key files with token counts and roles
  - `reminders`: BASE_REMINDERS (always use precision tools, follow GPA loop) plus any `extra_reminders`
- **Memory injection** (`injectMemory`): Reads `.goodvibes/memory/decisions.json`, `patterns.json`, and `failures.json`. Filters entries by scope overlap using a keyword tokenizer to find relevant context.
- **Stack detection**: Reads `package.json` and maps dependency names to human-readable tech labels (e.g., `next` → "Next.js", `prisma` → "Prisma", `tailwindcss` → "TailwindCSS").
- **Always runs in background**: The agent subprocess is always launched as a background process via `ProcessManager`. Returns `status: 'running'` with `agent_id`, `process_id`, and `log_file` path immediately.
- **Agent ID format**: `<session_prefix>-<8char_hex>` for correlation with telemetry.
- **Default models**: Claude → `claude-sonnet-4-5`, Gemini → `gemini-2.5-pro-preview`, Codex → `codex-mini-latest`.

---

### 11. `precision_config`

**Description:** Runtime configuration management, telemetry querying, KV session state, hooks management, and output mode control.

**Actions:**

| Action | Operations | Description |
|--------|------------|-------------|
| `get` | — | Read config key(s) |
| `set` | — | Write config key + persist to `goodvibes.json` |
| `reload` | — | Re-read config file from disk |
| `telemetry` | `summary \| query` | Tool usage statistics from SQLite |
| `state` | `get \| set \| list \| clear` | Session KV store operations |
| `hooks` | `list \| enable \| disable \| add \| remove` | Manage tool lifecycle hooks |
| `mode` | `get \| set \| list` | Output mode management |

**Notable Implementation Details:**

- **Virtual config keys**: `fetch.services` and `fetch.auth_status` are virtual keys resolved at read time — they return service registry metadata without persisting to the config file.
- **Telemetry**: Uses an in-memory SQLite database (`sql.js` — pure JavaScript SQLite). Records are written synchronously, persisted to `.goodvibes/telemetry.db` on a debounced 5-second schedule. The `summary` operation computes per-tool call counts, token totals, cache hit rates, and average durations.
- **Hooks**: Three hook types — `builtin` (registered in code), `script` (shell command invoked via `execFile`), `mcp` (calls another MCP tool). Hook execution is filtered by tool name and can be enabled/disabled at runtime. Config is persisted under `goodvibes.json` → `hooks`.
- **Mode management**: Three built-in modes (`vibecoding`, `justvibes`, `default`) plus custom registered modes. `vibecoding` enforces GPA loop usage and caps verbosity. `ModeManager.applyDefaults` applies mode-specific verbosity and extract mode defaults to each tool call.

---

### 12. `precision_notebook`

**Description:** Jupyter notebook cell operations — replace, insert, and delete cells by index or stable cell ID.

**Key Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `path` | `string` | Path to `.ipynb` file |
| `operations` | `NotebookOperation[]` | Array of cell operations |
| `op` | `replace \| insert \| delete` | Operation type |
| `cell` | `number` | 0-indexed cell number |
| `cell_id` | `string` | Stable cell ID (preferred over index) |
| `after` | `number` | Insert after this cell index |
| `source` | `string` | New cell source content |
| `cell_type` | `code \| markdown \| raw` | Cell type for new cells |
| `clear_outputs` | `boolean` | Clear outputs on replace |

**Notable Implementation Details:**

- **Cell ID targeting**: Modern Jupyter notebooks (nbformat 4.5+) have stable `id` fields per cell. `resolveCellId` looks up cells by their `id` string, making operations robust against cell reordering.
- **ID generation**: `generateCellId` creates 8-character hex IDs, ensuring uniqueness within the notebook using the existing cell ID set.
- **Atomic JSON round-trip**: The notebook is read as JSON, operations are applied in-memory by `applyOperations`, and the full JSON is written back. This preserves all metadata, kernel info, and outputs not touched by the operation.
- **Source normalization**: `normalizeSource` handles both `string` and `string[]` source formats (both are valid in the nbformat spec). Output is always written as `string[]` (array of lines).

---

## Core Systems

### FileStateCache (`src/state/file-cache.ts`)

A session-scoped LRU cache for file content. Every `precision_read` call checks the cache before reading from disk.

**Cache entry data:**
- `contentHash`: 8-char SHA-256 prefix of file content
- `content`: full file text (in `with_content` mode)
- `readCount`, `tokenCost`, `tokensSaved`
- `version`: monotonic integer, incremented on each write
- `modificationLog`: ordered list of `ModEntry` (tool + timestamp + summary)

**Cache lookup logic:**
1. Compute hash of current on-disk content
2. Compare to stored hash
3. If equal → `status: 'unchanged'`, return token savings info
4. If different → `status: 'modified'`, generate a diff (using `diff` library), update entry
5. If not found → `status: 'miss'`, populate entry

**Memory management**: Tracks total content bytes. When `totalContentBytes > maxMemoryBytes` (default 200MB), the LRU entry is evicted. The LRU order is maintained by `lastReadAt` timestamp.

**Conflict detection**: When `precision_edit` writes a file, it records the new version. If a subsequent read shows the version has incremented from a different tool/agent, a `ConflictInfo` is returned showing which tool modified the file and the diff since the last read version.

---

### ProjectIndex (`src/state/project-index.ts`)

A persistent project file tree stored at `.goodvibes/project-index.json`. Tracks every file with its path and estimated token count. Supports multi-version schema migration (v1, v2, v3 → v4).

**v4 Structure:**
```json
{
  "version": 4,
  "tree": {
    ".ts": { "src/index.ts": 1200, "src/types.ts": 450 },
    ".json": { "package.json": 80 }
  },
  "stats": { "total_files": 152, "total_tokens": 85000 }
}
```

The tree is organized as `{extension: {relativePath: tokenCount}}`. Files are maintained in sorted order using binary search (`insertSorted`). Token counts are estimated at 1 token per 4 characters.

The index uses **debounced flush**: `markDirty()` schedules a 2-second write timer. `forceFlush()` is called on shutdown. This prevents I/O storms when many files are written in rapid succession.

A separate `ProjectIndexer` (`src/state/project-indexer.ts`) handles the initial filesystem scan (using ripgrep) to populate the index at session start.

---

### Telemetry (`src/state/telemetry.ts`)

Uses `sql.js` (in-memory SQLite compiled to WebAssembly) to record every tool call:

```sql
CREATE TABLE calls (
  id TEXT PRIMARY KEY,        -- precision_id (e.g. 'read_abc123_def456')
  session_id TEXT NOT NULL,   -- 8-char session hex
  tool TEXT NOT NULL,         -- short tool name
  status TEXT NOT NULL,       -- 'success' | 'failed' | 'partial'
  tokens_in INTEGER,
  tokens_out INTEGER,
  cache_hit INTEGER,
  cache_bytes_saved INTEGER,
  duration_ms INTEGER,
  error TEXT,
  metadata TEXT,              -- JSON blob (file paths, command strings, etc.)
  created_at TEXT
);
```

Persistence is debounced to `.goodvibes/telemetry.db` every 5 seconds. Token estimation uses a 4-chars-per-token heuristic applied to the JSON-serialized args/result.

---

### Hooks System (`src/state/hooks.ts`)

A lifecycle event system with four event types:

| Event | When it fires |
|-------|---------------|
| `PrePrecisionTool` | Before any tool executes (can abort) |
| `PostPrecisionTool` | After successful tool execution |
| `OnPrecisionError` | After tool failure |
| `OnPrecisionMutation` | After write/edit/exec/notebook (mutation subset) |

Hooks can be: `builtin` (registered TypeScript functions), `script` (shell command), or `mcp` (another MCP tool call).

**Built-in hooks** (registered at startup):
- `record_telemetry` (PostPrecisionTool): records call metrics to the SQLite DB
- `update_index` (OnPrecisionMutation): calls `ProjectIndex.upsertFile()` for each affected path

Hooks are executed with a filter that can restrict them to specific tool names. The `HookAbortError` from a pre-hook causes `executeHandler` to throw immediately before calling the handler, returning an MCP error to the LLM.

---

### KVState (`src/state/kv-state.ts`)

A per-session JSON key-value store persisted to `.goodvibes/sessions/<session_id>.json`. Supports get/set/list/clear with optional prefix-based listing. Auto-populated with:

- `session.id` — session identifier
- `session.started_at` — ISO timestamp
- `session.tokens_used` — cumulative tokens (input + output)
- `session.files_modified` — deduplicated list of modified file paths
- `session.commands_run` — count of commands executed
- `session.agents_spawned` — count of `precision_agent` calls

Old sessions are pruned (`cleanupOldSessions`) keeping the most recent 5.

---

### PrecisionRuntime (`src/state/precision-runtime.ts`)

The central singleton that owns references to all subsystems:

```typescript
class PrecisionRuntime {
  readonly config: PrecisionEngineConfig;  // runtime-config.ts
  readonly state: KVState;                  // per-session KV store
  readonly telemetry: Telemetry;            // SQLite telemetry DB
  readonly index: ProjectIndex;             // project file tree
  readonly hooks: HooksManager;            // lifecycle hooks
  readonly dossier: DossierGenerator;      // agent context builder
  readonly modeManager: ModeManager;       // output mode enforcement
  readonly session: SessionInfo;           // { id, startedAt, toolCalls }
}
```

`PrecisionRuntime.initialize()` is async and runs at server startup. If it fails for any reason, the engine enters **degraded mode** — tools still work but there is no telemetry, no precision IDs, no hooks, and no session metrics.

---

### Mode Manager (`src/state/mode-manager.ts`)

Manages named output modes that apply defaults and enforcement rules across all tools. Built-in modes:

| Mode | Purpose |
|------|---------|
| `vibecoding` | Enforces GPA loop. Caps verbosity at `minimal` for writes/edits, `standard` for reads. Defaults grep format to `files_only`. |
| `justvibes` | Same defaults as vibecoding, less enforcement. |
| `default` | No enforcement. Standard defaults everywhere. |

Mode is detected at startup from `PRECISION_MODE` env var or config. Custom modes can be registered via `ModeManager.registerMode()`. `applyDefaults` is called in `executeHandler` (through hooks) to apply mode-specific overrides before the handler sees the input.

---

## Core Libraries

### RipgrepCore (`src/core/ripgrep.ts`)

Wrapper around `@vscode/ripgrep` binary. Builds command-line arguments from `RipgrepSearchOptions` and invokes the binary as a subprocess via `execFile`. Parses `--json` output (NDJSON) into typed `RipgrepMatch[]` results. Also provides `listFiles` (using `--files`) and `filesWithMatches` modes.

### TreeSitterCore (`src/core/tree-sitter.ts`)

Wrapper around `web-tree-sitter` (WASM-based parser). Loads language WASM files from `tree-sitter-wasms` package at runtime. Provides:
- `parse(content, filePath)` — returns a `Tree` for the appropriate language
- `getOutline(tree)` — extracts hierarchical `OutlineNode[]`
- `getSymbols(tree)` — extracts flat `SymbolInfo[]` with optional kind filter
- `getEnclosingFunction/Class(tree, line)` — finds the enclosing scope at a given line (used by precision_edit hints)
- `findReferences` / `findDefinition` — workspace-wide symbol lookup

Supported languages via WASM: TypeScript, JavaScript, Python, Rust, Go, and more (determined by `LANGUAGE_EXTENSIONS` map).

### AstGrepCore (`src/core/ast-grep.ts`)

Wrapper around `@ast-grep/napi` — Node.js native bindings to the ast-grep library. Used by `discover` structural queries and `precision_edit` `ast_pattern` match mode. Supports structural patterns like `console.log($X)` that match based on code structure rather than text.

---

## Key Design Decisions

1. **Degraded mode**: The runtime initializes non-blocking. If telemetry, index, or hooks fail to initialize, tools still work. This prevents a DB corruption or filesystem issue from taking down the whole server.

2. **`precision_id` correlation**: Every successful response is prefixed with a `[tool_abc123_def456]` tag. This enables the LLM to correlate tool calls with telemetry records and log entries without any extra API calls.

3. **4-chars-per-token heuristic**: Used throughout for budget estimation. It's a rough approximation — real tokenization varies by content — but it's consistent and fast without requiring a tokenizer dependency.

4. **Dual TS compiler + TreeSitter**: TypeScript files use the native TypeScript compiler API (most accurate for TS/TSX), while other languages fall back to TreeSitter WASM parsers. This gives the best accuracy for the most common file type in the ecosystem.

5. **No streaming**: All responses are buffered and returned as a single MCP response. Output overflow is handled by writing excess content to disk and returning a reference path.

6. **Hook architecture separates concerns**: The telemetry recorder, index updater, and any user-defined hooks are all just hook implementations. The core handler dispatch in `index.ts` only knows about the lifecycle events.

---

## Dependencies

| Package | Version | Role |
|---------|---------|------|
| `@modelcontextprotocol/sdk` | ^1.0.0 | MCP server/transport layer |
| `@ast-grep/napi` | ^0.40.5 | Structural AST pattern matching (discover, edit) |
| `@vscode/ripgrep` | ^1.17.0 | Fast file search binary (grep, glob, symbols) |
| `web-tree-sitter` | ^0.22.6 | WASM-based multi-language parser |
| `tree-sitter-wasms` | ^0.1.13 | Pre-compiled WASM grammars for 30+ languages |
| `sql.js` | ^1.12.0 | Pure-JS SQLite (telemetry database) |
| `diff` | ^8.0.3 | Unified diff generation (edit, file cache) |
| `fast-glob` | ^3.3.2 | JavaScript glob implementation (alternative backend) |
| `@mozilla/readability` | ^0.6.0 | Article content extraction (fetch readable mode) |
| `linkedom` | ^0.18.12 | DOM parsing for HTML content processing in Node.js |
| `turndown` | ^7.2.2 | HTML-to-Markdown conversion (fetch markdown mode) |
| `turndown-plugin-gfm` | ^1.0.2 | GFM tables/strikethrough for turndown |
| `pdf-parse` | ^1.1.4 | PDF text extraction (read + fetch) |
| `typescript` | ^5.3.0 | TS compiler API for symbol/outline extraction |
| `esbuild` | ^0.20.0 | Build bundler (dev) |
| `vitest` | ^2.0.0 | Test runner (dev) |
