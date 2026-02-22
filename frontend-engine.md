# frontend-engine Deep Dive

A comprehensive reference for the `frontend-engine` MCP server — its architecture, 14 analysis tools, AST-based implementation approach, and shared utilities.

---

## Overview

The `frontend-engine` is an MCP (Model Context Protocol) server that provides **static analysis tools for React/TypeScript frontends**. It performs all analysis at the AST level — no runtime, no DOM, no browser. Every tool reads source files (`.tsx`, `.jsx`, `.ts`, `.js`), parses them with the TypeScript compiler API, walks the resulting AST, and returns structured JSON reports.

**Primary use cases:**
- Debugging layout, overflow, z-index, and responsive design issues
- Auditing React performance (re-render triggers, hook dependency problems)
- Analyzing component architecture and state flow
- WCAG accessibility audits
- Next.js App Router client/server boundary optimization

**Version:** 1.0.0  
**Protocol:** MCP over stdio  
**Language:** TypeScript (ESM, compiled to CJS via esbuild)  
**Tools:** 14  

---

## Architecture

### MCP Server Structure

```
src/
  index.ts              # FrontendEngineServer class — MCP lifecycle
  config.ts             # SERVER_NAME, SERVER_VERSION, getProjectRoot()
  logging.ts            # Structured logger
  schemas/
    index.ts            # FRONTEND_SCHEMAS — inputSchema definitions for all 14 tools
  handlers/
    index.ts            # handlerRegistry Map — tool name → handler function
    react.ts            # frontend_component_tree (standalone, 795 lines)
    analyze-*.ts        # Thin entry-point shims for multi-file handlers
    diagnose-*.ts       # Thin entry-point shims for multi-file handlers
    get-*.ts            # Thin entry-point shims for multi-file handlers
    audit-*.ts          # Thin entry-point shims for multi-file handlers
    jsx-class-utils.ts  # Shared: extract className strings from JSX AST
    response-utils.ts   # Shared: MCP response factories
    <tool>/             # Subdirectories for complex tools (multi-file)
      index.ts          # Main handler entry point
      types.ts          # Tool-specific TypeScript interfaces
      *.ts              # Analyzer sub-modules
```

### Request Dispatch

```typescript
// handlers/index.ts — Map-based O(1) dispatch
const handlerRegistry = new Map<string, ToolHandler>([
  ['frontend_component_tree', handleGetReactComponentTree],
  ['frontend_render_triggers', handleAnalyzeRenderTriggers],
  // ... 12 more
]);

// index.ts — CallToolRequestSchema handler
const handler = getHandler(name);
return await handler(args);
```

The server uses `@modelcontextprotocol/sdk` with a `StdioServerTransport`. Tool schemas (`FRONTEND_SCHEMAS`) are served from `ListToolsRequestSchema`. All errors are wrapped in `McpError` with `ErrorCode.InternalError`.

### Project Root Resolution

All file paths are resolved against a project root. The root is determined by `process.env.PROJECT_ROOT || process.cwd()`. Relative paths are resolved against the root; absolute paths are used as-is.

### AST Analysis Approach

Every analysis tool follows the same pattern:

1. **Parse**: `ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true)` — produces a full AST with parent pointers (`setParentNodes: true`)
2. **Walk**: Recursive `ts.forEachChild` / `node.forEachChild` traversal or targeted visitor patterns
3. **Pattern-match**: TypeScript compiler API node kind checks (`ts.isJsxElement`, `ts.isCallExpression`, `ts.isIdentifier`, etc.)
4. **Extract**: Pull out class strings, hook calls, prop names, event handlers, import specifiers from AST nodes
5. **Classify**: Apply domain-specific rules (e.g., does this set of classes create a stacking context? Is this dep stable?)
6. **Report**: Return structured JSON serialized as MCP text content

---

## Tools Reference

### Component Analysis

#### `frontend_component_tree`

**Description:** Parse JSX/TSX files and build a component hierarchy tree. Uses static AST analysis to find component definitions and usages, extract props, and build parent-child relationships.

**Parameters:**

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `file` | string | no | — | Specific file to analyze |
| `path` | string | no | `"src"` | Directory to scan |
| `root_component` | string | no | — | Start tree from this component |
| `depth` | integer | no | `5` | Max traversal depth |

**Implementation** (`handlers/react.ts`, 795 lines):
- `isReactComponent()` — heuristic: function/arrow that returns JSX or whose name starts with uppercase
- `containsJsxReturn()` — walks the function body looking for JSX return statements
- `unwrapHocCall()` / `detectHocWrappedComponent()` — peels `memo()`, `forwardRef()`, `React.lazy()` wrappers to get the inner component
- `extractProps()` → `extractPropsFromFn()` / `extractPropsFromInterface()` — reads destructured params and referenced interface members
- `findUsedComponents()` — scans JSX opening elements for capitalized tag names
- `findComponentFiles()` — glob scans a directory for `.tsx`/`.jsx`/`.ts`/`.js` files, filters to those likely containing components
- `analyzeFile()` — orchestrates parse → walk → extract per file
- `buildUsedByRelationships()` — post-pass to fill `used_by` from `uses` arrays
- `buildTree()` — recursive depth-limited tree builder with cycle detection via `visited: Set<string>`
- `findRootComponent()` — heuristic: the component with no `used_by` entries

**Output:** `{ tree, components, count }` — hierarchical tree + flat list with `name`, `file`, `line`, `props`, `used_by`, `uses`, `lazy`, `wrappers`.

---

#### `frontend_component_state`

**Description:** Trace React state and props through component trees. Detects prop drilling, callback instability, missing memoization, and common anti-patterns.

**Parameters:**

| Param | Type | Required | Default |
|-------|------|----------|---------|
| `file` | string | yes | — |
| `component` | string | no | — |
| `include_children` | boolean | no | `false` |
| `depth` | integer | no | `2` |

**Implementation** (`handlers/component-state/`, 7 files):
- `component-detector.ts` — finds component function nodes in the AST
- `hook-analyzer.ts` — `extractHooks()` visits call expressions, identifies `useState`, `useReducer`, `useRef`, `useContext`, `useEffect`, and custom hooks by checking if function name starts with `use` or is imported as a hook
- `props-analyzer.ts` — extracts destructured props from function parameters, tracks which props are passed to children vs. used locally
- `jsx-analyzer.ts` — analyzes JSX to find prop passing patterns, identify prop drilling chains
- `issue-detector.ts` — flags: prop drilling (same prop passed 3+ levels), callback instability (function props recreated each render), missing `useMemo`/`useCallback`
- `_analyzeComponent()` in `index.ts` — recursive entry point for `include_children` traversal, resolves import paths to locate child component files

**Output:** Per-component state report: hooks list (type, variable name, dependencies), props (name, type, passed-to children, used-in-JSX), issues with severity and fix suggestions.

---

### Render Performance

#### `frontend_render_triggers`

**Description:** Identify what causes a React component to re-render. Covers memoization status, inline unstable references, expensive computations, and context subscriptions.

**Parameters:**

| Param | Type | Required | Default |
|-------|------|----------|---------|
| `file` | string | yes | — |
| `include_children` | boolean | no | `false` |

**Implementation** (`handlers/render-triggers/`, 6 files):
- `memoization-detector.ts` — `detectMemoization()` scans for `React.memo`, `memo()`, `PureComponent` class extends, `shouldComponentUpdate`; `findComponents()` returns all component nodes with memo status
- `trigger-analyzers.ts` (485 lines) — core analysis engine:
  - `findStateHooks()` — locates `useState`/`useReducer` calls, each is a render trigger
  - `findPropTriggers()` — if not memoized, all props are triggers; if memoized, shallow-compare semantics apply
  - `findForceUpdateTriggers()` — detects `this.forceUpdate()` calls (class components)
  - `findInlineDefinitions()` — identifies object literals `{}`, array literals `[]`, arrow functions `() => {}`, and JSX expressions defined inline in the render return; each creates a new reference every render
  - `findExpensiveComputations()` — heuristic: call chains with `.map().filter()`, `JSON.parse()`, `JSON.stringify()`, loops that produce arrays, etc. not wrapped in `useMemo`
  - `analyzeContextUsage()` — finds `useContext(SomeContext)` calls and reports the full context value is subscribed (vs. just a slice)
  - `analyzeChildProps()` — checks whether props passed to child components are stable or unstable (inline definitions)
- `suggestion-generator.ts` — maps findings to prioritized suggestions (wrap in `useCallback`, extract to module-level, add `React.memo`, etc.)

**Output:** `{ component, memoized, triggers[], inline_definitions[], expensive_computations[], context_subscriptions[], child_analyses[], suggestions[] }`

---

### Layout & Sizing

#### `frontend_layout_hierarchy`

**Description:** Build a layout tree from JSX/TSX showing display types, sizing constraints, flex/grid properties, overflow, and positioning.

**Parameters:**

| Param | Type | Required |
|-------|------|----------|
| `file` | string | yes |
| `selector` | string | no |

**Implementation** (`handlers/layout-hierarchy-*.ts`, 3 files + `analyze-layout-hierarchy.ts`):
- Parses JSX, extracts `className` strings using `jsx-class-utils.ts`
- Classifies each element: display type (`flex`, `grid`, `block`, `inline`, `hidden`), sizing (`w-*`, `h-*`, `min-*`, `max-*`), flex props (`flex-row`, `flex-col`, `flex-1`, `grow`, `shrink`, `basis-*`), grid props (`grid-cols-*`, `col-span-*`), overflow (`overflow-hidden`, `overflow-auto`, `overflow-scroll`), positioning (`relative`, `absolute`, `fixed`, `sticky`)
- Detects layout issues: fixed-height parent with auto-height children that may overflow, percentage height (`h-full`, `h-1/2`) without a parent that has explicit height, nested flex without `min-h-0` (a common cause of overflow), `absolute` children without a `relative` ancestor
- `selector` param filters the tree to a matching element by class (`.class-name`) or id (`#element-id`)

**Output:** `{ file, root_element, layout_tree, constraint_notes[], potential_issues[], summary }`

---

#### `frontend_sizing_strategy`

**Description:** Analyze how a specific element's dimensions are computed. Walks the ancestor chain to understand all constraints affecting the target element.

**Parameters:**

| Param | Type | Required |
|-------|------|----------|
| `file` | string | yes |
| `selector` | string | yes |

**Implementation** (`handlers/sizing-strategy-*.ts`, 3 files + `get-sizing-strategy.ts`):
- Locates the target element in the JSX tree by class/id/tag
- Classifies width/height strategy into: `fixed` (explicit px or rem value), `percentage` (`w-1/2`, `w-full`), `viewport` (`w-screen`, `h-screen`), `content-based` (no sizing class), `flex-controlled` (parent is flex), `grid-controlled` (parent is grid)
- Analyzes `FlexBehavior`: `grow`, `shrink`, `basis` values
- Analyzes `GridBehavior`: column/row span and placement
- Walks ancestor chain collecting constraints at each level
- Returns human-readable `summary` explaining the sizing computation chain

**Output:** `{ file, element, classes[], width: SizingDimension, height: SizingDimension, flex_behavior?, grid_behavior?, position_context, ancestor_chain[], summary }`

---

#### `frontend_overflow`

**Description:** Diagnose CSS overflow issues and generate actionable fix recommendations with trade-off explanations.

**Parameters:**

| Param | Type | Required |
|-------|------|----------|
| `file` | string | yes |
| `problem_description` | string | no |
| `element_hint` | string | no |

**Implementation** (`handlers/overflow-diagnosis/`, 6 files):
- `pattern-detector.ts` — `findOverflowPatterns()` walks a `LayoutNode` tree (produced by the layout hierarchy analyzer) and matches:
  - Fixed-height container with auto-height children
  - Flex container without `overflow-hidden`/`overflow-auto` where children could grow unbounded
  - Nested `h-full` without parent having explicit height
  - Absolute positioned children outside a positioned ancestor
  - Missing `min-h-0` on flex children that contain scrollable content
- `constraint-builder.ts` — builds a constraint chain showing how parent constraints propagate to the hinted element
- `fix-generator.ts` — for each detected pattern, generates 2–3 fix options: each with specific Tailwind classes to add/remove, a plain-English explanation, and trade-offs (e.g., `overflow-hidden` clips content vs. `overflow-auto` adds scrollbars)
- `problem_description` is used to weight/sort the most relevant patterns first

**Output:** `{ patterns[], constraint_chain?, fixes[], summary }`

---

### Visual Stacking

#### `frontend_stacking_context`

**Description:** Analyze z-index and stacking contexts. Detects all CSS properties that create new stacking contexts, builds a hierarchical stacking tree, finds conflicts.

**Parameters:**

| Param | Type | Required | Default |
|-------|------|----------|---------|
| `file` | string | yes | — |
| `include_portals` | boolean | no | `true` |

**Implementation** (`handlers/stacking-context/`, 8 files):
- `context-rules.ts` — `CONTEXT_CREATORS` map: for each CSS property group, a function that checks if any class in the set triggers a new stacking context:
  - `position+z-index`: `(relative|absolute|fixed|sticky)` + `z-*` where z ≠ `auto`
  - `transform`: any `translate-*`, `rotate-*`, `scale-*`, `skew-*`, `transform` utility
  - `opacity`: `opacity-*` where value < 1
  - `filter` / `backdrop-filter`: any `blur-*`, `brightness-*`, etc.
  - `isolation`: `isolate` class
  - `will-change`: `will-change-transform`, `will-change-opacity`
  - `mix-blend-mode`: any non-`normal` blend mode
- `extractZIndex()` — maps Tailwind `z-*` classes to numeric values (`z-0`→0, `z-10`→10, `z-50`→50, `z-auto`→`'auto'`); also parses arbitrary `z-[42]`
- `tree-builder.ts` — walks JSX, builds a nested stacking context tree
- `portal-detector.ts` — detects `ReactDOM.createPortal()`, Radix `Portal`, Headless UI `Dialog`, etc.
- `issue-detector.ts` — flags: sibling elements with conflicting z-index values inside the same stacking context, z-index on `position: static` elements (no effect), portals that escape the current stacking context
- `jsx-analyzer.ts` — extracts classes from each JSX element and invokes `createsStackingContext()`

**Output:** `{ stacking_tree, contexts[], conflicts[], portal_destinations[], summary }`

---

### Responsive Design

#### `frontend_responsive_breakpoints`

**Description:** Analyze responsive Tailwind classes across breakpoints. Detects mobile-first vs. desktop-first patterns, coverage gaps, and missing base styles.

**Parameters:**

| Param | Type | Required |
|-------|------|----------|
| `file` | string | yes |
| `element` | string | no |
| `breakpoints` | object | no |

**Implementation** (`handlers/responsive-breakpoints/`, 8 files):
- `breakpoint-resolver.ts` — `resolveBreakpoints()`: merges explicit `breakpoints` param, auto-detects `tailwind.config.js/ts/mjs/cjs` by walking up from project root and parsing the `screens` block with a regex-based extractor (`parseTailwindScreens()`); falls back to Tailwind v3 defaults: `{ sm: '640px', md: '768px', lg: '1024px', xl: '1280px', '2xl': '1536px' }`; sorts breakpoints by `min-width` value
- `jsx-extractor.ts` — `extractJsxElements()` walks the AST, collects all JSX elements with their className strings; filters to `element` param if provided (matches tag name or nth occurrence like `"div"`, `"Button#3"`)
- `class-parser.ts` — parses each class string: splits `{prefix}:{utility}`, recognizes responsive prefixes (`sm:`, `md:`, `lg:`, `xl:`, `2xl:`), groups classes by their CSS property group (display, padding, margin, typography, etc.)
- `issue-detector.ts` — detects:
  - Desktop-first: classes at larger breakpoints that undo base-level styles
  - Missing base style: a property is only defined at `sm:` or higher, leaving mobile unstyled
  - Breakpoint gap: e.g., property defined at `sm:` and `xl:` but not `md:` or `lg:`
  - Redundant breakpoints: same value repeated across multiple breakpoints

**Output:** `{ elements[], breakpoint_coverage, issues[], suggestions[], summary }`

---

### Tailwind CSS

#### `frontend_tailwind_conflicts`

**Description:** Detect conflicting, redundant, and contradictory Tailwind CSS classes in React components.

**Parameters:**

| Param | Type | Required | Default |
|-------|------|----------|---------|
| `file` | string | yes | — |
| `include_arbitrary` | boolean | no | `true` |

**Implementation** (`handlers/tailwind-conflicts-*.ts`, 3 files + `analyze-tailwind-conflicts.ts`, 236 lines):
- Extracts all `className` strings from JSX elements (via `jsx-class-utils.ts`)
- Classifies each class into a **property group** (e.g., `padding`, `padding-x`, `padding-y`, `margin`, `display`, `position`, `z-index`, `width`, `height`, `size`, etc.)
- Three conflict types:
  1. **Override**: same property group appears twice → later class wins, earlier is dead (e.g., `p-2 p-4`)
  2. **Redundant**: shorthand + longhand where shorthand is partially overridden (e.g., `p-2 px-4` → p-2's x-padding is dead)
  3. **Contradiction**: mutually exclusive classes (e.g., `hidden flex`, `block inline-flex`, `w-full w-auto`)
- Additional checks: `size-X` conflicts with explicit `w-X h-X`, `z-*` without any `position` class (z-index has no effect on `position: static`)
- Suggestions: if `w-N h-N` are equal, suggest `size-N`
- `include_arbitrary`: when true, parses `[value]` tokens in arbitrary utilities for conflict detection

**Output:** `{ file, elements_analyzed, conflicts[], redundant_classes[], specificity_issues[], suggestions[], summary }`

---

### Accessibility

#### `frontend_accessibility_tree`

**Description:** Build an ARIA accessibility tree and detect WCAG 2.1 issues. Covers semantic roles, focus order, keyboard interactions, and ARIA pattern validation.

**Parameters:**

| Param | Type | Required | Default |
|-------|------|----------|---------|
| `file` | string | yes | — |
| `element` | string | no | — |
| `check_patterns` | boolean | no | `true` |

**Implementation** (`handlers/accessibility-tree-*.ts`, 3 files + `get-accessibility-tree.ts`, 216 lines):
- `accessibility-tree-core.ts` — walks JSX to build `A11yNode` tree: assigns implicit ARIA roles to HTML elements (`button`→`button`, `a[href]`→`link`, `input`→`textbox`/`checkbox`/etc., `nav`→`navigation`, `main`→`main`, `section`→`region`), reads explicit `role=` attribute, reads `aria-label`, `aria-labelledby`, `aria-describedby`, `aria-hidden` attributes
- `accessibility-tree-analyzers.ts` — detects issues:
  - WCAG 1.1.1 (Non-text content): `<img>` without `alt` prop
  - WCAG 1.3.1 (Info & Relationships): `<input>` not wrapped in `<label>` and no `aria-label`/`aria-labelledby`
  - WCAG 2.4.7 (Focus Visible): interactive elements with `outline-none`/`focus:outline-none` but no `focus:ring-*` or `focus-visible:ring-*`
  - WCAG 4.1.2 (Name, Role, Value): `<button>` or `<a>` with no accessible name (no text content, no `aria-label`)
  - Non-interactive `<div>`/`<span>` with `onClick` but no `role`, `tabIndex`, or keyboard handler
- `accessibility-tree-utils.ts` — focus order computation: traversal order following DOM order, respecting `tabIndex` values, identifying tab stops
- `check_patterns`: when true, validates composite ARIA patterns — `role="dialog"` needs `aria-labelledby`; `role="combobox"` needs `aria-expanded`, `aria-controls`; `role="tablist"` needs `role="tab"` children with `aria-selected`

**Output:** `{ file, a11y_tree, focus_order[], issues[], keyboard_interactions, aria_patterns[], summary }`

---

### Events

#### `frontend_event_flow`

**Description:** Analyze event handling and propagation. Simulates bubbling, detects nested clickable elements, missing keyboard alternatives, and event delegation patterns.

**Parameters:**

| Param | Type | Required |
|-------|------|----------|
| `file` | string | yes |
| `event` | string | no |

**Implementation** (`handlers/event-flow-*.ts`, 3 files + `analyze-event-flow.ts`, 213 lines):
- `event-flow-core.ts` — walks JSX, collects all event handler attributes (`onClick`, `onChange`, `onSubmit`, `onKeyDown`, `onMouseEnter`, etc.), records each as: element tag, handler name/expression, whether it calls `stopPropagation()` or `preventDefault()` (checked by inspecting the handler function body if it's an inline arrow)
- `event-flow-analyzers.ts` — simulates bubbling: for each element with a handler, walks up the JSX ancestor chain collecting all handlers at higher levels → produces an `EventFlow` showing the full bubble path
- Detects issues:
  - **Double-fire**: nested clickable elements where both have `onClick` and neither calls `stopPropagation()`
  - **Non-interactive with click**: `<div onClick=...>` without `role`, `tabIndex`, or `onKeyDown` (accessibility violation)
  - **Form without preventDefault**: `<form onSubmit=...>` where handler doesn't call `e.preventDefault()`
- `event-flow-utils.ts` — delegation pattern detection: scans handler bodies for `e.target.closest()`, `e.target.matches()`, `e.currentTarget` checks
- `event` param filters output to a specific event type

**Output:** `{ file, handlers[], event_flows{}, issues[], delegation_patterns[], summary }`

---

### Next.js

#### `frontend_client_boundary`

**Description:** Analyze Next.js App Router `"use client"` / `"use server"` boundaries. Finds misclassified components, unnecessary client components, and bundle optimization opportunities.

**Parameters:**

| Param | Type | Required |
|-------|------|----------|
| `path` | string | no |
| `entry` | string | no |

**Implementation** (`handlers/client-boundary/`, 5 files):
- `scanner.ts` — scans files for `"use client"` / `"use server"` directives (string literals as first statement), builds `FileDirectiveInfo` per file
- `graph-builder.ts` (281 lines):
  - `extractImports()` — walks AST for `ImportDeclaration` nodes, extracts module specifiers
  - `resolveImport()` — resolves relative imports to absolute paths with extension probing (`.ts`, `.tsx`, `.js`, `.jsx`, `/index.ts`, etc.)
  - `buildImportGraph()` — produces `ImportGraph`: adjacency map of file → imported files
  - `classifyComponents()` — BFS from known `"use client"` roots; marks each reachable file as `client-inherited`; files with no directive and not reachable from a client root → `server`; ambiguous if has browser API usage without directive
  - `buildBoundaryMap()` — computes depth of each file from the nearest client boundary root
- `issue-detector.ts` — detects:
  - Missing `"use client"` on files using browser APIs (`window`, `document`, `localStorage`, `useState`, `useEffect`, event handlers)
  - Unnecessary `"use client"` on files that could be server components (no hooks, no browser API, no event handlers)
  - Server-only imports in client files (`server-only`, `next/headers`, `next/cookies`)
  - Large client subtrees (boundary depth > configurable threshold)
- `resolveScanPath()` in `index.ts` — auto-detects `app/` or `src/` directory if no `path`/`entry` provided

**Output:** `{ files[], classifications[], issues[], bundle_impact, summary }`

---

#### `frontend_error_boundaries`

**Description:** Analyze React/Next.js error boundary coverage. Detects class-based boundaries, library wrappers, missing `error.tsx` files in App Router segments, and coverage gaps.

**Parameters:**

| Param | Type | Required | Default |
|-------|------|----------|---------|
| `project_path` | string | yes | — |
| `entry` | string | no | — |
| `include_library_boundaries` | boolean | no | `true` |

**Implementation** (`handlers/error-boundaries/`, 5 files):
- `scanner.ts` (532 lines) — main detection engine:
  - `LIBRARY_BOUNDARY_SOURCES`: recognized libraries → `@sentry/react`, `@sentry/nextjs`, `react-error-boundary`, `@tanstack/react-query` (QueryErrorResetBoundary)
  - `ERROR_BOUNDARY_METHODS`: `getDerivedStateFromError`, `componentDidCatch`
  - `scanFileForErrorBoundaries()` — for each file: checks for class components with `getDerivedStateFromError`/`componentDidCatch`, checks JSX usage of known library boundary components, verifies `fallback`/`fallbackRender` prop presence, checks for reset/retry mechanism (`onReset`, `onError`)
  - `classHasFallback()` / `classHasReset()` — inspect class component `render()` for conditional error UI
  - `fileHasAsyncOperations()` — heuristic for async components that should be wrapped
  - `scanNextjsRouteSegments()` — walks an `app/` directory, identifies route segments (directories with `page.tsx`/`layout.tsx`), checks for `error.tsx` in each segment
- `coverage-analyzer.ts` — maps boundaries to the component subtrees they protect, identifies unprotected async components
- `issue-detector.ts` — flags: missing fallback UI, missing reset mechanism, overly broad boundary (protects too large a subtree), async component without any surrounding boundary

**Output:** `{ boundaries[], route_segments[], unprotected_async[], issues[], coverage_summary, summary }`

---

### Hooks

#### `frontend_hook_dependencies`

**Description:** Audit React hook dependency arrays for stale closures, missing/unnecessary/unstable dependencies, and anti-patterns.

**Parameters:**

| Param | Type | Required | Default |
|-------|------|----------|---------|
| `file` | string | yes | — |
| `hook` | string | no | — |
| `include_stable_analysis` | boolean | no | `true` |

**Implementation** (`handlers/hook-dependencies/`, 5 files):
- `hook-extractor.ts` (378 lines):
  - `HOOKS_WITH_DEPS`: `useEffect`, `useMemo`, `useCallback`, `useLayoutEffect`, `useInsertionEffect`
  - `buildComponentScope()` — walks the component function body to classify every identifier: `stateVars` (from `useState`), `refVars` (from `useRef`), `callbackVars` (from `useCallback`), `memoVars` (from `useMemo`), `contextVars` (from `useContext`), `props`, `constants` (module-level `const`/`let`), `stableApis` (dispatch from `useReducer`, setState setters)
  - `extractBodyRefs()` — collects all identifiers referenced inside a hook's callback body, excluding globals (`GLOBAL_IDENTIFIERS` set)
  - `extractHooksWithDeps()` — finds all hooks with dependency arrays, extracts the `deps` array entries as strings, pairs with `bodyRefs`
  - `hasCleanupReturn()` — checks if an effect returns a cleanup function
  - `detectSubscriptions()` — regex-based check for `addEventListener`, `subscribe`, `setInterval`, `setTimeout`, `.on(` patterns
- `stability-analyzer.ts` — classifies each dep as stable or unstable:
  - **Stable**: `useRef` values, `setState` setters, `useReducer` dispatch, module-level constants, `useCallback`/`useMemo` results
  - **Unstable**: inline objects `{}`, arrays `[]`, `.map()`/`.filter()` results, `Object.keys/values/entries()`, spread expressions `...x`, function expressions
- `issue-detector.ts` — issue types:
  - `stale_closure`: empty `[]` deps but body references mutable state/props
  - `missing_dep`: identifier in body not present in deps array
  - `unnecessary_dep`: identifier in deps array not referenced in body
  - `unstable_dep`: dep expression is unstable per stability-analyzer
  - `derived_state`: `useEffect` body that only calls `setState` with a value derived from deps (should use `useMemo` instead)
  - `missing_cleanup`: effect body has subscriptions/timers but no cleanup return
- `filterHooks()` in `index.ts` — filters to a specific hook by variable name or line number when `hook` param is provided

**Output:** `{ component, hooks[], issues[], stable_summary?, summary }`

---

## Shared Utilities

### `jsx-class-utils.ts`

Shared across layout, tailwind, stacking, responsive, and overflow tools.

```typescript
// Extract all class name strings from a JSX element's className prop
exportClassesFromNode(node: ts.Node, out: string[]): void
exportClassesFromAttribute(attr: ts.JsxAttribute): string[]
```

Handles three `className` value forms:
1. **String literal**: `className="flex p-4 bg-blue-500"`  → splits on whitespace
2. **Template literal**: `` className={`flex ${condition ? 'p-4' : 'p-2'}`} `` → extracts static segments, skips dynamic `${...}` expressions
3. **Conditional expressions**: `className={cn('base', condition && 'extra', { active: isActive })}` → walks `CallExpression` args, extracts string literal arguments

Does not evaluate dynamic expressions — only statically extractable class strings are returned.

### `response-utils.ts`

MCP response factories used by all handlers:

| Function | Purpose |
|----------|---------|
| `createSuccessResponse<T>(data)` | Serializes `data` as JSON in `content[0].text` |
| `createTextResponse(text)` | Plain text response |
| `createErrorResponse(msg, context?)` | Error with optional context object |
| `createErrorFromException(error, prefix?)` | Wraps a caught exception |
| `createNotFoundResponse(type, id)` | 404-style: "X not found: Y" |
| `createMissingArgumentResponse(name)` | Missing required argument |
| `createInvalidArgumentResponse(name, reason)` | Invalid argument value |

### `stacking-context/context-rules.ts`

The `CONTEXT_CREATORS` record maps CSS property groups to detection functions over Tailwind class arrays. `createsStackingContext(classes)` iterates all rules and returns the first match. `extractZIndex(classes)` maps `z-0`, `z-10`, `z-20`, `z-30`, `z-40`, `z-50` to numeric values and handles arbitrary `z-[N]` syntax.

### `responsive-breakpoints/breakpoint-resolver.ts`

`resolveBreakpoints()` priority chain:
1. Explicit `breakpoints` parameter (caller-provided overrides/additions)
2. Auto-detected `tailwind.config.*` via `parseTailwindScreens()` regex extraction
3. Tailwind v3 defaults

Breakpoints are sorted by `min-width` pixel value for correct mobile-first ordering.

---

## Key Implementation Details

### TypeScript AST Usage

All files use `typescript` (the compiler package) directly — not `ts-morph` or Babel. Key patterns:

```typescript
// Parse a file
const sourceFile = ts.createSourceFile(
  filePath, content, ts.ScriptTarget.Latest, /*setParentNodes*/ true
);

// Walk all nodes
function walk(node: ts.Node) {
  // process node
  ts.forEachChild(node, walk);
}

// Type guards
if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) { ... }
if (ts.isCallExpression(node)) { ... }
if (ts.isStringLiteral(node)) { ... }

// Get text representation
node.getText(sourceFile)
sourceFile.getLineAndCharacterOfPosition(node.getStart())
```

### Component Detection Heuristic

`isReactComponent()` in `react.ts` uses a multi-signal heuristic:
1. Name starts with uppercase (React convention)
2. Is a `FunctionDeclaration`, `ArrowFunction`, or `FunctionExpression`
3. Body contains JSX (via `containsJsxReturn()`)
4. OR is wrapped in `memo()`, `forwardRef()`, or `React.lazy()`

### HOC Unwrapping

`unwrapHocCall()` peels nested HOC wrappers recursively. For `memo(forwardRef((props) => ...))`, it returns `{ innerFn: ArrowFunction, wrappers: ['memo', 'forwardRef'], isLazy: false }`.

### Tailwind Class Parsing Strategy

All Tailwind analysis tools work on raw class strings — no CSS generation, no PostCSS, no Tailwind CLI. Classes are parsed by string pattern matching:
- Responsive prefix: matches `/^(sm|md|lg|xl|2xl|\[\d+px\]):/`  
- Arbitrary values: matches `/-\[.+\]$/`
- Property group classification: lookup table mapping class prefixes to CSS property groups

### Overflow Detection Algorithm

`findOverflowPatterns()` in `overflow-diagnosis/pattern-detector.ts` applies a depth-first walk over the `LayoutNode` tree, checking for:

```
For each node:
  if node.height === 'fixed' && any child.height === 'auto' → overflow risk
  if node.display === 'flex' && node.overflow === 'visible' && any child.flex_grow → unbounded growth
  if node.height === 'percentage' && parent.height === 'auto' → percentage-without-parent
  if node.position === 'absolute' && !hasPositionedAncestor → escaping containment
```

### Client Boundary Classification

`classifyComponents()` in `client-boundary/graph-builder.ts` uses BFS propagation:
1. Seed the queue with all files that have `"use client"` directive → mark as `client`
2. BFS: for each client file, mark all files that import it as `client-inherited`  
3. Files with `"use server"` directive → mark as `server` (overrides inherited)
4. Remaining unmarked → check for browser API usage: if found → `ambiguous`; otherwise → `server`

---

## Dependencies

| Package | Type | Purpose |
|---------|------|---------|
| `@modelcontextprotocol/sdk` | runtime | MCP server protocol, `Server`, `StdioServerTransport`, request schemas |
| `typescript` | runtime | TypeScript compiler API for AST parsing and analysis |
| `esbuild` | dev | Bundles ESM TypeScript sources to a single CJS `dist/index.cjs` |
| `vitest` | dev | Test runner |
| `@vitest/coverage-v8` | dev | Coverage reporting |
| `@types/node` | dev | Node.js type definitions |

No React runtime is required. No DOM APIs are used. All analysis is pure file I/O + TypeScript AST traversal.

---

## Tool Categories Summary

| Category | Tools |
|----------|-------|
| Component Analysis | `frontend_component_tree`, `frontend_component_state` |
| Render Performance | `frontend_render_triggers` |
| Layout & Sizing | `frontend_layout_hierarchy`, `frontend_sizing_strategy`, `frontend_overflow` |
| Visual Stacking | `frontend_stacking_context` |
| Responsive Design | `frontend_responsive_breakpoints` |
| Tailwind CSS | `frontend_tailwind_conflicts` |
| Accessibility | `frontend_accessibility_tree` |
| Events | `frontend_event_flow` |
| Next.js | `frontend_client_boundary`, `frontend_error_boundaries` |
| Hooks | `frontend_hook_dependencies` |
