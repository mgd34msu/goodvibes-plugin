# Frontend Engine — Atomic Decomposition (v1)

> Every function, variable, type, and constant across all 87 source files, analyzed by what it does, assigned to the correct architectural layer, renamed where appropriate.

## Reference Architecture

| Layer | Name | Purpose | Dependency Direction |
|-------|------|---------|---------------------|
| L0 | `shared/` | Config, logging, constants, generic utilities, reusable types | — (depends on nothing internal) |
| L1 | `core/` | Domain types, interfaces, single-concern domain functions | → shared only |
| L2 | `extensions/` | One dir per domain concern, multi-concern orchestration | → core, shared |
| L3 | `plugins/` | MCP thin dispatchers, external API surface | → extensions, core, shared |

Dependencies flow **downward only**. Never upward, never horizontal between sibling files (only through barrel exports).

**L1 vs L2 distinction:** L1 functions each do exactly one atomic thing (e.g., parse Tailwind classes into CSS properties, or extract className from a JSX attribute — that's one concern). L2 functions compose multiple L1 functions into analysis workflows (e.g., parse the file, walk the JSX tree, classify each element, detect issues, generate a summary — that's multi-concern orchestration).

---

## Current File Inventory

```
frontend-engine/src/
├── index.ts                                     (126 lines)  — FrontendEngineServer + main()
├── config.ts                                    (14 lines)   — SERVER_NAME, SERVER_VERSION, getProjectRoot
├── logging.ts                                   (40 lines)   — logger, LogLevel, LogEntry
├── schemas/
│   └── index.ts                                 (288 lines)  — 13 MCP tool schema definitions
└── handlers/
    ├── index.ts                                 (100 lines)  — handler registry, getHandler, hasHandler, listHandlers
    ├── response-utils.ts                        (205 lines)  — ToolResponse types + 7 response factory functions
    ├── react.ts                                 (795 lines)  — handleGetReactComponentTree + 20+ analysis helpers
    ├── jsx-class-utils.ts                       (137 lines)  — extractClassesFromNode, extractClassesFromAttribute
    ├── analyze-client-boundary.ts               (21 lines)   — re-export barrel → client-boundary/
    ├── analyze-error-boundaries.ts              (16 lines)   — re-export barrel → error-boundaries/
    ├── analyze-event-flow.ts                    (213 lines)  — handleAnalyzeEventFlow + inline DUPLICATE helpers
    ├── analyze-layout-hierarchy.ts              (202 lines)  — handleAnalyzeLayoutHierarchy + inline DUPLICATE helpers
    ├── analyze-render-triggers.ts               (29 lines)   — re-export barrel → render-triggers/
    ├── analyze-responsive-breakpoints.ts        (24 lines)   — re-export barrel → responsive-breakpoints/
    ├── analyze-stacking-context.ts              (25 lines)   — re-export barrel → stacking-context/
    ├── analyze-tailwind-conflicts.ts            (236 lines)  — handleAnalyzeTailwindConflicts + inline DUPLICATE helpers
    ├── audit-hook-dependencies.ts               (18 lines)   — re-export barrel → hook-dependencies/
    ├── diagnose-overflow.ts                     (24 lines)   — re-export barrel → overflow-diagnosis/
    ├── get-accessibility-tree.ts                (216 lines)  — handleGetAccessibilityTree + inline DUPLICATE helpers
    ├── get-sizing-strategy.ts                   (224 lines)  — handleGetSizingStrategy + inline DUPLICATE helpers
    ├── trace-component-state.ts                 (29 lines)   — re-export barrel → component-state/
    ├── accessibility-tree-core.ts               (173 lines)  — JSX file parsing for a11y analysis
    ├── accessibility-tree-utils.ts              (360 lines)  — ARIA constants, role mapping, focus utilities
    ├── accessibility-tree-analyzers.ts          (617 lines)  — A11y tree building, issue detection, summary
    ├── event-flow-core.ts                       (410 lines)  — event handler extraction, delegation detection
    ├── event-flow-utils.ts                      (199 lines)  — event type maps, interface definitions
    ├── event-flow-analyzers.ts                  (415 lines)  — event flow building, issue detection, summary
    ├── layout-hierarchy-core.ts                 (340 lines)  — JSX layout node building, selector matching
    ├── layout-hierarchy-utils.ts                (555 lines)  — Tailwind class parsing, layout type definitions
    ├── layout-hierarchy-analyzers.ts            (350 lines)  — layout issue detection, constraint notes, summary
    ├── sizing-strategy-core.ts                  (390 lines)  — element node building, JSX tree parsing (DUPLICATE of layout-hierarchy-core)
    ├── sizing-strategy-utils.ts                 (622 lines)  — extended Tailwind parsing, element types (DUPLICATE of layout-hierarchy-utils)
    ├── sizing-strategy-analyzers.ts             (495 lines)  — sizing dimension/flex/grid analysis, ancestor chain
    ├── tailwind-conflicts-core.ts               (80 lines)   — className extraction, JSX file analysis for conflicts
    ├── tailwind-conflicts-utils.ts              (550 lines)  — conflict categories, breakpoint/variant parsing
    ├── tailwind-conflicts-analyzers.ts          (440 lines)  — conflict detection, specificity issue detection
    ├── client-boundary/
    │   ├── index.ts                             (175 lines)  — handleAnalyzeClientBoundary
    │   ├── types.ts                             (96 lines)   — 8 types for client boundary analysis
    │   ├── scanner.ts                           (290 lines)  — file scanner for use client/server directives
    │   ├── graph-builder.ts                     (280 lines)  — import graph, component classification
    │   └── issue-detector.ts                    (230 lines)  — 4 detectors → detectIssues aggregator
    ├── component-state/
    │   ├── index.ts                             (350 lines)  — handleTraceComponentState
    │   ├── types.ts                             (145 lines)  — 11 types for component state tracing
    │   ├── utils.ts                             (160 lines)  — path utils, type inference (DUPLICATE helpers)
    │   ├── component-detector.ts                (95 lines)   — isReactComponent, containsJsxReturn, getComponentName (DUPLICATE)
    │   ├── hook-analyzer.ts                     (245 lines)  — extractHooks from component body
    │   ├── jsx-analyzer.ts                      (105 lines)  — JSX state/props usage analysis
    │   ├── props-analyzer.ts                    (200 lines)  — extractReceivedProps, findProvidedContexts
    │   └── issue-detector.ts                    (120 lines)  — prop drilling, callback instability detection
    ├── error-boundaries/
    │   ├── index.ts                             (285 lines)  — handleAnalyzeErrorBoundaries
    │   ├── types.ts                             (125 lines)  — 9 types for error boundary analysis
    │   ├── scanner.ts                           (530 lines)  — file scanner for class/functional error boundaries
    │   ├── coverage-analyzer.ts                 (240 lines)  — import graph + coverage analysis
    │   └── issue-detector.ts                    (265 lines)  — 5 detectors → detectAllIssues aggregator
    ├── hook-dependencies/
    │   ├── index.ts                             (230 lines)  — handleAuditHookDependencies (DUPLICATE helpers inline)
    │   ├── types.ts                             (140 lines)  — 7 types for hook dependency audit
    │   ├── hook-extractor.ts                    (310 lines)  — hook extraction with dependency arrays
    │   ├── stability-analyzer.ts                (230 lines)  — dep stability classification
    │   └── issue-detector.ts                    (280 lines)  — 6 detectors → detectAllIssues aggregator
    ├── overflow-diagnosis/
    │   ├── index.ts                             (160 lines)  — handleDiagnoseOverflow
    │   ├── types.ts                             (105 lines)  — 8 types for overflow diagnosis
    │   ├── utils.ts                             (155 lines)  — selector matching, tree enrichment, DUPLICATE response helpers
    │   ├── pattern-detector.ts                  (150 lines)  — findOverflowPatterns
    │   ├── constraint-builder.ts                (100 lines)  — buildConstraintChain, describeConstraint
    │   └── fix-generator.ts                     (270 lines)  — generateFixes, generateRecommendation
    ├── render-triggers/
    │   ├── index.ts                             (240 lines)  — handleAnalyzeRenderTriggers + type re-exports
    │   ├── types.ts                             (105 lines)  — 11 types for render trigger analysis
    │   ├── utils.ts                             (80 lines)   — path + AST utilities (DUPLICATE helpers)
    │   ├── trigger-analyzers.ts                 (480 lines)  — 7 trigger finders (state, props, inline, context…)
    │   ├── memoization-detector.ts              (185 lines)  — React.memo detection, component finder (DUPLICATE)
    │   └── suggestion-generator.ts              (125 lines)  — generateSuggestions
    ├── responsive-breakpoints/
    │   ├── index.ts                             (260 lines)  — handleAnalyzeResponsiveBreakpoints
    │   ├── types.ts                             (90 lines)   — 9 types for breakpoint analysis
    │   ├── constants.ts                         (195 lines)  — breakpoint sizes, class-to-property maps
    │   ├── utils.ts                             (40 lines)   — DUPLICATE response helpers + path utils
    │   ├── class-parser.ts                      (115 lines)  — Tailwind class parsing, breakpoint grouping
    │   ├── breakpoint-resolver.ts               (185 lines)  — resolves breakpoints from Tailwind config
    │   ├── jsx-extractor.ts                     (135 lines)  — extractClassNames from JSX
    │   └── issue-detector.ts                    (120 lines)  — detectIssues (missing breakpoints, desktop-first)
    └── stacking-context/
        ├── index.ts                             (220 lines)  — handleAnalyzeStackingContext + type re-exports
        ├── types.ts                             (150 lines)  — 10 types for stacking context analysis
        ├── utils.ts                             (25 lines)   — DUPLICATE response helpers
        ├── context-rules.ts                     (190 lines)  — stacking context creation rules, z-index extraction
        ├── tree-builder.ts                      (110 lines)  — buildStackingTree, getContextParent
        ├── jsx-analyzer.ts                      (135 lines)  — analyzeJsxFile for stacking patterns (DUPLICATE getLineNumber)
        ├── portal-detector.ts                   (155 lines)  — detectPortals, findContainingComponent
        └── issue-detector.ts                    (245 lines)  — detectStackingIssues
```

**Total: 87 files, ~17,600 lines**

---

## Atomic Element Inventory

Every exported and internal element, its current location, what it does, its target layer, and its new name (where renamed).

### `config.ts` — 3 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 1 | `SERVER_NAME` | const | config.ts:1 | Server identity string `'frontend-engine'` | **L0 shared/constants.ts** | — | Static identity constant, no domain logic |
| 2 | `SERVER_VERSION` | const | config.ts:2 | Version string `'1.0.0'` | **L0 shared/constants.ts** | — | Static identity constant |
| 3 | `getProjectRoot()` | function | config.ts:3 | Returns `PROJECT_ROOT` env var or `cwd()` | **L0 shared/config.ts** | — | Dynamic config accessor, shared across engines |

### `logging.ts` — 5 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 4 | `LogLevel` | type | logging.ts:1 | Union `'debug' \| 'info' \| 'warn' \| 'error' \| 'tool'` | **L0 shared/logger.ts** | — (change `'tool'` to `'request'`) | Co-locate with logger; `'tool'` is engine-specific |
| 5 | `LogEntry` | interface | logging.ts:2 | Shape: `{ level, message, data?, timestamp }` — 4 props | **L0 shared/logger.ts** | — | Internal logger type |
| 6 | `formatLog(entry)` | function | logging.ts:3 | Formats LogEntry as timestamped string | **L0 shared/logger.ts** | — | Pure formatting, no domain knowledge |
| 7 | `log(level, message, data)` | function (private) | logging.ts:4 | Creates LogEntry, formats, writes to stderr | **L0 shared/logger.ts** | — | Core log function (MCP requires stderr) |
| 8 | `logger` | object | logging.ts:5 | Facade: `{ debug, info, warn, error, tool }` | **L0 shared/logger.ts** | `.tool()` → `.request()` | Rename for cross-engine reuse |

### `index.ts` — 7 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 9 | `FrontendEngineServer` | class | index.ts:1 | MCP server class managing lifecycle | **L3 plugins/server.ts** | — | Server bootstrap belongs in plugin layer |
| 10 | `server` | property | index.ts:2 | Private `Server` instance | **L3 plugins/server.ts** | — | Internal to server class |
| 11 | `constructor` | method | index.ts:3 | Creates MCP server with name/version, sets up handlers | **L3 plugins/server.ts** | — | Server wiring |
| 12 | `setupHandlers` | method | index.ts:4 | Registers tool list + call handlers from registry | **L3 plugins/server.ts** | — | Dispatch registration |
| 13 | `setupErrorHandling` | method | index.ts:5 | Catches process errors, logs to stderr | **L3 plugins/server.ts** | — | Process-level guard |
| 14 | `start` | method | index.ts:6 | Connects server to stdio transport | **L3 plugins/server.ts** | — | Lifecycle management |
| 15 | `main()` | function | index.ts:7 | Entry point, creates server and starts it | **L3 plugins/server.ts** | — | Bootstrap function |

### `schemas/index.ts` — 2 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 16 | `FRONTEND_SCHEMAS` | const array | schemas/index.ts:1 | Array of 13 MCP tool schema definitions | **L3 plugins/schemas.ts** | — | Schema definitions are plugin-layer API surface |
| 17 | `allSchemas` | const | schemas/index.ts:2 | Alias for `FRONTEND_SCHEMAS` | **DELETE** | — | Unnecessary alias; use FRONTEND_SCHEMAS directly |

### `handlers/response-utils.ts` — 9 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 18 | `ToolResponseContent` | interface | response-utils.ts:1 | Content block: `{ type, text }` — 2 props | **L0 shared/types.ts** | `McpContent` | Shorter, clearly MCP protocol |
| 19 | `ToolResponse` | interface | response-utils.ts:2 | Response wrapper: `{ content, isError }` — 2 props | **L0 shared/types.ts** | `McpResponse` | Pairs with McpContent |
| 20 | `createSuccessResponse(data)` | function | response-utils.ts:3 | Wraps data as JSON text response | **L0 shared/response.ts** | `ok()` | Shorter, idiomatic |
| 21 | `createTextResponse(text)` | function | response-utils.ts:4 | Wraps plain text as response | **L0 shared/response.ts** | `text()` | Shorter |
| 22 | `createErrorResponse(message)` | function | response-utils.ts:5 | Wraps error message with optional context | **L0 shared/response.ts** | `fail()` | Pairs with ok() |
| 23 | `createErrorFromException(error)` | function | response-utils.ts:6 | Converts unknown exception to error response | **L0 shared/response.ts** | `failFromException()` | Consistent with fail() |
| 24 | `createNotFoundResponse(type, id)` | function | response-utils.ts:7 | Creates "not found" error for resource type + id | **L0 shared/response.ts** | `notFound()` | Shorter |
| 25 | `createMissingArgumentResponse(arg)` | function | response-utils.ts:8 | Creates "missing argument" error | **L0 shared/response.ts** | `missingArg()` | Shorter |
| 26 | `createInvalidArgumentResponse(arg, reason)` | function | response-utils.ts:9 | Creates "invalid argument" error with reason | **L0 shared/response.ts** | `invalidArg()` | Shorter |

### `handlers/index.ts` — 5 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 27 | `ToolHandler` | type | handlers/index.ts:1 | Signature: `(args: unknown) => Promise<ToolResponse>` | **L3 plugins/dispatch.ts** | `ToolDispatcher` | Dispatch signature, not business logic |
| 28 | `handlerRegistry` | const Map | handlers/index.ts:2 | Maps 13 tool names to handler functions | **L3 plugins/dispatch.ts** | `DISPATCH_TABLE` | It's a routing table |
| 29 | `getHandler(name)` | function | handlers/index.ts:3 | Looks up handler by tool name | **L3 plugins/dispatch.ts** | `getDispatcher()` | Matches ToolDispatcher naming |
| 30 | `hasHandler(name)` | function | handlers/index.ts:4 | Checks if tool name has registered handler | **L3 plugins/dispatch.ts** | `hasDispatcher()` | Consistent |
| 31 | `listHandlers()` | function | handlers/index.ts:5 | Returns array of registered tool names | **L3 plugins/dispatch.ts** | `listTools()` | It lists tool names, not handlers |

### `handlers/react.ts` — 26 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 32 | `GetReactComponentTreeArgs` | interface | react.ts:1 | Tool args: file, path, root_component, depth — 4 props | **L1 core/react/types.ts** | — | Domain input type |
| 33 | `normalizeFilePath(p)` | function | react.ts:2 | Replaces backslashes with forward slashes | **L0 shared/utils.ts** | `normalizePath()` | Generic path util, duplicated in 6 files |
| 34 | `makeRelativePath(base, abs)` | function | react.ts:3 | Converts absolute path to relative | **L0 shared/utils.ts** | `toRelativePath()` | Generic path util, duplicated in 6 files |
| 35 | `isReactComponent(node)` | function | react.ts:4 | Checks if AST node is a React component | **L1 core/react/component-detection.ts** | — | Single-concern React utility |
| 36 | `containsJsxReturn(body)` | function | react.ts:5 | Checks if function body returns JSX | **L1 core/react/component-detection.ts** | — | Single-concern React utility |
| 37 | `MEMO_CALLEE` | const Set | react.ts:6 | Set of React.memo callee names | **L1 core/react/constants.ts** | — | React pattern constants |
| 38 | `FORWARD_REF_CALLEE` | const Set | react.ts:7 | Set of forwardRef callee names | **L1 core/react/constants.ts** | — | React pattern constants |
| 39 | `LAZY_CALLEE` | const Set | react.ts:8 | Set of React.lazy callee names | **L1 core/react/constants.ts** | — | React pattern constants |
| 40 | `HOC_WRAPPING_CALLEE` | const Set | react.ts:9 | Union of all HOC callee sets | **L1 core/react/constants.ts** | — | React pattern constants |
| 41 | `getCalleeName(expr)` | function | react.ts:10 | Extracts callee name from CallExpression | **L1 core/react/ast-utils.ts** | — | Single-concern AST utility |
| 42 | `UnwrapResult` | interface | react.ts:11 | HOC unwrap result — 4 props | **L1 core/react/types.ts** | — | Domain type |
| 43 | `unwrapHocCall(node)` | function | react.ts:12 | Unwraps nested HOC calls to find inner function | **L1 core/react/hoc-utils.ts** | — | Single-concern HOC analysis |
| 44 | `detectHocWrappedComponent(decl)` | function | react.ts:13 | Detects if variable declaration wraps a component in HOCs | **L1 core/react/hoc-utils.ts** | — | Single-concern HOC analysis |
| 45 | `detectDefaultExportHoc(decl)` | function | react.ts:14 | Detects HOC-wrapped default exports | **L1 core/react/hoc-utils.ts** | — | Single-concern HOC analysis |
| 46 | `getComponentName(node)` | function | react.ts:15 | Extracts component name from AST node | **L1 core/react/component-detection.ts** | — | Single-concern React utility |
| 47 | `extractProps(node)` | function | react.ts:16 | Extracts prop names from component definition | **L1 core/react/props-utils.ts** | — | Single-concern props analysis |
| 48 | `extractPropsFromInterface(node)` | function | react.ts:17 | Extracts props from TypeScript interface | **L1 core/react/props-utils.ts** | — | Single-concern props analysis |
| 49 | `extractPropsFromFn(node)` | function | react.ts:18 | Extracts props from function parameters | **L1 core/react/props-utils.ts** | — | Single-concern props analysis |
| 50 | `findUsedComponents(ast)` | function | react.ts:19 | Finds JSX component references in AST | **L1 core/react/jsx-walker.ts** | — | Single-concern JSX traversal |
| 51 | `getLineNumber(node)` | function | react.ts:20 | Gets 1-based line number from node position | **L0 shared/ast.ts** | `lineOf()` | Duplicated in 6 files; generic AST utility |
| 52 | `findComponentFiles(dir)` | function | react.ts:21 | Recursively finds .tsx/.jsx/.ts/.js files | **L1 core/react/file-utils.ts** | — | Single-concern file scanning |
| 53 | `analyzeFile(path)` | function | react.ts:22 | Analyzes single file for component definitions | **L2 extensions/component-tree/analyzer.ts** | — | Multi-concern: parse + detect + extract |
| 54 | `buildUsedByRelationships(map)` | function | react.ts:23 | Builds reverse dependency graph | **L2 extensions/component-tree/graph.ts** | — | Multi-concern: graph construction |
| 55 | `buildTree(root, components)` | function | react.ts:24 | Builds component tree from root component | **L2 extensions/component-tree/graph.ts** | — | Multi-concern: tree construction |
| 56 | `findRootComponent(components)` | function | react.ts:25 | Finds root component (not used by any other) | **L2 extensions/component-tree/graph.ts** | — | Multi-concern: graph traversal |
| 57 | `handleGetReactComponentTree(args)` | function | react.ts:26 | Main handler for `frontend_component_tree` tool | **L3 plugins/dispatch.ts** | `buildComponentTree()` | Drop `handle`; L3 thin orchestrator |

### `handlers/jsx-class-utils.ts` — 2 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 58 | `extractClassesFromNode(node)` | function | jsx-class-utils.ts:1 | Walks AST to extract className values from JSX elements | **L1 core/jsx/class-extractor.ts** | — | Single-concern JSX utility |
| 59 | `extractClassesFromAttribute(attr)` | function | jsx-class-utils.ts:2 | Extracts class strings from a single JSX attribute | **L1 core/jsx/class-extractor.ts** | — | Single-concern JSX utility |

### `handlers/analyze-event-flow.ts` — 7 elements (5 DUPLICATES)

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 60 | `AnalyzeEventFlowArgs` | interface | analyze-event-flow.ts:1 | Tool args: file, event — 2 props | **L1 core/event-flow/types.ts** | — | Move to typed module |
| 61 | `AnalyzeEventFlowResult` | interface | analyze-event-flow.ts:2 | Result: file, handlers, event_flows, issues, delegation_patterns, summary — 6 props | **L1 core/event-flow/types.ts** | — | Move to typed module |
| 62 | `ToolResponse` (local) | interface | analyze-event-flow.ts:3 | **DUPLICATE** of response-utils.ToolResponse | **DELETE** | — | Import from L0 shared/types.ts |
| 63 | `createSuccessResponse` (local) | function | analyze-event-flow.ts:4 | **DUPLICATE** of response-utils.createSuccessResponse | **DELETE** | — | Import from L0 shared/response.ts |
| 64 | `createErrorResponse` (local) | function | analyze-event-flow.ts:5 | **DUPLICATE** of response-utils.createErrorResponse | **DELETE** | — | Import from L0 shared/response.ts |
| 65 | `makeRelativePath` (local) | function | analyze-event-flow.ts:6 | **DUPLICATE** of react.makeRelativePath | **DELETE** | — | Import from L0 shared/utils.ts |
| 66 | `handleAnalyzeEventFlow(args)` | function | analyze-event-flow.ts:7 | Main handler for `frontend_event_flow` tool | **L3 plugins/dispatch.ts** | `analyzeEventFlow()` | Drop `handle`; L3 thin orchestrator |

### `handlers/analyze-layout-hierarchy.ts` — 6 elements (4 DUPLICATES)

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 67 | `AnalyzeLayoutHierarchyArgs` | interface | analyze-layout-hierarchy.ts:1 | Tool args: file, selector — 2 props | **L1 core/layout-hierarchy/types.ts** | — | Move to typed module |
| 68 | `AnalyzeLayoutHierarchyResult` | interface | analyze-layout-hierarchy.ts:2 | Result: file, root_element, layout_tree, constraint_notes, potential_issues, summary — 6 props | **L1 core/layout-hierarchy/types.ts** | — | Move to typed module |
| 69 | `ToolResponse` (local) | interface | analyze-layout-hierarchy.ts:3 | **DUPLICATE** | **DELETE** | — | Import from L0 shared/types.ts |
| 70 | `createSuccessResponse` (local) | function | analyze-layout-hierarchy.ts:4 | **DUPLICATE** | **DELETE** | — | Import from L0 shared/response.ts |
| 71 | `createErrorResponse` (local) | function | analyze-layout-hierarchy.ts:5 | **DUPLICATE** | **DELETE** | — | Import from L0 shared/response.ts |
| 72 | `handleAnalyzeLayoutHierarchy(args)` | function | analyze-layout-hierarchy.ts:6 | Main handler for `frontend_layout_hierarchy` tool | **L3 plugins/dispatch.ts** | `analyzeLayoutHierarchy()` | Drop `handle`; L3 thin orchestrator |

### `handlers/analyze-tailwind-conflicts.ts` — 6 elements (4 DUPLICATES)

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 73 | `AnalyzeTailwindConflictsArgs` | interface | analyze-tailwind-conflicts.ts:1 | Tool args: file, include_arbitrary — 2 props | **L1 core/tailwind-conflicts/types.ts** | — | Move to typed module |
| 74 | `AnalyzeTailwindConflictsResult` | interface | analyze-tailwind-conflicts.ts:2 | Result: file, elements_analyzed, conflicts, redundant_classes, specificity_issues, suggestions, summary — 7 props | **L1 core/tailwind-conflicts/types.ts** | — | Move to typed module |
| 75 | `ToolResponse` (local) | interface | analyze-tailwind-conflicts.ts:3 | **DUPLICATE** | **DELETE** | — | Import from L0 shared/types.ts |
| 76 | `createSuccessResponse` (local) | function | analyze-tailwind-conflicts.ts:4 | **DUPLICATE** | **DELETE** | — | Import from L0 shared/response.ts |
| 77 | `createErrorResponse` (local) | function | analyze-tailwind-conflicts.ts:5 | **DUPLICATE** | **DELETE** | — | Import from L0 shared/response.ts |
| 78 | `handleAnalyzeTailwindConflicts(args)` | function | analyze-tailwind-conflicts.ts:6 | Main handler for `frontend_tailwind_conflicts` tool | **L3 plugins/dispatch.ts** | `analyzeTailwindConflicts()` | Drop `handle`; L3 thin orchestrator |

### `handlers/get-accessibility-tree.ts` — 6 elements (4 DUPLICATES)

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 79 | `GetAccessibilityTreeArgs` | interface | get-accessibility-tree.ts:1 | Tool args: file, element, check_patterns — 3 props | **L1 core/accessibility/types.ts** | — | Move to typed module |
| 80 | `GetAccessibilityTreeResult` | interface | get-accessibility-tree.ts:2 | Result: file, a11y_tree, focus_order, issues, keyboard_interactions, aria_patterns, summary — 7 props | **L1 core/accessibility/types.ts** | — | Move to typed module |
| 81 | `ToolResponse` (local) | interface | get-accessibility-tree.ts:3 | **DUPLICATE** | **DELETE** | — | Import from L0 shared/types.ts |
| 82 | `createSuccessResponse` (local) | function | get-accessibility-tree.ts:4 | **DUPLICATE** | **DELETE** | — | Import from L0 shared/response.ts |
| 83 | `createErrorResponse` (local) | function | get-accessibility-tree.ts:5 | **DUPLICATE** | **DELETE** | — | Import from L0 shared/response.ts |
| 84 | `handleGetAccessibilityTree(args)` | function | get-accessibility-tree.ts:6 | Main handler for `frontend_accessibility_tree` tool | **L3 plugins/dispatch.ts** | `buildAccessibilityTree()` | Drop `handle`; L3 thin orchestrator |

### `handlers/get-sizing-strategy.ts` — 6 elements (4 DUPLICATES)

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 85 | `GetSizingStrategyArgs` | interface | get-sizing-strategy.ts:1 | Tool args: file, element — 2 props | **L1 core/sizing-strategy/types.ts** | — | Move to typed module |
| 86 | `GetSizingStrategyResult` | interface | get-sizing-strategy.ts:2 | Result: file, element, classes, width, height, flex_behavior, grid_behavior, position_context, ancestor_chain, summary — 10 props | **L1 core/sizing-strategy/types.ts** | — | Move to typed module |
| 87 | `ToolResponse` (local) | interface | get-sizing-strategy.ts:3 | **DUPLICATE** | **DELETE** | — | Import from L0 shared/types.ts |
| 88 | `createSuccessResponse` (local) | function | get-sizing-strategy.ts:4 | **DUPLICATE** | **DELETE** | — | Import from L0 shared/response.ts |
| 89 | `createErrorResponse` (local) | function | get-sizing-strategy.ts:5 | **DUPLICATE** | **DELETE** | — | Import from L0 shared/response.ts |
| 90 | `handleGetSizingStrategy(args)` | function | get-sizing-strategy.ts:6 | Main handler for `frontend_sizing_strategy` tool | **L3 plugins/dispatch.ts** | `analyzeSizingStrategy()` | Drop `handle`; L3 thin orchestrator |

### Re-export Barrel Files — 8 files × 0 net elements

All 8 are thin pass-through re-exports with JSDoc. They contain no logic. In the target architecture they are replaced by direct barrel exports in the plugin layer.

| File | Lines | Delegates To | Target |
|------|-------|-------------|--------|
| `analyze-client-boundary.ts` | 21 | `./client-boundary/` | **DELETE** — import directly from `extensions/client-boundary/` |
| `analyze-error-boundaries.ts` | 16 | `./error-boundaries/` | **DELETE** — import directly |
| `analyze-render-triggers.ts` | 29 | `./render-triggers/` | **DELETE** — import directly |
| `analyze-responsive-breakpoints.ts` | 24 | `./responsive-breakpoints/` | **DELETE** — import directly |
| `analyze-stacking-context.ts` | 25 | `./stacking-context/` | **DELETE** — import directly |
| `audit-hook-dependencies.ts` | 18 | `./hook-dependencies/` | **DELETE** — import directly |
| `diagnose-overflow.ts` | 24 | `./overflow-diagnosis/` | **DELETE** — import directly |
| `trace-component-state.ts` | 29 | `./component-state/` | **DELETE** — import directly |

### `handlers/accessibility-tree-core.ts` — 4 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 91 | `getLineNumber(node)` | function | accessibility-tree-core.ts:1 | Converts node position to 1-based line number — **DUPLICATE** | **DELETE** | — | Use L0 shared/ast.ts:lineOf() |
| 92 | `extractAttributeValue(attr)` | function | accessibility-tree-core.ts:2 | Extracts string values from JSX attributes | **L1 core/jsx/attribute-utils.ts** | — | Single-concern JSX utility |
| 93 | `extractTextContent(node)` | function | accessibility-tree-core.ts:3 | Recursively extracts text from JSX children | **L1 core/jsx/text-utils.ts** | — | Single-concern JSX utility |
| 94 | `analyzeJsxFile(path)` | function | accessibility-tree-core.ts:4 | Parses JSX file into element info tree | **L2 extensions/accessibility/jsx-parser.ts** | — | Multi-concern: parse + walk + build |

### `handlers/accessibility-tree-utils.ts` — 11 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 95 | `ElementInfo` | interface | accessibility-tree-utils.ts:1 | Internal element representation — 7 props | **L1 core/accessibility/types.ts** | — | Core domain type |
| 96 | `AriaPatternDef` | interface | accessibility-tree-utils.ts:2 | ARIA pattern definition — 3 props | **L1 core/accessibility/types.ts** | — | Core domain type |
| 97 | `SEMANTIC_ROLES` | const Map | accessibility-tree-utils.ts:3 | Maps HTML elements to implicit ARIA roles | **L1 core/accessibility/constants.ts** | — | Static data, no computation |
| 98 | `INPUT_TYPE_ROLES` | const Map | accessibility-tree-utils.ts:4 | Maps input types to ARIA roles | **L1 core/accessibility/constants.ts** | — | Static data |
| 99 | `NATIVELY_FOCUSABLE` | const Set | accessibility-tree-utils.ts:5 | Set of natively focusable HTML elements | **L1 core/accessibility/constants.ts** | — | Static data |
| 100 | `ARIA_PATTERNS` | const Map | accessibility-tree-utils.ts:6 | ARIA pattern definitions for dialog, combobox, tabs, etc. | **L1 core/accessibility/constants.ts** | — | Static data |
| 101 | `EXPECTED_KEYBOARD_INTERACTIONS` | const Map | accessibility-tree-utils.ts:7 | Maps ARIA roles to expected keyboard interactions | **L1 core/accessibility/constants.ts** | — | Static data |
| 102 | `getRole(tag, attrs)` | function | accessibility-tree-utils.ts:8 | Determines ARIA role from tag + attributes | **L1 core/accessibility/role-utils.ts** | — | Single-concern ARIA computation |
| 103 | `isFocusable(element)` | function | accessibility-tree-utils.ts:9 | Checks if element can receive focus | **L1 core/accessibility/focus-utils.ts** | — | Single-concern focus check |
| 104 | `getTabIndex(element)` | function | accessibility-tree-utils.ts:10 | Extracts or infers tabindex value | **L1 core/accessibility/focus-utils.ts** | — | Single-concern focus check |
| 105 | `isHidden(element)` | function | accessibility-tree-utils.ts:11 | Checks if element is hidden via ARIA/CSS | **L1 core/accessibility/role-utils.ts** | — | Single-concern visibility check |

### `handlers/accessibility-tree-analyzers.ts` — 13 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 106 | `A11yNode` | interface | accessibility-tree-analyzers.ts:1 | Accessibility tree node — 5 props | **L1 core/accessibility/types.ts** | — | Core output type |
| 107 | `FocusOrderEntry` | interface | accessibility-tree-analyzers.ts:2 | Focus sequence entry — 3 props | **L1 core/accessibility/types.ts** | — | Core output type |
| 108 | `A11yIssue` | interface | accessibility-tree-analyzers.ts:3 | Accessibility issue — 4 props | **L1 core/accessibility/types.ts** | — | Core output type |
| 109 | `KeyboardInteractions` | interface | accessibility-tree-analyzers.ts:4 | Keyboard interaction analysis — 3 props | **L1 core/accessibility/types.ts** | — | Core output type |
| 110 | `AriaPattern` | interface | accessibility-tree-analyzers.ts:5 | ARIA pattern validation result — 3 props | **L1 core/accessibility/types.ts** | — | Core output type |
| 111 | `getAccessibleName(element)` | function | accessibility-tree-analyzers.ts:6 | Computes accessible name from ARIA/content | **L1 core/accessibility/name-utils.ts** | — | Single-concern name computation |
| 112 | `getAccessibleDescription(element)` | function | accessibility-tree-analyzers.ts:7 | Gets accessible description from ARIA attributes | **L1 core/accessibility/name-utils.ts** | — | Single-concern name computation |
| 113 | `validateAriaPatterns(elements)` | function | accessibility-tree-analyzers.ts:8 | Validates ARIA patterns in elements | **L2 extensions/accessibility/pattern-validator.ts** | — | Multi-concern: classify + validate |
| 114 | `detectA11yIssues(elements)` | function | accessibility-tree-analyzers.ts:9 | Detects WCAG violations | **L2 extensions/accessibility/issue-detector.ts** | — | Multi-concern: scan + classify |
| 115 | `analyzeKeyboardInteractions(handlers)` | function | accessibility-tree-analyzers.ts:10 | Analyzes keyboard handlers vs expectations | **L2 extensions/accessibility/keyboard-analyzer.ts** | — | Multi-concern: map + compare |
| 116 | `buildA11yTree(elements)` | function | accessibility-tree-analyzers.ts:11 | Builds hierarchical accessibility tree | **L2 extensions/accessibility/tree-builder.ts** | — | Multi-concern: structure + enrich |
| 117 | `buildFocusOrder(elements)` | function | accessibility-tree-analyzers.ts:12 | Creates focus sequence sorted by tabindex | **L2 extensions/accessibility/focus-analyzer.ts** | — | Multi-concern: filter + sort |
| 118 | `generateSummary(result)` | function | accessibility-tree-analyzers.ts:13 | Generates human-readable a11y summary | **L2 extensions/accessibility/summary.ts** | — | Aggregation + formatting |

### `handlers/event-flow-core.ts` — 8 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 119 | `getLineNumber(node)` | function | event-flow-core.ts:1 | Gets line number from node — **DUPLICATE** | **DELETE** | — | Use L0 shared/ast.ts:lineOf() |
| 120 | `getCodeSnippet(node)` | function | event-flow-core.ts:2 | Extracts truncated code snippet from node | **L0 shared/ast.ts** | — | Generic AST utility |
| 121 | `containsStopPropagation(body)` | function | event-flow-core.ts:3 | Checks for stopPropagation() calls | **L1 core/event-flow/propagation-utils.ts** | — | Single-concern AST check |
| 122 | `containsPreventDefault(body)` | function | event-flow-core.ts:4 | Checks for preventDefault() calls | **L1 core/event-flow/propagation-utils.ts** | — | Single-concern AST check |
| 123 | `resolveHandlerBody(ref, ast)` | function | event-flow-core.ts:5 | Resolves handler ref to function body | **L0 shared/ast.ts** | — | Generic AST resolution |
| 124 | `extractEventHandlers(jsx)` | function | event-flow-core.ts:6 | Extracts all event handlers from JSX | **L1 core/event-flow/handler-extractor.ts** | — | Single-concern extraction |
| 125 | `findReactComponent(ast)` | function | event-flow-core.ts:7 | Finds main React component in file | **L1 core/react/component-detection.ts** | — | DUPLICATE of react.ts — consolidate |
| 126 | `detectDelegationPatterns(ast)` | function | event-flow-core.ts:8 | Detects e.target.closest() patterns | **L1 core/event-flow/delegation-detector.ts** | — | Single-concern pattern detection |

### `handlers/event-flow-utils.ts` — 7 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 127 | `EventHandler` | interface | event-flow-utils.ts:1 | Event handler info — 6 props | **L1 core/event-flow/types.ts** | — | Core domain type |
| 128 | `ComponentNode` | interface | event-flow-utils.ts:2 | Component tree node tracking — 5 props | **L1 core/event-flow/types.ts** | — | Core domain type |
| 129 | `EVENT_PROPS` | const Map | event-flow-utils.ts:3 | Maps React event props to DOM events | **L1 core/event-flow/constants.ts** | — | Static mapping data |
| 130 | `BUBBLING_EVENTS` | const Set | event-flow-utils.ts:4 | Events that bubble by default | **L1 core/event-flow/constants.ts** | — | Static data |
| 131 | `INTERACTIVE_ELEMENTS` | const Set | event-flow-utils.ts:5 | Natively interactive HTML elements | **L1 core/event-flow/constants.ts** | — | Static data |
| 132 | `NON_INTERACTIVE_ELEMENTS` | const Set | event-flow-utils.ts:6 | Elements often given click handlers | **L1 core/event-flow/constants.ts** | — | Static data |
| 133 | `normalizeFilePath(p)` | function | event-flow-utils.ts:7 | Normalizes path separators — **DUPLICATE** | **DELETE** | — | Use L0 shared/utils.ts:normalizePath() |

### `handlers/event-flow-analyzers.ts` — 11 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 134 | `EventFlowStep` | interface | event-flow-analyzers.ts:1 | Step in event flow — 3 props | **L1 core/event-flow/types.ts** | — | Core output type |
| 135 | `EventFlow` | interface | event-flow-analyzers.ts:2 | Event flow scenario — 3 props | **L1 core/event-flow/types.ts** | — | Core output type |
| 136 | `EventIssue` | interface | event-flow-analyzers.ts:3 | Event handling issue — 3 props | **L1 core/event-flow/types.ts** | — | Core output type |
| 137 | `DelegationPattern` | interface | event-flow-analyzers.ts:4 | Event delegation pattern — 3 props | **L1 core/event-flow/types.ts** | — | Core output type |
| 138 | `findNestedClickables(tree)` | function | event-flow-analyzers.ts:5 | Finds nested elements with click handlers | **L2 extensions/event-flow/nesting-detector.ts** | — | Multi-concern: walk + filter |
| 139 | `areNested(a, b)` | function | event-flow-analyzers.ts:6 | Checks parent-child relationship | **L1 core/jsx/tree-utils.ts** | — | Single-concern tree check |
| 140 | `findNodeByLine(tree, line)` | function | event-flow-analyzers.ts:7 | Finds component node by line number | **L1 core/jsx/tree-utils.ts** | — | Single-concern lookup |
| 141 | `detectIssues(tree, handlers)` | function | event-flow-analyzers.ts:8 | Detects event handling issues | **L2 extensions/event-flow/issue-detector.ts** | — | Multi-concern: classify + report |
| 142 | `buildEventFlows(handlers, tree)` | function | event-flow-analyzers.ts:9 | Simulates event bubbling flows | **L2 extensions/event-flow/flow-builder.ts** | — | Multi-concern: simulate + structure |
| 143 | `findDelegationTargets(body)` | function | event-flow-analyzers.ts:10 | Finds delegation targets in handler code | **L2 extensions/event-flow/delegation-analyzer.ts** | — | Multi-concern: parse + resolve |
| 144 | `generateSummary(result)` | function | event-flow-analyzers.ts:11 | Generates event analysis summary | **L2 extensions/event-flow/summary.ts** | — | Aggregation + formatting |

### `handlers/layout-hierarchy-core.ts` — 7 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 145 | `extractClassName(node)` | function | layout-hierarchy-core.ts:1 | Extracts className from JSX element | **L1 core/jsx/attribute-utils.ts** | — | Single-concern JSX utility |
| 146 | `extractId(node)` | function | layout-hierarchy-core.ts:2 | Extracts id attribute from JSX element | **L1 core/jsx/attribute-utils.ts** | — | Single-concern JSX utility |
| 147 | `createElementIdentifier(tag, id, cls)` | function | layout-hierarchy-core.ts:3 | Creates element identifier string | **L1 core/jsx/element-utils.ts** | — | Single-concern utility |
| 148 | `buildLayoutNode(el)` | function | layout-hierarchy-core.ts:4 | Builds LayoutNode with sizing/flex/grid/overflow info | **L2 extensions/layout-hierarchy/node-builder.ts** | — | Multi-concern: parse + classify |
| 149 | `matchesSelector(node, sel)` | function | layout-hierarchy-core.ts:5 | Checks if element matches CSS selector | **L1 core/jsx/selector-utils.ts** | — | Single-concern selector check |
| 150 | `parseJsxElement(el)` | function | layout-hierarchy-core.ts:6 | Parses JSX elements into layout nodes | **L2 extensions/layout-hierarchy/parser.ts** | — | Multi-concern: parse + walk |
| 151 | `findRootJsx(component)` | function | layout-hierarchy-core.ts:7 | Finds root JSX from component return | **L1 core/react/jsx-utils.ts** | — | Single-concern JSX traversal |

### `handlers/layout-hierarchy-utils.ts` — 9 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 152 | `SizingStrategy` | interface | layout-hierarchy-utils.ts:1 | Sizing strategy with type and value — 2 props | **L1 core/tailwind/types.ts** | — | Shared Tailwind output type |
| 153 | `DisplayType` | type | layout-hierarchy-utils.ts:2 | CSS display value union | **L0 shared/types.ts** | — | Generic CSS type |
| 154 | `PositionType` | type | layout-hierarchy-utils.ts:3 | CSS position value union | **L0 shared/types.ts** | — | Generic CSS type; duplicated in sizing-strategy-utils |
| 155 | `ParsedCssProperties` | interface | layout-hierarchy-utils.ts:4 | Parsed Tailwind props — 10+ props | **L1 core/tailwind/types.ts** | — | Core Tailwind output type |
| 156 | `TAILWIND_SPACING` | const Map | layout-hierarchy-utils.ts:5 | Maps Tailwind spacing scale to CSS | **L1 core/tailwind/constants.ts** | — | Duplicated in sizing-strategy-utils; merge |
| 157 | `TAILWIND_FRACTIONS` | const Map | layout-hierarchy-utils.ts:6 | Maps Tailwind fractions to percentages | **L1 core/tailwind/constants.ts** | — | Duplicated; merge |
| 158 | `parseWidthClass(cls)` | function | layout-hierarchy-utils.ts:7 | Parses width classes to SizingStrategy | **L1 core/tailwind/class-parser.ts** | — | Near-duplicate in sizing-strategy-utils; merge |
| 159 | `parseHeightClass(cls)` | function | layout-hierarchy-utils.ts:8 | Parses height classes to SizingStrategy | **L1 core/tailwind/class-parser.ts** | — | Near-duplicate; merge |
| 160 | `parseTailwindClasses(classes)` | function | layout-hierarchy-utils.ts:9 | Parses all Tailwind classes to CSS props | **L1 core/tailwind/class-parser.ts** | — | Near-duplicate; merge (sizing-strategy version is superset) |

### `handlers/layout-hierarchy-analyzers.ts` — 10 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 161 | `Sizing` | interface | layout-hierarchy-analyzers.ts:1 | Width/height sizing — 2 props | **L1 core/layout-hierarchy/types.ts** | — | Core output type |
| 162 | `FlexProps` | interface | layout-hierarchy-analyzers.ts:2 | Flex layout props — 8 props | **L1 core/layout-hierarchy/types.ts** | — | Core output type |
| 163 | `GridProps` | interface | layout-hierarchy-analyzers.ts:3 | Grid layout props — 6 props | **L1 core/layout-hierarchy/types.ts** | — | Core output type |
| 164 | `Overflow` | interface | layout-hierarchy-analyzers.ts:4 | Overflow for x/y — 2 props | **L1 core/layout-hierarchy/types.ts** | — | Core output type |
| 165 | `LayoutNode` | interface | layout-hierarchy-analyzers.ts:5 | Complete layout node — 12 props | **L1 core/layout-hierarchy/types.ts** | — | Core domain type |
| 166 | `LayoutIssue` | interface | layout-hierarchy-analyzers.ts:6 | Layout issue — 3 props | **L1 core/layout-hierarchy/types.ts** | — | Core output type |
| 167 | `LayoutContext` | interface | layout-hierarchy-analyzers.ts:7 | Context passed down tree — 5 props | **L1 core/layout-hierarchy/types.ts** | — | Internal analysis type |
| 168 | `detectIssues(tree)` | function | layout-hierarchy-analyzers.ts:8 | Detects layout issues | **L2 extensions/layout-hierarchy/issue-detector.ts** | — | Multi-concern: walk + classify |
| 169 | `generateConstraintNotes(tree)` | function | layout-hierarchy-analyzers.ts:9 | Generates constraint chain explanation | **L2 extensions/layout-hierarchy/constraint-notes.ts** | — | Multi-concern: traverse + format |
| 170 | `generateSummary(result)` | function | layout-hierarchy-analyzers.ts:10 | Generates layout analysis summary | **L2 extensions/layout-hierarchy/summary.ts** | — | Aggregation + formatting |

### `handlers/sizing-strategy-core.ts` — 8 elements (4 DUPLICATES)

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 171 | `extractClassName(node)` | function | sizing-strategy-core.ts:1 | **DUPLICATE** of layout-hierarchy-core | **DELETE** | — | Consolidate into L1 core/jsx/attribute-utils.ts |
| 172 | `extractId(node)` | function | sizing-strategy-core.ts:2 | **DUPLICATE** of layout-hierarchy-core | **DELETE** | — | Same |
| 173 | `buildElementNode(el)` | function | sizing-strategy-core.ts:3 | Builds ElementNode with parsed Tailwind | **L2 extensions/sizing-strategy/node-builder.ts** | — | Multi-concern: parse + classify |
| 174 | `matchesSelector(node, sel)` | function | sizing-strategy-core.ts:4 | **DUPLICATE** of layout-hierarchy-core | **DELETE** | — | Consolidate into L1 core/jsx/selector-utils.ts |
| 175 | `parseJsxTree(component)` | function | sizing-strategy-core.ts:5 | Parses JSX tree into ElementNode structure | **L2 extensions/sizing-strategy/parser.ts** | — | Multi-concern: parse + walk |
| 176 | `findRootJsx(component)` | function | sizing-strategy-core.ts:6 | **DUPLICATE** of layout-hierarchy-core | **DELETE** | — | Consolidate into L1 core/react/jsx-utils.ts |
| 177 | `findElementBySelector(tree, sel)` | function | sizing-strategy-core.ts:7 | Finds element matching CSS selector | **L2 extensions/sizing-strategy/parser.ts** | — | Multi-concern: walk + match |
| 178 | `getAllElements(tree)` | function | sizing-strategy-core.ts:8 | Flattens JSX tree to array | **L1 core/jsx/tree-utils.ts** | — | Single-concern traversal |

### `handlers/sizing-strategy-utils.ts` — 11 elements (5 DUPLICATES)

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 179 | `DisplayType` | type | sizing-strategy-utils.ts:1 | **DUPLICATE** of layout-hierarchy-utils | **DELETE** | — | Use L0 shared/types.ts |
| 180 | `PositionType` | type | sizing-strategy-utils.ts:2 | **DUPLICATE** of layout-hierarchy-utils | **DELETE** | — | Use L0 shared/types.ts |
| 181 | `SizingStrategyType` | type | sizing-strategy-utils.ts:3 | Sizing strategy type union — 8 values | **L1 core/tailwind/types.ts** | — | Core domain type |
| 182 | `ElementNode` | interface | sizing-strategy-utils.ts:4 | Element with all CSS props — 24 props | **L1 core/sizing-strategy/types.ts** | — | Core domain type |
| 183 | `TAILWIND_SPACING` | const Map | sizing-strategy-utils.ts:5 | **DUPLICATE** of layout-hierarchy-utils | **DELETE** | — | Use L1 core/tailwind/constants.ts |
| 184 | `TAILWIND_FRACTIONS` | const Map | sizing-strategy-utils.ts:6 | **DUPLICATE** of layout-hierarchy-utils | **DELETE** | — | Use L1 core/tailwind/constants.ts |
| 185 | `MAX_WIDTH_VALUES` | const Map | sizing-strategy-utils.ts:7 | Maps max-width Tailwind classes to CSS | **L1 core/tailwind/constants.ts** | — | Static Tailwind data |
| 186 | `parseWidthClass(cls)` | function | sizing-strategy-utils.ts:8 | Near-DUPLICATE of layout-hierarchy-utils (superset) | **L1 core/tailwind/class-parser.ts** | — | Merge; this version has more coverage |
| 187 | `parseHeightClass(cls)` | function | sizing-strategy-utils.ts:9 | Near-DUPLICATE of layout-hierarchy-utils (superset) | **L1 core/tailwind/class-parser.ts** | — | Merge; this version has more coverage |
| 188 | `parseTailwindClasses(classes)` | function | sizing-strategy-utils.ts:10 | Near-DUPLICATE (superset with 24 props vs 10+) | **L1 core/tailwind/class-parser.ts** | — | Merge; this version is the superset to keep |
| 189 | `createElementIdentifier(tag, id, cls)` | function | sizing-strategy-utils.ts:11 | **DUPLICATE** of layout-hierarchy-core | **DELETE** | — | Use L1 core/jsx/element-utils.ts |

### `handlers/sizing-strategy-analyzers.ts` — 12 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 190 | `SizingDimension` | interface | sizing-strategy-analyzers.ts:1 | Sizing dimension analysis — 4 props | **L1 core/sizing-strategy/types.ts** | — | Core output type |
| 191 | `FlexBehavior` | interface | sizing-strategy-analyzers.ts:2 | Flex behavior analysis — 5 props | **L1 core/sizing-strategy/types.ts** | — | Core output type |
| 192 | `GridBehavior` | interface | sizing-strategy-analyzers.ts:3 | Grid behavior analysis — 5 props | **L1 core/sizing-strategy/types.ts** | — | Core output type |
| 193 | `AncestorNode` | interface | sizing-strategy-analyzers.ts:4 | Ancestor sizing impact — 2 props | **L1 core/sizing-strategy/types.ts** | — | Core output type |
| 194 | `getStrategyDescription(strategy)` | function | sizing-strategy-analyzers.ts:5 | Human-readable strategy description | **L1 core/sizing-strategy/formatters.ts** | — | Single-concern formatting |
| 195 | `analyzeWidthStrategy(el)` | function | sizing-strategy-analyzers.ts:6 | Analyzes width sizing strategy | **L2 extensions/sizing-strategy/dimension-analyzer.ts** | — | Multi-concern: classify + describe |
| 196 | `analyzeHeightStrategy(el)` | function | sizing-strategy-analyzers.ts:7 | Analyzes height sizing strategy | **L2 extensions/sizing-strategy/dimension-analyzer.ts** | — | Multi-concern: classify + describe |
| 197 | `analyzeFlexBehavior(el)` | function | sizing-strategy-analyzers.ts:8 | Analyzes flex behavior | **L2 extensions/sizing-strategy/flex-analyzer.ts** | — | Multi-concern: classify + describe |
| 198 | `analyzeGridBehavior(el)` | function | sizing-strategy-analyzers.ts:9 | Analyzes grid behavior | **L2 extensions/sizing-strategy/grid-analyzer.ts** | — | Multi-concern: classify + describe |
| 199 | `getPositionContext(el)` | function | sizing-strategy-analyzers.ts:10 | Describes position context | **L1 core/sizing-strategy/formatters.ts** | — | Single-concern description |
| 200 | `buildAncestorChain(el, tree)` | function | sizing-strategy-analyzers.ts:11 | Builds ancestor sizing chain | **L2 extensions/sizing-strategy/ancestor-analyzer.ts** | — | Multi-concern: traverse + classify |
| 201 | `generateSummary(result)` | function | sizing-strategy-analyzers.ts:12 | Generates sizing analysis summary | **L2 extensions/sizing-strategy/summary.ts** | — | Aggregation + formatting |

### `handlers/tailwind-conflicts-core.ts` — 3 elements (1 DUPLICATE)

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 202 | `getLineNumber(node)` | function | tailwind-conflicts-core.ts:1 | Gets line number — **DUPLICATE** | **DELETE** | — | Use L0 shared/ast.ts:lineOf() |
| 203 | `getRawClassName(el)` | function | tailwind-conflicts-core.ts:2 | Extracts raw className string from JSX | **L1 core/jsx/attribute-utils.ts** | — | Single-concern JSX utility |
| 204 | `analyzeJsxFile(path)` | function | tailwind-conflicts-core.ts:3 | Analyzes JSX file for element class info | **L2 extensions/tailwind-conflicts/jsx-parser.ts** | — | Multi-concern: parse + extract |

### `handlers/tailwind-conflicts-utils.ts` — 12 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 205 | `CLASS_CATEGORIES` | const Map | tailwind-conflicts-utils.ts:1 | Maps CSS property categories to Tailwind prefixes | **L1 core/tailwind/conflict-constants.ts** | — | Static conflict analysis data |
| 206 | `SHORTHAND_MAP` | const Map | tailwind-conflicts-utils.ts:2 | Maps shorthand classes to longhand equivalents | **L1 core/tailwind/conflict-constants.ts** | — | Static data |
| 207 | `CONTRADICTIONS` | const array | tailwind-conflicts-utils.ts:3 | Array of mutually exclusive class pairs | **L1 core/tailwind/conflict-constants.ts** | — | Static data |
| 208 | `SIZE_SETS_BOTH` | const | tailwind-conflicts-utils.ts:4 | Identifier for `size-` classes | **L1 core/tailwind/conflict-constants.ts** | — | Static data |
| 209 | `stripPrefixes(cls)` | function | tailwind-conflicts-utils.ts:5 | Removes variant/breakpoint prefixes | **L1 core/tailwind/class-parser.ts** | — | Single-concern parsing |
| 210 | `getBreakpointPrefix(cls)` | function | tailwind-conflicts-utils.ts:6 | Extracts breakpoint prefix | **L1 core/tailwind/class-parser.ts** | — | Single-concern parsing |
| 211 | `getVariantPrefix(cls)` | function | tailwind-conflicts-utils.ts:7 | Extracts variant prefix | **L1 core/tailwind/class-parser.ts** | — | Single-concern parsing |
| 212 | `groupByBreakpoint(classes)` | function | tailwind-conflicts-utils.ts:8 | Groups classes by breakpoint | **L1 core/tailwind/class-grouper.ts** | — | Single-concern grouping |
| 213 | `groupByVariant(classes)` | function | tailwind-conflicts-utils.ts:9 | Groups classes by variant | **L1 core/tailwind/class-grouper.ts** | — | Single-concern grouping |
| 214 | `getCategory(cls)` | function | tailwind-conflicts-utils.ts:10 | Determines CSS category for class | **L1 core/tailwind/class-classifier.ts** | — | Single-concern classification |
| 215 | `getShorthandPrefix(cls)` | function | tailwind-conflicts-utils.ts:11 | Gets shorthand prefix (p, m, etc) | **L1 core/tailwind/class-classifier.ts** | — | Single-concern classification |
| 216 | `longhandOverridesShorthand(cls, set)` | function | tailwind-conflicts-utils.ts:12 | Checks longhand override | **L1 core/tailwind/class-classifier.ts** | — | Single-concern check |

### `handlers/tailwind-conflicts-analyzers.ts` — 8 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 217 | `ConflictType` | type | tailwind-conflicts-analyzers.ts:1 | Conflict type union — 3 values | **L1 core/tailwind-conflicts/types.ts** | — | Core domain type |
| 218 | `Conflict` | interface | tailwind-conflicts-analyzers.ts:2 | Conflict info — 6 props | **L1 core/tailwind-conflicts/types.ts** | — | Core output type |
| 219 | `RedundantClass` | interface | tailwind-conflicts-analyzers.ts:3 | Redundant class report — 3 props | **L1 core/tailwind-conflicts/types.ts** | — | Core output type |
| 220 | `SpecificityIssue` | interface | tailwind-conflicts-analyzers.ts:4 | Specificity issue — 4 props | **L1 core/tailwind-conflicts/types.ts** | — | Core output type |
| 221 | `Suggestion` | interface | tailwind-conflicts-analyzers.ts:5 | Optimization suggestion — 2 props | **L1 core/tailwind-conflicts/types.ts** | — | Core output type |
| 222 | `ElementInfo` | interface | tailwind-conflicts-analyzers.ts:6 | Element class info — 4 props | **L1 core/tailwind-conflicts/types.ts** | — | Core intermediate type |
| 223 | `detectConflicts(elements)` | function | tailwind-conflicts-analyzers.ts:7 | Detects override/redundant/contradiction conflicts | **L2 extensions/tailwind-conflicts/conflict-detector.ts** | — | Multi-concern: classify + match |
| 224 | `detectSpecificityIssues(elements)` | function | tailwind-conflicts-analyzers.ts:8 | Detects specificity issues | **L2 extensions/tailwind-conflicts/specificity-detector.ts** | — | Multi-concern: group + detect |

### `client-boundary/types.ts` — 8 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 225 | `AnalyzeClientBoundaryArgs` | interface | client-boundary/types.ts:1 | Tool args: file, path, shallow — 3 props | **L1 core/client-boundary/types.ts** | — | Core input type |
| 226 | `Classification` | type | client-boundary/types.ts:2 | server/client/client-inherited/ambiguous | **L1 core/client-boundary/types.ts** | — | Core domain type |
| 227 | `IssueSeverity` | type | client-boundary/types.ts:3 | error/warning/info | **L1 core/client-boundary/types.ts** | — | Core domain type |
| 228 | `IssueType` | type | client-boundary/types.ts:4 | 5 boundary issue types | **L1 core/client-boundary/types.ts** | — | Core domain type |
| 229 | `ComponentClassification` | interface | client-boundary/types.ts:5 | Classification result — 5 props | **L1 core/client-boundary/types.ts** | — | Core output type |
| 230 | `ClientBoundaryIssue` | interface | client-boundary/types.ts:6 | Boundary issue — 6 props | **L1 core/client-boundary/types.ts** | — | Core output type |
| 231 | `BoundarySummary` | interface | client-boundary/types.ts:7 | Summary stats — 5 props | **L1 core/client-boundary/types.ts** | — | Core output type |
| 232 | `BoundaryEntry` | interface | client-boundary/types.ts:8 | Boundary entry point — 3 props | **L1 core/client-boundary/types.ts** | — | Core output type |

### `client-boundary/scanner.ts` — 5 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 233 | `findClientOnlyAPIs(ast)` | function | client-boundary/scanner.ts:1 | Detects client-only API usage | **L1 core/client-boundary/api-detector.ts** | — | Single-concern AST check |
| 234 | `findServerOnlyImports(ast)` | function | client-boundary/scanner.ts:2 | Detects server-only imports | **L1 core/client-boundary/api-detector.ts** | — | Single-concern AST check |
| 235 | `collectFiles(dir, exts)` | function | client-boundary/scanner.ts:3 | Recursively collects scannable files | **L1 core/file-utils.ts** | — | Generic file scanner |
| 236 | `parseFile(path)` | function | client-boundary/scanner.ts:4 | Parses file into TS SourceFile | **L1 core/ast/parser.ts** | — | Single-concern file parsing |
| 237 | `scanForDirectives(files)` | function | client-boundary/scanner.ts:5 | Scans files for use client/server directives | **L2 extensions/client-boundary/directive-scanner.ts** | — | Multi-concern: read + parse + extract |

### `client-boundary/graph-builder.ts` — 3 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 238 | `buildImportGraph(files)` | function | client-boundary/graph-builder.ts:1 | Builds import graph from files | **L2 extensions/client-boundary/import-graph.ts** | — | Multi-concern: parse + link |
| 239 | `classifyComponents(graph, entries)` | function | client-boundary/graph-builder.ts:2 | BFS classification from client boundaries | **L2 extensions/client-boundary/classifier.ts** | — | Multi-concern: BFS + classify |
| 240 | `buildBoundaryMap(graph, classified)` | function | client-boundary/graph-builder.ts:3 | Maps boundary files to descendant count | **L2 extensions/client-boundary/boundary-map.ts** | — | Multi-concern: graph traverse + aggregate |

### `client-boundary/issue-detector.ts` — 5 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 241 | `detectUnnecessaryClient(classified)` | function | client-boundary/issue-detector.ts:1 | Files with "use client" but no client APIs | **L2 extensions/client-boundary/issue-detector.ts** | — | Multi-concern: filter + check |
| 242 | `detectMissingDirective(classified)` | function | client-boundary/issue-detector.ts:2 | Files using client APIs without directive | **L2 extensions/client-boundary/issue-detector.ts** | — | Multi-concern: filter + check |
| 243 | `detectLargeClientSubtrees(map)` | function | client-boundary/issue-detector.ts:3 | Large client subtrees | **L2 extensions/client-boundary/issue-detector.ts** | — | Multi-concern: threshold + report |
| 244 | `detectServerOnlyInClient(classified)` | function | client-boundary/issue-detector.ts:4 | Server imports in client files | **L2 extensions/client-boundary/issue-detector.ts** | — | Multi-concern: intersect + report |
| 245 | `detectIssues(classified, map, scan)` | function | client-boundary/issue-detector.ts:5 | Runs all detectors, returns combined | **L2 extensions/client-boundary/issue-detector.ts** | — | Orchestrator: compose all detectors |

### `client-boundary/index.ts` — 2 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 246 | `resolveScanPath(args)` | function | client-boundary/index.ts:1 | Determines scan path (app/, src/, or root) | **L2 extensions/client-boundary/resolver.ts** | — | Single-concern path resolution |
| 247 | `handleAnalyzeClientBoundary(args)` | function | client-boundary/index.ts:2 | Main handler for `analyze_client_boundary` tool | **L3 plugins/dispatch.ts** | `analyzeClientBoundary()` | Drop `handle`; L3 thin orchestrator |

### `component-state/types.ts` — 11 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 248 | `TraceComponentStateArgs` | interface | component-state/types.ts:1 | Tool args — component, file, depth | **L1 core/component-state/types.ts** | — | Core input type |
| 249 | `LocalStateInfo` | interface | component-state/types.ts:2 | Local state — name, type, initialValue | **L1 core/component-state/types.ts** | — | Core output type |
| 250 | `ReceivedProp` | interface | component-state/types.ts:3 | Received prop info | **L1 core/component-state/types.ts** | — | Core output type |
| 251 | `PassedDownProp` | interface | component-state/types.ts:4 | Passed-down prop info | **L1 core/component-state/types.ts** | — | Core output type |
| 252 | `PropsAnalysis` | interface | component-state/types.ts:5 | Props analysis result | **L1 core/component-state/types.ts** | — | Core output type |
| 253 | `ConsumedContext` | interface | component-state/types.ts:6 | Consumed context info | **L1 core/component-state/types.ts** | — | Core output type |
| 254 | `ProvidedContext` | interface | component-state/types.ts:7 | Provided context info | **L1 core/component-state/types.ts** | — | Core output type |
| 255 | `ContextAnalysis` | interface | component-state/types.ts:8 | Context analysis result | **L1 core/component-state/types.ts** | — | Core output type |
| 256 | `EffectInfo` | interface | component-state/types.ts:9 | Effect info — deps, cleanup | **L1 core/component-state/types.ts** | — | Core output type |
| 257 | `ComponentIssue` | interface | component-state/types.ts:10 | Component issue — type, message, severity | **L1 core/component-state/types.ts** | — | Core output type |
| 258 | `AnalysisContext` | interface | component-state/types.ts:11 | Internal analysis context | **L1 core/component-state/types.ts** | — | Internal orchestration type |

### `component-state/utils.ts` — 8 elements (4 DUPLICATES)

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 259 | `createSuccessResponse` | function | component-state/utils.ts:1 | **DUPLICATE** | **DELETE** | — | Use L0 shared/response.ts |
| 260 | `createErrorResponse` | function | component-state/utils.ts:2 | **DUPLICATE** | **DELETE** | — | Use L0 shared/response.ts |
| 261 | `normalizeFilePath(p)` | function | component-state/utils.ts:3 | **DUPLICATE** | **DELETE** | — | Use L0 shared/utils.ts:normalizePath() |
| 262 | `makeRelativePath(base, abs)` | function | component-state/utils.ts:4 | **DUPLICATE** | **DELETE** | — | Use L0 shared/utils.ts:toRelativePath() |
| 263 | `resolveFilePath(file, root)` | function | component-state/utils.ts:5 | Resolves file path to absolute | **L0 shared/utils.ts** | — | Generic path utility |
| 264 | `getTypeString(node)` | function | component-state/utils.ts:6 | Extracts type string from TS node | **L1 core/ast/type-utils.ts** | — | Single-concern AST utility |
| 265 | `inferTypeFromValue(node)` | function | component-state/utils.ts:7 | Infers type from initial value | **L1 core/ast/type-utils.ts** | — | Single-concern type inference |
| 266 | `hasCleanupReturn(fn)` | function | component-state/utils.ts:8 | Checks for cleanup return in function | **L1 core/react/hook-utils.ts** | — | Single-concern hook utility; duplicated in hook-dependencies |

### `component-state/component-detector.ts` — 3 elements (3 DUPLICATES)

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 267 | `containsJsxReturn(body)` | function | component-state/component-detector.ts:1 | **DUPLICATE** of react.ts | **DELETE** | — | Use L1 core/react/component-detection.ts |
| 268 | `isReactComponent(node)` | function | component-state/component-detector.ts:2 | **DUPLICATE** of react.ts | **DELETE** | — | Use L1 core/react/component-detection.ts |
| 269 | `getComponentName(node)` | function | component-state/component-detector.ts:3 | **DUPLICATE** of react.ts | **DELETE** | — | Use L1 core/react/component-detection.ts |

### `component-state/hook-analyzer.ts` — 2 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 270 | `isKnownHookOrImported(fn)` | function | component-state/hook-analyzer.ts:1 | Checks if function is a hook | **L1 core/react/hook-utils.ts** | — | Single-concern hook check |
| 271 | `extractHooks(component, scope)` | function | component-state/hook-analyzer.ts:2 | Extracts all hook usages from component | **L2 extensions/component-state/hook-extractor.ts** | — | Multi-concern: walk + classify |

### `component-state/jsx-analyzer.ts` — 2 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 272 | `collectUsedIdentifiers(expr)` | function | component-state/jsx-analyzer.ts:1 | Collects identifiers in expression | **L1 core/ast/identifier-utils.ts** | — | Single-concern AST traversal |
| 273 | `analyzeJsx(component, ctx)` | function | component-state/jsx-analyzer.ts:2 | Analyzes JSX for state/props usage | **L2 extensions/component-state/jsx-analyzer.ts** | — | Multi-concern: walk + correlate |

### `component-state/props-analyzer.ts` — 3 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 274 | `extractReceivedProps(component)` | function | component-state/props-analyzer.ts:1 | Extracts props from component definition | **L2 extensions/component-state/props-analyzer.ts** | — | Multi-concern: parse + infer |
| 275 | `extractPropsFromTypeDefinition(node)` | function | component-state/props-analyzer.ts:2 | Extracts props from interface/type | **L1 core/react/props-utils.ts** | — | Single-concern TypeScript analysis |
| 276 | `findProvidedContexts(component)` | function | component-state/props-analyzer.ts:3 | Finds context providers | **L2 extensions/component-state/context-analyzer.ts** | — | Multi-concern: walk + detect |

### `component-state/issue-detector.ts` — 1 element

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 277 | `detectIssues(analysis)` | function | component-state/issue-detector.ts:1 | Detects prop drilling, callback instability, etc. | **L2 extensions/component-state/issue-detector.ts** | — | Multi-concern: evaluate + classify |

### `component-state/index.ts` — 4 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 278 | `findJsxComponentNames(ast)` | function | component-state/index.ts:1 | Finds PascalCase JSX component usages | **L1 core/react/jsx-walker.ts** | — | Single-concern JSX traversal |
| 279 | `resolveImportPath(file, imp)` | function | component-state/index.ts:2 | Resolves import path to file | **L1 core/ast/import-resolver.ts** | — | Single-concern resolution |
| 280 | `_analyzeComponent(args, ctx)` | function | component-state/index.ts:3 | Core analysis for single component | **L2 extensions/component-state/analyzer.ts** | `analyzeComponent()` | Drop underscore; rename for clarity |
| 281 | `handleTraceComponentState(args)` | function | component-state/index.ts:4 | Main handler for `trace_component_state` tool | **L3 plugins/dispatch.ts** | `traceComponentState()` | Drop `handle`; L3 thin orchestrator |

### `error-boundaries/types.ts` — 9 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 282 | `AnalyzeErrorBoundariesArgs` | interface | error-boundaries/types.ts:1 | Tool args — path, depth, check_async | **L1 core/error-boundaries/types.ts** | — | Core input type |
| 283 | `BoundaryKind` | type | error-boundaries/types.ts:2 | class-based/functional/next-error-file | **L1 core/error-boundaries/types.ts** | — | Core domain type |
| 284 | `IssueSeverity` | type | error-boundaries/types.ts:3 | error/warning/info | **L1 core/error-boundaries/types.ts** | — | Core domain type |
| 285 | `IssueType` | type | error-boundaries/types.ts:4 | 5 boundary issue types | **L1 core/error-boundaries/types.ts** | — | Core domain type |
| 286 | `ErrorBoundaryInfo` | interface | error-boundaries/types.ts:5 | Error boundary metadata | **L1 core/error-boundaries/types.ts** | — | Core output type |
| 287 | `RouteSegment` | interface | error-boundaries/types.ts:6 | Next.js route segment info | **L1 core/error-boundaries/types.ts** | — | Core output type |
| 288 | `CoverageResult` | interface | error-boundaries/types.ts:7 | Coverage analysis result | **L1 core/error-boundaries/types.ts** | — | Core output type |
| 289 | `ErrorBoundaryIssue` | interface | error-boundaries/types.ts:8 | Error boundary issue — severity, type, message | **L1 core/error-boundaries/types.ts** | — | Core output type |
| 290 | `ErrorBoundarySummary` | interface | error-boundaries/types.ts:9 | Summary stats | **L1 core/error-boundaries/types.ts** | — | Core output type |

### `error-boundaries/scanner.ts` — 11 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 291 | `SCANNABLE_EXTENSIONS` | const | error-boundaries/scanner.ts:1 | File extensions to scan | **L0 shared/constants.ts** | — | Generic file type constant |
| 292 | `hasErrorBoundaryMethods(cls)` | function | error-boundaries/scanner.ts:2 | Checks class for error boundary methods | **L1 core/error-boundaries/class-utils.ts** | — | Single-concern AST check |
| 293 | `classHasFallback(cls)` | function | error-boundaries/scanner.ts:3 | Checks for fallback UI | **L1 core/error-boundaries/class-utils.ts** | — | Single-concern AST check |
| 294 | `classHasReset(cls)` | function | error-boundaries/scanner.ts:4 | Checks for reset functionality | **L1 core/error-boundaries/class-utils.ts** | — | Single-concern AST check |
| 295 | `collectJsxElementNames(ast)` | function | error-boundaries/scanner.ts:5 | Collects JSX element names | **L1 core/jsx/element-utils.ts** | — | Single-concern JSX utility |
| 296 | `jsxHasFallbackProp(node)` | function | error-boundaries/scanner.ts:6 | Checks for fallback prop | **L1 core/error-boundaries/jsx-utils.ts** | — | Single-concern JSX check |
| 297 | `jsxHasResetProp(node)` | function | error-boundaries/scanner.ts:7 | Checks for onReset/resetKeys | **L1 core/error-boundaries/jsx-utils.ts** | — | Single-concern JSX check |
| 298 | `extractImports(ast)` | function | error-boundaries/scanner.ts:8 | Extracts import specifiers | **L1 core/ast/import-resolver.ts** | — | Single-concern AST extraction |
| 299 | `scanFileForErrorBoundaries(path)` | function | error-boundaries/scanner.ts:9 | Scans file for error boundaries | **L2 extensions/error-boundaries/file-scanner.ts** | — | Multi-concern: parse + detect |
| 300 | `fileHasAsyncOperations(ast)` | function | error-boundaries/scanner.ts:10 | Checks for async operations | **L1 core/ast/async-utils.ts** | — | Single-concern AST check |
| 301 | `scanNextjsRouteSegments(dir)` | function | error-boundaries/scanner.ts:11 | Scans for error.tsx files | **L2 extensions/error-boundaries/route-scanner.ts** | — | Multi-concern: walk + classify |

### `error-boundaries/coverage-analyzer.ts` — 5 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 302 | `extractImportPaths(file)` | function | error-boundaries/coverage-analyzer.ts:1 | Parses file imports to absolute paths | **L1 core/ast/import-resolver.ts** | — | Single-concern import resolution |
| 303 | `buildForwardImportGraph(files)` | function | error-boundaries/coverage-analyzer.ts:2 | Builds forward import graph | **L2 extensions/error-boundaries/import-graph.ts** | — | Multi-concern: parse + link |
| 304 | `collectSubtree(graph, root)` | function | error-boundaries/coverage-analyzer.ts:3 | Collects transitive imports | **L1 core/graph/traversal.ts** | — | Single-concern graph traversal |
| 305 | `analyzeCoverage(boundaries, graph)` | function | error-boundaries/coverage-analyzer.ts:4 | Analyzes error boundary coverage | **L2 extensions/error-boundaries/coverage-analyzer.ts** | — | Multi-concern: traverse + correlate |
| 306 | `updateSegmentProtection(segments, covered)` | function | error-boundaries/coverage-analyzer.ts:5 | Updates route segment protection status | **L2 extensions/error-boundaries/coverage-analyzer.ts** | — | Multi-concern: map + update |

### `error-boundaries/issue-detector.ts` — 6 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 307 | `detectMissingFallback(boundaries)` | function | error-boundaries/issue-detector.ts:1 | Missing fallback UI | **L2 extensions/error-boundaries/issue-detector.ts** | — | Single-concern detector |
| 308 | `detectMissingReset(boundaries)` | function | error-boundaries/issue-detector.ts:2 | Missing reset functionality | **L2 extensions/error-boundaries/issue-detector.ts** | — | Single-concern detector |
| 309 | `detectOverlyBroadBoundary(boundaries)` | function | error-boundaries/issue-detector.ts:3 | Overly broad boundary at root | **L2 extensions/error-boundaries/issue-detector.ts** | — | Single-concern detector |
| 310 | `detectMissingErrorFiles(segments)` | function | error-boundaries/issue-detector.ts:4 | Missing error.tsx files | **L2 extensions/error-boundaries/issue-detector.ts** | — | Single-concern detector |
| 311 | `detectUnprotectedRoutes(segments)` | function | error-boundaries/issue-detector.ts:5 | Unprotected route-level files | **L2 extensions/error-boundaries/issue-detector.ts** | — | Single-concern detector |
| 312 | `detectAllIssues(boundaries, segments)` | function | error-boundaries/issue-detector.ts:6 | Runs all detectors | **L2 extensions/error-boundaries/issue-detector.ts** | — | Orchestrator: compose all detectors |

### `error-boundaries/index.ts` — 3 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 313 | `resolveProjectPath(args)` | function | error-boundaries/index.ts:1 | Resolves and validates project path | **L0 shared/utils.ts** | — | Generic path resolution |
| 314 | `detectAppRouterDir(path)` | function | error-boundaries/index.ts:2 | Detects Next.js App Router | **L1 core/nextjs/router-utils.ts** | — | Single-concern framework detection |
| 315 | `handleAnalyzeErrorBoundaries(args)` | function | error-boundaries/index.ts:3 | Main handler for `analyze_error_boundaries` tool | **L3 plugins/dispatch.ts** | `analyzeErrorBoundaries()` | Drop `handle`; L3 thin orchestrator |

### `hook-dependencies/types.ts` — 7 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 316 | `AuditHookDependenciesArgs` | interface | hook-dependencies/types.ts:1 | Tool args — file, component | **L1 core/hook-dependencies/types.ts** | — | Core input type |
| 317 | `DependencyStability` | type | hook-dependencies/types.ts:2 | stable/unstable/unknown | **L1 core/hook-dependencies/types.ts** | — | Core domain type |
| 318 | `DependencyInfo` | interface | hook-dependencies/types.ts:3 | Dependency info — name, type, stability | **L1 core/hook-dependencies/types.ts** | — | Core output type |
| 319 | `HookInfo` | interface | hook-dependencies/types.ts:4 | Hook info — name, deps, line | **L1 core/hook-dependencies/types.ts** | — | Core output type |
| 320 | `HookIssue` | interface | hook-dependencies/types.ts:5 | Hook issue — type, hook, details | **L1 core/hook-dependencies/types.ts** | — | Core output type |
| 321 | `ComponentScope` | interface | hook-dependencies/types.ts:6 | Component scope info for analysis | **L1 core/hook-dependencies/types.ts** | — | Core analysis type |
| 322 | `AuditResult` | interface | hook-dependencies/types.ts:7 | Audit result — hooks, issues, summary | **L1 core/hook-dependencies/types.ts** | — | Core output type |

### `hook-dependencies/hook-extractor.ts` — 4 elements (1 DUPLICATE)

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 323 | `extractBodyRefs(body)` | function | hook-dependencies/hook-extractor.ts:1 | Extracts refs from hook body | **L1 core/ast/ref-extractor.ts** | — | Single-concern AST extraction |
| 324 | `hasCleanupReturn(fn)` | function | hook-dependencies/hook-extractor.ts:2 | **DUPLICATE** of component-state/utils.hasCleanupReturn | **DELETE** | — | Use L1 core/react/hook-utils.ts |
| 325 | `extractHooksWithDeps(component)` | function | hook-dependencies/hook-extractor.ts:3 | Extracts hooks with dependency arrays | **L2 extensions/hook-dependencies/extractor.ts** | — | Multi-concern: find + parse |
| 326 | `buildComponentScope(ast)` | function | hook-dependencies/hook-extractor.ts:4 | Builds component scope info | **L2 extensions/hook-dependencies/scope-builder.ts** | — | Multi-concern: walk + classify |

### `hook-dependencies/stability-analyzer.ts` — 2 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 327 | `classifyDependency(dep, scope)` | function | hook-dependencies/stability-analyzer.ts:1 | Classifies dep as stable/unstable/unknown | **L1 core/hook-dependencies/stability.ts** | — | Single-concern classification |
| 328 | `analyzeDependencies(hook, scope)` | function | hook-dependencies/stability-analyzer.ts:2 | Analyzes all deps in hook array | **L2 extensions/hook-dependencies/dep-analyzer.ts** | — | Multi-concern: map + classify |

### `hook-dependencies/issue-detector.ts` — 6 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 329 | `detectStaleClosure(hook, scope)` | function | hook-dependencies/issue-detector.ts:1 | Detects stale closures | **L2 extensions/hook-dependencies/issue-detector.ts** | — | Multi-concern: analyze + classify |
| 330 | `detectMissingDeps(hook, scope)` | function | hook-dependencies/issue-detector.ts:2 | Detects missing dependencies | **L2 extensions/hook-dependencies/issue-detector.ts** | — | Multi-concern: diff + report |
| 331 | `detectUnnecessaryDeps(hook, scope)` | function | hook-dependencies/issue-detector.ts:3 | Detects unnecessary dependencies | **L2 extensions/hook-dependencies/issue-detector.ts** | — | Multi-concern: analyze + classify |
| 332 | `detectUnstableDeps(hook, scope)` | function | hook-dependencies/issue-detector.ts:4 | Detects unstable dependencies | **L2 extensions/hook-dependencies/issue-detector.ts** | — | Multi-concern: map + classify |
| 333 | `detectDerivedState(hook, scope)` | function | hook-dependencies/issue-detector.ts:5 | Detects derived state anti-pattern | **L2 extensions/hook-dependencies/issue-detector.ts** | — | Multi-concern: detect + report |
| 334 | `detectAllIssues(hooks, scope)` | function | hook-dependencies/issue-detector.ts:6 | Runs all detectors | **L2 extensions/hook-dependencies/issue-detector.ts** | — | Orchestrator: compose all detectors |

### `hook-dependencies/index.ts` — 7 elements (4 DUPLICATES)

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 335 | `createSuccessResponse` | function | hook-dependencies/index.ts:1 | **DUPLICATE** | **DELETE** | — | Use L0 shared/response.ts |
| 336 | `createErrorResponse` | function | hook-dependencies/index.ts:2 | **DUPLICATE** | **DELETE** | — | Use L0 shared/response.ts |
| 337 | `makeRelativePath(base, abs)` | function | hook-dependencies/index.ts:3 | **DUPLICATE** | **DELETE** | — | Use L0 shared/utils.ts:toRelativePath() |
| 338 | `resolveFilePath(file, root)` | function | hook-dependencies/index.ts:4 | Resolves file path | **DELETE** | — | Use L0 shared/utils.ts |
| 339 | `detectComponentName(ast)` | function | hook-dependencies/index.ts:5 | Detects component name | **L1 core/react/component-detection.ts** | — | Single-concern; consolidate with react.ts |
| 340 | `findComponentNode(ast, name)` | function | hook-dependencies/index.ts:6 | Finds function containing hooks | **L1 core/react/component-detection.ts** | — | Single-concern lookup |
| 341 | `handleAuditHookDependencies(args)` | function | hook-dependencies/index.ts:7 | Main handler for `audit_hook_dependencies` tool | **L3 plugins/dispatch.ts** | `auditHookDependencies()` | Drop `handle`; L3 thin orchestrator |

### `overflow-diagnosis/types.ts` — 8 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 342 | `DiagnoseOverflowArgs` | interface | overflow-diagnosis/types.ts:1 | Tool args — file, element, hint | **L1 core/overflow-diagnosis/types.ts** | — | Core input type |
| 343 | `LayoutNode` (overflow) | interface | overflow-diagnosis/types.ts:2 | Extends base LayoutNode with parent ref | **L1 core/overflow-diagnosis/types.ts** | `OverflowLayoutNode` | Disambiguate from layout-hierarchy LayoutNode |
| 344 | `OverflowPattern` | interface | overflow-diagnosis/types.ts:3 | Detected overflow pattern | **L1 core/overflow-diagnosis/types.ts** | — | Core output type |
| 345 | `ConstraintChainEntry` | interface | overflow-diagnosis/types.ts:4 | Constraint chain entry | **L1 core/overflow-diagnosis/types.ts** | — | Core output type |
| 346 | `FixOption` | interface | overflow-diagnosis/types.ts:5 | Fix option — description, classes, tradeoffs | **L1 core/overflow-diagnosis/types.ts** | — | Core output type |
| 347 | `Recommendation` | interface | overflow-diagnosis/types.ts:6 | Fix recommendation | **L1 core/overflow-diagnosis/types.ts** | — | Core output type |
| 348 | `Diagnosis` | interface | overflow-diagnosis/types.ts:7 | Overflow diagnosis | **L1 core/overflow-diagnosis/types.ts** | — | Core output type |
| 349 | `DiagnoseOverflowResult` | interface | overflow-diagnosis/types.ts:8 | Full tool result | **L1 core/overflow-diagnosis/types.ts** | — | Core output type |

### `overflow-diagnosis/utils.ts` — 8 elements (2 DUPLICATES)

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 350 | `matchesSelector(node, sel)` | function | overflow-diagnosis/utils.ts:1 | Tests layout node against selector | **L1 core/jsx/selector-utils.ts** | — | Consolidate with other matchesSelector duplicates |
| 351 | `createSuccessResponse` | function | overflow-diagnosis/utils.ts:2 | **DUPLICATE** | **DELETE** | — | Use L0 shared/response.ts |
| 352 | `createErrorResponse` | function | overflow-diagnosis/utils.ts:3 | **DUPLICATE** | **DELETE** | — | Use L0 shared/response.ts |
| 353 | `enrichTreeWithParents(tree)` | function | overflow-diagnosis/utils.ts:4 | Adds parent references to tree | **L1 core/jsx/tree-utils.ts** | — | Single-concern tree mutation |
| 354 | `isConstrainedSizing(node)` | function | overflow-diagnosis/utils.ts:5 | Detects fixed/constrained sizing | **L1 core/overflow-diagnosis/sizing-utils.ts** | — | Single-concern sizing check |
| 355 | `isAutoSizing(node)` | function | overflow-diagnosis/utils.ts:6 | Detects auto sizing | **L1 core/overflow-diagnosis/sizing-utils.ts** | — | Single-concern sizing check |
| 356 | `hasAutoHeightChildren(node)` | function | overflow-diagnosis/utils.ts:7 | Checks for auto-height children | **L1 core/overflow-diagnosis/sizing-utils.ts** | — | Single-concern sizing check |
| 357 | `matchesHint(node, hint)` | function | overflow-diagnosis/utils.ts:8 | Tests element against user hint | **L1 core/overflow-diagnosis/hint-matcher.ts** | — | Single-concern match |

### `overflow-diagnosis/pattern-detector.ts` — 1 element

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 358 | `findOverflowPatterns(tree, target)` | function | overflow-diagnosis/pattern-detector.ts:1 | Finds all overflow-prone patterns in tree | **L2 extensions/overflow-diagnosis/pattern-detector.ts** | — | Multi-concern: walk + classify |

### `overflow-diagnosis/constraint-builder.ts` — 2 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 359 | `describeConstraint(node)` | function | overflow-diagnosis/constraint-builder.ts:1 | Human-readable constraint descriptions | **L1 core/overflow-diagnosis/formatters.ts** | — | Single-concern formatting |
| 360 | `buildConstraintChain(root, target)` | function | overflow-diagnosis/constraint-builder.ts:2 | Builds constraint chain from root to target | **L2 extensions/overflow-diagnosis/constraint-builder.ts** | — | Multi-concern: traverse + describe |

### `overflow-diagnosis/fix-generator.ts` — 3 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 361 | `generateFixes(patterns)` | function | overflow-diagnosis/fix-generator.ts:1 | Generates fix options for detected patterns | **L2 extensions/overflow-diagnosis/fix-generator.ts** | — | Multi-concern: classify + generate |
| 362 | `generateRecommendation(fixes, patterns)` | function | overflow-diagnosis/fix-generator.ts:2 | Selects best fix for primary pattern | **L2 extensions/overflow-diagnosis/fix-generator.ts** | — | Multi-concern: rank + select |
| 363 | `collectRelatedElements(chain)` | function | overflow-diagnosis/fix-generator.ts:3 | Gathers elements from constraint chain | **L1 core/overflow-diagnosis/element-utils.ts** | — | Single-concern collection |

### `overflow-diagnosis/index.ts` — 1 element

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 364 | `handleDiagnoseOverflow(args)` | function | overflow-diagnosis/index.ts:1 | Main handler orchestrating overflow analysis | **L3 plugins/dispatch.ts** | `diagnoseOverflow()` | Drop `handle`; L3 thin orchestrator |

### `render-triggers/types.ts` — 13 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 365 | `AnalyzeRenderTriggersArgs` | interface | render-triggers/types.ts:1 | Tool args — file, component | **L1 core/render-triggers/types.ts** | — | Core input type |
| 366 | `MemoType` | type | render-triggers/types.ts:2 | React.memo/PureComponent/none | **L1 core/render-triggers/types.ts** | — | Core domain type |
| 367 | `TriggerType` | type | render-triggers/types.ts:3 | Trigger category union | **L1 core/render-triggers/types.ts** | — | Core domain type |
| 368 | `TriggerFrequency` | type | render-triggers/types.ts:4 | always/conditional/never | **L1 core/render-triggers/types.ts** | — | Core domain type |
| 369 | `InlineDefinitionType` | type | render-triggers/types.ts:5 | object/array/function | **L1 core/render-triggers/types.ts** | — | Core domain type |
| 370 | `ContextGranularity` | type | render-triggers/types.ts:6 | fine/coarse/unknown | **L1 core/render-triggers/types.ts** | — | Core domain type |
| 371 | `OptimizationPriority` | type | render-triggers/types.ts:7 | high/medium/low | **L1 core/render-triggers/types.ts** | — | Core domain type |
| 372 | `OptimizationType` | type | render-triggers/types.ts:8 | Optimization strategy union | **L1 core/render-triggers/types.ts** | — | Core domain type |
| 373 | `RenderTrigger` | interface | render-triggers/types.ts:9 | Render trigger — type, frequency, description | **L1 core/render-triggers/types.ts** | — | Core output type |
| 374 | `InlineDefinition` | interface | render-triggers/types.ts:10 | Inline definition info | **L1 core/render-triggers/types.ts** | — | Core output type |
| 375 | `ExpensiveComputation` | interface | render-triggers/types.ts:11 | Expensive computation info | **L1 core/render-triggers/types.ts** | — | Core output type |
| 376 | `ContextSubscription` | interface | render-triggers/types.ts:12 | Context subscription info | **L1 core/render-triggers/types.ts** | — | Core output type |
| 377 | `ChildAnalysis` | interface | render-triggers/types.ts:13 | Child analysis result | **L1 core/render-triggers/types.ts** | — | Core output type |

### `render-triggers/utils.ts` — 8 elements (5 DUPLICATES)

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 378 | `createSuccessResponse` | function | render-triggers/utils.ts:1 | **DUPLICATE** | **DELETE** | — | Use L0 shared/response.ts |
| 379 | `createErrorResponse` | function | render-triggers/utils.ts:2 | **DUPLICATE** | **DELETE** | — | Use L0 shared/response.ts |
| 380 | `normalizeFilePath(p)` | function | render-triggers/utils.ts:3 | **DUPLICATE** | **DELETE** | — | Use L0 shared/utils.ts |
| 381 | `makeRelativePath(base, abs)` | function | render-triggers/utils.ts:4 | **DUPLICATE** | **DELETE** | — | Use L0 shared/utils.ts |
| 382 | `getLineNumber(node)` | function | render-triggers/utils.ts:5 | **DUPLICATE** | **DELETE** | — | Use L0 shared/ast.ts:lineOf() |
| 383 | `getCodeSnippet(node)` | function | render-triggers/utils.ts:6 | Extracts clean code snippet | **L0 shared/ast.ts** | — | Consolidate with event-flow-core version |
| 384 | `isInsideJsxAttribute(node, ast)` | function | render-triggers/utils.ts:7 | Checks if node is inside JSX attribute | **L1 core/jsx/node-utils.ts** | — | Single-concern AST check |
| 385 | `isInsideMemoizationHook(node, ast)` | function | render-triggers/utils.ts:8 | Checks if node is inside useCallback/useMemo | **L1 core/react/hook-utils.ts** | — | Single-concern hook check |

### `render-triggers/trigger-analyzers.ts` — 7 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 386 | `findStateHooks(component)` | function | render-triggers/trigger-analyzers.ts:1 | Finds useState/useReducer hooks | **L2 extensions/render-triggers/state-analyzer.ts** | — | Multi-concern: find + classify |
| 387 | `findPropTriggers(component)` | function | render-triggers/trigger-analyzers.ts:2 | Identifies prop re-render triggers | **L2 extensions/render-triggers/prop-analyzer.ts** | — | Multi-concern: find + classify |
| 388 | `findForceUpdateTriggers(component)` | function | render-triggers/trigger-analyzers.ts:3 | Detects forceUpdate calls | **L2 extensions/render-triggers/force-update-detector.ts** | — | Multi-concern: find + classify |
| 389 | `findInlineDefinitions(component)` | function | render-triggers/trigger-analyzers.ts:4 | Finds inline objects/arrays/functions | **L2 extensions/render-triggers/inline-detector.ts** | — | Multi-concern: walk + classify |
| 390 | `findExpensiveComputations(component)` | function | render-triggers/trigger-analyzers.ts:5 | Identifies un-memoized expensive ops | **L2 extensions/render-triggers/computation-detector.ts** | — | Multi-concern: find + classify |
| 391 | `analyzeContextUsage(component)` | function | render-triggers/trigger-analyzers.ts:6 | Analyzes useContext subscriptions | **L2 extensions/render-triggers/context-analyzer.ts** | — | Multi-concern: find + analyze |
| 392 | `analyzeChildProps(component, tree)` | function | render-triggers/trigger-analyzers.ts:7 | Traces props to child components | **L2 extensions/render-triggers/child-analyzer.ts** | — | Multi-concern: trace + analyze |

### `render-triggers/memoization-detector.ts` — 3 elements (1 DUPLICATE)

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 393 | `detectMemoization(component)` | function | render-triggers/memoization-detector.ts:1 | Detects React.memo/PureComponent | **L1 core/react/memo-utils.ts** | — | Single-concern detection |
| 394 | `containsJsxReturn(body)` | function | render-triggers/memoization-detector.ts:2 | **DUPLICATE** of react.ts | **DELETE** | — | Use L1 core/react/component-detection.ts |
| 395 | `findComponents(ast)` | function | render-triggers/memoization-detector.ts:3 | Finds all React components in file | **L2 extensions/render-triggers/component-finder.ts** | — | Multi-concern: walk + detect |

### `render-triggers/suggestion-generator.ts` — 1 element

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 396 | `generateSuggestions(analysis)` | function | render-triggers/suggestion-generator.ts:1 | Creates optimization suggestions | **L2 extensions/render-triggers/suggestion-generator.ts** | — | Multi-concern: classify + format |

### `render-triggers/index.ts` — 2 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 397 | type re-exports (11) | re-exports | render-triggers/index.ts:1 | Re-exports from ./types | **DELETE** | — | Consumers import from L1 core/render-triggers/types.ts directly |
| 398 | `handleAnalyzeRenderTriggers(args)` | function | render-triggers/index.ts:2 | Main handler for `analyze_render_triggers` tool | **L3 plugins/dispatch.ts** | `analyzeRenderTriggers()` | Drop `handle`; L3 thin orchestrator |

### `responsive-breakpoints/types.ts` — 9 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 399 | `AnalyzeResponsiveBreakpointsArgs` | interface | responsive-breakpoints/types.ts:1 | Tool args — file, component, custom_breakpoints | **L1 core/responsive-breakpoints/types.ts** | — | Core input type |
| 400 | `BreakpointClasses` | interface | responsive-breakpoints/types.ts:2 | Classes grouped by breakpoint | **L1 core/responsive-breakpoints/types.ts** | — | Core intermediate type |
| 401 | `BreakpointCoverage` | interface | responsive-breakpoints/types.ts:3 | Coverage per breakpoint | **L1 core/responsive-breakpoints/types.ts** | — | Core output type |
| 402 | `PropertyTransition` | interface | responsive-breakpoints/types.ts:4 | Property transition across breakpoints | **L1 core/responsive-breakpoints/types.ts** | — | Core output type |
| 403 | `PropertyChange` | interface | responsive-breakpoints/types.ts:5 | Property change at breakpoint | **L1 core/responsive-breakpoints/types.ts** | — | Core output type |
| 404 | `ElementAnalysis` | interface | responsive-breakpoints/types.ts:6 | Per-element breakpoint analysis | **L1 core/responsive-breakpoints/types.ts** | — | Core output type |
| 405 | `Issue` | interface | responsive-breakpoints/types.ts:7 | Responsive issue | **L1 core/responsive-breakpoints/types.ts** | `ResponsiveIssue` | Disambiguate from other Issue types |
| 406 | `AnalyzeResponsiveBreakpointsResult` | interface | responsive-breakpoints/types.ts:8 | Full tool result | **L1 core/responsive-breakpoints/types.ts** | — | Core output type |

### `responsive-breakpoints/constants.ts` — 3 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 407 | `BREAKPOINT_SIZES` | const Map | responsive-breakpoints/constants.ts:1 | Default Tailwind breakpoint sizes | **L1 core/responsive-breakpoints/constants.ts** | — | Static breakpoint data |
| 408 | `CLASS_TO_PROPERTY` | const Map | responsive-breakpoints/constants.ts:2 | Maps Tailwind class to CSS property | **L1 core/tailwind/class-classifier.ts** | — | Merge with tailwind-conflicts-utils class mapping |
| 409 | `CLASS_PREFIX_TO_PROPERTY` | const Map | responsive-breakpoints/constants.ts:3 | Maps Tailwind prefix to CSS property | **L1 core/tailwind/class-classifier.ts** | — | Merge with class-classifier |

### `responsive-breakpoints/utils.ts` — 4 elements (4 DUPLICATES)

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 410 | `createSuccessResponse` | function | responsive-breakpoints/utils.ts:1 | **DUPLICATE** | **DELETE** | — | Use L0 shared/response.ts |
| 411 | `createErrorResponse` | function | responsive-breakpoints/utils.ts:2 | **DUPLICATE** | **DELETE** | — | Use L0 shared/response.ts |
| 412 | `normalizeFilePath(p)` | function | responsive-breakpoints/utils.ts:3 | **DUPLICATE** | **DELETE** | — | Use L0 shared/utils.ts |
| 413 | `makeRelativePath(base, abs)` | function | responsive-breakpoints/utils.ts:4 | **DUPLICATE** | **DELETE** | — | Use L0 shared/utils.ts |

### `responsive-breakpoints/class-parser.ts` — 4 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 414 | `parseClassName(cls)` | function | responsive-breakpoints/class-parser.ts:1 | Splits className string into individual classes | **L1 core/tailwind/class-parser.ts** | — | Single-concern; consolidate into shared Tailwind parser |
| 415 | `parseBreakpointClasses(classes)` | function | responsive-breakpoints/class-parser.ts:2 | Groups classes by breakpoint prefix | **L1 core/tailwind/class-grouper.ts** | — | Single-concern; consolidate |
| 416 | `getPropertyFromClass(cls)` | function | responsive-breakpoints/class-parser.ts:3 | Maps Tailwind class to CSS property | **L1 core/tailwind/class-classifier.ts** | — | Single-concern; consolidate |
| 417 | `trackPropertyChanges(breakpoints)` | function | responsive-breakpoints/class-parser.ts:4 | Identifies property transitions across breakpoints | **L2 extensions/responsive-breakpoints/transition-tracker.ts** | — | Multi-concern: diff + describe |

### `responsive-breakpoints/breakpoint-resolver.ts` — 2 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 418 | `ResolvedBreakpoints` | interface | responsive-breakpoints/breakpoint-resolver.ts:1 | Resolved breakpoints container — 2 props | **L1 core/responsive-breakpoints/types.ts** | — | Core domain type |
| 419 | `resolveBreakpoints(config?)` | function | responsive-breakpoints/breakpoint-resolver.ts:2 | Resolves breakpoints from Tailwind config or defaults | **L2 extensions/responsive-breakpoints/resolver.ts** | — | Multi-concern: find file + parse + merge |

### `responsive-breakpoints/jsx-extractor.ts` — 1 element

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 420 | `extractClassNames(ast)` | function | responsive-breakpoints/jsx-extractor.ts:1 | Extracts all className values from JSX | **L1 core/jsx/class-extractor.ts** | — | Consolidate with jsx-class-utils |

### `responsive-breakpoints/issue-detector.ts` — 1 element

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 421 | `detectIssues(analysis, breakpoints)` | function | responsive-breakpoints/issue-detector.ts:1 | Detects responsive issues (missing breakpoints, desktop-first, gaps) | **L2 extensions/responsive-breakpoints/issue-detector.ts** | — | Multi-concern: analyze + classify |

### `responsive-breakpoints/index.ts` — 1 element

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 422 | `handleAnalyzeResponsiveBreakpoints(args)` | function | responsive-breakpoints/index.ts:1 | Main handler for `analyze_responsive_breakpoints` tool | **L3 plugins/dispatch.ts** | `analyzeResponsiveBreakpoints()` | Drop `handle`; L3 thin orchestrator |

### `stacking-context/types.ts` — 10 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 423 | `AnalyzeStackingContextArgs` | interface | stacking-context/types.ts:1 | Tool args — file, element, thresholds | **L1 core/stacking-context/types.ts** | — | Core input type |
| 424 | `StackingContext` | interface | stacking-context/types.ts:2 | Stacking context node | **L1 core/stacking-context/types.ts** | — | Core domain type |
| 425 | `ContextCreator` | type | stacking-context/types.ts:3 | Rule that creates stacking context | **L1 core/stacking-context/types.ts** | — | Core domain type |
| 426 | `ZIndexInfo` | interface | stacking-context/types.ts:4 | Z-index usage info | **L1 core/stacking-context/types.ts** | — | Core output type |
| 427 | `StackingIssue` | interface | stacking-context/types.ts:5 | Stacking context issue | **L1 core/stacking-context/types.ts** | — | Core output type |
| 428 | `PortalInfo` | interface | stacking-context/types.ts:6 | React portal info | **L1 core/stacking-context/types.ts** | — | Core output type |
| 429 | `StackingContextEntry` | interface | stacking-context/types.ts:7 | Entry in stacking context list | **L1 core/stacking-context/types.ts** | — | Core output type |
| 430 | `AnalyzeStackingContextResult` | interface | stacking-context/types.ts:8 | Full tool result | **L1 core/stacking-context/types.ts** | — | Core output type |
| 431 | `StackingThresholds` | interface | stacking-context/types.ts:9 | Threshold config for issue detection | **L1 core/stacking-context/types.ts** | — | Core config type |
| 432 | `DEFAULT_STACKING_THRESHOLDS` | const | stacking-context/types.ts:10 | Default threshold values | **L1 core/stacking-context/constants.ts** | — | Move const to constants file |

### `stacking-context/utils.ts` — 2 elements (2 DUPLICATES)

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 433 | `createSuccessResponse` | function | stacking-context/utils.ts:1 | **DUPLICATE** | **DELETE** | — | Use L0 shared/response.ts |
| 434 | `createErrorResponse` | function | stacking-context/utils.ts:2 | **DUPLICATE** | **DELETE** | — | Use L0 shared/response.ts |

### `stacking-context/context-rules.ts` — 9 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 435 | `CONTEXT_CREATORS` | const Map | stacking-context/context-rules.ts:1 | Map of stacking context creation rules | **L1 core/stacking-context/constants.ts** | — | Static rule data |
| 436 | `createsStackingContext(classes)` | function | stacking-context/context-rules.ts:2 | Tests classes against all rules | **L1 core/stacking-context/rule-engine.ts** | — | Single-concern rule evaluation |
| 437 | `extractZIndex(classes)` | function | stacking-context/context-rules.ts:3 | Parses z-index from classes | **L1 core/stacking-context/class-utils.ts** | — | Single-concern extraction |
| 438 | `extractPosition(classes)` | function | stacking-context/context-rules.ts:4 | Extracts position type from classes | **L1 core/stacking-context/class-utils.ts** | — | Single-concern extraction |
| 439 | `position_with_z(cls)` | function | stacking-context/context-rules.ts:5 | Rule: positioned + z-index creates context | **L1 core/stacking-context/rules/position.ts** | — | Single-concern rule |
| 440 | `fixed_or_sticky(cls)` | function | stacking-context/context-rules.ts:6 | Rule: fixed/sticky creates context | **L1 core/stacking-context/rules/position.ts** | — | Single-concern rule |
| 441 | `transform(cls)` | function | stacking-context/context-rules.ts:7 | Rule: transform creates context | **L1 core/stacking-context/rules/transform.ts** | — | Single-concern rule |
| 442 | `opacity(cls)` | function | stacking-context/context-rules.ts:8 | Rule: opacity < 1 creates context | **L1 core/stacking-context/rules/visual.ts** | — | Single-concern rule |
| 443 | `filter_isolation_will_change_contain(cls)` | function | stacking-context/context-rules.ts:9 | Rules: filter, isolation, will-change, contain | **L1 core/stacking-context/rules/visual.ts** | — | Single-concern rules (split as needed) |

### `stacking-context/tree-builder.ts` — 3 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 444 | `buildStackingTree(elements)` | function | stacking-context/tree-builder.ts:1 | Builds hierarchical stacking tree | **L2 extensions/stacking-context/tree-builder.ts** | — | Multi-concern: classify + structure |
| 445 | `getContextParent(node, tree)` | function | stacking-context/tree-builder.ts:2 | Finds parent stacking context | **L1 core/stacking-context/tree-utils.ts** | — | Single-concern tree traversal |
| 446 | `collectZIndexValues(elements)` | function | stacking-context/tree-builder.ts:3 | Gathers z-index values with context parents | **L2 extensions/stacking-context/z-index-collector.ts** | — | Multi-concern: walk + correlate |

### `stacking-context/jsx-analyzer.ts` — 2 elements (1 DUPLICATE)

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 447 | `getLineNumber(node)` | function | stacking-context/jsx-analyzer.ts:1 | **DUPLICATE** | **DELETE** | — | Use L0 shared/ast.ts:lineOf() |
| 448 | `analyzeJsxFile(path)` | function | stacking-context/jsx-analyzer.ts:2 | Analyzes JSX for stacking patterns | **L2 extensions/stacking-context/jsx-analyzer.ts** | — | Multi-concern: parse + classify |

### `stacking-context/portal-detector.ts` — 2 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 449 | `findContainingComponent(ast, line)` | function | stacking-context/portal-detector.ts:1 | Finds component containing position | **L1 core/react/component-detection.ts** | — | Single-concern lookup; consolidate |
| 450 | `detectPortals(ast)` | function | stacking-context/portal-detector.ts:2 | Detects React portal usage | **L2 extensions/stacking-context/portal-detector.ts** | — | Multi-concern: walk + detect |

### `stacking-context/issue-detector.ts` — 1 element

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 451 | `detectStackingIssues(tree, zIndex, portals, thresholds)` | function | stacking-context/issue-detector.ts:1 | Detects z-index inflation, trapping, conflicts | **L2 extensions/stacking-context/issue-detector.ts** | — | Multi-concern: analyze + classify |

### `stacking-context/index.ts` — 2 elements

| # | Element | Kind | Current Location | What It Does | Target | New Name | Justification |
|---|---------|------|-----------------|--------------|--------|----------|---------------|
| 452 | type re-exports (12) | re-exports | stacking-context/index.ts:1 | Re-exports from ./types | **DELETE** | — | Consumers import from L1 core/stacking-context/types.ts directly |
| 453 | `handleAnalyzeStackingContext(args)` | function | stacking-context/index.ts:2 | Main handler for `analyze_stacking_context` tool | **L3 plugins/dispatch.ts** | `analyzeStackingContext()` | Drop `handle`; L3 thin orchestrator |

---

## Cross-Cutting Concerns (Duplication Inventory)

| Concern | Defined In (Current) | Count | Target (After Refactor) |
|---------|---------------------|-------|-------------------------|
| `ToolResponse` + `createSuccessResponse` + `createErrorResponse` | response-utils.ts, analyze-event-flow.ts, analyze-layout-hierarchy.ts, analyze-tailwind-conflicts.ts, get-accessibility-tree.ts, get-sizing-strategy.ts, component-state/utils.ts, hook-dependencies/index.ts, overflow-diagnosis/utils.ts, render-triggers/utils.ts, responsive-breakpoints/utils.ts, stacking-context/utils.ts | **12** | **L0 shared/response.ts** — single canonical source |
| `normalizeFilePath` + `makeRelativePath` | react.ts, event-flow-utils.ts, component-state/utils.ts, hook-dependencies/index.ts, render-triggers/utils.ts, responsive-breakpoints/utils.ts | **6** | **L0 shared/utils.ts** — rename to `normalizePath` / `toRelativePath` |
| `getLineNumber(node)` | react.ts, event-flow-core.ts, accessibility-tree-core.ts, tailwind-conflicts-core.ts, render-triggers/utils.ts, stacking-context/jsx-analyzer.ts | **6** | **L0 shared/ast.ts** — rename to `lineOf` |
| `containsJsxReturn` + `isReactComponent` + `getComponentName` | react.ts, component-state/component-detector.ts, render-triggers/memoization-detector.ts | **3** | **L1 core/react/component-detection.ts** |
| Tailwind parsing (`parseTailwindClasses`, `parseWidthClass`, `parseHeightClass`, `TAILWIND_SPACING`, `TAILWIND_FRACTIONS`) | layout-hierarchy-utils.ts, sizing-strategy-utils.ts (superset) | **2** | **L1 core/tailwind/class-parser.ts** — merge; keep sizing-strategy version as superset |
| `extractClassName` + `extractId` + `matchesSelector` + `createElementIdentifier` | layout-hierarchy-core.ts, sizing-strategy-core.ts | **2** | **L1 core/jsx/** — split by concern |
| `DisplayType` + `PositionType` | layout-hierarchy-utils.ts, sizing-strategy-utils.ts | **2** | **L0 shared/types.ts** |
| `hasCleanupReturn(fn)` | component-state/utils.ts, hook-dependencies/hook-extractor.ts | **2** | **L1 core/react/hook-utils.ts** |
| `getCodeSnippet(node)` | event-flow-core.ts, render-triggers/utils.ts | **2** | **L0 shared/ast.ts** |
| `resolveFilePath(file, root)` | component-state/utils.ts, hook-dependencies/index.ts | **2** | **L0 shared/utils.ts** |

**Total duplicated implementations removed: ~53 DELETE entries**

---

## Element-to-Target Summary

| Target File | Element #s | Count |
|-------------|-----------|-------|
| **L0 shared/constants.ts** | 1, 2, 291 | 3 |
| **L0 shared/config.ts** | 3 | 1 |
| **L0 shared/logger.ts** | 4, 5, 6, 7, 8 | 5 |
| **L0 shared/types.ts** | 18, 19, 153, 154, 179, 180 | 6 |
| **L0 shared/response.ts** | 20, 21, 22, 23, 24, 25, 26 | 7 |
| **L0 shared/utils.ts** | 33, 34, 263, 313 | 4 |
| **L0 shared/ast.ts** | 51, 120, 123, 383 | 4 |
| **L1 core/react/component-detection.ts** | 35, 36, 46, 125, 267, 268, 269, 339, 340, 393(?), 449 | 11 |
| **L1 core/react/constants.ts** | 37, 38, 39, 40 | 4 |
| **L1 core/react/ast-utils.ts** | 41 | 1 |
| **L1 core/react/hoc-utils.ts** | 43, 44, 45 | 3 |
| **L1 core/react/props-utils.ts** | 47, 48, 49, 275 | 4 |
| **L1 core/react/jsx-walker.ts** | 50, 278 | 2 |
| **L1 core/react/file-utils.ts** | 52 | 1 |
| **L1 core/react/jsx-utils.ts** | 151 | 1 |
| **L1 core/react/hook-utils.ts** | 266, 270, 384, 385 | 4 |
| **L1 core/react/memo-utils.ts** | 393 | 1 |
| **L1 core/jsx/class-extractor.ts** | 58, 59, 420 | 3 |
| **L1 core/jsx/attribute-utils.ts** | 92, 145, 146, 203 | 4 |
| **L1 core/jsx/text-utils.ts** | 93 | 1 |
| **L1 core/jsx/element-utils.ts** | 147, 295 | 2 |
| **L1 core/jsx/selector-utils.ts** | 149, 174, 350 | 3 |
| **L1 core/jsx/tree-utils.ts** | 139, 140, 178, 353 | 4 |
| **L1 core/jsx/node-utils.ts** | 384 | 1 |
| **L1 core/tailwind/constants.ts** | 156, 157, 183, 184, 185 | 5 |
| **L1 core/tailwind/class-parser.ts** | 158, 159, 160, 186, 187, 188, 209, 210, 211, 414, 415 | 11 |
| **L1 core/tailwind/class-grouper.ts** | 212, 213 | 2 |
| **L1 core/tailwind/class-classifier.ts** | 214, 215, 216, 408, 409, 416 | 6 |
| **L1 core/tailwind/types.ts** | 152, 155, 181 | 3 |
| **L1 core/tailwind/conflict-constants.ts** | 205, 206, 207, 208 | 4 |
| **L1 core/ast/type-utils.ts** | 264, 265 | 2 |
| **L1 core/ast/identifier-utils.ts** | 272 | 1 |
| **L1 core/ast/import-resolver.ts** | 236(?), 279, 298, 302 | 4 |
| **L1 core/ast/async-utils.ts** | 300 | 1 |
| **L1 core/ast/ref-extractor.ts** | 323 | 1 |
| **L1 core/ast/parser.ts** | 236 | 1 |
| **L1 core/file-utils.ts** | 235 | 1 |
| **L1 core/graph/traversal.ts** | 304 | 1 |
| **L1 core/nextjs/router-utils.ts** | 314 | 1 |
| **L1 core/accessibility/types.ts** | 95, 96, 106, 107, 108, 109, 110 | 7 |
| **L1 core/accessibility/constants.ts** | 97, 98, 99, 100, 101 | 5 |
| **L1 core/accessibility/role-utils.ts** | 102, 105 | 2 |
| **L1 core/accessibility/focus-utils.ts** | 103, 104 | 2 |
| **L1 core/accessibility/name-utils.ts** | 111, 112 | 2 |
| **L1 core/event-flow/types.ts** | 127, 128, 134, 135, 136, 137 | 6 |
| **L1 core/event-flow/constants.ts** | 129, 130, 131, 132 | 4 |
| **L1 core/event-flow/propagation-utils.ts** | 121, 122 | 2 |
| **L1 core/event-flow/handler-extractor.ts** | 124 | 1 |
| **L1 core/event-flow/delegation-detector.ts** | 126 | 1 |
| **L1 core/layout-hierarchy/types.ts** | 67, 68, 161, 162, 163, 164, 165, 166, 167 | 9 |
| **L1 core/sizing-strategy/types.ts** | 85, 86, 182, 190, 191, 192, 193 | 7 |
| **L1 core/sizing-strategy/formatters.ts** | 194, 199 | 2 |
| **L1 core/tailwind-conflicts/types.ts** | 73, 74, 217, 218, 219, 220, 221, 222 | 8 |
| **L1 core/client-boundary/types.ts** | 225, 226, 227, 228, 229, 230, 231, 232 | 8 |
| **L1 core/client-boundary/api-detector.ts** | 233, 234 | 2 |
| **L1 core/component-state/types.ts** | 248–258 | 11 |
| **L1 core/error-boundaries/types.ts** | 282–290 | 9 |
| **L1 core/error-boundaries/class-utils.ts** | 292, 293, 294 | 3 |
| **L1 core/error-boundaries/jsx-utils.ts** | 296, 297 | 2 |
| **L1 core/hook-dependencies/types.ts** | 316–322 | 7 |
| **L1 core/hook-dependencies/stability.ts** | 327 | 1 |
| **L1 core/overflow-diagnosis/types.ts** | 342–349 | 8 |
| **L1 core/overflow-diagnosis/sizing-utils.ts** | 354, 355, 356 | 3 |
| **L1 core/overflow-diagnosis/hint-matcher.ts** | 357 | 1 |
| **L1 core/overflow-diagnosis/formatters.ts** | 359 | 1 |
| **L1 core/overflow-diagnosis/element-utils.ts** | 363 | 1 |
| **L1 core/render-triggers/types.ts** | 365–377 | 13 |
| **L1 core/responsive-breakpoints/types.ts** | 399–406, 418 | 9 |
| **L1 core/responsive-breakpoints/constants.ts** | 407 | 1 |
| **L1 core/stacking-context/types.ts** | 423–431 | 9 |
| **L1 core/stacking-context/constants.ts** | 432, 435 | 2 |
| **L1 core/stacking-context/rule-engine.ts** | 436 | 1 |
| **L1 core/stacking-context/class-utils.ts** | 437, 438 | 2 |
| **L1 core/stacking-context/rules/** | 439–443 | 5 |
| **L1 core/stacking-context/tree-utils.ts** | 445 | 1 |
| **L2 extensions/component-tree/analyzer.ts** | 53 | 1 |
| **L2 extensions/component-tree/graph.ts** | 54, 55, 56 | 3 |
| **L2 extensions/accessibility/jsx-parser.ts** | 94 | 1 |
| **L2 extensions/accessibility/pattern-validator.ts** | 113 | 1 |
| **L2 extensions/accessibility/issue-detector.ts** | 114 | 1 |
| **L2 extensions/accessibility/keyboard-analyzer.ts** | 115 | 1 |
| **L2 extensions/accessibility/tree-builder.ts** | 116 | 1 |
| **L2 extensions/accessibility/focus-analyzer.ts** | 117 | 1 |
| **L2 extensions/accessibility/summary.ts** | 118 | 1 |
| **L2 extensions/event-flow/nesting-detector.ts** | 138 | 1 |
| **L2 extensions/event-flow/issue-detector.ts** | 141 | 1 |
| **L2 extensions/event-flow/flow-builder.ts** | 142 | 1 |
| **L2 extensions/event-flow/delegation-analyzer.ts** | 143 | 1 |
| **L2 extensions/event-flow/summary.ts** | 144 | 1 |
| **L2 extensions/layout-hierarchy/node-builder.ts** | 148 | 1 |
| **L2 extensions/layout-hierarchy/parser.ts** | 150 | 1 |
| **L2 extensions/layout-hierarchy/issue-detector.ts** | 168 | 1 |
| **L2 extensions/layout-hierarchy/constraint-notes.ts** | 169 | 1 |
| **L2 extensions/layout-hierarchy/summary.ts** | 170 | 1 |
| **L2 extensions/sizing-strategy/node-builder.ts** | 173 | 1 |
| **L2 extensions/sizing-strategy/parser.ts** | 175, 177 | 2 |
| **L2 extensions/sizing-strategy/dimension-analyzer.ts** | 195, 196 | 2 |
| **L2 extensions/sizing-strategy/flex-analyzer.ts** | 197 | 1 |
| **L2 extensions/sizing-strategy/grid-analyzer.ts** | 198 | 1 |
| **L2 extensions/sizing-strategy/ancestor-analyzer.ts** | 200 | 1 |
| **L2 extensions/sizing-strategy/summary.ts** | 201 | 1 |
| **L2 extensions/tailwind-conflicts/jsx-parser.ts** | 204 | 1 |
| **L2 extensions/tailwind-conflicts/conflict-detector.ts** | 223 | 1 |
| **L2 extensions/tailwind-conflicts/specificity-detector.ts** | 224 | 1 |
| **L2 extensions/client-boundary/directive-scanner.ts** | 237 | 1 |
| **L2 extensions/client-boundary/import-graph.ts** | 238 | 1 |
| **L2 extensions/client-boundary/classifier.ts** | 239 | 1 |
| **L2 extensions/client-boundary/boundary-map.ts** | 240 | 1 |
| **L2 extensions/client-boundary/issue-detector.ts** | 241, 242, 243, 244, 245 | 5 |
| **L2 extensions/client-boundary/resolver.ts** | 246 | 1 |
| **L2 extensions/component-state/hook-extractor.ts** | 271 | 1 |
| **L2 extensions/component-state/jsx-analyzer.ts** | 273 | 1 |
| **L2 extensions/component-state/props-analyzer.ts** | 274 | 1 |
| **L2 extensions/component-state/context-analyzer.ts** | 276 | 1 |
| **L2 extensions/component-state/issue-detector.ts** | 277 | 1 |
| **L2 extensions/component-state/analyzer.ts** | 280 | 1 |
| **L2 extensions/error-boundaries/file-scanner.ts** | 299 | 1 |
| **L2 extensions/error-boundaries/route-scanner.ts** | 301 | 1 |
| **L2 extensions/error-boundaries/import-graph.ts** | 303 | 1 |
| **L2 extensions/error-boundaries/coverage-analyzer.ts** | 305, 306 | 2 |
| **L2 extensions/error-boundaries/issue-detector.ts** | 307, 308, 309, 310, 311, 312 | 6 |
| **L2 extensions/hook-dependencies/extractor.ts** | 325 | 1 |
| **L2 extensions/hook-dependencies/scope-builder.ts** | 326 | 1 |
| **L2 extensions/hook-dependencies/dep-analyzer.ts** | 328 | 1 |
| **L2 extensions/hook-dependencies/issue-detector.ts** | 329, 330, 331, 332, 333, 334 | 6 |
| **L2 extensions/overflow-diagnosis/pattern-detector.ts** | 358 | 1 |
| **L2 extensions/overflow-diagnosis/constraint-builder.ts** | 360 | 1 |
| **L2 extensions/overflow-diagnosis/fix-generator.ts** | 361, 362 | 2 |
| **L2 extensions/render-triggers/state-analyzer.ts** | 386 | 1 |
| **L2 extensions/render-triggers/prop-analyzer.ts** | 387 | 1 |
| **L2 extensions/render-triggers/force-update-detector.ts** | 388 | 1 |
| **L2 extensions/render-triggers/inline-detector.ts** | 389 | 1 |
| **L2 extensions/render-triggers/computation-detector.ts** | 390 | 1 |
| **L2 extensions/render-triggers/context-analyzer.ts** | 391 | 1 |
| **L2 extensions/render-triggers/child-analyzer.ts** | 392 | 1 |
| **L2 extensions/render-triggers/component-finder.ts** | 395 | 1 |
| **L2 extensions/render-triggers/suggestion-generator.ts** | 396 | 1 |
| **L2 extensions/responsive-breakpoints/transition-tracker.ts** | 417 | 1 |
| **L2 extensions/responsive-breakpoints/resolver.ts** | 419 | 1 |
| **L2 extensions/responsive-breakpoints/issue-detector.ts** | 421 | 1 |
| **L2 extensions/stacking-context/tree-builder.ts** | 444 | 1 |
| **L2 extensions/stacking-context/z-index-collector.ts** | 446 | 1 |
| **L2 extensions/stacking-context/jsx-analyzer.ts** | 448 | 1 |
| **L2 extensions/stacking-context/portal-detector.ts** | 450 | 1 |
| **L2 extensions/stacking-context/issue-detector.ts** | 451 | 1 |
| **L3 plugins/server.ts** | 9–15 | 7 |
| **L3 plugins/schemas.ts** | 16 | 1 |
| **L3 plugins/dispatch.ts** | 27, 28, 29, 30, 31, 57, 66, 72, 78, 84, 90, 247, 281, 315, 341, 364, 398, 422, 453 | 19 |
| **DELETED (duplicates/re-exports/barrels)** | 17, 62, 63, 64, 65, 69, 70, 71, 75, 76, 77, 81, 82, 83, 87, 88, 89, 91, 119, 133, 171, 172, 174, 176, 179, 180, 183, 184, 189, 202, 259, 260, 261, 262, 267, 268, 269, 324, 335, 336, 337, 338, 378, 379, 380, 381, 382, 397, 410, 411, 412, 413, 433, 434, 447, 452 + 8 barrel files | ~64 |

**453 elements inventoried. ~90 renamed. ~64 deleted (duplicates/re-exports/barrels). 87 → ~140 files.**

---

## Rewiring: Import Path Changes

| Current Import | New Import |
|---------------|------------|
| `'./config.js'` → SERVER_NAME, SERVER_VERSION | `'../shared/constants.js'` |
| `'./config.js'` → getProjectRoot | `'../shared/config.js'` |
| `'./logging.js'` → logger | `'../shared/logger.js'` |
| `'./handlers/response-utils.js'` → ToolResponse, ToolResponseContent | `'../shared/types.js'` → McpResponse, McpContent |
| `'./handlers/response-utils.js'` → createSuccessResponse | `'../shared/response.js'` → ok |
| `'./handlers/response-utils.js'` → createErrorResponse | `'../shared/response.js'` → fail |
| `'./handlers/response-utils.js'` → createTextResponse | `'../shared/response.js'` → text |
| `'./handlers/response-utils.js'` → createNotFoundResponse | `'../shared/response.js'` → notFound |
| `'./handlers/response-utils.js'` → createMissingArgumentResponse | `'../shared/response.js'` → missingArg |
| `'./handlers/response-utils.js'` → createInvalidArgumentResponse | `'../shared/response.js'` → invalidArg |
| Local ToolResponse/createSuccessResponse/createErrorResponse (12 files) | `'../../shared/response.js'` → ok, fail |
| `'../react.js'` → normalizeFilePath, makeRelativePath | `'../../shared/utils.js'` → normalizePath, toRelativePath |
| `'../react.js'` → getLineNumber | `'../../shared/ast.js'` → lineOf |
| `'../react.js'` → isReactComponent, containsJsxReturn, getComponentName | `'../../core/react/component-detection.js'` |
| `'../react.js'` → extractProps | `'../../core/react/props-utils.js'` |
| `'../jsx-class-utils.js'` | `'../../core/jsx/class-extractor.js'` |
| `'./component-detector.js'` → isReactComponent, containsJsxReturn, getComponentName | `'../../core/react/component-detection.js'` |
| `'./utils.js'` → createSuccessResponse/createErrorResponse (module utils) | `'../../shared/response.js'` → ok, fail |
| `'../accessibility-tree-core.js'` / `'../accessibility-tree-utils.js'` / `'../accessibility-tree-analyzers.js'` | `'../../core/accessibility/**'` and `'../../extensions/accessibility/**'` |
| `'../event-flow-core.js'` / `'../event-flow-utils.js'` / `'../event-flow-analyzers.js'` | `'../../core/event-flow/**'` and `'../../extensions/event-flow/**'` |
| `'../layout-hierarchy-core.js'` / `'../layout-hierarchy-utils.js'` / `'../layout-hierarchy-analyzers.js'` | `'../../core/layout-hierarchy/**'` and `'../../extensions/layout-hierarchy/**'` |
| `'../sizing-strategy-core.js'` / `'../sizing-strategy-utils.js'` / `'../sizing-strategy-analyzers.js'` | `'../../core/tailwind/**'`, `'../../core/sizing-strategy/**'`, `'../../extensions/sizing-strategy/**'` |
| `'../tailwind-conflicts-core.js'` / `'../tailwind-conflicts-utils.js'` / `'../tailwind-conflicts-analyzers.js'` | `'../../core/tailwind/**'`, `'../../core/tailwind-conflicts/**'`, `'../../extensions/tailwind-conflicts/**'` |
| `'./handlers/index.js'` → handlerRegistry | `'./dispatch.js'` → DISPATCH_TABLE |
| `'./schemas/index.js'` | `'./schemas.js'` |

