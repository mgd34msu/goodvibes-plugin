# Precision-Engine Atomic Decomposition

> **STATUS**: PLAN DOCUMENT — not implementation. This document describes the target architecture.

---

## Section 1: Executive Summary

This document defines a bottom-up atomic decomposition of the precision-engine MCP server (86 source files, ~29,250 lines, 12 MCP tools). The current architecture suffers from monolithic handlers that each re-implement the same shared operations: token estimation appears in 6 places, path normalization in 2, and the try-catch-format-return response pattern repeats across all 12 data-returning handlers.

The solution is a layered foundation:
- **L0 (shared/)** — Pure utilities, types, constants. Zero internal dependencies.
- **L1 (core/)** — Single-concern domain functions, each doing exactly ONE atomic thing.
- **L2 (extensions/)** — Multi-concern orchestrators composing multiple L1 functions.
- **L3 (plugins/)** — MCP thin dispatch, routing requests to L2.

Every operation exists in exactly ONE place, used by MANY tools. Higher layers compose lower layers; they never re-implement them.

---

## Section 2: Current Architecture & Problems

### Current Directory Structure

```
precision-engine/
  src/
    handlers/          # 13 tool handlers (monolithic)
    core/              # Some shared utilities
    utils/             # Mixed-concern utilities
    schemas/           # All 13 schemas in one file
    types.ts           # Shared types
    config.ts          # Config + constants
    logging.ts         # Logging + timing + token utils
    index.ts           # Entry point
```

---

### Problem 1: Duplicated Operations

`estimateTokens()` is implemented locally in 5 handlers and also exists in `logging.ts`, giving 6 total copies:
- `handlers/precision-grep.ts:141`
- `handlers/precision-edit.ts:152`
- `handlers/precision-symbols.ts:94`
- `handlers/precision-read.ts:457`
- `handlers/precision-glob.ts:91`
- `logging.ts` (canonical, but not imported by the handlers above)

`normalizePath()` exists in both `utils/index.ts:247` AND `handlers/precision-read.ts:448` — a duplicate that diverges silently over time.

The try-catch-format-return response construction pattern (build result object → wrap in `toCallToolResult` → return) is copy-pasted across all 12 data-returning handlers with minor variations, making every handler a de-facto re-implementation of the same response lifecycle.

---

### Problem 2: Monolithic Handlers

Handlers accumulate concerns until they become unmaintainable:

| Handler | Lines | Mixed Concerns |
|---------|-------|----------------|
| `precision-exec.ts` | 1,952 | Process spawning, retry logic, output collection, exit code interpretation, progress tracking, overflow handling |
| `precision-read.ts` | 1,634 | File reading, outline generation, symbol extraction, AST analysis, line extraction, caching |
| `precision-edit.ts` | 1,398 | File reading, exact/fuzzy/regex/AST matching, replacement, transaction management, backup/restore |
| `precision-symbols.ts` | 917 | Workspace search, document search, signature formatting |
| `runtime-config.ts` | 683 | Config loading, schema definition, defaults, validation |
| `schemas/index.ts` | 888 | All 12 tool schemas in one file |

A handler that is 1,952 lines long cannot be understood, tested, or modified in isolation. Changes to retry logic risk breaking output collection; changes to output formatting risk breaking process spawning.

---

### Problem 3: No Shared Composition Layer

Each handler reaches directly into Node's `fs` module (`fs.readFile`, `fs.writeFile`, `fs.stat`) rather than going through a shared file I/O atomic. This means:
- Consistent error handling around file I/O must be duplicated per handler.
- Shared behaviors like safe overwrite (write-to-temp, rename) must be duplicated.
- There is no single place to add cross-cutting concerns (e.g., telemetry on all file reads).

Similarly, each handler implements its own output formatting logic. There is no orchestrator layer — business logic is interleaved with I/O and response formatting inside the same function body.

---

### Problem 4: Mixed Concerns

A single handler function today may contain:
- **L0 work** — token estimation inline
- **L1 work** — raw file reading via `fs.readFile`
- **L2 work** — workflow coordination (read → transform → cache)
- **L3 work** — MCP response formatting

`utils/index.ts` (483 lines) exhibits the same problem at the utility level: it mixes pure utilities (string manipulation), I/O helpers (file existence checks), state helpers (cache access), and formatting functions — four distinct concerns that should live in four distinct modules.

---

## Section 3: Cross-Handler Shared Operations

This table is the KEY driver of the decomposition. It shows which operations are shared across which handlers, establishing the case for extraction at each layer.

| Operation | Category | Handler Count | Which Handlers |
|-----------|----------|---------------|----------------|
| `toCallToolResult()` | Response | 12 | ALL data-returning |
| `successResult()` | Response | 12 | ALL data-returning |
| `errorResult()` | Response | 12 | ALL data-returning |
| `startTimer()` | Timing | 12 | ALL |
| `estimateTokens()` | Tokens | 12 | ALL (5 duplicated, 7 imported) |
| `formatMissingParamError()` | Errors | 12 | ALL |
| `createErrorResult()` | Errors | 12 | ALL |
| `parseOutputMode()` | Output | 10 | read, write, edit, grep, glob, exec, fetch, symbols, notebook, discover |
| `mergeDefaults()` | Output | 10 | same as above |
| `parseJsonField()` | Params | 8 | read, write, edit, grep, glob, exec, fetch, symbols |
| `resolveStringField()` | Params | 8 | same as above |
| `validateFilePath()` | Path | 7 | read, write, edit, grep, glob, exec, discover |
| `normalizePath()` | Path | 7 | ALL file handlers (2 duplicated) |
| `fs.readFile()` | File I/O | 7 | read, write, edit, symbols, notebook, exec, agent |
| `isTextFile()` | Text | 5 | read, write, edit, glob, discover |
| `fs.stat()` | File I/O | 5 | read, write, edit, glob, exec |
| `warnDeprecatedParam()` | Compat | 6 | read, write, grep, glob, symbols, discover |
| `extractLines()` | Text | 4 | read, grep, symbols, discover |
| `DEFAULT_EXCLUDES` | Constants | 4 | grep, glob, symbols, discover |
| `validateDirectoryPath()` | Path | 4 | grep, glob, exec, discover |
| `RipgrepCore.search()` | Search | 4 | grep, glob, symbols, discover |
| `TreeSitterCore.parse()` | Parse | 4 | read, grep, symbols, discover |
| `FileStateCache` | Cache | 4 | read, write, edit, notebook |
| `ProjectIndex` | Index | 4 | write, grep, symbols, discover |
| `performSafeOverwrite()` | File I/O | 3 | write, edit, notebook |
| `AstGrepCore.match()` | AST | 2 | edit, discover |
| `ProcessManager` | Process | 2 | exec, agent |

Every row in this table is a candidate for extraction to a shared layer. Operations shared by 10+ handlers belong at L0 (pure utility). Operations shared by 4–9 handlers that depend on domain state belong at L1. Operations shared by 2–3 handlers that orchestrate multiple concerns belong at L2.

---

## Section 4: L0 — Shared Foundation

L0 contains pure utilities, types, and constants with **zero internal dependencies**. Nothing in L0 imports from L1, L2, or L3. Every item in L0 has a single canonical location and is imported (not re-implemented) everywhere it is used.

---

### shared/types.ts — All shared type definitions

Consolidates type definitions currently scattered across `types.ts` and handler-local interfaces.

| Type / Interface | Current Location | Used By |
|-----------------|------------------|---------|
| `OutputMode` | `types.ts` | ALL |
| `PrecisionResult` | `types.ts` | ALL |
| `FileSpec` | `types.ts` | read, write, edit, notebook |
| `EditSpec` | `types.ts` | edit |
| `GrepMatch` | `types.ts` | grep, discover |
| `SymbolInfo` | `types.ts` | symbols, discover, read |
| `ExecResult` | `types.ts` | exec |
| `FetchResult` | `types.ts` | fetch |
| `ValidationStep` | `types.ts` | edit |
| `OutputOptions` | `types.ts` | ALL |
| `TimingInfo` | `types.ts` | ALL |
| `TokenEstimate` | `types.ts` | ALL |
| `PathValidationResult` | `types.ts` | read, write, edit, grep, glob, exec, discover |
| `FileMetadata` | `types.ts` | read, write, glob |
| `CacheEntry` | `types.ts` | read, write, edit, notebook |
| `ProjectIndexEntry` | `types.ts` | write, grep, symbols, discover |
| `DeprecationWarning` | `types.ts` | read, write, grep, glob, symbols, discover |
| `ProcessResult` | `types.ts` | exec, agent |
| `AstNode` | `types.ts` | read, edit, discover |

---

### shared/response.ts — Response builders

Currently in `utils/index.ts`. These three functions are called in every single data-returning handler and represent the MCP response lifecycle boundary.

| Function | Current Location | Purpose |
|----------|------------------|---------|
| `toCallToolResult()` | `utils/index.ts` | Wrap any result as MCP `CallToolResult` |
| `successResult()` | `utils/index.ts` | Create success response with timing + meta |
| `errorResult()` | `utils/index.ts` | Create error response |

---

### shared/errors.ts — Error formatting

Currently in `utils/errors.ts`. No changes to location name, but scope is clarified: this module owns ALL error message construction.

| Function | Current Location | Purpose |
|----------|------------------|---------|
| `formatMissingParamError()` | `utils/errors.ts` | Missing required parameter message |
| `createErrorResult()` | `utils/errors.ts` | Create error result object |
| `formatInvalidValueError()` | `utils/errors.ts` | Invalid parameter value message |
| `formatMutualExclusivityError()` | `utils/errors.ts` | Mutually exclusive params message |

---

### shared/params.ts — Parameter parsing

Currently in `utils/index.ts`. These functions handle the conversion from raw MCP tool call arguments (JSON strings, interpolatable strings) into typed values used by all handlers.

| Function | Current Location | Purpose |
|----------|------------------|---------|
| `parseJsonField()` | `utils/index.ts` | Parse JSON string or pass through object |
| `resolveStringField()` | `utils/index.ts` | Resolve string with interpolation |
| `resolveStringFieldAsync()` | `utils/index.ts` | Async version |

---

### shared/output.ts — Output mode resolution

Currently in `utils/index.ts`. Used by 10 of 12 tools to normalize the caller's requested output mode and merge handler-specific defaults.

| Function | Current Location | Purpose |
|----------|------------------|---------|
| `parseOutputMode()` | `utils/index.ts` | Parse output mode from string |
| `mergeDefaults()` | `utils/index.ts` | Merge tool defaults with user options |
| `formatOutput()` | inline in handlers | Format result data according to output mode and verbosity |

---

### shared/path.ts — Path operations

Consolidates path utilities currently split across `utils/index.ts`, `utils/path-validation.ts`, and `handlers/precision-read.ts`. The duplicate `normalizePath()` in `precision-read.ts` is removed; the handler imports from `shared/path.ts`.

| Function | Current Location(s) | Dedup? | Purpose |
|----------|---------------------|--------|---------|
| `normalizePath()` | `utils/index.ts` + `precision-read.ts:448` | YES — remove from read | Normalize file path |
| `validateFilePath()` | `utils/path-validation.ts` | no | Validate file path + sandbox check |
| `validateDirectoryPath()` | `utils/path-validation.ts` | no | Validate directory path + sandbox check |

---

### shared/text.ts — Text utilities

Currently in `utils/index.ts`. These two functions are pure string/content operations with no I/O or external dependencies.

| Function | Current Location | Purpose |
|----------|------------------|---------|
| `isTextFile()` | `utils/index.ts` | Check if file extension is a known text type |
| `extractLines()` | `utils/index.ts` | Extract line range from string content |

---

### shared/tokens.ts — Token estimation

This is the most egregious duplication in the codebase. Six copies of the same estimation logic exist across five handlers and `logging.ts`. After extraction, all six call sites import from `shared/tokens.ts`; the five local copies are deleted.

| Function | Current Location(s) | Dedup? | Purpose |
|----------|---------------------|--------|---------|
| `estimateTokens()` | `logging.ts` + `precision-grep.ts:141` + `precision-edit.ts:152` + `precision-symbols.ts:94` + `precision-read.ts:457` + `precision-glob.ts:91` | YES — 5 local copies removed | Estimate token count for text |

---

### shared/timing.ts — Timer

Currently embedded in `logging.ts` alongside logging concerns. Timer functionality is pure (no I/O, no logging) and belongs in its own module.

| Function | Current Location | Purpose |
|----------|------------------|---------|
| `startTimer()` | `logging.ts` | Start execution timer; returns elapsed-ms function |

---

### shared/constants.ts — Shared constants

Currently in `config.ts` mixed with runtime config logic. Constants are purely declarative and have no runtime initialization — they belong at L0.

| Constant | Current Location | Purpose |
|----------|------------------|---------|
| `DEFAULT_EXCLUDES` | `config.ts` | Glob exclusion patterns shared by grep, glob, symbols, discover |
| `TEXT_EXTENSIONS` | `config.ts` | Known text file extension set |
| `DEFAULTS` | `config.ts` | Default config values |

---

### shared/deprecation.ts — Backward compatibility

Currently in `utils/deprecation.ts`. No location change needed — just scope clarification: this module owns ALL backward-compatibility warning emission.

| Function | Current Location | Purpose |
|----------|------------------|---------|
| `warnDeprecatedParam()` | `utils/deprecation.ts` | Emit structured deprecation warning |

---

### L0 Summary

L0 contains **20 functions**, **19 types/interfaces**, and **3 constant sets** — all with zero internal dependencies. Every item exists in exactly ONE location. No L0 module imports from L1, L2, or L3. All duplication identified in Section 2 (the 6-copy `estimateTokens`, the 2-copy `normalizePath`) is resolved at this layer.
# Precision Engine Atomic Decomposition — Part 2

---

## Section 5: L1 — Core Atomics

L1 atomics are single-concern domain functions. Each does exactly ONE thing and is describable in ONE sentence without "and". They depend only on L0 (shared utilities) — never on each other, with one documented exception: **core/index/ depends on core/fs/** for file metadata operations. This is a deliberate design choice — index building requires reading file stats. This exception does not violate the layering intent: the dependency is one-directional, non-circular, and between two L1 domains where one (fs) is a lower-level primitive.

---

### core/fs/ — File System Atomics

| Atomic | What It Does | Current Location | Target | Used By (L2) |
|--------|-------------|------------------|--------|--------------|
| `readFileContent(path)` | Read file and return string content | Inline in read, edit, write, notebook, agent handlers | `core/fs/read.ts` | read, edit, write, notebook, agent |
| `readFileBuffer(path)` | Read file and return Buffer | Inline in read handler (for images/binary) | `core/fs/read.ts` | read |
| `writeFileContent(path, content)` | Write string content to file | Inline in write, edit, notebook handlers | `core/fs/write.ts` | write, edit, notebook |
| `statFile(path)` | Get file stats (size, mtime, type) | Inline in read, write, edit, glob, exec handlers | `core/fs/stat.ts` | read, write, edit, glob, exec |
| `statFileOrNull(path)` | Get file stats or null if not found | Inline in write handler (existence check) | `core/fs/stat.ts` | write, glob |
| `createBackup(path)` | Copy file to timestamped backup location | `state/safe-overwrite.ts` | `core/fs/backup.ts` | write, edit |
| `restoreBackup(backupPath, originalPath)` | Restore file from backup | `state/safe-overwrite.ts` | `core/fs/backup.ts` | edit (transaction rollback) |
| `generateBackupPath(path)` | Generate timestamped backup file path | `state/safe-overwrite.ts` | `core/fs/backup.ts` | write, edit |
| `ensureDirectory(path)` | Create directory tree if it does not exist | Inline in write handler | `core/fs/write.ts` | write |
| `deleteFile(path)` | Remove a file from disk | Inline in edit handler (cleanup) | `core/fs/write.ts` | edit (temp files) |

---

### core/search/ — Search Atomics (wrapping ripgrep)

| Atomic | What It Does | Current Location | Target | Used By (L2) |
|--------|-------------|------------------|--------|--------------|
| `ripgrepSearch(pattern, path, opts)` | Execute ripgrep content search and return matches | `core/ripgrep.ts` (`RipgrepCore.search`) | `core/search/ripgrep.ts` | grep, discover |
| `ripgrepFileList(path, globs, excludes)` | List files matching glob patterns via ripgrep | `core/ripgrep.ts` (`RipgrepCore.files`) | `core/search/ripgrep.ts` | glob, grep, symbols, discover |
| `ripgrepCount(pattern, path)` | Count pattern matches without returning content | `core/ripgrep.ts` (`RipgrepCore.count`) | `core/search/ripgrep.ts` | grep (count_only mode) |

---

### core/parse/ — Parsing Atomics (wrapping tree-sitter)

| Atomic | What It Does | Current Location | Target | Used By (L2) |
|--------|-------------|------------------|--------|--------------|
| `treeSitterParse(content, lang)` | Parse source code into an AST | `core/tree-sitter.ts` | `core/parse/tree-sitter.ts` | read, symbols, discover |
| `treeSitterOutline(ast)` | Extract structural outline from a parsed AST | `core/tree-sitter.ts` | `core/parse/tree-sitter.ts` | read (outline mode) |
| `treeSitterSymbols(ast, filter)` | Extract symbol definitions from a parsed AST | `core/tree-sitter.ts` | `core/parse/tree-sitter.ts` | read (symbols mode), symbols, discover |
| `detectLanguage(path)` | Detect programming language from file extension | `core/languages.ts` | `core/parse/languages.ts` | read, edit, symbols, grep |
| `getLanguageFromExtension(ext)` | Map a file extension to a language name | `core/languages.ts` | `core/parse/languages.ts` | read, edit, symbols |
| `isLanguageSupported(lang)` | Check if tree-sitter has a grammar for this language | `core/languages.ts` | `core/parse/languages.ts` | read, symbols |

---

### core/ast/ — AST Pattern Matching Atomics (wrapping ast-grep)

| Atomic | What It Does | Current Location | Target | Used By (L2) |
|--------|-------------|------------------|--------|--------------|
| `astGrepMatch(pattern, content, lang)` | Find AST nodes matching a structural pattern | `core/ast-grep.ts` | `core/ast/ast-grep.ts` | edit (ast mode), discover (structural) |
| `astGrepReplace(pattern, replacement, content)` | Replace AST nodes matching a structural pattern | `core/ast-grep.ts` | `core/ast/ast-grep.ts` | edit (ast mode) |

---

### core/match/ — String Matching Atomics

| Atomic | What It Does | Current Location | Target | Used By (L2) |
|--------|-------------|------------------|--------|--------------|
| `findExactMatch(content, find, occurrence)` | Find an exact string match in content | Inline in `precision-edit.ts` | `core/match/exact.ts` | edit |
| `fuzzyMatch(content, find, threshold)` | Find an approximate string match using Levenshtein distance | `utils/fuzzy.ts` + inline in edit | `core/match/fuzzy.ts` | edit |
| `regexMatch(content, pattern, flags)` | Find a regex match in content | Inline in `precision-edit.ts` | `core/match/regex.ts` | edit |
| `levenshteinDistance(a, b)` | Calculate edit distance between two strings | `utils/fuzzy.ts` | `core/match/fuzzy.ts` | edit |
| `calculateSimilarity(a, b)` | Calculate string similarity score in the range 0–1 | `utils/fuzzy.ts` | `core/match/fuzzy.ts` | edit |

---

### core/process/ — Process Management Atomics

| Atomic | What It Does | Current Location | Target | Used By (L2) |
|--------|-------------|------------------|--------|--------------|
| `spawnProcess(cmd, opts)` | Spawn a child process and return its handle | `state/process-manager.ts` | `core/process/spawn.ts` | exec, agent |
| `killProcess(pid)` | Terminate a running process by PID | `state/process-manager.ts` | `core/process/spawn.ts` | exec, agent |
| `getProcessStatus(pid)` | Check whether a process is still running | `state/process-manager.ts` | `core/process/spawn.ts` | exec, config |
| `retryWithBackoff(fn, config)` | Retry a function call with exponential backoff | `utils/retry-engine.ts` | `core/process/retry.ts` | exec |
| `shouldRetry(error, attempt, config)` | Determine whether an error warrants a retry attempt | `utils/retry-engine.ts` | `core/process/retry.ts` | exec |
| `pollUntilPattern(stream, pattern, timeout)` | Wait for a regex pattern to appear in process output | Inline in `precision-exec.ts` | `core/process/poll.ts` | exec |
| `interpretExitCode(code, cmd)` | Map a process exit code to a meaningful error category | `utils/exit-codes.ts` | `core/process/exit-codes.ts` | exec |

---

### core/cache/ — Caching Atomics

| Atomic | What It Does | Current Location | Target | Used By (L2) |
|--------|-------------|------------------|--------|--------------|
| `fileCacheGet(path)` | Retrieve cached file content and metadata | `state/file-cache.ts` | `core/cache/file-cache.ts` | read, edit, write, notebook |
| `fileCacheSet(path, content, hash)` | Store file content and hash in the cache | `state/file-cache.ts` | `core/cache/file-cache.ts` | read, write, notebook |
| `fileCacheInvalidate(path)` | Remove a file's entry from the cache | `state/file-cache.ts` | `core/cache/file-cache.ts` | write, edit, notebook |
| `fileCacheStatus(path)` | Check cache status for a path (hit/miss/stale) | `state/file-cache.ts` | `core/cache/file-cache.ts` | read |
| `searchCacheGet(query)` | Retrieve cached search results for a query key | `state/search-cache.ts` | `core/cache/search-cache.ts` | grep |
| `searchCacheSet(query, results)` | Store search results under a query key | `state/search-cache.ts` | `core/cache/search-cache.ts` | grep |

---

### core/index/ — Project Index Atomics

| Atomic | What It Does | Current Location | Target | Used By (L2) |
|--------|-------------|------------------|--------|--------------|
| `indexLookup(path)` | Query the project index for a file's metadata | `state/project-index.ts` | `core/index/project-index.ts` | write, grep, symbols, discover |
| `indexUpdate(path, metadata)` | Update a single file's metadata entry in the index | `state/project-index.ts` | `core/index/project-index.ts` | write, edit |
| `indexBuild(rootPath)` | Build the project index from scratch by walking the tree | `state/project-indexer.ts` | `core/index/project-indexer.ts` | config (init), discover |
| `indexGetTokenEstimate(path)` | Get the estimated token count for a file from the index | `state/project-index.ts` | `core/index/project-index.ts` | read, grep, discover |

---

### core/config/ — Configuration Atomics

| Atomic | What It Does | Current Location | Target | Used By (L2) |
|--------|-------------|------------------|--------|--------------|
| `getConfigValue(key)` | Read a single runtime configuration value | `runtime-config.ts` | `core/config/runtime-config.ts` | ALL handlers |
| `setConfigValue(key, value)` | Update a single runtime configuration value | `runtime-config.ts` | `core/config/runtime-config.ts` | config |
| `loadConfig(path)` | Load configuration from a file into memory | `runtime-config.ts` | `core/config/runtime-config.ts` | server init |
| `getMaxFileBytes()` | Read the maximum file size limit from config | `runtime-config.ts` | `core/config/runtime-config.ts` | read, write, edit |
| `getPageSizeLines()` | Read the pagination page size from config | `runtime-config.ts` | `core/config/runtime-config.ts` | read, grep |

---

**L1 contains 48 atomics across 9 domains. Each does exactly one thing. No L1 function calls another L1 function.**

---

## Section 6: L2 — Tool Orchestrators

L2 is where composition happens. Each orchestrator calls multiple L1 atomics (and L0 utilities) to implement a complete tool workflow. Orchestrators are thin — they decide WHICH atomics to call and in WHAT ORDER. They contain no parsing logic, no file I/O primitives, no process spawning.

---

### extensions/read/ — Read Orchestrator

**Name**: `readOrchestrator`

**Purpose**: For each requested file, resolve the extract mode and return appropriately transformed content.

**Composition diagram**:
```
readOrchestrator(args):
  for each file in args.files:
    validateFilePath(file.path)                           # L0
    cached = fileCacheGet(file.path)                      # L1 cache
    if !cached or args.force:
      content = readFileContent(file.path)                # L1 fs
      stat    = statFile(file.path)                       # L1 fs
      fileCacheSet(file.path, content, hash)              # L1 cache
    else:
      content = cached.content

    lang = detectLanguage(file.path)                      # L1 parse

    switch(file.extract):
      'content':  result = content
      'outline':  ast    = treeSitterParse(content, lang)  # L1 parse
                  result = treeSitterOutline(ast)           # L1 parse
      'symbols':  ast    = treeSitterParse(content, lang)  # L1 parse
                  result = treeSitterSymbols(ast, filter)   # L1 parse
      'ast':      result = treeSitterParse(content, lang)  # L1 parse
      'lines':    result = extractLines(content, range)    # L0 text

    budget = indexGetTokenEstimate(file.path)             # L1 index
    applyPagination(result, args.output, budget)          # L2 read-helper
    formatOutput(result, args.output)                     # L0 output
```

**L1 atomics used** (9): `readFileContent`, `statFile`, `fileCacheGet`, `fileCacheSet`, `treeSitterParse`, `treeSitterOutline`, `treeSitterSymbols`, `detectLanguage`, `indexGetTokenEstimate`

**L0 utilities used**: `validateFilePath`, `extractLines`, `formatOutput`, `parseOutputMode`, `estimateTokens`

**Tool-specific L2 helpers**: `applyPagination` (token-budget-aware page slicing)

---

### extensions/edit/ — Edit Orchestrator

**Name**: `editOrchestrator`

**Purpose**: For each edit, locate the target string using the configured match mode and replace it atomically, rolling back on failure.

**Composition diagram**:
```
editOrchestrator(args):
  backups = []
  for each edit in args.edits:
    validateFilePath(edit.path)                           # L0
    content = readFileContent(edit.path)                  # L1 fs
    lang    = detectLanguage(edit.path)                   # L1 parse

    if args.transaction.mode == 'atomic':
      backupPath = createBackup(edit.path)                # L1 fs
      backups.push({ backupPath, original: edit.path })

    switch(args.match.mode):
      'exact':  match = findExactMatch(content, edit.find, edit.occurrence)  # L1 match
      'fuzzy':  match = fuzzyMatch(content, edit.find, args.match.threshold) # L1 match
      'regex':  match = regexMatch(content, edit.find, args.match.flags)     # L1 match
      'ast':    match = astGrepMatch(edit.find, content, lang)               # L1 ast

    if !match:
      rollbackAll(backups)     # L2 edit-helper (calls restoreBackup for each)
      return error

    newContent = applyReplacement(content, match, edit.replace)  # L2 edit-helper
    writeFileContent(edit.path, newContent)               # L1 fs
    fileCacheInvalidate(edit.path)                        # L1 cache
    indexUpdate(edit.path, newMetadata)                   # L1 index

  if args.validation.after:
    runPostValidation(args.validation.after)              # L2 edit-helper

  on unrecoverable error:
    rollbackAll(backups)                                  # L2 edit-helper -> restoreBackup (L1 fs)
```

**L1 atomics used** (11): `readFileContent`, `writeFileContent`, `createBackup`, `restoreBackup`, `fileCacheInvalidate`, `indexUpdate`, `detectLanguage`, `findExactMatch`, `fuzzyMatch`, `regexMatch`, `astGrepMatch`

**L0 utilities used**: `validateFilePath`, `formatOutput`

**Tool-specific L2 helpers**: `applyReplacement` (applies match offsets to produce new content), `rollbackAll` (loops over backup map calling `restoreBackup`), `runPostValidation` (spawns a lint/typecheck command via exec orchestrator), `generateDiff` (produces unified diff for output)

---

### extensions/write/ — Write Orchestrator

**Name**: `writeOrchestrator`

**Purpose**: Write each file to disk, handling existence policy, parent directory creation, and cache/index updates.

**Composition diagram**:
```
writeOrchestrator(args):
  for each file in args.files:
    validateFilePath(file.path)                           # L0

    existing = statFileOrNull(file.path)                  # L1 fs
    switch(file.mode):
      'fail_if_exists': if existing: return error
      'backup':         if existing: createBackup(file.path)  # L1 fs
      'overwrite':      (no check needed)

    ensureDirectory(dirname(file.path))                   # L1 fs
    writeFileContent(file.path, file.content)             # L1 fs
    fileCacheSet(file.path, file.content, hash)           # L1 cache
    indexUpdate(file.path, newMetadata)                   # L1 index
```

**L1 atomics used** (6): `statFileOrNull`, `createBackup`, `ensureDirectory`, `writeFileContent`, `fileCacheSet`, `indexUpdate`

**L0 utilities used**: `validateFilePath`, `formatOutput`, `estimateTokens`

**Tool-specific L2 helpers**: none — this orchestrator is intentionally flat

---

### extensions/exec/ — Exec Orchestrator

**Name**: `execOrchestrator`

**Purpose**: Run each command under the configured execution mode (immediate, retry, poll, background) and validate against expectations.

**Composition diagram**:
```
execOrchestrator(args):
  for each command in args.commands:
    validateDirectoryPath(command.cwd)                    # L0

    if command.background:
      handle = spawnProcess(command.cmd, opts)            # L1 process
      return { processId: handle.pid }                   # early exit

    if command.retry:
      result = retryWithBackoff(                          # L1 process
        () => spawnProcess(command.cmd, opts),
        command.retry
      )
    else if command.until:
      proc   = spawnProcess(command.cmd, opts)            # L1 process
      result = pollUntilPattern(                          # L1 process
        proc.stdout,
        command.until.pattern,
        command.until.timeout_ms
      )
    else:
      result = spawnProcess(command.cmd, opts)            # L1 process

    on timeout: killProcess(result.pid)                   # L1 process
    exitInfo = interpretExitCode(result.code, command.cmd) # L1 process
    status   = getProcessStatus(result.pid)               # L1 process
    checkExpectation(result, exitInfo, command.expect)    # L2 exec-helper
```

**L1 atomics used** (6): `spawnProcess`, `retryWithBackoff`, `pollUntilPattern`, `interpretExitCode`, `getProcessStatus`, `killProcess`

**L0 utilities used**: `validateDirectoryPath`, `formatOutput`

**Tool-specific L2 helpers**: `checkExpectation` (compares result against declared exit_code, stdout_contains, stderr_empty expectations and builds structured pass/fail output)

---

### extensions/grep/ — Grep Orchestrator

**Name**: `grepOrchestrator`

**Purpose**: Execute each search query, rank and paginate the results, and format output to the requested level of detail.

**Composition diagram**:
```
grepOrchestrator(args):
  for each query in args.queries:
    validateDirectoryPath(query.path)                     # L0

    cached = searchCacheGet(queryCacheKey(query))         # L1 cache
    if cached:
      raw = cached
    else if query.count_only:
      raw = ripgrepCount(query.pattern, query.path)       # L1 search
    else if query.negate:
      raw = grepNegate(query)                             # L2 grep-helper
    else:
      raw = ripgrepSearch(query.pattern, query.path, opts) # L1 search
      searchCacheSet(queryCacheKey(query), raw)           # L1 cache

    budget  = indexGetTokenEstimate(query.path)           # L1 index
    ranked  = rankResults(raw, query)                     # L2 grep-helper
    paged   = applyPagination(ranked, args.output, budget) # L2 grep-helper
    result  = formatGrepOutput(paged, args.output.format) # L2 grep-helper
```

**L1 atomics used** (6): `ripgrepSearch`, `ripgrepCount`, `ripgrepFileList`, `searchCacheGet`, `searchCacheSet`, `indexGetTokenEstimate`

**L0 utilities used**: `validateDirectoryPath`, `formatOutput`

**Tool-specific L2 helpers**: `rankResults` (score by recency/relevance), `applyPagination` (token-budget-aware slicing), `grepNegate` (inverts ripgrepFileList results against a positive match set), `computeStats` (line/file/match counts), `findRelatedFiles` (sibling test/type files via index), `generateReplacePreview` (dry-run replacement preview)

---

### extensions/glob/ — Glob Orchestrator

**Name**: `globOrchestrator`

**Purpose**: List files matching the given glob patterns, apply metadata filters, and format the result.

**Composition diagram**:
```
globOrchestrator(args):
  validateDirectoryPath(args.base_path)                   # L0

  files = ripgrepFileList(                                # L1 search
    args.base_path,
    args.patterns,
    args.exclude
  )

  enriched  = enrichWithStats(files)                      # L2 glob-helper (calls statFile L1)
  filtered  = applyFilters(enriched, args.filters)        # L2 glob-helper
  formatted = formatGlobOutput(filtered, args.output.format) # L2 glob-helper
```

**L1 atomics used** (2): `ripgrepFileList`, `statFile` (via `enrichWithStats`)

**L0 utilities used**: `validateDirectoryPath`, `formatOutput`

**Tool-specific L2 helpers**: `enrichWithStats` (hydrates file list with stat data), `applyFilters` (size, mtime, extension, gitignore filters), `formatGlobOutput` (paths_only / with_stats / with_content switching)

---

### extensions/fetch/ — Fetch Orchestrator

**Name**: `fetchOrchestrator`

**Purpose**: Fetch each URL, apply the configured authentication strategy, and extract content in the requested format.

**Composition diagram**:
```
fetchOrchestrator(args):
  for each url in args.urls:
    auth     = httpResolveAuth(url, args.auth)            # L2 fetch-helper
    request  = buildRequest(url, args)                    # L2 fetch-helper
    response = httpFetch(request, auth)                   # L2 fetch-helper

    switch(url.extract || args.extract):
      'json':        result = parseJson(response.body)
      'markdown':    result = turndownConvert(response.body)      # L2 fetch-helper
      'readable':    result = readabilityExtract(response.body)   # L2 fetch-helper
      'structured':  result = cssSelectExtract(response.body, url.selectors) # L2 fetch-helper
      'tables':      result = extractTables(response.body)        # L2 fetch-helper
      'code_blocks': result = extractCodeBlocks(response.body)    # L2 fetch-helper
      'links':       result = extractLinks(response.body)         # L2 fetch-helper
      'pdf':         result = pdfExtract(response)                # L2 fetch-helper
      'raw':         result = response.body

    formatOutput(result, args.output)                     # L0 output
```

**L1 atomics used** (0): fetch is self-contained — all HTTP primitives (`httpFetch`, `httpResolveAuth`) are L2-internal helpers within `extensions/fetch/`. No L1 core domain is needed.

**L0 utilities used**: `formatOutput`, `estimateTokens`

**Tool-specific L2 helpers** (existing, well-organized — stay as L2 modules in `extensions/fetch/`): `httpResolveAuth` (resolves auth strategy: bearer, basic, service-registry, none), `httpFetch` (HTTP execution with redirect handling and error classification), `buildRequest` (assembles headers, method, body), `turndownConvert`, `readabilityExtract`, `cssSelectExtract`, `extractTables`, `extractCodeBlocks`, `extractLinks`, `pdfExtract`

---

### extensions/symbols/ — Symbols Orchestrator

**Name**: `symbolsOrchestrator`

**Purpose**: Extract symbol definitions from a single file or across the entire workspace, filtered by kind.

**Composition diagram**:
```
symbolsOrchestrator(args):
  switch(args.mode):
    'workspace':
      files = ripgrepFileList(root, args.globs, [])       # L1 search
      for each file in files:
        if !isLanguageSupported(detectLanguage(file)):    # L1 parse (isLanguageSupported + detectLanguage)
          continue
        content = readFileContent(file)                   # L1 fs
        ast     = treeSitterParse(content, lang)          # L1 parse
        symbols += treeSitterSymbols(ast, args.kinds)     # L1 parse

    'document':
      validateFilePath(args.file)                         # L0
      content = readFileContent(args.file)                # L1 fs
      lang    = detectLanguage(args.file)                 # L1 parse
      ast     = treeSitterParse(content, lang)            # L1 parse
      symbols = treeSitterSymbols(ast, args.kinds)        # L1 parse

  filtered  = filterByKind(symbols, args.kinds)           # L2 symbols-helper
  formatted = formatSignatures(filtered, args.verbosity)  # L2 symbols-helper
```

**L1 atomics used** (6): `ripgrepFileList`, `readFileContent`, `detectLanguage`, `isLanguageSupported`, `treeSitterParse`, `treeSitterSymbols`

**L0 utilities used**: `validateFilePath`, `formatOutput`

**Tool-specific L2 helpers**: `filterByKind` (function/class/interface/type/variable filter), `formatSignatures` (location vs. full-signature output modes)

---

### extensions/notebook/ — Notebook Orchestrator

**Name**: `notebookOrchestrator`

**Purpose**: Apply an ordered sequence of cell operations (replace, insert, delete) to a Jupyter notebook.

**Composition diagram**:
```
notebookOrchestrator(args):
  validateFilePath(args.path)                             # L0
  raw      = readFileContent(args.path)                   # L1 fs
  notebook = parseNotebook(raw)                           # L2 notebook-helper (JSON.parse + schema validate)

  for each op in args.operations:
    switch(op.op):
      'replace': replaceCell(notebook, op.cell_id, op.source, op.cell_type) # L2 notebook-helper
      'insert':  insertCell(notebook, op.after_id, op.source, op.cell_type) # L2 notebook-helper
      'delete':  deleteCell(notebook, op.cell_id)                           # L2 notebook-helper

  serialized = serializeNotebook(notebook)                # L2 notebook-helper
  writeFileContent(args.path, serialized)                 # L1 fs
  fileCacheInvalidate(args.path)                          # L1 cache
```

**L1 atomics used** (3): `readFileContent`, `writeFileContent`, `fileCacheInvalidate`

**L0 utilities used**: `validateFilePath`, `formatOutput`

**Tool-specific L2 helpers**: `parseNotebook` (JSON parse + nbformat schema validation), `replaceCell` (find by cell_id and swap source/type), `insertCell` (find anchor cell and splice new cell after it), `deleteCell` (find by cell_id and remove), `serializeNotebook` (JSON.stringify with 1-space indent per nbformat convention)

---

### extensions/config/ — Config Orchestrator

**Name**: `configOrchestrator`

**Purpose**: Route a configuration action (get, set, reload, status) to the appropriate config atomic.

**Composition diagram**:
```
configOrchestrator(args):
  switch(args.action):
    'get':    value   = getConfigValue(args.key)          # L1 config
              return formatConfigValue(value, args.key)   # L2 config-helper

    'set':    setConfigValue(args.key, args.value)        # L1 config
              return formatConfigValue(args.value, args.key) # L2 config-helper

    'reload': loadConfig(configPath)                      # L1 config
              return { reloaded: true }

    'status': keys   = getAllConfigKeys()                  # L2 config-helper
              values = keys.map(k => getConfigValue(k))   # L1 config
              return formatConfigStatus(values)            # L2 config-helper

    'processes':
              statuses = trackedPids.map(pid =>            # L2 config-helper
                getProcessStatus(pid)                      # L1 process
              )
              return formatProcessList(statuses)           # L2 config-helper
```

**L1 atomics used** (4): `getConfigValue`, `setConfigValue`, `loadConfig`, `getProcessStatus`

**L0 utilities used**: `formatOutput`

**Tool-specific L2 helpers**: `formatConfigValue` (typed value display), `getAllConfigKeys` (returns full key manifest), `formatConfigStatus` (full config dump), `formatProcessList` (tracked background process table)

---

### extensions/agent/ — Agent Orchestrator

**Name**: `agentOrchestrator`

**Purpose**: Build a dossier from the provided context spec and launch a headless Claude process.

**Composition diagram**:
```
agentOrchestrator(args):
  validateDirectoryPath(args.cwd)                         # L0

  dossier = buildDossier(args.dossier)                    # L2 agent-helper
    // Inside buildDossier:
    for each path in dossier.context_files:
      content = readFileContent(path)                     # L1 fs
    memory  = readFileContent(memoryPath)                 # L1 fs
    system  = assembleSystemPrompt(dossier, memory)       # L2 agent-helper

  handle = spawnProcess(claudeCmd, {                      # L1 process
    cwd: args.cwd,
    env: { DOSSIER: serialize(dossier) },
    ...opts
  })

  return { processId: handle.pid }
```

**L1 atomics used** (2): `readFileContent`, `spawnProcess`

**L0 utilities used**: `validateDirectoryPath`, `formatOutput`

**Tool-specific L2 helpers**: `buildDossier` (reads context_files, injects memory, assembles task + scope + constraints), `assembleSystemPrompt` (combines dossier sections into final system prompt string)

---

### extensions/discover/ — Discover Orchestrator

**Name**: `discoverOrchestrator`

**Purpose**: Execute a batch of heterogeneous queries in parallel and merge their results into a unified discovery response.

**Composition diagram**:
```
discoverOrchestrator(args):
  results = []

  // All queries run in parallel
  parallel for each query in args.queries:
    switch(query.type):
      'grep':       r = ripgrepSearch(query.pattern, query.path, opts)      # L1 search
      'glob':       r = ripgrepFileList(query.path, query.patterns, [])     # L1 search
      'symbols':
        files = ripgrepFileList(query.path, query.globs, [])                # L1 search
        for each file in files:
          ast = treeSitterParse(readFileContent(file), detectLanguage(file)) # L1 fs + L1 parse x2
          r += treeSitterSymbols(ast, query.kinds)                          # L1 parse
      'structural':
        files = ripgrepFileList(query.path, query.globs, [])                # L1 search
        for each file in files:
          r += astGrepMatch(query.query, readFileContent(file), lang)       # L1 ast + L1 fs

    results.push({ id: query.id, type: query.type, data: r })

  merged    = mergeResults(results)                       # L2 discover-helper
  for each newly-discovered file not in index:
    indexUpdate(file.path, metadata)                       # L1 index
  formatted = formatDiscoverOutput(merged, args.verbosity) # L2 discover-helper
```

**L1 atomics used** (8): `ripgrepSearch`, `ripgrepFileList`, `readFileContent`, `treeSitterParse`, `treeSitterSymbols`, `astGrepMatch`, `detectLanguage`, `indexUpdate`

**L0 utilities used**: `validateDirectoryPath`, `formatOutput`, `estimateTokens`

**Tool-specific L2 helpers**: `mergeResults` (deduplicates across query types, preserves query IDs), `formatDiscoverOutput` (count_only / files_only / locations switching)

---

**Each L2 orchestrator is a thin composition layer. The business logic lives in L1 atomics. L2 decides WHICH atomics to call and in WHAT ORDER.**

---

## Section 7: L3 — MCP Dispatch

L3 is the outermost layer — the MCP protocol boundary. Its only responsibility is routing MCP tool calls to L2 orchestrators and wrapping the results in MCP-compliant response envelopes. L3 contains zero business logic.

---

### The L3 Test

> "Would this function exist if MCP didn't exist?"

If no, it belongs in L3. If yes, it belongs in L1 or L2.

The dispatch table, the schema definitions, and the server bootstrap would all disappear if MCP were replaced by a different transport. They are L3 by definition.

---

### plugins/dispatch.ts — The Dispatch Table

```typescript
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { readOrchestrator }     from '../extensions/read/orchestrator.js';
import { editOrchestrator }     from '../extensions/edit/orchestrator.js';
import { writeOrchestrator }    from '../extensions/write/orchestrator.js';
import { execOrchestrator }     from '../extensions/exec/orchestrator.js';
import { grepOrchestrator }     from '../extensions/grep/orchestrator.js';
import { globOrchestrator }     from '../extensions/glob/orchestrator.js';
import { fetchOrchestrator }    from '../extensions/fetch/orchestrator.js';
import { symbolsOrchestrator }  from '../extensions/symbols/orchestrator.js';
import { notebookOrchestrator } from '../extensions/notebook/orchestrator.js';
import { configOrchestrator }   from '../extensions/config/orchestrator.js';
import { agentOrchestrator }    from '../extensions/agent/orchestrator.js';
import { discoverOrchestrator } from '../extensions/discover/orchestrator.js';
import { toCallToolResult }     from '../shared/mcp-adapter.js';

const DISPATCH_TABLE: Record<string, (args: unknown) => Promise<CallToolResult>> = {
  'precision_read':     (args) => toCallToolResult(readOrchestrator(args)),
  'precision_edit':     (args) => toCallToolResult(editOrchestrator(args)),
  'precision_write':    (args) => toCallToolResult(writeOrchestrator(args)),
  'precision_exec':     (args) => toCallToolResult(execOrchestrator(args)),
  'precision_grep':     (args) => toCallToolResult(grepOrchestrator(args)),
  'precision_glob':     (args) => toCallToolResult(globOrchestrator(args)),
  'precision_fetch':    (args) => toCallToolResult(fetchOrchestrator(args)),
  'precision_symbols':  (args) => toCallToolResult(symbolsOrchestrator(args)),
  'precision_notebook': (args) => toCallToolResult(notebookOrchestrator(args)),
  'precision_config':   (args) => toCallToolResult(configOrchestrator(args)),
  'precision_agent':    (args) => toCallToolResult(agentOrchestrator(args)),
  'discover':           (args) => toCallToolResult(discoverOrchestrator(args)),
};

export function dispatch(name: string, args: unknown): Promise<CallToolResult> {
  const handler = DISPATCH_TABLE[name];
  if (!handler) throw new UnknownToolError(name);
  return handler(args);
}
```

The dispatch table is the complete L3 routing surface. 12 entries (11 `precision_*` tools + `discover`). No conditionals, no validation, no business logic.

---

### plugins/schemas.ts — Schema Definitions

Schemas live in a **single `plugins/schemas.ts` file** — a pure data file with no imports from L1 or L2. All 12 tool schema definitions are named exports inline in one file. This is intentional: schemas are pure data (JSON Schema / Zod object literals), not logic, and the file split is handled by the L2 layer. Splitting schemas into per-tool files would add 11 extra files for negligible benefit.

```typescript
// All 12 tool schemas as named exports — pure data, no logic, no imports from L1/L2
export const precisionReadSchema = { /* ... */ };
export const precisionEditSchema = { /* ... */ };
export const precisionWriteSchema = { /* ... */ };
export const precisionExecSchema = { /* ... */ };
export const precisionGrepSchema = { /* ... */ };
export const precisionGlobSchema = { /* ... */ };
export const precisionFetchSchema = { /* ... */ };
export const precisionSymbolsSchema = { /* ... */ };
export const precisionNotebookSchema = { /* ... */ };
export const precisionConfigSchema = { /* ... */ };
export const precisionAgentSchema = { /* ... */ };
export const discoverSchema = { /* ... */ };
```

No validation logic — validation is an L0 utility (`validateArgs`, to be added to `shared/params.ts`) called by each L2 orchestrator.

---

### plugins/server.ts — MCP Server Bootstrap

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { dispatch } from './dispatch.js';
import * as schemas from './schemas.js';

const server = new Server(
  { name: 'precision-engine', version: '2.0.0' },
  { capabilities: { tools: {} } }
);

// List all tools — returns schema array
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: Object.values(schemas),
}));

// Call a tool — routes to dispatch table
server.setRequestHandler(CallToolRequestSchema, async (request) => (
  dispatch(request.params.name, request.params.arguments)
));

// Connect transport and start
const transport = new StdioServerTransport();
await server.connect(transport);
```

That is the complete server bootstrap. No business logic. `listTools` returns the schema array. `callTool` calls `dispatch`. The server has no knowledge of what any tool does.

---

### Before and After: Illustrated with precision_read

**BEFORE (`precision-read.ts` — 1,634 lines, all concerns mixed):**

```
export async function handlePrecisionRead(args: unknown): Promise<CallToolResult> {
  //
  // L0: parameter parsing, schema validation                     (~50 lines)
  //     -- belongs in shared/validation.ts + L0 utilities
  //
  // L1: ripgrep-based file listing for 'search' extract mode     (~80 lines)
  //     -- belongs in core/search/ripgrep.ts
  //
  // L1: file reading with cache lookup and stat                  (~100 lines)
  //     -- belongs in core/fs/read.ts + core/cache/file-cache.ts
  //
  // L1: language detection                                       (~30 lines)
  //     -- belongs in core/parse/languages.ts
  //
  // L1: tree-sitter parse, outline, symbols extraction           (~300 lines)
  //     -- belongs in core/parse/tree-sitter.ts
  //
  // L2: extract mode routing logic                               (~100 lines)
  //     -- belongs in extensions/read/orchestrator.ts
  //
  // L2: token-budget pagination                                  (~120 lines)
  //     -- belongs in extensions/read/orchestrator.ts (L2 helper)
  //
  // L1: line range extraction                                    (~50 lines)
  //     -- belongs in core/fs/read.ts or L0 text utility
  //
  // L0: output formatting, verbosity control, token estimation   (~200 lines)
  //     -- belongs in shared/output.ts + shared/tokens.ts
  //
  // L3: MCP response wrapping                                    (~20 lines)
  //     -- belongs in plugins/dispatch.ts via toCallToolResult()
  //
  // ... 584 more lines of further mixed concerns
}
```

**AFTER (all concerns separated, each in its correct layer):**

```typescript
// L3: plugins/dispatch.ts
// 1 line — the entire MCP surface for precision_read
'precision_read': (args) => toCallToolResult(readOrchestrator(args))


// L2: extensions/read/orchestrator.ts
// ~80 lines — routes extract modes, calls atomics in sequence
export async function readOrchestrator(args: ReadArgs): Promise<ReadResult> {
  const parsed = validateArgs(readSchema, args);          // L0
  // ... calls L1 atomics per file, per extract mode
}


// L1: core/fs/read.ts
// ~30 lines — one function, one responsibility
export async function readFileContent(path: string): Promise<string> {
  return fs.readFile(path, 'utf-8');
}

// L1: core/parse/tree-sitter.ts
// ~50 lines per function
export function treeSitterParse(content: string, lang: Language): Tree { ... }
export function treeSitterOutline(ast: Tree): OutlineNode[] { ... }
export function treeSitterSymbols(ast: Tree, filter: SymbolFilter): Symbol[] { ... }

// L1: core/cache/file-cache.ts
// ~20 lines per function
export function fileCacheGet(path: string): CacheEntry | null { ... }
export function fileCacheSet(path: string, content: string, hash: string): void { ... }

// L0: shared/output.ts, shared/tokens.ts, shared/path.ts
// Shared across ALL 12 tools — written once, used everywhere
export function formatOutput(result: unknown, opts: OutputOpts): string { ... }
export function estimateTokens(content: string): number { ... }
export function validateFilePath(path: string): void { ... }
```

**The result**: The 1,634-line file becomes ~80 lines of orchestration. The extracted logic lives in small, named, single-concern functions that are individually understandable, independently testable, and reused across all 12 tools.

---

### L3 Summary

L3 contains exactly 3 files:

| File | Contents | Line Count |
|------|----------|------------|
| `plugins/dispatch.ts` | Dispatch table (12 entries) + `dispatch()` function | ~25 lines |
| `plugins/schemas.ts` | Single file with all 12 tool schema definitions as named exports (pure data, ~888 lines) | ~888 lines |
| `plugins/server.ts` | MCP server bootstrap with 2 request handlers | ~25 lines |

**L3 contains exactly 1 dispatch table, 1 schema file, and 1 server bootstrap. No business logic. Each handler is 1 line.**
# Precision Engine Atomic Decomposition — Part 3

## Section 8: Target File Structure

The complete target directory tree, organized by layer:

```
src/
├── shared/                          # L0 — Pure utilities, zero internal deps
│   ├── types.ts                     # OutputMode, PrecisionResult, FileSpec, EditSpec, etc.
│   ├── constants.ts                 # DEFAULT_EXCLUDES, TEXT_EXTENSIONS, DEFAULTS
│   ├── response.ts                  # toCallToolResult(), successResult(), errorResult()
│   ├── errors.ts                    # formatMissingParamError(), createErrorResult(), etc.
│   ├── params.ts                    # parseJsonField(), resolveStringField()
│   ├── output.ts                    # parseOutputMode(), mergeDefaults()
│   ├── path.ts                      # normalizePath(), validateFilePath(), validateDirectoryPath()
│   ├── text.ts                      # isTextFile(), extractLines()
│   ├── tokens.ts                    # estimateTokens() — ONE location (was 6 copies)
│   ├── timing.ts                    # startTimer()
│   ├── deprecation.ts               # warnDeprecatedParam()
│   └── index.ts                     # Barrel export
│
├── core/                            # L1 — Single-concern atomics, depends only on L0
│   ├── fs/                          # File system operations
│   │   ├── read.ts                  # readFileContent(), readFileBuffer()
│   │   ├── write.ts                 # writeFileContent(), ensureDirectory(), deleteFile()
│   │   ├── stat.ts                  # statFile(), statFileOrNull()
│   │   ├── backup.ts                # createBackup(), restoreBackup(), generateBackupPath()
│   │   └── index.ts
│   ├── search/                      # Ripgrep wrapper
│   │   ├── ripgrep.ts               # ripgrepSearch(), ripgrepFileList(), ripgrepCount()
│   │   └── index.ts
│   ├── parse/                       # Tree-sitter wrapper
│   │   ├── tree-sitter.ts           # treeSitterParse(), treeSitterOutline(), treeSitterSymbols()
│   │   ├── languages.ts             # detectLanguage(), getLanguageFromExtension(), isLanguageSupported()
│   │   └── index.ts
│   ├── ast/                         # AST-grep wrapper
│   │   ├── ast-grep.ts              # astGrepMatch(), astGrepReplace()
│   │   └── index.ts
│   ├── match/                       # String matching
│   │   ├── exact.ts                 # findExactMatch()
│   │   ├── fuzzy.ts                 # fuzzyMatch(), levenshteinDistance(), calculateSimilarity()
│   │   ├── regex.ts                 # regexMatch()
│   │   └── index.ts
│   ├── process/                     # Process management
│   │   ├── spawn.ts                 # spawnProcess(), killProcess(), getProcessStatus()
│   │   ├── retry.ts                 # retryWithBackoff(), shouldRetry()
│   │   ├── poll.ts                  # pollUntilPattern()
│   │   ├── exit-codes.ts            # interpretExitCode()
│   │   └── index.ts
│   ├── cache/                       # Caching
│   │   ├── file-cache.ts            # fileCacheGet(), fileCacheSet(), fileCacheInvalidate(), fileCacheStatus()
│   │   ├── search-cache.ts          # searchCacheGet(), searchCacheSet()
│   │   └── index.ts
│   ├── index/                       # Project indexing
│   │   ├── project-index.ts         # indexLookup(), indexUpdate(), indexGetTokenEstimate()
│   │   ├── project-indexer.ts       # indexBuild()
│   │   └── index.ts
│   ├── config/                      # Runtime configuration
│   │   ├── runtime-config.ts        # getConfigValue(), setConfigValue(), loadConfig()
│   │   └── index.ts
│   └── index.ts                     # Barrel export
│
├── extensions/                      # L2 — Orchestrators composing L1
│   ├── read/                        # precision_read tool
│   │   ├── orchestrator.ts          # readOrchestrator() — compose: validate → cache → read → extract → format
│   │   ├── extractors.ts            # contentExtractor(), outlineExtractor(), symbolsExtractor(), astExtractor(), lineExtractor()
│   │   └── index.ts
│   ├── edit/                        # precision_edit tool
│   │   ├── orchestrator.ts          # editOrchestrator() — compose: validate → read → match → replace → write → verify
│   │   ├── transaction.ts           # transactionManager() — backup → try → rollback on fail
│   │   ├── matchers.ts              # dispatchMatch() — route to exact/fuzzy/regex/ast
│   │   └── index.ts
│   ├── write/                       # precision_write tool
│   │   ├── orchestrator.ts          # writeOrchestrator() — compose: validate → backup → write → cache → index
│   │   └── index.ts
│   ├── exec/                        # precision_exec tool
│   │   ├── orchestrator.ts          # execOrchestrator() — compose: validate → spawn → retry/poll → interpret → format
│   │   ├── background.ts            # backgroundExecOrchestrator() — long-running process management
│   │   ├── overflow.ts              # handleOverflow() — large output handling
│   │   ├── progress.ts              # createProgressCollector() — progress tracking
│   │   └── index.ts
│   ├── grep/                        # precision_grep tool
│   │   ├── orchestrator.ts          # grepOrchestrator() — compose: validate → search → rank → paginate → format
│   │   ├── ranking.ts               # rankResults(), computeStats()
│   │   ├── pagination.ts            # applyPagination(), tokenBudgetedSlice()
│   │   ├── negation.ts              # findFilesWithoutPattern()
│   │   ├── relationships.ts         # findRelatedFiles()
│   │   ├── replace-preview.ts       # generateReplacePreview()
│   │   └── index.ts
│   ├── glob/                        # precision_glob tool
│   │   ├── orchestrator.ts          # globOrchestrator() — compose: validate → list → filter → format
│   │   ├── filters.ts               # applyFilters() — size, date, content filters
│   │   └── index.ts
│   ├── fetch/                       # precision_fetch tool
│   │   ├── orchestrator.ts          # fetchOrchestrator() — compose: auth → request → fetch → extract
│   │   ├── auth/                    # Authentication strategies
│   │   │   ├── bearer.ts            # BearerAuth strategy
│   │   │   ├── basic.ts             # BasicAuth strategy
│   │   │   ├── api-key.ts           # ApiKeyAuth strategy
│   │   │   ├── oauth2.ts            # OAuth2Auth strategy
│   │   │   ├── session.ts           # SessionAuth strategy
│   │   │   ├── orchestrator.ts      # resolveAuth() — select + apply strategy
│   │   │   └── index.ts
│   │   ├── extractors/              # Content extraction
│   │   │   ├── turndown.ts          # HTML → Markdown conversion
│   │   │   ├── readability.ts       # Article extraction
│   │   │   ├── css-selectors.ts     # CSS selector extraction
│   │   │   ├── tables.ts            # Table extraction
│   │   │   ├── links.ts             # Link extraction
│   │   │   ├── code-blocks.ts       # Code block extraction
│   │   │   ├── pdf-routing.ts       # PDF content extraction
│   │   │   ├── html-utils.ts        # HTML utility functions
│   │   │   └── index.ts
│   │   ├── services/                # Service registry
│   │   │   ├── registry.ts          # ServiceRegistry — named service management
│   │   │   ├── resolver.ts          # ServiceResolver — resolve URL → service
│   │   │   ├── request-builder.ts   # RequestBuilder — construct HTTP requests
│   │   │   ├── secrets-store.ts     # SecretsStore — secure credential storage
│   │   │   ├── secrets-guard.ts     # SecretsGuard — prevent credential leakage
│   │   │   ├── cookie-jar.ts        # CookieJar — HTTP cookie management
│   │   │   ├── rate-limiter.ts      # RateLimiter — request rate limiting
│   │   │   ├── redirect-tracker.ts  # RedirectTracker — follow redirects
│   │   │   ├── format-negotiation.ts # FormatNegotiation — content type negotiation
│   │   │   ├── content-fingerprint.ts # ContentFingerprint — content dedup
│   │   │   ├── content-type.ts      # ContentType — MIME type detection
│   │   │   └── index.ts
│   │   └── index.ts
│   ├── symbols/                     # precision_symbols tool
│   │   ├── orchestrator.ts          # symbolsOrchestrator() — compose: search/parse → extract → filter → format
│   │   ├── formatters.ts            # formatSignature(), formatSymbolLocation()
│   │   └── index.ts
│   ├── notebook/                    # precision_notebook tool
│   │   ├── orchestrator.ts          # notebookOrchestrator() — compose: validate → read → modify → write
│   │   ├── operations.ts            # replaceCell(), insertCell(), deleteCell(), parseNotebook()
│   │   └── index.ts
│   ├── config/                      # precision_config tool
│   │   ├── orchestrator.ts          # configOrchestrator() — compose: get/set/reload
│   │   └── index.ts
│   ├── agent/                       # precision_agent tool
│   │   ├── orchestrator.ts          # agentOrchestrator() — compose: dossier → spawn → track
│   │   ├── dossier.ts               # buildDossier() — context assembly
│   │   └── index.ts
│   ├── discover/                    # discover tool
│   │   ├── orchestrator.ts          # discoverOrchestrator() — compose: multi-query → merge → format
│   │   └── index.ts
│   └── index.ts                     # Barrel export
│
├── state/                           # Singleton lifecycle management
│   ├── session.ts                   # SessionState — per-session state
│   ├── telemetry.ts                 # Telemetry — metrics + cost tracking
│   ├── hooks.ts                     # HooksManager — pre/post tool hooks
│   ├── mode.ts                      # ModeManager — output mode enforcement
│   ├── runtime.ts                   # PrecisionRuntime — session metadata
│   ├── kv.ts                        # KVState — key-value storage
│   ├── history.ts                   # CommandHistory — command log
│   └── index.ts                     # Barrel export
│
├── plugins/                         # L3 — MCP dispatch only
│   ├── dispatch.ts                  # DISPATCH_TABLE — tool name → L2 orchestrator mapping
│   ├── schemas.ts                   # MCP tool schema definitions for all 12 tools
│   ├── server.ts                    # MCP server setup, listTools(), callTool()
│   └── index.ts                     # Barrel export
│
├── index.ts                         # Entry point — server bootstrap
└── build-index-cli.ts               # CLI tool for building project index
```

### Layer Summary

| Layer | Directory | Files | Purpose |
|-------|-----------|-------|---------|
| L0 | shared/ | 12 | Pure utilities, types, constants |
| L1 | core/ | 30 | Single-concern domain atomics |
| L2 | extensions/ | 68 | Tool-specific orchestrators + helpers (includes fetch subdirs) |
| L2+ | extensions/fetch/ | 30 | Fetch auth(7), extractors(9), services(12), orchestrator+index(2) |
| L3 | plugins/ | 4 | MCP dispatch table + schemas + server |
| L0+ | state/ | 8 | Cross-cutting infrastructure: singleton lifecycle management. Sits alongside L0 — state singletons provide mutable runtime state accessed by L1 and L2; they depend only on L0 types. Not L1 because they are stateful, not atomic. |
| Root | . | 2 | Entry point + CLI |
| **Total** | | **~124** | |

### Before/After Comparison

```
BEFORE: 86 files, mixed concerns, 5x duplicated estimateTokens, 1000+ line handlers
AFTER: ~124 files, single concern per file, zero duplication, handlers are 1-line dispatchers
```

File count INCREASES — this is intentional. More files with single concerns is better than fewer files with mixed concerns. Each file in the target structure is:

- **Small** — 30-80 lines typical for L1, 80-150 lines for L2
- **Single-purpose** — one sentence describes what it does
- **Independently testable** — no entangled dependencies to mock
- **Reusable** — any tool needing that operation imports from the same place

---

## Section 9: Dependency Graph

The dependency graph below proves no circular dependencies exist. All arrows point downward — from higher layers to lower layers, and from lower layers only to Node.js builtins or external packages.

```
┌─────────────────────────────────────────────────────────────────────┐
│                        L3: MCP DISPATCH                             │
│  plugins/dispatch.ts ──→ extensions/**/orchestrator.ts              │
│  plugins/schemas.ts  (pure data, no deps)                           │
│  plugins/server.ts   ──→ dispatch.ts + schemas.ts                   │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │ calls
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     L2: TOOL ORCHESTRATORS                          │
│                                                                     │
│  read/orchestrator    ──→ core/fs, core/parse, core/cache, core/index│
│  edit/orchestrator    ──→ core/fs, core/match, core/ast, core/cache, core/parse, core/index │
│  write/orchestrator   ──→ core/fs, core/cache, core/index           │
│  exec/orchestrator    ──→ core/process                              │
│  grep/orchestrator    ──→ core/search, core/cache, core/index       │
│  glob/orchestrator    ──→ core/search, core/fs                      │
│  fetch/orchestrator   ──→ fetch/auth, fetch/extractors, fetch/services│
│  symbols/orchestrator ──→ core/search, core/parse, core/fs          │
│  notebook/orchestrator──→ core/fs, core/cache                       │
│  config/orchestrator  ──→ core/config, core/process                 │
│  agent/orchestrator   ──→ core/process, core/fs                     │
│  discover/orchestrator──→ core/search, core/parse, core/ast, core/fs, core/index │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │ calls
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       L1: CORE ATOMICS                              │
│                                                                     │
│  core/fs/       ──→ shared/path, shared/errors                      │
│  core/search/   ──→ shared/constants (DEFAULT_EXCLUDES)             │
│  core/parse/    ──→ shared/ (external: tree-sitter)                 │
│  core/ast/      ──→ shared/ (external: ast-grep)                    │
│  core/match/    ──→ shared/                                         │
│  core/process/  ──→ shared/errors                                   │
│  core/cache/    ──→ shared/tokens, shared/timing                    │
│  core/index/    ──→ shared/tokens, core/fs                          │
│  core/config/   ──→ shared/                                         │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │ imports
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     L0: SHARED FOUNDATION                           │
│                                                                     │
│  shared/types.ts       ──→ (none)                                   │
│  shared/constants.ts   ──→ (none)                                   │
│  shared/response.ts    ──→ shared/types                             │
│  shared/errors.ts      ──→ shared/types                             │
│  shared/params.ts      ──→ (none)                                   │
│  shared/output.ts      ──→ shared/types                             │
│  shared/path.ts        ──→ (external: path, fs)                     │
│  shared/text.ts        ──→ (none)                                   │
│  shared/tokens.ts      ──→ (none)                                   │
│  shared/timing.ts      ──→ (none)                                   │
│  shared/deprecation.ts ──→ (none)                                   │
└─────────────────────────────────────────────────────────────────────┘
                                   │ imports
                                   ▼
                          (Node.js builtins only)
```

### Cross-Layer Access Matrix

Which L2 orchestrators depend on which L1 core domains:

| L2 Orchestrator | fs | search | parse | ast | match | process | cache | index | config |
|-----------------|----|--------|-------|-----|-------|---------|-------|-------|--------|
| read            | ✓  |        | ✓     |     |       |         | ✓     | ✓     |        |
| edit            | ✓  |        | ✓     | ✓   | ✓     |         | ✓     | ✓     |        |
| write           | ✓  |        |       |     |       |         | ✓     | ✓     |        |
| exec            |    |        |       |     |       | ✓       |       |       |        |
| grep            |    | ✓      |       |     |       |         | ✓     | ✓     |        |
| glob            | ✓  | ✓      |       |     |       |         |       |       |        |
| fetch           |    |        |       |     |       |         |       |       |        |
| symbols         | ✓  | ✓      | ✓     |     |       |         |       |       |        |
| notebook        | ✓  |        |       |     |       |         | ✓     |       |        |
| config          |    |        |       |     |       | ✓       |       |       | ✓      |
| agent           | ✓  |        |       |     |       | ✓       |       |       |        |
| discover        | ✓  | ✓      | ✓     | ✓   |       |         |       | ✓     |        |

### What the Matrix Proves

- **core/fs** is the most shared L1 domain — used by 8 tools (read, edit, write, notebook, agent, glob, symbols, discover)
- **core/search** is next — used by 4 tools (grep, glob, symbols, discover)
- **core/parse** used by 4 tools (read, edit, symbols, discover)
- **core/cache** used by 5 tools (read, edit, write, grep, notebook) — cross-tool caching consistency
- **core/index** used by 5 tools (read, write, edit, grep, discover) — any tool that reads or mutates files tracks token estimates or updates file metadata
- **core/match** and **core/ast** are narrow (1-2 tools each) — but correct as L1 because they are single-concern with no upward references
- **fetch** is self-contained — its L2 orchestrator uses no other L1 core domains; auth/extractors/services are all fetch-internal L2 helpers that depend only on shared/
- **core/process** used by 3 tools (exec, config, agent) — exec spawns, config monitors, agent launches
- No L1 module references another L1 module, with one documented exception: core/index/ depends on core/fs/ for file metadata operations. This is a deliberate design choice — index building requires reading file stats. See Section 5 for the explicit amendment to the L1 rule.

---

## Section 10: Migration Plan

Each phase is independently deployable and verifiable. Phases do not overlap — each phase starts from a passing typecheck and test suite and must end with one too.

### Phase 1: Extract L0 Foundation

**Risk: LOW** — Moving existing code, not changing behavior. All callers get updated imports, no logic changes.

```
1a. Create shared/ directory with 11 modules:
    types.ts, constants.ts, response.ts, errors.ts, params.ts,
    output.ts, path.ts, text.ts, tokens.ts, timing.ts, deprecation.ts

1b. Move existing functions from:
    utils/index.ts         → shared/tokens.ts, shared/text.ts, shared/output.ts
    utils/errors.ts        → shared/errors.ts
    utils/path-validation.ts → shared/path.ts
    utils/deprecation.ts   → shared/deprecation.ts
    logging.ts             → shared/response.ts
    config.ts              → shared/constants.ts

1c. DEDUP: Remove 5 local estimateTokens() copies from these handlers:
    precision-read.ts, precision-edit.ts, precision-grep.ts,
    precision-glob.ts, precision-symbols.ts
    → all import from shared/tokens.ts

1d. DEDUP: Remove normalizePath() copy from precision-read.ts
    → import from shared/path.ts

1e. Update ALL imports across all handler files

1f. Create shared/index.ts barrel export

1g. Verify: npm run typecheck && npm run test
```

- Files created: 12 (shared/ modules)
- Files modified: ~20 (import changes only)
- Files deleted: 0
- Lines changed: ~200 (import rewiring)

### Phase 2: Extract L1 Core Atomics

**Risk: MEDIUM** — Extracting inline code from handlers into new files. Handlers remain functional throughout; they call the new L1 functions directly.

```
2a. Create core/fs/
    Extract from: handlers and safe-overwrite.ts
    New functions: readFileContent(), readFileBuffer(), writeFileContent(),
                   ensureDirectory(), deleteFile(), statFile(), statFileOrNull(),
                   createBackup(), restoreBackup(), generateBackupPath()

2b. Create core/search/
    Rename + re-export from: existing core/ripgrep.ts
    New function names: ripgrepSearch(), ripgrepFileList(), ripgrepCount()

2c. Create core/parse/
    Rename + re-export from: existing core/tree-sitter.ts + core/languages.ts
    New function names: treeSitterParse(), treeSitterOutline(), treeSitterSymbols(),
                        detectLanguage(), getLanguageFromExtension(), isLanguageSupported()

2d. Create core/ast/
    Rename + re-export from: existing core/ast-grep.ts
    New function names: astGrepMatch(), astGrepReplace()

2e. Create core/match/
    Extract from: precision-edit.ts (inline matching logic)
    Move: utils/fuzzy.ts → core/match/fuzzy.ts
    New functions: findExactMatch(), fuzzyMatch(), levenshteinDistance(),
                   calculateSimilarity(), regexMatch()

2f. Create core/process/
    Extract from: state/process-manager.ts, utils/retry-engine.ts,
                  utils/exit-codes.ts, inline exec handler code
    New functions: spawnProcess(), killProcess(), getProcessStatus(),
                   retryWithBackoff(), shouldRetry(), pollUntilPattern(),
                   interpretExitCode()

2g. Create core/cache/
    Re-export from: state/file-cache.ts → core/cache/file-cache.ts
    Re-export from: state/search-cache.ts → core/cache/search-cache.ts

2h. Create core/index/
    Re-export from: state/project-index.ts → core/index/project-index.ts
    Re-export from: state/project-indexer.ts → core/index/project-indexer.ts

2i. Create core/config/
    Extract from: runtime-config.ts
    New functions: getConfigValue(), setConfigValue(), loadConfig()

2j. Create core/index.ts barrel export

2k. Verify: npm run typecheck && npm run test
```

- Files created: ~25
- Files modified: ~15 (handlers updated to call L1 functions)
- Files deleted: 0
- Lines moved: ~2,000 (from handlers into L1 files)

### Phase 3: Create L2 Orchestrators

**Risk: MEDIUM-HIGH** — Restructuring handler internals. This is the largest phase. Each tool gets its own extensions/{tool}/ directory, and business logic moves from the flat handler file into the orchestrator. The handler file remains but now delegates.

```
3a. For each of the 12 tools, create extensions/{tool}/orchestrator.ts
    Tools: read, edit, write, exec, grep, glob, fetch, symbols,
           notebook, config, agent, discover

3b. Move business logic from each handler into its orchestrator:
    The handler calls orchestrator(params, state) and wraps the result.
    The orchestrator contains all the multi-step coordination logic.

3c. Create tool-specific L2 helpers:
    grep/ranking.ts       — rankResults(), computeStats()
    grep/pagination.ts    — applyPagination(), tokenBudgetedSlice()
    grep/negation.ts      — findFilesWithoutPattern()
    grep/relationships.ts — findRelatedFiles()
    grep/replace-preview.ts — generateReplacePreview()
    edit/transaction.ts   — transactionManager()
    edit/matchers.ts      — dispatchMatch()
    exec/background.ts    — backgroundExecOrchestrator()
    exec/overflow.ts      — handleOverflow()
    exec/progress.ts      — createProgressCollector()
    glob/filters.ts       — applyFilters()
    read/extractors.ts    — contentExtractor(), outlineExtractor(), etc.
    symbols/formatters.ts — formatSignature(), formatSymbolLocation()
    notebook/operations.ts — replaceCell(), insertCell(), deleteCell(), parseNotebook()
    agent/dossier.ts      — buildDossier()

3d. Move fetch auth/, extractors/, services/ into extensions/fetch/
    (Already well-organized — minimal structural change, mostly path updates)

3e. Each handler file is now a thin delegation shell:
    import { readOrchestrator } from '../extensions/read/orchestrator';
    export async function handle(params, state) {
      return readOrchestrator(params, state);
    }

3f. Create extensions/index.ts barrel export

3g. Verify: npm run typecheck && npm run test
```

- Files created: ~40
- Files modified: ~15 (handlers reduced to delegation shells)
- Files deleted: 0
- Lines moved: ~8,000 (from handlers into orchestrators and helpers)

### Phase 4: Thin L3 Dispatch

**Risk: LOW** — All logic is already in L2. This phase is pure wiring. Handler files are replaced by entries in a dispatch table.

```
4a. Create plugins/dispatch.ts with DISPATCH_TABLE:
    const DISPATCH_TABLE: Record<string, Orchestrator> = {
      precision_read:     readOrchestrator,
      precision_edit:     editOrchestrator,
      precision_write:    writeOrchestrator,
      precision_exec:     execOrchestrator,
      precision_grep:     grepOrchestrator,
      precision_glob:     globOrchestrator,
      precision_fetch:    fetchOrchestrator,
      precision_symbols:  symbolsOrchestrator,
      precision_notebook: notebookOrchestrator,
      precision_config:   configOrchestrator,
      precision_agent:    agentOrchestrator,
      discover:           discoverOrchestrator,
    };

4b. Create plugins/schemas.ts
    Move schema definitions from schemas/index.ts
    Pure data — no imports from L1 or L2

4c. Create plugins/server.ts
    Extract MCP server setup from index.ts
    callTool() implementation: look up DISPATCH_TABLE, call orchestrator, return result

4d. Remove old handlers/ directory (13 handler files replaced by dispatch entries)

4e. Move state/ singletons to new state/ path (keep implementations as-is)

4f. Update index.ts to import from plugins/server.ts

4g. Verify: npm run typecheck && npm run test
```

- Files created: 4 (dispatch.ts, schemas.ts, server.ts, index.ts)
- Files modified: 2 (index.ts, build config)
- Files deleted: 13 (old handler files)

### Phase 5: Cleanup

**Risk: LOW** — Removing dead code only. No behavior changes.

```
5a. Remove empty/dead utils/ files
    Functions moved to shared/ or core/ in phases 1-2
    Candidates: utils/index.ts (gutted), utils/errors.ts (moved),
                utils/path-validation.ts (moved), utils/fuzzy.ts (moved),
                utils/retry-engine.ts (moved), utils/exit-codes.ts (moved)

5b. Remove old core/ wrapper files replaced by new organized modules:
    core/ripgrep.ts      → replaced by core/search/ripgrep.ts
    core/tree-sitter.ts  → replaced by core/parse/tree-sitter.ts
    core/ast-grep.ts     → replaced by core/ast/ast-grep.ts
    core/languages.ts    → replaced by core/parse/languages.ts

5c. Update build configuration (esbuild/rollup entry points)

5d. Run full test suite to confirm nothing broke

5e. Verify zero circular dependencies:
    npx madge --circular src/
    Expected output: No circular dependency found!
```

- Files created: 0
- Files modified: 1 (build config)
- Files deleted: ~10 (old utils/ and core/ files)

### Migration Summary Table

| Phase | Description | Files Created | Files Modified | Files Deleted | Risk | Verification |
|-------|-------------|---------------|----------------|---------------|------|--------------|
| 1 | Extract L0 | 12 | ~20 (imports) | 0 | LOW | typecheck + test |
| 2 | Extract L1 | ~25 | ~15 (handlers) | 0 | MEDIUM | typecheck + test |
| 3 | Create L2 | ~40 | ~15 (handlers) | 0 | MEDIUM-HIGH | typecheck + test |
| 4 | Thin L3 | 4 | 2 (index, config) | 13 (handlers) | LOW | typecheck + test |
| 5 | Cleanup | 0 | 1 (build) | ~10 (old utils/core) | LOW | typecheck + test + madge |

**Total**: 81 files created, ~53 files modified, ~23 files deleted
**Net change**: 86 files → ~124 files (more files, single concern each, zero duplication)

---

## Key Metrics

| Metric | Before | After |
|--------|--------|-------|
| Total files | 86 | ~124 |
| Max handler size | 1,952 lines | ~80 lines (L2 orchestrator) |
| estimateTokens() copies | 6 | 1 |
| normalizePath() copies | 2 | 1 |
| Avg lines per file | ~340 | ~236 (29,250 lines / 124 files; median lower due to small barrel exports ~5 lines each) |
| Circular dependencies | Unknown | 0 (enforced by layer rules) |
| L3 handler lines | 1000+ | 1 (dispatch entry) |
| Independently testable units | ~20 | ~80 |
