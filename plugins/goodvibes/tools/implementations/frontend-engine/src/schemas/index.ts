/**
 * Frontend analysis tool schemas - React, responsive, layout, accessibility
 */

export const FRONTEND_SCHEMAS = [
  {
    name: 'get_react_component_tree',
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
    name: 'analyze_stacking_context',
    description: 'Analyze z-index and stacking contexts in React/Vue/Svelte components. Detects which CSS properties create new stacking contexts (position+z-index, transform, opacity, filter, isolation, etc.), builds a hierarchical stacking tree, identifies potential z-index conflicts, and finds portal destinations. Essential for debugging "why isn\'t my z-index working" issues.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'File path to analyze (relative to project root or absolute). Supports .tsx, .jsx, .vue, .svelte' },
        include_portals: { type: 'boolean', description: 'Look for portal destinations (createPortal, Teleport, etc.)', default: true },
      },
      required: ['file'],
    },
  },
  {
    name: 'analyze_responsive_breakpoints',
    description: 'Analyze responsive Tailwind classes across breakpoints. Detects mobile-first patterns, tracks property changes across breakpoints (sm, md, lg, xl, 2xl), identifies breakpoint coverage gaps, and flags potential responsive design issues like desktop-first patterns or missing base styles.',
    inputSchema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          description: 'File path to analyze (supports .tsx, .jsx, .vue, .svelte)',
        },
        element: {
          type: 'string',
          description: 'Optional: specific element to analyze (e.g., "div" or "Button#3"). If not provided, analyzes all elements.',
        },
      },
      required: ['file'],
    },
  },
  {
    name: 'trace_component_state',
    description: 'Trace React state and props through component trees. Analyzes useState, useReducer, useRef, useContext, and effect hooks. Detects prop drilling, callback instability, missing memoization, and other common React anti-patterns. Returns detailed state flow analysis including which state is used in JSX and passed to children.',
    inputSchema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          description: 'File path to analyze (relative to project root or absolute). Must be a React component file (.tsx, .jsx)',
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
    name: 'analyze_render_triggers',
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
    name: 'analyze_layout_hierarchy',
    description: 'Analyze the CSS layout hierarchy of React/Vue/Svelte components. Parses JSX/TSX files to build a layout tree with sizing constraints, display types (flex/grid/block), flex/grid properties, overflow handling, and positioning. Supports comprehensive Tailwind CSS class parsing. Detects potential layout issues like fixed height containers with auto-height children, nested flex without sizing, percentage height without parent height, etc.',
    inputSchema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          description: 'Component file path to analyze (relative to project root or absolute). Supports .tsx, .jsx, .vue, .svelte files.',
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
    name: 'diagnose_overflow',
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
    name: 'get_accessibility_tree',
    description: 'Build an accessibility tree and detect WCAG issues in React/Vue/Svelte components. Analyzes semantic HTML roles, focus order, keyboard interactions, and ARIA patterns. Detects issues like missing alt text (1.1.1), unlabeled form inputs (1.3.1), buttons/links without accessible names (4.1.2), click handlers on non-interactive elements, missing focus indicators (2.4.7), and invalid ARIA patterns. Returns a hierarchical accessibility tree, focus order sequence, issues with WCAG criteria references, and optimization suggestions.',
    inputSchema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          description: 'Component file path to analyze (relative to project root or absolute). Supports .tsx, .jsx, .vue, .svelte files.',
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
    name: 'get_sizing_strategy',
    description: 'Analyze how a specific element\'s size is determined. Examines Tailwind classes or CSS to identify width/height strategies (fixed, percentage, viewport, content-based, flex-controlled, grid-controlled), min/max constraints, flex behavior (grow, shrink, basis), grid placement, overflow settings, and positioning context. Walks the ancestor chain to find constraints that affect the target element. Returns a human-readable summary explaining how the element\'s dimensions are computed.',
    inputSchema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          description: 'Component file path to analyze (relative to project root or absolute). Supports .tsx, .jsx, .vue, .svelte files.',
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
    name: 'analyze_event_flow',
    description: 'Analyze event handling and propagation in React/Vue/Svelte components. Detects all event handlers (onClick, onChange, onSubmit, etc.), simulates event bubbling from leaf to root, identifies issues like nested clickable elements that may double-fire, click handlers on non-interactive elements without keyboard alternatives, and form submits without preventDefault. Also detects event delegation patterns (e.target.closest, e.target.matches checks). Essential for debugging "why is my click firing twice" and accessibility audits.',
    inputSchema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          description: 'Component file path to analyze (relative to project root or absolute). Supports .tsx, .jsx, .vue, .svelte files.',
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
    name: 'analyze_tailwind_conflicts',
    description: 'Detect conflicting and redundant Tailwind CSS classes in React/Vue/Svelte components. Identifies three types of issues: (1) Override conflicts where later classes override earlier ones (e.g., "p-2 p-4"), (2) Redundant classes from shorthand/longhand combinations (e.g., "p-2 px-4" where p-2\'s x-padding is overridden), (3) Contradiction conflicts with mutually exclusive classes (e.g., "hidden flex"). Also detects size-X conflicts with explicit w-/h- classes, z-index without position, and provides optimization suggestions like using size-X instead of w-X h-X when equal.',
    inputSchema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          description: 'File path to analyze (relative to project root or absolute). Supports .tsx, .jsx, .vue, .svelte files.',
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
];

export const allSchemas = FRONTEND_SCHEMAS;
