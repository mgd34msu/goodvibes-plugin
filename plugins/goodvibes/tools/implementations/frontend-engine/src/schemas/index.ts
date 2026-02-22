/**
 * Frontend analysis tool schemas - React, responsive, layout, accessibility
 */

export const FRONTEND_SCHEMAS = [
  {
    name: 'frontend_component_tree',
    description: 'Parse JSX/TSX files and build a component hierarchy tree. Uses static AST analysis to find component definitions and usages, extract props, and build parent-child relationships. Useful for understanding React component architecture.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Specific component file to analyze (relative to project root)' },
        path: { type: 'string', description: 'Directory to analyze for components', default: 'src' },
        root_component: { type: 'string', description: 'Start analysis from a specific component name' },
        depth: { type: 'integer', description: 'Maximum depth to traverse in component tree', default: 5 },
      },
    },
  },
  {
    name: 'frontend_stacking_context',
    description: 'Analyze z-index and stacking contexts in React components. Detects which CSS properties create new stacking contexts (position+z-index, transform, opacity, filter, isolation, etc.), builds a hierarchical stacking tree, identifies potential z-index conflicts, and finds portal destinations. Essential for debugging "why isn\'t my z-index working" issues.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'File path to analyze (relative to project root or absolute). Supports .tsx, .jsx, .ts, .js' },
        include_portals: { type: 'boolean', description: 'Look for portal destinations (createPortal, Radix Portal, etc.)', default: true },
      },
      required: ['file'],
    },
  },
  {
    name: 'frontend_responsive_breakpoints',
    description: 'Analyze responsive Tailwind classes across breakpoints. Detects mobile-first patterns, tracks property changes across breakpoints (sm, md, lg, xl, 2xl), identifies breakpoint coverage gaps, and flags potential responsive design issues like desktop-first patterns or missing base styles. Supports custom breakpoints via explicit parameter or automatic tailwind.config.js/ts detection.',
    inputSchema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          description: 'File path to analyze (supports .tsx, .jsx, .ts, .js)',
        },
        element: {
          type: 'string',
          description: 'Optional: specific element to analyze (e.g., "div" or "Button#3"). If not provided, analyzes all elements.',
        },
        breakpoints: {
          type: 'object',
          description: 'Optional: custom breakpoint overrides as a map of name to min-width size (e.g., { xs: "480px", "3xl": "1920px" }). Overrides matching defaults; new keys are added. Tailwind config is auto-detected when this is omitted.',
          additionalProperties: { type: 'string' },
        },
      },
      required: ['file'],
    },
  },
  {
    name: 'frontend_component_state',
    description: 'Trace React state and props through component trees. Analyzes useState, useReducer, useRef, useContext, and effect hooks. Detects prop drilling, callback instability, missing memoization, and other common React anti-patterns. Returns detailed state flow analysis including which state is used in JSX and passed to children.',
    inputSchema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          description: 'File path to analyze (relative to project root or absolute). Must be a React component file (.tsx, .jsx)',
        },
        component: {
          type: 'string',
          description: 'Specific component name to analyze if file contains multiple components',
        },
        include_children: {
          type: 'boolean',
          description: 'Analyze imported child components (default: false)',
          default: false,
        },
        depth: {
          type: 'integer',
          description: 'How deep to trace child components when include_children is true (default: 2)',
          default: 2,
        },
      },
      required: ['file'],
    },
  },
  {
    name: 'frontend_render_triggers',
    description: 'Analyze what causes a React component to re-render. Identifies memoization status (React.memo, PureComponent, shouldComponentUpdate), inline definitions creating unstable references (objects, arrays, functions, JSX), expensive computations not wrapped in useMemo, context subscriptions and their granularity, and provides prioritized optimization suggestions.',
    inputSchema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          description: 'Path to the React component file to analyze (relative to project root or absolute)',
        },
        include_children: {
          type: 'boolean',
          description: 'Analyze child component memoization and prop stability (default: false)',
          default: false,
        },
      },
      required: ['file'],
    },
  },
  {
    name: 'frontend_layout_hierarchy',
    description: 'Analyze the CSS layout hierarchy of React components. Parses JSX/TSX files to build a layout tree with sizing constraints, display types (flex/grid/block), flex/grid properties, overflow handling, and positioning. Supports comprehensive Tailwind CSS class parsing. Detects potential layout issues like fixed height containers with auto-height children, nested flex without sizing, percentage height without parent height, etc.',
    inputSchema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          description: 'Component file path to analyze (relative to project root or absolute). Supports .tsx, .jsx, .ts, .js files.',
        },
        selector: {
          type: 'string',
          description: 'Optional: Focus on specific element by class (.class-name) or id (#element-id). If omitted, analyzes entire component tree.',
        },
      },
      required: ['file'],
    },
  },
  {
    name: 'frontend_overflow',
    description: 'Diagnose CSS overflow issues and recommend fixes. Analyzes layout hierarchy to identify overflow-prone patterns such as fixed-height containers with auto-height children, flex containers without overflow handling, nested percentage heights, absolute positioning without containment, and missing min-h-0 in nested flex. Returns actionable fix options with Tailwind CSS classes and trade-off explanations.',
    inputSchema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          description: 'Component file path to analyze (relative to project root or absolute). Supports .tsx and .jsx files.',
        },
        problem_description: {
          type: 'string',
          description: 'Optional: Description of the overflow problem (e.g., "content overflowing container", "scroll not working"). Helps contextualize the diagnosis.',
        },
        element_hint: {
          type: 'string',
          description: 'Optional: Class name or selector to focus analysis on. Builds a constraint chain showing how layout constraints propagate to this element.',
        },
      },
      required: ['file'],
    },
  },
  {
    name: 'frontend_accessibility_tree',
    description: 'Build an accessibility tree and detect WCAG issues in React components. Analyzes semantic HTML roles, focus order, keyboard interactions, and ARIA patterns. Detects issues like missing alt text (1.1.1), unlabeled form inputs (1.3.1), buttons/links without accessible names (4.1.2), click handlers on non-interactive elements, missing focus indicators (2.4.7), and invalid ARIA patterns. Returns a hierarchical accessibility tree, focus order sequence, issues with WCAG criteria references, and optimization suggestions.',
    inputSchema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          description: 'Component file path to analyze (relative to project root or absolute). Supports .tsx, .jsx, .ts, .js files.',
        },
        element: {
          type: 'string',
          description: 'Optional: Focus on specific element by tag name or component name. If omitted, analyzes entire component tree.',
        },
        check_patterns: {
          type: 'boolean',
          description: 'Validate ARIA patterns for roles like dialog, combobox, tabs, etc. (default: true)',
          default: true,
        },
      },
      required: ['file'],
    },
  },
  {
    name: 'frontend_sizing_strategy',
    description: 'Analyze how a specific element\'s size is determined. Examines Tailwind classes or CSS to identify width/height strategies (fixed, percentage, viewport, content-based, flex-controlled, grid-controlled), min/max constraints, flex behavior (grow, shrink, basis), grid placement, overflow settings, and positioning context. Walks the ancestor chain to find constraints that affect the target element. Returns a human-readable summary explaining how the element\'s dimensions are computed.',
    inputSchema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          description: 'Component file path to analyze (relative to project root or absolute). Supports .tsx, .jsx, .ts, .js files.',
        },
        selector: {
          type: 'string',
          description: 'Element selector: class (.className), id (#id), or tag name. Finds the first matching element in the component tree.',
        },
      },
      required: ['file', 'selector'],
    },
  },
  {
    name: 'frontend_event_flow',
    description: 'Analyze event handling and propagation in React components. Detects all event handlers (onClick, onChange, onSubmit, etc.), simulates event bubbling from leaf to root, identifies issues like nested clickable elements that may double-fire, click handlers on non-interactive elements without keyboard alternatives, and form submits without preventDefault. Also detects event delegation patterns (e.target.closest, e.target.matches checks). Essential for debugging "why is my click firing twice" and accessibility audits.',
    inputSchema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          description: 'Component file path to analyze (relative to project root or absolute). Supports .tsx, .jsx, .ts, .js files.',
        },
        event: {
          type: 'string',
          description: 'Optional: Filter to specific event type (e.g., "click", "change", "submit"). If omitted, analyzes all events.',
        },
      },
      required: ['file'],
    },
  },
  {
    name: 'frontend_hook_dependencies',
    description: 'Analyzes React hook dependency arrays for stale closures, missing/unnecessary dependencies, unstable references, and anti-patterns like derived state in effects. Covers useEffect, useMemo, useCallback, useLayoutEffect, useInsertionEffect. Detects: stale closures (empty deps + state refs), missing deps (body refs not in array), unnecessary deps (array entries not referenced), unstable deps (inline objects/arrays/functions, .map()/.filter() results, Object.keys/values/entries), derived state anti-pattern, and missing cleanup for subscriptions/timers.',
    inputSchema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          description: 'React component file path (.tsx, .jsx, .ts, .js)',
        },
        hook: {
          type: 'string',
          description: 'Analyze a specific hook by variable name or line number (e.g., "myEffect" or "42")',
        },
        include_stable_analysis: {
          type: 'boolean',
          description: 'Include stability classification for all deps, including stable ones (default: true)',
          default: true,
        },
      },
      required: ['file'],
    },
  },
  {
    name: 'frontend_tailwind_conflicts',
    description: 'Detect conflicting and redundant Tailwind CSS classes in React components. Identifies three types of issues: (1) Override conflicts where later classes override earlier ones (e.g., "p-2 p-4"), (2) Redundant classes from shorthand/longhand combinations (e.g., "p-2 px-4" where p-2\'s x-padding is overridden), (3) Contradiction conflicts with mutually exclusive classes (e.g., "hidden flex"). Also detects size-X conflicts with explicit w-/h- classes, z-index without position, and provides optimization suggestions like using size-X instead of w-X h-X when equal.',
    inputSchema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          description: 'File path to analyze (relative to project root or absolute). Supports .tsx, .jsx, .ts, .js files.',
        },
        include_arbitrary: {
          type: 'boolean',
          description: 'Check arbitrary values like [100px] for conflicts (default: true)',
          default: true,
        },
      },
      required: ['file'],
    },
  },
  {
    name: 'frontend_client_boundary',
    description:
      'Analyzes Next.js App Router "use client" and "use server" boundaries to find misclassified components, unnecessary client components, and boundary optimization opportunities. Scans files for directives, builds an import graph, classifies each file as server/client/client-inherited/ambiguous, and detects issues like missing directives, unnecessary client usage, server-only imports in client files, and large client subtrees that bloat the bundle.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description:
            'Directory to scan (default: "app" or "src" auto-detected from project root)',
        },
        entry: {
          type: 'string',
          description: 'Specific entry file to trace from instead of scanning a directory',
        },
      },
    },
  },
  {
    name: 'frontend_error_boundaries',
    description:
      'Analyzes React/Next.js projects for error boundary coverage. Detects class-based error boundaries (getDerivedStateFromError / componentDidCatch) and library wrappers (react-error-boundary, Sentry, etc.), analyzes which component subtrees are protected, identifies missing error.tsx files in Next.js App Router route segments, and flags issues like missing fallback UI, missing reset/retry mechanisms, overly broad boundaries, and async components without protection.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: {
          type: 'string',
          description: 'Root directory of the React/Next.js project to analyze',
        },
        entry: {
          type: 'string',
          description: 'Optional entry file to start analysis from instead of scanning the entire project',
        },
        include_library_boundaries: {
          type: 'boolean',
          description: 'Include detection of library error boundaries (react-error-boundary, Sentry, etc.) (default: true)',
          default: true,
        },
      },
      required: ['project_path'],
    },
  },
];

export const allSchemas = FRONTEND_SCHEMAS;
