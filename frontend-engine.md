# Frontend Engine — Analysis Document

Static analysis engine for React/TSX + Tailwind CSS codebases. Provides 14 tools that perform multi-file AST analysis the AI agent would otherwise need many individual tool calls to replicate.

**Version**: v2 (current)  
**Scope**: React (.tsx, .jsx, .ts, .js) only  
**Analysis method**: TypeScript Compiler API (static, no runtime)

---

## Tools (14)

### Component Analysis

#### `get_react_component_tree`
Parses JSX/TSX files and builds a component hierarchy tree. Detects function declarations, arrow functions, class components, `React.memo`, `React.forwardRef`, `React.lazy`, and HOC-wrapped components. Returns a hierarchical tree and flat component list with props, `used_by`/`uses` relationships, lazy status, and wrapper annotations.

- **Input**: `file` or `path` (directory), optional `root_component`, optional `depth` (default 5)
- **Added in v2**: `memo`, `forwardRef`, `lazy`, and HOC wrapping detection; `wrappers` and `lazy` fields on output nodes

#### `trace_component_state`
Traces React state and props through component trees. Analyzes `useState`, `useReducer`, `useRef`, `useContext`, and effect hooks. Detects prop drilling, callback instability, missing memoization, and other anti-patterns. Returns detailed state flow including which state values are used in JSX and passed to children.

- **Input**: `file` (required), `include_children` (default false), `depth` (default 2)

#### `analyze_render_triggers`
Analyzes what causes a React component to re-render. Identifies memoization status (`React.memo`, `PureComponent`, `shouldComponentUpdate`), inline definitions creating unstable references (objects, arrays, functions, JSX), expensive computations not wrapped in `useMemo`, and context subscription granularity. Provides prioritized optimization suggestions.

- **Input**: `file` (required), `include_children` (default false)

#### `audit_hook_dependencies` (new in v2)
Analyzes React hook dependency arrays for correctness. Covers `useEffect`, `useMemo`, `useCallback`, `useLayoutEffect`, and `useInsertionEffect`. Detects stale closures (empty dep array with state/prop references), missing deps (variables used in the hook body not listed), unnecessary deps (listed but not referenced), and unstable deps (inline objects/arrays/functions, `.map()`/`.filter()` results, `Object.keys/values/entries`, spread expressions). Also flags the derived state anti-pattern (`useEffect` that only calls `setState`) and missing cleanup for subscriptions/timers/event listeners.

- **Input**: `file` (required), `hook` (optional — specific hook by name or line number), `include_stable_analysis` (default true)

### Layout & CSS Analysis

#### `analyze_layout_hierarchy`
Builds a layout tree from JSX with sizing constraints, display types (flex/grid/block), flex/grid properties, overflow handling, and positioning. Detects layout issues: fixed-height containers with auto-height children, nested flex without sizing, percentage height without established parent height, and similar patterns.

- **Input**: `file` (required), `selector` (optional — focus on specific element by `.class` or `#id`)

#### `get_sizing_strategy`
Analyzes how a specific element's dimensions are determined. Examines Tailwind classes to identify width/height strategies (fixed, percentage, viewport, content-based, flex-controlled, grid-controlled), min/max constraints, flex behavior, grid placement, overflow settings, and positioning context. Walks the ancestor chain to find constraints that affect the target element.

- **Input**: `file` (required), `selector` (required — `.className`, `#id`, or tag name)

#### `diagnose_overflow`
Diagnoses CSS overflow issues and recommends fixes. Analyzes layout hierarchy for overflow-prone patterns: fixed-height containers with auto-height children, flex containers without overflow handling, nested percentage heights, absolute positioning without containment, and missing `min-h-0` in nested flex. Returns actionable fix options with Tailwind CSS classes and trade-off explanations.

- **Input**: `file` (required), `problem_description` (optional), `element_hint` (optional)

#### `analyze_stacking_context`
Analyzes z-index and stacking contexts. Detects CSS properties that create new stacking contexts (`position`+`z-index`, `transform`, `opacity`, `filter`, `isolation`, etc.), builds a hierarchical stacking tree, identifies potential z-index conflicts, and finds portal destinations (`createPortal`, Radix Portal, etc.).

- **Input**: `file` (required), `include_portals` (default true)

### Tailwind CSS Analysis

#### `analyze_tailwind_conflicts`
Detects conflicting and redundant Tailwind classes. Identifies three issue types: (1) override conflicts where later classes override earlier ones (e.g., `p-2 p-4`), (2) redundant combinations from shorthand/longhand pairs (e.g., `p-2 px-4`), and (3) contradictions with mutually exclusive classes (e.g., `hidden flex`). Also detects `size-X` conflicts with explicit `w-`/`h-` classes and z-index without position.

- **Input**: `file` (required), `include_arbitrary` (default true)
- **Enhanced in v2**: Dynamic class pattern detection — logical AND (`isActive && 'bg-blue-500'`), `clsx`/`cn` object syntax (`{ 'bg-blue-500': isActive }`), and array syntax (`cn(['flex', isActive && 'bg-blue-500'])`)

#### `analyze_responsive_breakpoints`
Analyzes responsive Tailwind classes across breakpoints. Detects mobile-first patterns, tracks property changes across breakpoints, identifies coverage gaps, and flags issues like desktop-first patterns or missing base styles.

- **Input**: `file` (required), `element` (optional), `breakpoints` (optional — explicit override map)
- **Enhanced in v2**: Custom breakpoint support — auto-detects `tailwind.config.js`/`.ts`/`.mjs`/`.cjs` and reads `theme.screens`/`theme.extend.screens`. Falls back to Tailwind defaults when no config is found. The `breakpoints` parameter allows explicit override.

### Event & Accessibility Analysis

#### `analyze_event_flow`
Analyzes event handling and propagation. Detects all event handlers (`onClick`, `onChange`, `onSubmit`, etc.), simulates event bubbling from leaf to root, identifies nested clickable elements that may double-fire, click handlers on non-interactive elements without keyboard alternatives, and form submits without `preventDefault`. Also detects event delegation patterns.

- **Input**: `file` (required), `event` (optional — filter to specific event type)

#### `get_accessibility_tree`
Builds an accessibility tree and detects WCAG issues. Analyzes semantic HTML roles, focus order, keyboard interactions, and ARIA patterns. Detects missing alt text (1.1.1), unlabeled form inputs (1.3.1), buttons/links without accessible names (4.1.2), click handlers on non-interactive elements, missing focus indicators (2.4.7), and invalid ARIA patterns.

- **Input**: `file` (required), `element` (optional), `check_patterns` (default true)

### Next.js / App Router Analysis

#### `analyze_client_boundary` (new in v2)
Analyzes Next.js App Router `"use client"` and `"use server"` boundaries. Scans files for directives, builds an import graph, and classifies each file as server, client, client-inherited, or ambiguous. Detects: missing `"use client"` directives on components using client-only APIs, unnecessary client components that could be server components, server-only imports (`server-only` packages, database clients, `fs`) referenced in client files, and large client subtrees that inflate the bundle unnecessarily. Output includes a boundary map with optimization suggestions.

- **Input**: `path` (optional — directory to scan, auto-detects `app` or `src`), `entry` (optional — trace from a specific file)

#### `analyze_error_boundaries` (new in v2)
Analyzes React/Next.js projects for error boundary coverage. Detects class-based error boundaries (`getDerivedStateFromError`/`componentDidCatch`) and library wrappers (`react-error-boundary`, Sentry, etc.). Identifies which component subtrees are protected, finds missing `error.tsx` files in Next.js App Router route segments, and flags issues: missing fallback UI, missing reset/retry mechanisms, overly broad root-level boundaries, and async components without protection.

- **Input**: `project_path` (required), `entry` (optional), `include_library_boundaries` (default true)

---

## Architecture

### File Tree (key modules)

```
plugins/goodvibes/tools/
  definitions/frontend-engine/          # Tool schemas (14 YAML files)
    analyze-client-boundary.yaml
    analyze-error-boundaries.yaml
    analyze-event-flow.yaml
    analyze-layout-hierarchy.yaml
    analyze-render-triggers.yaml
    analyze-responsive-breakpoints.yaml
    analyze-stacking-context.yaml
    analyze-tailwind-conflicts.yaml
    audit-hook-dependencies.yaml
    diagnose-overflow.yaml
    get-accessibility-tree.yaml
    get-react-component-tree.yaml
    get-sizing-strategy.yaml
    trace-component-state.yaml

  implementations/frontend-engine/src/
    index.ts                            # Entry point — routes calls to handlers
    config.ts                           # Engine configuration
    logging.ts                          # Structured logging
    schemas/index.ts                    # Zod schemas for all tool inputs

    handlers/
      index.ts                          # Tool dispatch barrel — routes calls to handlers
      react.ts                          # Component tree builder (get_react_component_tree)
      jsx-class-utils.ts                # Shared: class extraction from JSX attributes
      response-utils.ts                 # Shared: response formatting

      trace-component-state.ts          # trace_component_state entry
      analyze-render-triggers.ts        # analyze_render_triggers entry
      analyze-stacking-context.ts       # analyze_stacking_context entry
      analyze-tailwind-conflicts.ts     # analyze_tailwind_conflicts entry
      analyze-tailwind-conflicts-core.ts        # Conflict detection logic
      analyze-tailwind-conflicts-analyzers.ts   # Per-class-type analyzers
      analyze-tailwind-conflicts-utils.ts       # Utility helpers
      analyze-responsive-breakpoints.ts # analyze_responsive_breakpoints entry
      analyze-layout-hierarchy.ts       # analyze_layout_hierarchy entry
      analyze-layout-hierarchy-core.ts          # Layout tree construction
      analyze-layout-hierarchy-analyzers.ts     # Layout issue detectors
      analyze-layout-hierarchy-utils.ts         # Utility helpers
      get-sizing-strategy.ts            # get_sizing_strategy entry
      get-sizing-strategy-core.ts               # Sizing strategy resolution
      get-sizing-strategy-analyzers.ts          # Constraint analyzers
      get-sizing-strategy-utils.ts              # Utility helpers
      diagnose-overflow.ts              # diagnose_overflow entry
      analyze-event-flow.ts             # analyze_event_flow entry
      event-flow-core.ts                        # Event propagation simulation
      event-flow-analyzers.ts                   # Handler pattern analyzers
      event-flow-utils.ts                       # Utility helpers
      get-accessibility-tree.ts         # get_accessibility_tree entry
      accessibility-tree-core.ts                # Accessibility tree builder
      accessibility-tree-analyzers.ts           # WCAG issue detectors
      accessibility-tree-utils.ts               # Utility helpers
      audit-hook-dependencies.ts        # audit_hook_dependencies entry
      analyze-client-boundary.ts        # analyze_client_boundary entry
      analyze-error-boundaries.ts       # analyze_error_boundaries entry

      component-state/                  # trace_component_state implementation
        component-detector.ts
        hook-analyzer.ts
        issue-detector.ts
        jsx-analyzer.ts
        props-analyzer.ts
        types.ts
        utils.ts

      render-triggers/                  # analyze_render_triggers implementation
        memoization-detector.ts
        suggestion-generator.ts
        trigger-analyzers.ts
        types.ts
        utils.ts

      stacking-context/                 # analyze_stacking_context implementation
        context-rules.ts
        issue-detector.ts
        jsx-analyzer.ts
        portal-detector.ts
        tree-builder.ts
        types.ts
        utils.ts

      responsive-breakpoints/           # analyze_responsive_breakpoints implementation
        breakpoint-resolver.ts          # NEW in v2: config auto-detection + rem/em support
        class-parser.ts
        constants.ts
        issue-detector.ts
        jsx-extractor.ts
        types.ts
        utils.ts

      overflow-diagnosis/               # diagnose_overflow implementation
        constraint-builder.ts
        fix-generator.ts
        pattern-detector.ts
        types.ts
        utils.ts

      hook-dependencies/                # audit_hook_dependencies implementation (new in v2)
        hook-extractor.ts
        issue-detector.ts
        stability-analyzer.ts
        types.ts

      client-boundary/                  # analyze_client_boundary implementation (new in v2)
        graph-builder.ts
        issue-detector.ts
        scanner.ts
        types.ts

      error-boundaries/                 # analyze_error_boundaries implementation (new in v2)
        coverage-analyzer.ts
        issue-detector.ts
        scanner.ts
        types.ts
```

### Shared Modules

#### `jsx-class-utils.ts`
Extracted in v2 to eliminate duplication across five consumers. Provides two exported functions:

- `extractClassesFromAttribute(attr)` — Extracts Tailwind class strings from a JSX `className` attribute. Handles string literals, template literals, `cn`/`clsx`/`classNames` string arguments, ternary expressions, logical AND patterns (`isActive && 'bg-blue-500'`), `clsx`/`cn` object syntax (`{ 'bg-blue-500': isActive }`), and array syntax.
- `extractClassesFromNode(node, out)` — Walks a TypeScript AST node and collects all class strings into the provided output array.

**Consumers**: `tailwind-conflicts-core.ts`, `stacking-context/jsx-analyzer.ts`, `layout-hierarchy-core.ts`, `sizing-strategy-core.ts`, `responsive-breakpoints/jsx-extractor.ts`

#### `breakpoint-resolver.ts`
Added in v2. Resolves the effective set of Tailwind breakpoints for a project:

1. If explicit `breakpoints` parameter is provided, merge with defaults (custom values override, new keys are added)
2. Otherwise, search for `tailwind.config.js`/`.ts`/`.mjs`/`.cjs` in the project root
3. If found, parse `theme.screens` and `theme.extend.screens` values (handles `px`, `rem`, and `em` units)
4. Fall back to Tailwind default breakpoints (`sm: 640px`, `md: 768px`, `lg: 1024px`, `xl: 1280px`, `2xl: 1536px`)

Breakpoints are always sorted by pixel size before use.

---

## v2 Changes Summary

### Correctness
- **React-only scope enforced**: All tool schemas, handler code, and documentation now correctly state React (.tsx, .jsx, .ts, .js) only. Vue SFC and Svelte template support was never implemented in the TypeScript Compiler API-based analysis and has been removed from all descriptions and extension allowlists.

### Improvements to Existing Tools

| Tool | v2 Change |
|------|-----------|
| `get_react_component_tree` | Detects `memo`, `forwardRef`, `lazy`, and generic HOC wrapping; adds `wrappers` and `lazy` fields to output |
| `analyze_tailwind_conflicts` | Dynamic class extraction via shared `jsx-class-utils`: logical AND, clsx object syntax, array syntax |
| `analyze_responsive_breakpoints` | Custom breakpoint support via `breakpoint-resolver.ts`; auto-detects tailwind config; `breakpoints` parameter added |
| All Tailwind class tools | Shared `jsx-class-utils.ts` eliminates duplicate extraction logic across 5 handlers |

### New Tools

| Tool | What It Does |
|------|--------------|
| `analyze_client_boundary` | Maps Next.js App Router server/client boundary; finds misclassified components and bundle bloat |
| `audit_hook_dependencies` | Detects stale closures, missing/unnecessary deps, unstable references, and anti-patterns in hook dep arrays |
| `analyze_error_boundaries` | Maps error boundary coverage; finds unprotected subtrees and missing `error.tsx` in route segments |

---

## Limitations

- **Static analysis only** — No runtime behavior, no actual rendering, no DOM access. Results reflect what the code says, not what the browser computes.
- **React only** — Vue SFCs and Svelte templates cannot be parsed with the TypeScript Compiler API. Passing `.vue` or `.svelte` files will produce incorrect or empty results.
- **No bundler awareness** — Dynamic imports, code splitting, and runtime module resolution are not followed. Import graph analysis uses static import statements only.
- **Class strings in variables** — Tailwind classes assembled through complex runtime logic (string concatenation, external utility functions, CSS Modules) may not be fully captured. The `jsx-class-utils` extractor handles the most common patterns but cannot cover all dynamic construction approaches.
- **Custom hooks** — `audit_hook_dependencies` analyzes `useEffect`/`useMemo`/`useCallback`/`useLayoutEffect`/`useInsertionEffect` directly. Custom hooks that wrap these are not recursively analyzed.
- **Monorepo paths** — Import resolution in monorepo setups with `paths` aliases requires the `tsconfig.json` to be discoverable from the analyzed file's directory.
