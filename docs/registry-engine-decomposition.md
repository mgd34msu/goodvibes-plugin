# Registry Engine — Atomic Decomposition (v2)

> Every function, variable, type, and constant across all 10 source files, analyzed by what it does, assigned to the correct architectural layer, renamed where appropriate.

## Reference Architecture

| Layer | Name | Purpose | Dependency Direction |
|-------|------|---------|---------------------|
| L0 | `shared/` | Config, logging, constants, generic utilities, reusable types | — (depends on nothing internal) |
| L1 | `core/` | Domain types, interfaces, single-concern domain functions | → shared only |
| L2 | `extensions/` | One dir per domain concern, multi-concern orchestration | → core, shared |
| L3 | `plugins/` | MCP thin dispatchers, external API surface | → extensions, core, shared |

Dependencies flow **downward only**. Never upward, never horizontal between sibling files (only through barrel exports).

**L1 vs L2 distinction:** L1 functions each do exactly one atomic thing (even if that involves I/O — e.g., loading a file and parsing it is one concern). L2 functions compose multiple L1 functions into business workflows (e.g., resolve a path, read the file, parse frontmatter, fall back to regex extraction — that's multi-concern orchestration).

---

## Current File Inventory

```
registry-engine/src/
├── index.ts              (299 lines)  — LazyRegistryLoader + RegistryEngineServer + main()
├── config.ts             (76 lines)   — constants, path resolution, Fuse config
├── logging.ts            (56 lines)   — logger, timer, token estimator
├── types.ts              (94 lines)   — all type definitions
├── utils.ts              (181 lines)  — file I/O, registry loading, search, metadata parsing, response helpers
├── handlers/
│   ├── index.ts          (55 lines)   — handler dispatch map
│   ├── search.ts         (105 lines)  — search handlers + duplicate search function
│   ├── content.ts        (63 lines)   — content retrieval handlers
│   └── dependencies.ts   (184 lines)  — monolithic dependency analysis
└── schemas/
    └── index.ts          (93 lines)   — MCP tool schema definitions
```

**Total: 10 files, 1,206 lines**

---

## Atomic Element Inventory

Every exported and internal element, its current location, what it does, its target layer, and its new name (where renamed).

### `config.ts` — 8 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 1 | `SERVER_NAME` | const | config.ts:11 | Server identity string `'registry-engine'` | **L0 shared/constants.ts** | — | Static identity constant, no domain logic |
| 2 | `SERVER_VERSION` | const | config.ts:12 | Version string `'1.0.0'` | **L0 shared/constants.ts** | — | Static identity constant |
| 3 | `getEsmDir()` | function | config.ts:26-29 | Resolves current file's directory via `import.meta.url` in ESM context | **L0 shared/utils.ts** | `resolveEsmDir()` | Verb-first naming; generic path utility |
| 4 | `getConfigDir()` | function | config.ts:31-37 | Resolves config directory handling both CJS and ESM contexts | **L0 shared/utils.ts** | `resolveModuleDir()` | It resolves the module's directory, not a "config" dir. Name was misleading |
| 5 | `PLUGIN_ROOT` | const | config.ts:44 | Root directory of GoodVibes plugin, from env or relative path | **L0 shared/config.ts** | — | Environment-derived path constant |
| 6 | `PROJECT_ROOT` | const | config.ts:51 | Root directory of user's project, from env or `cwd()` | **L0 shared/config.ts** | — | Environment-derived path constant |
| 7 | `getProjectRoot()` | function | config.ts:58-60 | Dynamic PROJECT_ROOT getter (re-reads env at call time) | **L0 shared/config.ts** | — | Dynamic config accessor |
| 8 | `FUSE_OPTIONS` | const | config.ts:66-75 | Fuse.js search config: field weights (name:0.3, description:0.4, keywords:0.3), threshold 0.4 | **L1 core/search.ts** | `SEARCH_OPTIONS` | Decouples the name from the Fuse.js implementation detail. This is "how search works," not "which library" |

### `logging.ts` — 6 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 9 | `LogLevel` | type | logging.ts:6 | Union type `'debug' \| 'info' \| 'warn' \| 'error' \| 'tool'` | **L0 shared/logger.ts** | — (change `'tool'` to `'request'`) | Co-locate with logger. `'tool'` is too engine-specific; `'request'` is reusable |
| 10 | `LogEntry` | interface | logging.ts:8-13 | Shape: `{ level, message, data?, timestamp }` | **L0 shared/logger.ts** | — | Co-locate with logger; only used by logger internals |
| 11 | `formatLog(entry)` | function | logging.ts:15-21 | Formats LogEntry into `[timestamp] [LEVEL] message data` string | **L0 shared/logger.ts** | — | Pure formatting, no domain knowledge |
| 12 | `log(level, message, data)` | function (private) | logging.ts:23-31 | Creates LogEntry, formats it, writes to stderr via `console.error` | **L0 shared/logger.ts** | — | Core log function with stderr output (MCP requirement) |
| 13 | `logger` | object | logging.ts:33-39 | Facade: `{ debug, info, warn, error, tool }` | **L0 shared/logger.ts** | `.tool()` → `.request()` | Facade stays; rename `tool` method to `request` for cross-engine reuse |
| 14 | `startTimer()` | function | logging.ts:44-47 | Returns closure that computes elapsed ms via `performance.now()` | **L0 shared/utils.ts** | — | Generic perf utility, misplaced in logging |
| 15 | `estimateTokens(text)` | function | logging.ts:53-55 | Returns `Math.ceil(text.length / 4)` — rough token approximation | **L0 shared/utils.ts** | — | Generic text utility, misplaced in logging |

### `types.ts` — 10 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 16 | `RegistryEntry` | interface | types.ts:9-15 | Shape of a single registry item: `{ name, path, description, keywords?, category? }` | **L1 core/types.ts** | — | Core domain entity |
| 17 | `Registry` | interface | types.ts:17-20 | Container: `{ version, search_index: RegistryEntry[] }` | **L1 core/types.ts** | — | Core domain entity |
| 18 | `SearchResult` | interface | types.ts:22-27 | Output shape: `{ name, path, description, relevance }` | **L1 core/types.ts** | — | Core domain entity |
| 19 | `SearchSkillsArgs` | interface | types.ts:34-38 | Tool input: `{ query, category?, limit? }` | **L1 core/types.ts** | — | Pure data shape used by L2 and L3 |
| 20 | `SearchArgs` | interface | types.ts:41-44 | Tool input: `{ query, limit? }` | **L1 core/types.ts** | — | Same reasoning |
| 21 | `RecommendSkillsArgs` | interface | types.ts:47-50 | Tool input: `{ task, max_results? }` | **L1 core/types.ts** | — | Same reasoning |
| 22 | `GetContentArgs` | interface | types.ts:53-55 | Tool input: `{ path }` | **L1 core/types.ts** | `ContentArgs` | Drop redundant `Get` prefix — the function name provides the verb |
| 23 | `SkillDependenciesArgs` | interface | types.ts:58-62 | Tool input: `{ skill, depth?, include_optional? }` | **L1 core/types.ts** | `DependencyAnalysisArgs` | Matches renamed function `analyzeDependencies` |
| 24 | `HandlerContext` | interface | types.ts:72-77 | Context: `{ skillsIndex, agentsIndex, toolsIndex, skillsRegistry }` | **L1 core/types.ts** | `RegistryContext` | "Handler" is an L3 concept. This is the domain context — the loaded registry state |
| 25 | `ToolResponseContent` | interface | types.ts:83-88 | MCP response content: `{ type, text?, data?, mimeType? }` | **L0 shared/types.ts** | `McpContent` | Shorter, clearer. "Tool" is ambiguous; this is MCP protocol content |
| 26 | `ToolResponse` | interface | types.ts:90-93 | MCP response: `{ content: McpContent[], isError? }` | **L0 shared/types.ts** | `McpResponse` | Pairs with McpContent. Clearly MCP protocol, not domain |

### `utils.ts` — 6 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 27 | `fileExists(filePath)` | function | utils.ts:17-24 | Async file existence check via `fsPromises.access()` | **L0 shared/utils.ts** | — | Generic filesystem utility |
| 28 | `loadRegistry(registryPath)` | function | utils.ts:29-42 | Loads YAML file from `PLUGIN_ROOT/{path}`, parses with `js-yaml` | **L1 core/registry.ts** | — | Single-concern: load + parse. Returns domain type |
| 29 | `createIndex(registry)` | function | utils.ts:47-50 | Creates `Fuse<RegistryEntry>` from registry using SEARCH_OPTIONS | **L1 core/search.ts** | `buildIndex()` | `build` better conveys the construction semantics |
| 30 | `search(index, query, limit)` | function | utils.ts:55-69 | Fuse.js search, maps results to `SearchResult[]` with relevance | **L1 core/search.ts** | `query()` | Avoids collision with `extensions/search.ts` module name. `query` is the verb for what this pure function does |
| 31 | `parseSkillMetadata(skillPath)` | function | utils.ts:74-154 | **Monolithic (80 lines)**. Path resolution + file read + YAML frontmatter + regex fallback + keyword extraction | **DECOMPOSE** → see below | — | |
| 32 | `success(data)` | function | utils.ts:163-170 | Creates successful McpResponse with JSON-stringified data | **L0 shared/response.ts** | `ok()` | Shorter, idiomatic. Pairs with `fail()` |
| 33 | `error(message)` | function | utils.ts:175-180 | Creates error McpResponse with `isError: true` | **L0 shared/response.ts** | `fail()` | Pairs with `ok()`. `error` shadows built-in Error |

### `handlers/index.ts` — 5 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 34 | `ToolHandler` | type | handlers/index.ts:19 | Signature: `(context: RegistryContext, args: unknown) => Promise<McpResponse>` | **L3 plugins/dispatch.ts** | `ToolDispatcher` | This is a dispatch signature, not business logic |
| 35 | `TOOL_HANDLERS` | const (map) | handlers/index.ts:24-33 | Maps 7 tool names to dispatchers. Extracts context fields, delegates | **L3 plugins/dispatch.ts** | `DISPATCH_TABLE` | It's a routing table |
| 36 | `getHandler(name)` | function | handlers/index.ts:38-40 | Looks up dispatcher in map | **L3 plugins/dispatch.ts** | `getDispatcher()` | Matches ToolDispatcher naming |
| 37 | `hasHandler(name)` | function | handlers/index.ts:45-47 | Checks if dispatcher exists | **L3 plugins/dispatch.ts** | `hasDispatcher()` | Consistent |
| 38 | `listHandlers()` | function | handlers/index.ts:52-54 | Returns all registered tool names | **L3 plugins/dispatch.ts** | `listTools()` | It lists tool names, not handlers |

### `handlers/search.ts` — 5 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 39 | `search()` (local) | function | search.ts:17-30 | **DUPLICATE** of `utils.ts:search()` — identical logic | **DELETE** | — | Use `core/search.ts:query()` |
| 40 | `handleSearchSkills(index, args)` | function | search.ts:35-44 | search + category filter + format | **L2 extensions/search.ts** | `searchSkills()` | Drop `handle` — L2 is business logic, not dispatch |
| 41 | `handleSearchAgents(index, args)` | function | search.ts:49-55 | search + format | **L2 extensions/search.ts** | `searchAgents()` | Drop `handle` |
| 42 | `handleSearchTools(index, args)` | function | search.ts:60-66 | search + format | **L2 extensions/search.ts** | `searchTools()` | Drop `handle` |
| 43 | `handleRecommendSkills(index, args)` | function | search.ts:71-104 | **Monolithic (34 lines)**. Keyword extraction, category detection, complexity estimation, recommendation building | **DECOMPOSE** → see below | `recommendSkills()` | Drop `handle` |

### `handlers/content.ts` — 3 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 44 | `createTextResponse(text)` | function | content.ts:18-22 | Creates McpResponse with text content | **DELETE** | — | Duplicate of `ok()`. `ok(text)` handles strings |
| 45 | `handleGetSkillContent(args)` | function | content.ts:27-42 | Tries 3 paths, **BLOCKING** `fs.existsSync()`, reads file | **L2 extensions/content.ts** | `getSkillContent()` | Drop `handle`. Fix blocking I/O → use async `fileExists()` |
| 46 | `handleGetAgentContent(args)` | function | content.ts:47-62 | Tries 3 paths, **BLOCKING** `fs.existsSync()`, reads file | **L2 extensions/content.ts** | `getAgentContent()` | Drop `handle`. Fix blocking I/O |

### `handlers/dependencies.ts` — 3 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 47 | `DependencyInfo` | interface | dependencies.ts:17-21 | Shape: `{ skill, path, reason }` | **L1 core/types.ts** | `DependencyLink` | "Info" is vague. This describes a link between skills |
| 48 | `DependentInfo` | interface | dependencies.ts:26-29 | Shape: `{ skill, path }` | **L1 core/types.ts** | `DependentRef` | "Info" is vague. This is a reference to a dependent skill |
| 49 | `handleSkillDependencies()` | function | dependencies.ts:34-183 | **Monolithic (150 lines)**. 9 phases: find skill, load metadata, required deps (recursive), optional deps, conflicts, reverse scan, related by category, bundle, format | **DECOMPOSE** → see below | `analyzeDependencies()` | Drop `handle`, drop `Skill` (the args already say what skill). Verb clarifies this is analysis, not lookup |

### `schemas/index.ts` — 1 element

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 50 | `DISCOVERY_SCHEMAS` | const (array) | schemas/index.ts:5-92 | Array of 7 MCP tool definitions | **L3 plugins/schemas.ts** | `TOOL_SCHEMAS` | "Discovery" was a feature label. This is the complete tool schema set |

### `index.ts` — 15 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 51 | `LazyRegistryLoader` | class | index.ts:49-174 | Lazy loading of 3 Fuse indexes with promise dedup | **L2 extensions/loader.ts** | `RegistryIndexCache` | It's a cache of indexes, not a loader. The class's purpose is caching with lazy initialization |
| 52 | `_skillsIndex` | field | index.ts:50 | Cached Fuse index for skills | Part of RegistryIndexCache | — | |
| 53 | `_agentsIndex` | field | index.ts:51 | Cached Fuse index for agents | Part of RegistryIndexCache | — | |
| 54 | `_toolsIndex` | field | index.ts:52 | Cached Fuse index for tools | Part of RegistryIndexCache | — | |
| 55 | `_skillsRegistry` | field | index.ts:53 | Cached raw skills registry (for dependency analysis) | Part of RegistryIndexCache | — | |
| 56 | `_skillsLoading` / `_agentsLoading` / `_toolsLoading` | fields | index.ts:55-57 | Promise dedup — prevents concurrent loads | Part of RegistryIndexCache | — | |
| 57 | `_skillsLoaded` / `_agentsLoaded` / `_toolsLoaded` | fields | index.ts:59-61 | Load-tracking booleans | Part of RegistryIndexCache | — | |
| 58 | `getSkillsIndex()` | method | index.ts:66-74 | Lazy getter with promise dedup | Part of RegistryIndexCache | — | |
| 59 | `getSkillsRegistry()` | method | index.ts:79-87 | Lazy getter for raw registry | Part of RegistryIndexCache | — | |
| 60 | `getAgentsIndex()` | method | index.ts:92-100 | Lazy getter for agents index | Part of RegistryIndexCache | — | |
| 61 | `getToolsIndex()` | method | index.ts:105-113 | Lazy getter for tools index | Part of RegistryIndexCache | — | |
| 62 | `preloadAll()` | method | index.ts:119-125 | Parallel loading of all 3 indexes | Part of RegistryIndexCache | `warmAll()` | "Preload" implies it happens before something. "Warm" is the standard cache term |
| 63 | `getHandlerContext()` | method | index.ts:130-143 | Ensures all loaded, returns RegistryContext | Part of RegistryIndexCache | `getContext()` | "Handler" removed — returns RegistryContext, not handler-specific |
| 64 | `loadSkills()` / `loadAgents()` / `loadTools()` | methods | index.ts:145-173 | Each: loadRegistry() + buildIndex(), set flag, log | Part of RegistryIndexCache | — | |
| 65 | `RegistryEngineServer` | class | index.ts:183-288 | MCP server: wires request handlers, manages lifecycle | **L3 plugins/server.ts** | — | Name is fine — it IS the registry engine server |
| 66-67 | `.server`, `.registryLoader` | fields | index.ts:184-185 | MCP Server + cache instances | Part of server (L3) | `.indexCache` | Matches RegistryIndexCache rename |
| 68 | `constructor()` | method | index.ts:187-196 | Creates server, cache, wires handlers | Part of server (L3) | — | |
| 69 | `initializeIndexes()` | method | index.ts:202-213 | Checks GOODVIBES_EAGER_LOAD, optionally warms cache | Part of server (L3) | `initCache()` | Shorter, matches RegistryIndexCache |
| 70 | `getHandlerContext()` | method | index.ts:218-220 | Delegates to cache.getContext() | Part of server (L3) | `getContext()` | Consistent with cache method rename |
| 71 | `setupHandlers()` | method | index.ts:222-257 | Registers ListTools + CallTool MCP handlers | Part of server (L3) | `setupRoutes()` | "Routes" better describes MCP request routing |
| 72 | `setupErrorHandling()` | method | index.ts:259-273 | server.onerror, SIGINT/SIGTERM | Part of server (L3) | `setupLifecycle()` | Handles both errors AND process signals — lifecycle is more accurate |
| 73 | `start()` | method | index.ts:275-283 | init + transport + connect | Part of server (L3) | — | |
| 74 | `stop()` | method | index.ts:285-287 | server.close() | Part of server (L3) | — | |
| 75 | `main()` | function | index.ts:290-293 | Entry point | **L3 plugins/server.ts** | `bootstrap()` | Matches runtime-engine convention. `main` is generic |

---

## Issues Found

### Duplicated Code

| Issue | Location A | Location B | Resolution |
|-------|-----------|-----------|------------|
| `search()` — identical logic, identical signature | `utils.ts:55-69` | `handlers/search.ts:17-30` | **Delete** from search.ts. Single source in `core/search.ts:query()` |
| `createTextResponse()` overlaps with `success()` | `handlers/content.ts:18-22` | `utils.ts:163-170` | **Delete** `createTextResponse()`. Use `shared/response.ts:ok()` |
| Path resolution (try 3 paths) | `handlers/content.ts:28-32` | `utils.ts:82-86` (inside parseSkillMetadata) | **Extract** shared `resolveSkillPath()` into `core/resolution.ts` |

### Blocking I/O

| Issue | Location | Fix |
|-------|----------|-----|
| `fs.existsSync()` in content handlers | content.ts:35, content.ts:55 | Replace with async `fileExists()` from `shared/utils.ts` |

### Monolithic Functions

| Function | Lines | Concerns Mixed | Decomposition |
|----------|-------|----------------|---------------|
| `parseSkillMetadata()` | 80 | Path resolution, file I/O, YAML frontmatter, regex fallback, keyword extraction | → 4 atomic L1 functions + 1 L2 orchestrator |
| `handleRecommendSkills()` | 34 | Keyword extraction, category detection, complexity estimation, recommendation building | → 3 atomic L1 functions + 1 L2 orchestrator |
| `handleSkillDependencies()` | 150 | 9 distinct phases | → 6 atomic L2 functions + 1 orchestrator |

### Misplaced Elements

| Element | Current File | Problem | Correct Location |
|---------|-------------|---------|------------------|
| `startTimer()` | logging.ts | Perf utility, not logging | `shared/utils.ts` |
| `estimateTokens()` | logging.ts | Text utility, not logging | `shared/utils.ts` |
| `FUSE_OPTIONS` | config.ts | Search-domain config, not generic config | `core/search.ts` as `SEARCH_OPTIONS` |
| `ToolResponseContent`, `ToolResponse` | types.ts | MCP protocol types mixed with domain types | `shared/types.ts` as `McpContent`, `McpResponse` |
| `LogLevel`, `LogEntry` | logging.ts → types.ts? | Only used by logger | Keep co-located in `shared/logger.ts` |

---

## Decomposition Plan for Monolithic Functions

### `parseSkillMetadata()` → 4 L1 functions + 1 L2 orchestrator

```
resolveSkillPath(skillPath: string): Promise<string | null>
  → Tries 3 candidate paths (SKILL.md, .md, raw), returns first that exists
  → Location: L1 core/resolution.ts
  → Deps: shared/utils.ts (fileExists), shared/config.ts (PLUGIN_ROOT)
  → Single-concern: path resolution with filesystem check

parseFrontmatter(content: string): Record<string, unknown> | null
  → Extracts YAML between --- markers, parses with js-yaml
  → Location: L1 core/parsing.ts
  → Deps: js-yaml (external)
  → Pure function: string in, object out

extractMarkdownMetadata(content: string): { requires?, complements?, technologies? }
  → Regex fallback: finds "Requires:", "Related:", "See also:" markdown sections
  → Location: L1 core/parsing.ts
  → Deps: none
  → Pure function. Renamed from extractMetadataFromContent — clarifies the source format

extractTechKeywords(content: string): string[]
  → Matches content against TECH_KEYWORDS constant list
  → Location: L1 core/parsing.ts
  → Deps: none (TECH_KEYWORDS constant co-located)
  → Pure function

loadSkillMetadata(skillPath: string): Promise<SkillMetadata>
  → Orchestrates: resolveSkillPath → readFile → parseFrontmatter || (extractMarkdownMetadata + extractTechKeywords)
  → Location: L2 extensions/metadata.ts
  → Deps: core/resolution, core/parsing, shared/utils
  → Renamed from parseSkillMetadata — "load" clarifies it does I/O, "parse" implied pure
```

### `handleRecommendSkills()` → 3 L1 functions + 1 L2 orchestrator

```
extractKeywords(text: string): string[]
  → Splits on whitespace, filters words > 3 chars
  → Location: L1 core/parsing.ts
  → Pure function

detectCategory(text: string): string
  → Matches text against CATEGORY_MAP constant
  → Location: L1 core/classification.ts
  → Pure function. CATEGORY_MAP co-located:
    { auth/login → 'authentication', database/prisma/sql → 'database',
      api/endpoint → 'api', style/css/tailwind → 'styling',
      test → 'testing', deploy/build → 'deployment' }

estimateComplexity(keywords: string[]): 'simple' | 'moderate' | 'complex'
  → Heuristic: >10 = complex, >5 = moderate, else simple
  → Location: L1 core/classification.ts
  → Pure function. Co-located with detectCategory — both classify text

recommendSkills(index, args): McpResponse
  → Orchestrates: extractKeywords → query → detectCategory → estimateComplexity → format → ok()
  → Location: L2 extensions/recommendations.ts
  → Deps: core/search, core/parsing, core/classification, shared/response
```

### `handleSkillDependencies()` → 6 L2 functions + 1 orchestrator

```
findOne(index, name: string): SearchResult | null
  → Wrapper: query(index, name, 1)[0] || null
  → Location: L1 core/search.ts (alongside query)
  → Pure convenience function

resolveRequired(metadata, index, depth): DependencyLink[]
  → Iterates metadata.requires, searches each, recurses if depth > 1
  → Location: L2 extensions/dependencies.ts
  → Deps: core/search (findOne), extensions/metadata (loadSkillMetadata)

resolveOptional(metadata, index): DependencyLink[]
  → Iterates metadata.complements, searches each
  → Location: L2 extensions/dependencies.ts
  → Deps: core/search (findOne)

resolveConflicts(metadata, index): DependencyLink[]
  → Iterates metadata.conflicts, searches each
  → Location: L2 extensions/dependencies.ts
  → Deps: core/search (findOne)

findDependents(registry, target, index): DependentRef[]
  → Scans all entries, loads metadata, checks if requires includes target
  → Location: L2 extensions/dependencies.ts
  → Deps: core/types, extensions/metadata
  → Note: O(n) with async I/O per entry. Future: build reverse index at load time in RegistryIndexCache

findRelated(index, skillPath, exclude, max): DependencyLink[]
  → Extracts category from path, searches same-category, deduplicates
  → Location: L2 extensions/dependencies.ts
  → Deps: core/search (query)
  → Renamed from findRelatedByCategory — shorter, the "by category" logic is implementation detail

buildBundle(skill, required, optional): string[]
  → Assembles ordered path list: target + top required + top optional
  → Location: L2 extensions/dependencies.ts
  → Pure function, no deps

analyzeDependencies(index, registry, args): McpResponse
  → Orchestrates: findOne → loadSkillMetadata → resolveRequired → resolveOptional →
    resolveConflicts → findDependents → findRelated → buildBundle → ok()
  → Location: L2 extensions/dependencies.ts
  → Deps: all above + shared/response
```

---

## Target File Structure

```
registry-engine/src/
├── shared/                          # L0 — Zero domain knowledge
│   ├── index.ts                     # Barrel export
│   ├── constants.ts                 # SERVER_NAME, SERVER_VERSION
│   ├── config.ts                    # PLUGIN_ROOT, PROJECT_ROOT, getProjectRoot()
│   ├── logger.ts                    # LogLevel, LogEntry, formatLog, log, logger
│   ├── types.ts                     # McpContent, McpResponse
│   ├── response.ts                  # ok(), fail()
│   └── utils.ts                     # fileExists(), resolveEsmDir(), resolveModuleDir(),
│                                    #   startTimer(), estimateTokens()
│
├── core/                            # L1 — Single-concern domain functions
│   ├── index.ts                     # Barrel export
│   ├── types.ts                     # RegistryEntry, Registry, SearchResult, RegistryContext,
│   │                                #   SearchSkillsArgs, SearchArgs, RecommendSkillsArgs,
│   │                                #   ContentArgs, DependencyAnalysisArgs,
│   │                                #   DependencyLink, DependentRef, SkillMetadata
│   ├── registry.ts                  # loadRegistry()
│   ├── search.ts                    # SEARCH_OPTIONS, buildIndex(), query(), findOne()
│   ├── resolution.ts               # resolveSkillPath(), resolveAgentPath()
│   ├── parsing.ts                   # parseFrontmatter(), extractMarkdownMetadata(),
│   │                                #   extractTechKeywords(), extractKeywords()
│   └── classification.ts           # CATEGORY_MAP, detectCategory(), estimateComplexity()
│
├── extensions/                      # L2 — Multi-concern orchestration
│   ├── index.ts                     # Barrel export
│   ├── loader.ts                    # RegistryIndexCache class
│   ├── search.ts                    # searchSkills(), searchAgents(), searchTools()
│   ├── recommendations.ts          # recommendSkills()
│   ├── content.ts                   # getSkillContent(), getAgentContent()
│   ├── metadata.ts                  # loadSkillMetadata()
│   └── dependencies.ts             # resolveRequired(), resolveOptional(), resolveConflicts(),
│                                    #   findDependents(), findRelated(), buildBundle(),
│                                    #   analyzeDependencies()
│
└── plugins/                         # L3 — MCP interface, thin dispatch
    ├── index.ts                     # Barrel export
    ├── server.ts                    # RegistryEngineServer class, bootstrap()
    ├── dispatch.ts                  # ToolDispatcher type, DISPATCH_TABLE,
    │                                #   getDispatcher(), hasDispatcher(), listTools()
    └── schemas.ts                   # TOOL_SCHEMAS
```

**Total: 19 files** (from 10). Each has a single responsibility.

---

## Dependency Graph

```
                    ┌─────────────────────────────────────────────┐
                    │              L3: plugins/                   │
                    │                                             │
                    │  server.ts ──→ dispatch.ts ──→ schemas.ts   │
                    │     │              │                        │
                    └─────┼──────────────┼────────────────────────┘
                          │              │
                          ▼              ▼
          ┌───────────────────────────────────────────────────────┐
          │                  L2: extensions/                      │
          │                                                       │
          │  loader.ts                                            │
          │     │                                                 │
          │  search.ts    recommendations.ts    content.ts        │
          │     │              │                    │             │
          │  metadata.ts ◄─────┘                    │             │
          │     │                                   │             │
          │  dependencies.ts ◄──────────────────────┘             │
          └─────┼────────────┼───────────────┼────────────────────┘
                │            │               │
                ▼            ▼               ▼
       ┌──────────────────────────────────────────────────────────┐
       │                    L1: core/                             │
       │                                                          │
       │  types.ts   registry.ts   search.ts   resolution.ts      │
       │                  parsing.ts   classification.ts           │
       └──────────────────────────┬────────────────────────────────┘
                                  │
                                  ▼
       ┌──────────────────────────────────────────────────────────┐
       │                    L0: shared/                           │
       │                                                          │
       │  constants.ts  config.ts  logger.ts  types.ts            │
       │  response.ts  utils.ts                                   │
       └──────────────────────────────────────────────────────────┘
```

---

## Complete Rename Map

Quick reference for every name that changes:

| Old Name | New Name | Reason |
|----------|----------|--------|
| `getEsmDir()` | `resolveEsmDir()` | Verb-first |
| `getConfigDir()` | `resolveModuleDir()` | Was misleading — resolves module dir, not config |
| `FUSE_OPTIONS` | `SEARCH_OPTIONS` | Decouple from Fuse.js implementation detail |
| `LogLevel: 'tool'` | `LogLevel: 'request'` | Generic for cross-engine reuse |
| `logger.tool()` | `logger.request()` | Consistent with LogLevel change |
| `ToolResponseContent` | `McpContent` | Shorter, clearly MCP protocol |
| `ToolResponse` | `McpResponse` | Pairs with McpContent |
| `success()` | `ok()` | Shorter, idiomatic |
| `error()` | `fail()` | Avoids shadowing Error; pairs with ok() |
| `createIndex()` | `buildIndex()` | `build` conveys construction |
| `search()` (core) | `query()` | Avoids name collision with extensions/search module |
| `GetContentArgs` | `ContentArgs` | Drop redundant verb prefix |
| `SkillDependenciesArgs` | `DependencyAnalysisArgs` | Matches analyzeDependencies() |
| `HandlerContext` | `RegistryContext` | "Handler" is L3 concept; this is domain context |
| `ToolHandler` | `ToolDispatcher` | Dispatch signature, not business logic |
| `TOOL_HANDLERS` | `DISPATCH_TABLE` | It's a routing table |
| `getHandler()` | `getDispatcher()` | Consistent |
| `hasHandler()` | `hasDispatcher()` | Consistent |
| `listHandlers()` | `listTools()` | Lists tool names, not handlers |
| `DISCOVERY_SCHEMAS` | `TOOL_SCHEMAS` | Complete schema set, not just "discovery" |
| `DependencyInfo` | `DependencyLink` | Describes a link, not generic "info" |
| `DependentInfo` | `DependentRef` | A reference to a dependent |
| `LazyRegistryLoader` | `RegistryIndexCache` | It caches indexes, not loads registries |
| `preloadAll()` | `warmAll()` | Standard cache warming terminology |
| `getHandlerContext()` | `getContext()` | Returns RegistryContext |
| `initializeIndexes()` | `initCache()` | Shorter, matches RegistryIndexCache |
| `setupHandlers()` | `setupRoutes()` | MCP request routing |
| `setupErrorHandling()` | `setupLifecycle()` | Handles errors + signals |
| `.registryLoader` | `.indexCache` | Matches class rename |
| `main()` | `bootstrap()` | Matches runtime-engine convention |
| `handleSearchSkills()` | `searchSkills()` | L2 is logic, not dispatch |
| `handleSearchAgents()` | `searchAgents()` | Drop handle |
| `handleSearchTools()` | `searchTools()` | Drop handle |
| `handleRecommendSkills()` | `recommendSkills()` | Drop handle |
| `handleGetSkillContent()` | `getSkillContent()` | Drop handle |
| `handleGetAgentContent()` | `getAgentContent()` | Drop handle |
| `handleSkillDependencies()` | `analyzeDependencies()` | Drop handle, clarify verb |
| `parseSkillMetadata()` | `loadSkillMetadata()` | Does I/O, not just parsing |
| `extractMetadataFromContent()` | `extractMarkdownMetadata()` | Clarifies source format |
| `findRelatedByCategory()` | `findRelated()` | Implementation detail in name |

---

## Element Migration Summary

| Target File | Elements (by #) | Count |
|-------------|----------------|-------|
| **L0 shared/constants.ts** | 1, 2 | 2 |
| **L0 shared/config.ts** | 5, 6, 7 | 3 |
| **L0 shared/logger.ts** | 9, 10, 11, 12, 13 | 5 |
| **L0 shared/types.ts** | 25, 26 | 2 |
| **L0 shared/response.ts** | 32, 33 | 2 |
| **L0 shared/utils.ts** | 3, 4, 14, 15, 27 | 5 |
| **L1 core/types.ts** | 16, 17, 18, 19, 20, 21, 22, 23, 24, 47, 48 | 11 |
| **L1 core/registry.ts** | 28 | 1 |
| **L1 core/search.ts** | 8, 29, 30 + new findOne | 4 |
| **L1 core/resolution.ts** | new: resolveSkillPath, resolveAgentPath | 2 |
| **L1 core/parsing.ts** | new: parseFrontmatter, extractMarkdownMetadata, extractTechKeywords, extractKeywords | 4 |
| **L1 core/classification.ts** | new: CATEGORY_MAP, detectCategory, estimateComplexity | 3 |
| **L2 extensions/loader.ts** | 51-64 (RegistryIndexCache) | 1 class |
| **L2 extensions/search.ts** | 40, 41, 42 | 3 |
| **L2 extensions/recommendations.ts** | 43 decomposed | 1 |
| **L2 extensions/content.ts** | 45, 46 | 2 |
| **L2 extensions/metadata.ts** | 31 decomposed | 1 |
| **L2 extensions/dependencies.ts** | 49 decomposed into 7 | 7 |
| **L3 plugins/server.ts** | 65-75 | 1 class + bootstrap |
| **L3 plugins/dispatch.ts** | 34, 35, 36, 37, 38 | 5 |
| **L3 plugins/schemas.ts** | 50 | 1 |
| **DELETED** | 39, 44 | 2 |

**75 elements total. 37 renamed. 2 deleted. 10 newly extracted from monoliths. 10 → 19 files.**

---

## Rewiring: Import Path Changes

| Current Import | New Import |
|---------------|------------|
| `'./config.js'` → SERVER_NAME, SERVER_VERSION | `'../shared/constants.js'` |
| `'./config.js'` → PLUGIN_ROOT | `'../shared/config.js'` |
| `'./config.js'` → FUSE_OPTIONS | `'./search.js'` → SEARCH_OPTIONS (within core) |
| `'./logging.js'` → logger | `'../shared/logger.js'` |
| `'./types.js'` → Registry, RegistryEntry, SearchResult | `'../core/types.js'` |
| `'./types.js'` → HandlerContext | `'../core/types.js'` → RegistryContext |
| `'./types.js'` → ToolResponse | `'../shared/types.js'` → McpResponse |
| `'./types.js'` → ToolResponseContent | `'../shared/types.js'` → McpContent |
| `'../utils.js'` → success | `'../../shared/response.js'` → ok |
| `'../utils.js'` → search | `'../../core/search.js'` → query |
| `'../utils.js'` → parseSkillMetadata | `'../metadata.js'` → loadSkillMetadata (within extensions) |
| `'../utils.js'` → loadRegistry, createIndex | `'../core/registry.js'` + `'../core/search.js'` → buildIndex |
| `'./schemas/index.js'` → DISCOVERY_SCHEMAS | `'./schemas.js'` → TOOL_SCHEMAS (within plugins) |
| `'./handlers/index.js'` → getHandler, hasHandler, listHandlers | `'./dispatch.js'` → getDispatcher, hasDispatcher, listTools |
| `'../config.js'` → PLUGIN_ROOT | `'../../shared/config.js'` |
| `'fs'` (sync) | `'../../shared/utils.js'` → fileExists (async) |
