# Frontend Engine v2 — Implementation Plan

Targeted improvements for the React+Tailwind static analysis engine. No scope creep — only changes that serve the core audience and can't be trivially done by the AI agent with existing tools.

---

## Phase 1: Honesty & Cleanup

Remove false claims. The engine is a React/TSX + Tailwind analyzer. Stop pretending otherwise.

### 1.1 Remove Vue/Svelte references from tool schemas

Multiple YAML tool definitions and code comments reference `.vue` and `.svelte` support that doesn't exist. The TypeScript compiler API cannot parse Vue SFC templates or Svelte template syntax. Accepting these extensions gives users broken results.

**Files to update:**
- `definitions/frontend-engine/*.yaml` — Remove `.vue` and `.svelte` from allowed file extensions in all 11 tool schemas
- `src/handlers/stacking-context/portal-detector.ts` — Remove Vue Teleport and Svelte Portal regex detection (lines 97-113). These produce false confidence without real template parsing.
- `src/handlers/stacking-context/index.ts` — Remove `.vue`/`.svelte` from extension whitelist
- `src/handlers/responsive-breakpoints/index.ts` — Remove Vue/Svelte template extraction references
- `src/handlers/react.ts` — Already React-only, just verify no misleading comments
- `frontend-engine.md` — Update "Multi-framework support" strength to accurately reflect React-only scope

**Scope**: React (.tsx, .jsx, .ts, .js) only. If Vue/Svelte support is wanted in the future, it should be a separate engine with proper parsers (`@vue/compiler-sfc`, `svelte/compiler`).

### 1.2 Update frontend-engine.md

The analysis document still lists issues that were fixed in Part 1 (commit `212add1c`). Update the Findings section to reflect current state:
- Remove fixed items from "Unimplemented Features" (include_children/depth, multi-component analysis)
- Remove fixed items from "Minor Issues" (all 8 were addressed)
- Update "Limitations" to remove items that are now intentional scope decisions
- Add note about v2 improvements

---

## Phase 2: Core Gaps (React+Tailwind)

Fixes for real gaps in the primary audience's workflow.

### 2.1 Dynamic class pattern detection

**Why**: Logical AND and clsx object syntax are extremely common in Tailwind projects. Missing them means tools miss real classes that are actually applied.

**Current** (`tailwind-conflicts-core.ts:28-89`):
- String literals, template literals, cn/clsx/classNames string args, ternaries

**Add:**

| Pattern | Example | Frequency |
|---------|---------|----------|
| Logical AND | `isActive && 'bg-blue-500'` | Very common |
| clsx/cn object syntax | `clsx({ 'bg-blue-500': isActive, 'bg-gray-200': !isActive })` | Very common |
| Array syntax | `cn(['flex', isActive && 'bg-blue-500'])` | Common |

**Implementation**: Extend `extractClassesFromAttribute()` to handle:
1. `LogicalExpression` with `&&` operator — extract the string literal from the right operand
2. `ObjectLiteralExpression` inside cn/clsx/classNames calls — extract all property name strings
3. `ArrayLiteralExpression` inside cn/clsx calls — extract string elements and recurse into logical AND elements

**Affected tools**: All tools that extract classes will benefit since they share the extraction utility.

### 2.2 Component detection: memo, forwardRef, lazy

**Why**: Production React codebases heavily use these patterns. `get_react_component_tree` produces incomplete trees without them.

**Current** (`react.ts`):
- Function declarations, arrow functions, class components

**Add:**

| Pattern | Example |
|---------|--------|
| React.memo wrapping | `const Comp = React.memo(() => <div/>)` |
| React.memo named | `const Comp = memo(function Comp() { return <div/> })` |
| forwardRef | `const Comp = forwardRef((props, ref) => <div/>)` |
| forwardRef + memo | `const Comp = memo(forwardRef((props, ref) => <div/>))` |
| lazy | `const Comp = lazy(() => import('./Comp'))` |
| HOC unwrapping | `export default withRouter(MyComponent)` — detect the inner component name |

**Implementation**: When visiting `VariableDeclaration` nodes, check if the initializer is a `CallExpression` where the callee is `memo`, `React.memo`, `forwardRef`, `React.forwardRef`, or `lazy`. Unwrap to find the inner component (function expression or arrow function). For HOCs, extract the argument name.

**Note**: `render-triggers/index.ts` already handles `export default memo(Component)` for default exports. This extends the same pattern to the component tree builder and covers named exports + nested wrapping.

### 2.3 Custom Tailwind breakpoint support

**Why**: Many projects customize Tailwind breakpoints. The engine hardcodes default values, so custom breakpoints like `xs: '480px'` or `3xl: '1920px'` are invisible.

**Current** (`responsive-breakpoints/constants.ts:10-23`):
```typescript
export const BREAKPOINTS = ['sm', 'md', 'lg', 'xl', '2xl'] as const;
export const BREAKPOINT_SIZES = { base: '0px', sm: '640px', md: '768px', ... };
```

**Implementation**:
1. Add optional `breakpoints` parameter to `analyze_responsive_breakpoints` schema — allows explicit override
2. On tool invocation, if no explicit breakpoints provided, look for `tailwind.config.js` or `tailwind.config.ts` in the project root
3. If config found, extract `theme.screens` or `theme.extend.screens` values using a simple AST parse or regex extraction (config files are typically simple object literals)
4. Merge with defaults — custom values override, unknown keys are added
5. Fall back to hardcoded defaults if no config found and no parameter provided

**Files**:
- `responsive-breakpoints/constants.ts` — Export defaults but make them overridable
- `responsive-breakpoints/index.ts` — Add config detection logic
- `definitions/frontend-engine/analyze-responsive-breakpoints.yaml` — Add optional `breakpoints` parameter
- `schemas/index.ts` — Update schema

---

## Phase 3: New Tools

High-value analysis that would take the AI agent many tool calls to replicate manually.

### 3.1 `analyze_client_boundary` — Server vs Client Component Analysis

**Why this is the highest-value addition**: Next.js App Router's `"use client"` boundary is the #1 source of confusion and bugs in modern React. Analyzing it requires tracing import chains across many files to find where boundaries sit, what gets pulled into the client bundle unnecessarily, and which components could be server components but aren't. An AI agent would need dozens of grep+read cycles to figure this out.

**What it does**:
1. Scan the project for `"use client"` and `"use server"` directives
2. Build an import graph starting from the entry points
3. Classify every component as: server (default), client (has directive), client-inherited (imported by a client component), or ambiguous
4. Detect issues:
   - **Large client subtrees**: A `"use client"` high in the tree that forces many children to be client components unnecessarily
   - **Missing directive**: Component uses client-only APIs (useState, useEffect, onClick handlers, browser APIs) but has no `"use client"` directive and isn't imported by a client component
   - **Unnecessary client**: Component has `"use client"` but doesn't use any client-only APIs — could be a server component
   - **Boundary optimization**: Suggest moving `"use client"` lower in the tree to keep more components on the server
   - **Server-only imports in client**: Importing `server-only` modules, database clients, or fs in client components
5. Output a boundary map showing the client/server split with optimization suggestions

**Inputs**:
- `path` (optional, default: `"src"` or `"app"`): Directory to scan
- `entry` (optional): Specific entry file to trace from
- `framework` (optional, default: auto-detect): `"nextjs"` | `"remix"` | `"react-router"` — determines default server/client classification

**Implementation complexity**: Medium-high. Requires import graph traversal (similar to what component-state already does with `visitedFiles` + `resolveImportPath`) and a classification algorithm. The AST detection of client-only APIs (hooks, event handlers, browser globals) can reuse patterns from existing tools.

### 3.2 `audit_hook_dependencies` — Hook Dependency Analysis

**Why**: Stale closures, missing deps, and unnecessary deps are the #1 source of React bugs. The current `trace_component_state` extracts hook deps but doesn't deeply analyze them. Proper analysis requires understanding data flow — which values are stable (setState, dispatch, refs), which change every render (objects, arrays, callbacks), and which are missing from dep arrays.

**What it does**:
1. Extract all hooks with dependency arrays (useEffect, useMemo, useCallback, useLayoutEffect)
2. Analyze each dependency:
   - **Stable values** (safe to omit, but ESLint wants them): `setState`, `dispatch`, `useRef().current`, imports, constants
   - **Unstable values** (new reference every render): inline objects `{}`, inline arrays `[]`, inline functions `() => {}`, object spread, `.map()/.filter()` results
   - **Missing deps**: Variables used inside the hook body that aren't in the dep array and aren't stable
   - **Unnecessary deps**: Values in the dep array that aren't used in the hook body
3. Detect anti-patterns:
   - **Stale closure risk**: Effect uses a prop/state value but dep array is `[]`
   - **Object/array dep**: Dep array includes an object or array that's created during render (will trigger on every render, defeating memoization)
   - **Effect should be event handler**: Effect that runs on a specific state change and immediately does a side effect — should be in the event handler instead
   - **Cascading state updates**: `useEffect(() => { setB(a + 1) }, [a])` — derived state should use computation, not an effect
   - **Cleanup missing**: Effect with subscriptions, timers, or event listeners but no cleanup return
4. Generate suggestions with specific fixes

**Inputs**:
- `file` (required): Component file
- `hook` (optional): Analyze a specific hook by variable name or line number
- `include_stable_analysis` (optional, default: true): Whether to classify deps as stable/unstable

**Implementation complexity**: Medium. The dep array extraction already exists in `component-state/hook-analyzer.ts`. The new work is the data flow analysis — tracing which variables are used inside hook bodies and classifying their stability.

### 3.3 `analyze_error_boundaries` — Error/Suspense Boundary Coverage

**Why**: "Which components crash without being caught?" requires walking the full component tree and tracking boundary positions. This is tedious to do manually across a large codebase. One tool call gives a complete coverage map.

**What it does**:
1. Scan for error boundary implementations (class components with `componentDidCatch`/`getDerivedStateFromError`, or common libraries like `react-error-boundary`)
2. Scan for Suspense boundaries (`<Suspense fallback={...}>`)
3. Build the component tree and annotate which components are protected by which boundary
4. Identify gaps:
   - **Unprotected subtrees**: Components with no ancestor error boundary
   - **Missing Suspense for lazy**: `React.lazy()` components without a Suspense ancestor
   - **Missing Suspense for data fetching**: Components using `use()` hook or async server components without Suspense
   - **Boundary too high**: Single error boundary at the root catches everything — one error takes down the whole app
   - **Boundary too low**: Error boundaries inside leaf components that should propagate errors up
   - **No fallback UI**: Suspense or error boundary with trivial fallback (empty div, null)
5. Output a coverage map with suggestions for boundary placement

**Inputs**:
- `path` (optional, default: `"src"`): Directory to scan
- `entry` (optional): Specific entry point
- `include_suspense` (optional, default: true): Include Suspense boundary analysis

**Implementation complexity**: Medium. Reuses the component tree builder from `react.ts` and adds boundary detection + coverage tracking.

---

## Summary

| Phase | Item | Effort | Impact |
|-------|------|--------|--------|
| 1.1 | Remove Vue/Svelte false claims | Low | Correctness |
| 1.2 | Update frontend-engine.md | Low | Documentation |
| 2.1 | Dynamic class patterns (AND, clsx objects) | Medium | High |
| 2.2 | Component detection (memo/forwardRef/lazy) | Medium | High |
| 2.3 | Custom Tailwind breakpoints | Low | Medium |
| 3.1 | `analyze_client_boundary` (new tool) | Medium-High | Very High |
| 3.2 | `audit_hook_dependencies` (new tool) | Medium | High |
| 3.3 | `analyze_error_boundaries` (new tool) | Medium | Medium-High |

Phases are independent. Phase 1 is cleanup that should happen regardless. Phase 2 fixes real gaps in the core feature set. Phase 3 adds high-value tools that justify their existence by doing complex multi-file analysis the AI can't easily replicate.
