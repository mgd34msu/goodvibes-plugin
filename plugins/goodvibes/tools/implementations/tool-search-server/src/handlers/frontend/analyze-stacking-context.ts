/**
 * Analyze Stacking Context Handler
 *
 * Analyzes z-index and stacking contexts in React/Vue/Svelte components
 * using Tailwind CSS class analysis. Detects potential z-index conflicts,
 * context isolation issues, and portal destinations.
 *
 * @module handlers/frontend/analyze-stacking-context
 */

import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';

// =============================================================================
// Types
// =============================================================================

/**
 * Arguments for the analyze_stacking_context tool
 */
export interface AnalyzeStackingContextArgs {
  /** File path to analyze (relative to project root or absolute) */
  file: string;
  /** Look for portal destinations (default true) */
  include_portals?: boolean;
}

/**
 * Represents a node in the stacking context tree
 */
interface StackingContext {
  /** Element identifier (tag name or component name with line) */
  element: string;
  /** z-index value or "auto" */
  z_index: number | 'auto';
  /** Whether this element creates a new stacking context */
  creates_context: boolean;
  /** Reason why it creates a stacking context */
  context_reason?: string;
  /** Child elements in the stacking tree */
  children: StackingContext[];
}

/**
 * Information about an element that creates a stacking context
 */
interface ContextCreator {
  /** Element identifier */
  element: string;
  /** Reason for context creation */
  reason: string;
  /** z-index value */
  z_index: number | 'auto';
  /** CSS classes applied to the element */
  classes: string[];
}

/**
 * Information about a z-index value in the document
 */
interface ZIndexInfo {
  /** Element identifier */
  element: string;
  /** The z-index value */
  z_index: number;
  /** The parent stacking context */
  context_parent: string;
}

/**
 * A detected potential issue with stacking
 */
interface StackingIssue {
  /** Issue type/title */
  issue: string;
  /** Elements involved */
  elements: string[];
  /** Detailed explanation */
  explanation: string;
  /** Suggested fix */
  fix: string;
}

/**
 * Portal destination information
 */
interface PortalInfo {
  /** Component name containing the portal */
  component: string;
  /** Portal destination (DOM element ID or description) */
  destination: string;
  /** z-index if specified */
  z_index?: number;
}

/**
 * Result of stacking context analysis
 */
interface AnalyzeStackingContextResult {
  /** File that was analyzed */
  file: string;
  /** Hierarchical stacking context tree */
  stacking_tree: StackingContext;
  /** List of elements that create stacking contexts */
  context_creators: ContextCreator[];
  /** List of z-index values found */
  z_index_values: ZIndexInfo[];
  /** Potential issues detected */
  potential_issues: StackingIssue[];
  /** Portal destinations if include_portals is true */
  portals?: PortalInfo[];
}

/**
 * Tool response format
 */
interface ToolResponse {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

/**
 * Internal element representation during analysis
 */
interface ElementInfo {
  /** Element identifier */
  element: string;
  /** Line number in source */
  line: number;
  /** CSS classes */
  classes: string[];
  /** z-index value */
  z_index: number | 'auto';
  /** Whether it creates a stacking context */
  creates_context: boolean;
  /** Reason for context creation */
  context_reason?: string;
  /** Parent element index */
  parent_index: number | null;
  /** Whether this is a component (uppercase) vs HTML element */
  is_component: boolean;
}

// =============================================================================
// Response Helpers
// =============================================================================

function createSuccessResponse<T>(data: T): ToolResponse {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  };
}

function createErrorResponse(message: string, context?: Record<string, unknown>): ToolResponse {
  return {
    content: [{ type: 'text', text: JSON.stringify({ error: message, ...context }, null, 2) }],
    isError: true,
  };
}

// =============================================================================
// Stacking Context Detection Rules
// =============================================================================

/**
 * Rules for detecting stacking context creation.
 * Each rule takes an array of CSS classes and returns whether
 * the combination creates a new stacking context.
 */
const CONTEXT_CREATORS: Record<string, (classes: string[]) => boolean> = {
  /**
   * Position with z-index: relative/absolute/fixed/sticky + z-*
   */
  position_with_z: (classes: string[]) => {
    const hasPosition = classes.some((c) =>
      ['relative', 'absolute', 'fixed', 'sticky'].includes(c)
    );
    const hasZIndex = classes.some((c) => /^-?z-/.test(c));
    return hasPosition && hasZIndex;
  },

  /**
   * Fixed or sticky positioning always creates a stacking context
   */
  fixed_or_sticky: (classes: string[]) =>
    classes.includes('fixed') || classes.includes('sticky'),

  /**
   * Transform property creates a stacking context
   */
  transform: (classes: string[]) =>
    classes.some(
      (c) =>
        c.startsWith('transform') ||
        c.startsWith('rotate') ||
        c.startsWith('scale') ||
        c.startsWith('translate') ||
        c.startsWith('skew') ||
        c === '-translate-x-1/2' ||
        c === '-translate-y-1/2' ||
        /^-?(rotate|scale|translate|skew)-/.test(c)
    ),

  /**
   * Opacity less than 1 creates a stacking context
   * Matches opacity-0 through opacity-95 (not opacity-100)
   */
  opacity: (classes: string[]) =>
    classes.some((c) => {
      const match = c.match(/^opacity-(\d+)$/);
      if (!match) return false;
      const value = parseInt(match[1], 10);
      return value < 100;
    }),

  /**
   * Filter or backdrop-filter creates a stacking context
   */
  filter: (classes: string[]) =>
    classes.some(
      (c) =>
        c === 'filter' ||
        c.startsWith('blur-') ||
        c.startsWith('brightness-') ||
        c.startsWith('contrast-') ||
        c.startsWith('grayscale') ||
        c.startsWith('hue-rotate-') ||
        c.startsWith('invert') ||
        c.startsWith('saturate-') ||
        c.startsWith('sepia') ||
        c.startsWith('drop-shadow-') ||
        c.startsWith('backdrop-')
    ),

  /**
   * Isolation: isolate creates a stacking context
   */
  isolation: (classes: string[]) => classes.includes('isolate'),

  /**
   * will-change with transform or opacity creates a stacking context
   */
  will_change: (classes: string[]) =>
    classes.some((c) => c.startsWith('will-change-')),

  /**
   * CSS contain property with layout, paint, or strict
   */
  contain: (classes: string[]) => classes.some((c) => c.startsWith('contain-')),

  /**
   * Mix-blend-mode other than normal creates a stacking context
   */
  mix_blend: (classes: string[]) =>
    classes.some((c) => c.startsWith('mix-blend-') && c !== 'mix-blend-normal'),

  /**
   * Flex/Grid child with z-index creates a stacking context
   * (technically the parent needs to be flex/grid, but we detect the z-index usage)
   */
  flex_grid_z: (classes: string[]) => {
    const hasZIndex = classes.some((c) => /^-?z-/.test(c));
    // If it has z-index but no explicit position, could be in flex/grid context
    const hasPosition = classes.some((c) =>
      ['relative', 'absolute', 'fixed', 'sticky'].includes(c)
    );
    return hasZIndex && !hasPosition;
  },

  /**
   * Perspective creates a stacking context
   */
  perspective: (classes: string[]) =>
    classes.some((c) => c.startsWith('perspective-')),

  /**
   * Clip-path creates a stacking context
   */
  clip_path: (classes: string[]) =>
    classes.some((c) => c.startsWith('clip-') && c !== 'clip-content'),

  /**
   * Mask creates a stacking context
   */
  mask: (classes: string[]) =>
    classes.some((c) => c.startsWith('mask-') || c === 'mask'),
};

/**
 * Check if a set of classes creates a new stacking context
 * @param classes - Array of CSS class names
 * @returns Object with creates flag and optional reason
 */
function createsStackingContext(classes: string[]): { creates: boolean; reason?: string } {
  for (const [name, check] of Object.entries(CONTEXT_CREATORS)) {
    if (check(classes)) {
      return { creates: true, reason: name.replace(/_/g, ' ') };
    }
  }
  return { creates: false };
}

// =============================================================================
// Z-Index Extraction
// =============================================================================

/**
 * Standard Tailwind z-index values
 */
const TAILWIND_Z_INDEX_MAP: Record<string, number> = {
  'z-0': 0,
  'z-10': 10,
  'z-20': 20,
  'z-30': 30,
  'z-40': 40,
  'z-50': 50,
  'z-auto': NaN, // Special marker for "auto"
};

/**
 * Extract z-index value from CSS classes
 * @param classes - Array of CSS class names
 * @returns z-index value or "auto"
 */
function extractZIndex(classes: string[]): number | 'auto' {
  // Look for z-* classes
  const zClass = classes.find((c) => /^-?z-/.test(c));
  if (!zClass) return 'auto';

  // Check for z-auto
  if (zClass === 'z-auto') return 'auto';

  // Check for standard Tailwind values
  if (TAILWIND_Z_INDEX_MAP[zClass] !== undefined) {
    return TAILWIND_Z_INDEX_MAP[zClass];
  }

  // Handle negative z-index
  const negativeMatch = zClass.match(/^-z-(\d+)$/);
  if (negativeMatch) {
    return -parseInt(negativeMatch[1], 10);
  }

  // Handle arbitrary values: z-[100], z-[9999]
  const arbitraryMatch = zClass.match(/^-?z-\[(-?\d+)\]$/);
  if (arbitraryMatch) {
    return parseInt(arbitraryMatch[1], 10);
  }

  // Handle numeric z-index: z-100, z-999
  const numericMatch = zClass.match(/^z-(\d+)$/);
  if (numericMatch) {
    return parseInt(numericMatch[1], 10);
  }

  return 'auto';
}

// =============================================================================
// Portal Detection
// =============================================================================

/**
 * Detect React/Vue/Svelte portal usage in source code
 * @param content - Source file content
 * @param sourceFile - TypeScript source file
 * @returns Array of detected portals
 */
function detectPortals(content: string, sourceFile: ts.SourceFile): PortalInfo[] {
  const portals: PortalInfo[] = [];

  // React createPortal pattern
  const reactPortalRegex =
    /createPortal\s*\(\s*[^,]+,\s*document\.getElementById\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  let match: RegExpExecArray | null;

  while ((match = reactPortalRegex.exec(content)) !== null) {
    portals.push({
      component: findContainingComponent(match.index, sourceFile) || 'Unknown',
      destination: match[1],
    });
  }

  // React Portal component pattern (from react-dom)
  const reactPortalComponentRegex =
    /<Portal[^>]*container\s*=\s*\{[^}]*getElementById\s*\(\s*['"]([^'"]+)['"]/g;
  while ((match = reactPortalComponentRegex.exec(content)) !== null) {
    portals.push({
      component: findContainingComponent(match.index, sourceFile) || 'Unknown',
      destination: match[1],
    });
  }

  // Radix UI / Headless UI Portal pattern
  const radixPortalRegex = /<(Portal|DialogPortal|PopoverPortal)[^>]*>/g;
  while ((match = radixPortalRegex.exec(content)) !== null) {
    const containerMatch = content
      .slice(match.index, match.index + 200)
      .match(/container\s*=\s*\{[^}]*getElementById\s*\(\s*['"]([^'"]+)['"]/);

    portals.push({
      component: findContainingComponent(match.index, sourceFile) || 'Unknown',
      destination: containerMatch ? containerMatch[1] : 'document.body (default)',
    });
  }

  // Vue Teleport pattern
  const vueTeleportRegex = /<Teleport[^>]*to\s*=\s*['"]([^'"]+)['"]/g;
  while ((match = vueTeleportRegex.exec(content)) !== null) {
    portals.push({
      component: findContainingComponent(match.index, sourceFile) || 'Unknown',
      destination: match[1],
    });
  }

  // Svelte portal pattern (various libraries)
  const sveltePortalRegex = /<Portal[^>]*target\s*=\s*['"]([^'"]+)['"]/g;
  while ((match = sveltePortalRegex.exec(content)) !== null) {
    portals.push({
      component: findContainingComponent(match.index, sourceFile) || 'Unknown',
      destination: match[1],
    });
  }

  // Next.js Portal pattern
  const nextPortalRegex =
    /next\/dynamic[^}]*Portal|@radix-ui\/react-portal|@headlessui\/react/g;
  if (nextPortalRegex.test(content)) {
    // Check for usage patterns
    const modalRegex = /<(Modal|Dialog|Drawer|Sheet|Popover|Dropdown)[^>]*>/g;
    while ((match = modalRegex.exec(content)) !== null) {
      const existingPortal = portals.find(
        (p) =>
          p.component === findContainingComponent(match!.index, sourceFile)
      );
      if (!existingPortal) {
        portals.push({
          component: findContainingComponent(match.index, sourceFile) || 'Unknown',
          destination: 'document.body (inferred from modal/dialog pattern)',
        });
      }
    }
  }

  return portals;
}

/**
 * Find the containing component/function for a source position
 */
function findContainingComponent(position: number, sourceFile: ts.SourceFile): string | null {
  let result: string | null = null;

  function visit(node: ts.Node): void {
    if (node.getStart() <= position && node.getEnd() >= position) {
      // Function declaration
      if (ts.isFunctionDeclaration(node) && node.name) {
        result = node.name.getText(sourceFile);
      }
      // Arrow function in variable declaration
      else if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
        if (
          node.initializer &&
          (ts.isArrowFunction(node.initializer) ||
            ts.isFunctionExpression(node.initializer))
        ) {
          result = node.name.getText(sourceFile);
        }
      }
      // Class component
      else if (ts.isClassDeclaration(node) && node.name) {
        result = node.name.getText(sourceFile);
      }

      ts.forEachChild(node, visit);
    }
  }

  visit(sourceFile);
  return result;
}

// =============================================================================
// AST Analysis
// =============================================================================

/**
 * Extract CSS classes from a JSX className attribute
 */
function extractClassesFromAttribute(
  attr: ts.JsxAttribute,
  sourceFile: ts.SourceFile
): string[] {
  if (!attr.initializer) return [];

  // className="class1 class2"
  if (ts.isStringLiteral(attr.initializer)) {
    return attr.initializer.text.split(/\s+/).filter(Boolean);
  }

  // className={...}
  if (ts.isJsxExpression(attr.initializer) && attr.initializer.expression) {
    const expr = attr.initializer.expression;

    // className={"class1 class2"}
    if (ts.isStringLiteral(expr)) {
      return expr.text.split(/\s+/).filter(Boolean);
    }

    // className={`class1 ${dynamic} class2`}
    if (ts.isTemplateExpression(expr)) {
      const classes: string[] = [];
      // Head
      if (expr.head.text) {
        classes.push(...expr.head.text.split(/\s+/).filter(Boolean));
      }
      // Template spans
      for (const span of expr.templateSpans) {
        if (span.literal.text) {
          classes.push(...span.literal.text.split(/\s+/).filter(Boolean));
        }
      }
      return classes;
    }

    // className={cn("class1", "class2")} or clsx() or classNames()
    if (ts.isCallExpression(expr)) {
      const classes: string[] = [];
      for (const arg of expr.arguments) {
        if (ts.isStringLiteral(arg)) {
          classes.push(...arg.text.split(/\s+/).filter(Boolean));
        }
        // Handle object syntax: { "class-name": condition }
        if (ts.isObjectLiteralExpression(arg)) {
          for (const prop of arg.properties) {
            if (ts.isPropertyAssignment(prop)) {
              if (ts.isStringLiteral(prop.name)) {
                classes.push(...prop.name.text.split(/\s+/).filter(Boolean));
              } else if (ts.isIdentifier(prop.name)) {
                classes.push(prop.name.text);
              }
            }
            if (ts.isShorthandPropertyAssignment(prop)) {
              classes.push(prop.name.text);
            }
          }
        }
      }
      return classes;
    }
  }

  return [];
}

/**
 * Get line number for a position in source file
 */
function getLineNumber(pos: number, sourceFile: ts.SourceFile): number {
  const { line } = sourceFile.getLineAndCharacterOfPosition(pos);
  return line + 1;
}

/**
 * Analyze a JSX file for stacking contexts
 */
function analyzeJsxFile(
  filePath: string,
  content: string,
  sourceFile: ts.SourceFile
): ElementInfo[] {
  const elements: ElementInfo[] = [];
  const elementStack: number[] = []; // Stack of parent indices

  function visit(node: ts.Node): void {
    // JSX Opening Element or Self-Closing Element
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tagName = node.tagName.getText(sourceFile);
      const line = getLineNumber(node.getStart(), sourceFile);
      const isComponent = /^[A-Z]/.test(tagName);

      // Extract classes from className attribute
      let classes: string[] = [];
      for (const attr of node.attributes.properties) {
        if (ts.isJsxAttribute(attr)) {
          const attrName = attr.name.getText(sourceFile);
          if (attrName === 'className' || attrName === 'class') {
            classes = extractClassesFromAttribute(attr, sourceFile);
            break;
          }
        }
      }

      // Check if this creates a stacking context
      const { creates, reason } = createsStackingContext(classes);
      const z_index = extractZIndex(classes);

      const elementInfo: ElementInfo = {
        element: `${tagName}:${line}`,
        line,
        classes,
        z_index,
        creates_context: creates,
        context_reason: reason,
        parent_index: elementStack.length > 0 ? elementStack[elementStack.length - 1] : null,
        is_component: isComponent,
      };

      const currentIndex = elements.length;
      elements.push(elementInfo);

      // If this is an opening element (not self-closing), push to stack
      if (ts.isJsxOpeningElement(node)) {
        elementStack.push(currentIndex);
      }
    }

    // JSX Closing Element - pop from stack
    if (ts.isJsxClosingElement(node)) {
      elementStack.pop();
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return elements;
}

// =============================================================================
// Tree Building
// =============================================================================

/**
 * Build stacking context tree from flat element list
 */
function buildStackingTree(elements: ElementInfo[]): StackingContext {
  // Create a root context
  const root: StackingContext = {
    element: 'root',
    z_index: 'auto',
    creates_context: true,
    context_reason: 'document root',
    children: [],
  };

  // Map from element index to tree node
  const nodeMap = new Map<number, StackingContext>();

  // First pass: create nodes for elements that create contexts or have z-index
  for (let i = 0; i < elements.length; i++) {
    const elem = elements[i];
    const node: StackingContext = {
      element: elem.element,
      z_index: elem.z_index,
      creates_context: elem.creates_context,
      context_reason: elem.context_reason,
      children: [],
    };
    nodeMap.set(i, node);
  }

  // Second pass: build tree structure
  for (let i = 0; i < elements.length; i++) {
    const elem = elements[i];
    const node = nodeMap.get(i)!;

    // Find the parent stacking context
    let parentContextIndex: number | null = null;
    let searchIndex = elem.parent_index;

    while (searchIndex !== null) {
      const parentElem = elements[searchIndex];
      if (parentElem.creates_context) {
        parentContextIndex = searchIndex;
        break;
      }
      searchIndex = parentElem.parent_index;
    }

    if (parentContextIndex !== null) {
      const parentNode = nodeMap.get(parentContextIndex)!;
      parentNode.children.push(node);
    } else {
      // No parent context found, attach to root
      root.children.push(node);
    }
  }

  return root;
}

/**
 * Get the parent stacking context name for an element
 */
function getContextParent(elementIndex: number, elements: ElementInfo[]): string {
  const elem = elements[elementIndex];
  let searchIndex = elem.parent_index;

  while (searchIndex !== null) {
    const parentElem = elements[searchIndex];
    if (parentElem.creates_context) {
      return parentElem.element;
    }
    searchIndex = parentElem.parent_index;
  }

  return 'root';
}

// =============================================================================
// Issue Detection
// =============================================================================

/**
 * Collect all z-index values from tree
 */
function collectZIndexValues(elements: ElementInfo[]): ZIndexInfo[] {
  const zValues: ZIndexInfo[] = [];

  for (let i = 0; i < elements.length; i++) {
    const elem = elements[i];
    if (typeof elem.z_index === 'number') {
      zValues.push({
        element: elem.element,
        z_index: elem.z_index,
        context_parent: getContextParent(i, elements),
      });
    }
  }

  return zValues;
}

/**
 * Detect potential stacking issues
 */
function detectStackingIssues(
  elements: ElementInfo[],
  zIndexValues: ZIndexInfo[]
): StackingIssue[] {
  const issues: StackingIssue[] = [];

  // Issue 1: z-index inflation (too many high z-index values)
  const highZElements = zIndexValues.filter((z) => z.z_index >= 50);
  if (highZElements.length > 3) {
    issues.push({
      issue: 'z-index inflation detected',
      elements: highZElements.map((z) => `${z.element} (z-${z.z_index})`),
      explanation:
        'Multiple elements with z-index >= 50 indicate potential layering confusion. ' +
        'This often leads to an "arms race" where z-index values keep increasing.',
      fix:
        'Restructure components to use fewer z-index values. Consider using ' +
        'CSS isolation ("isolate" class) to create local stacking contexts, ' +
        'or reorganize DOM structure so fewer elements need explicit z-index.',
    });
  }

  // Issue 2: Very high z-index values
  const veryHighZ = zIndexValues.filter((z) => z.z_index >= 9999);
  if (veryHighZ.length > 0) {
    issues.push({
      issue: 'Extremely high z-index values',
      elements: veryHighZ.map((z) => `${z.element} (z-${z.z_index})`),
      explanation:
        'Z-index values like 9999 or higher suggest attempts to "win" the stacking ' +
        'order by brute force. This is often a sign of underlying architecture issues.',
      fix:
        'Investigate why such high values are needed. Often this indicates ' +
        'components fighting for top position when they should be in separate ' +
        'stacking contexts or portal to document.body.',
    });
  }

  // Issue 3: z-index without explicit position
  const zWithoutPosition = elements.filter((elem) => {
    const hasZ = typeof elem.z_index === 'number';
    const hasPosition = elem.classes.some((c) =>
      ['relative', 'absolute', 'fixed', 'sticky'].includes(c)
    );
    // Note: flex/grid children can have z-index without position
    const mightBeFlexChild =
      !hasPosition && elem.creates_context && elem.context_reason === 'flex grid z';
    return hasZ && !hasPosition && !mightBeFlexChild && !elem.creates_context;
  });

  if (zWithoutPosition.length > 0) {
    issues.push({
      issue: 'z-index without positioning context',
      elements: zWithoutPosition.map((e) => e.element),
      explanation:
        'Elements with z-index but no position (relative, absolute, fixed, sticky) ' +
        'may not behave as expected unless they are flex/grid children.',
      fix:
        'Add "relative" class to elements that need z-index to work. ' +
        'Example: className="relative z-10" instead of just "z-10".',
    });
  }

  // Issue 4: Isolated contexts preventing expected layering
  const isolatedContexts = elements.filter(
    (elem) =>
      elem.creates_context &&
      elem.context_reason &&
      ['isolation', 'transform', 'filter', 'opacity'].includes(
        elem.context_reason.replace(/ /g, '_')
      )
  );

  if (isolatedContexts.length > 0) {
    // Check if there are z-index values inside these contexts
    for (const ctx of isolatedContexts) {
      const ctxIndex = elements.indexOf(ctx);
      const childrenWithZ = zIndexValues.filter(
        (z) => z.context_parent === ctx.element
      );

      if (childrenWithZ.some((z) => z.z_index > 10)) {
        issues.push({
          issue: `Stacking context isolation in ${ctx.element}`,
          elements: [ctx.element, ...childrenWithZ.map((z) => z.element)],
          explanation:
            `The element ${ctx.element} creates a stacking context due to "${ctx.context_reason}". ` +
            'Child elements with high z-index will NOT appear above sibling elements of this container, ' +
            'regardless of their z-index values.',
          fix:
            'If children need to appear above elements outside this container, consider: ' +
            '1) Using a portal to render outside the isolated context, ' +
            '2) Removing the property causing context creation if not needed, ' +
            '3) Restructuring the component hierarchy.',
        });
      }
    }
  }

  // Issue 5: Negative z-index potential issues
  const negativeZ = zIndexValues.filter((z) => z.z_index < 0);
  if (negativeZ.length > 0) {
    issues.push({
      issue: 'Negative z-index usage',
      elements: negativeZ.map((z) => `${z.element} (z-${z.z_index})`),
      explanation:
        'Negative z-index values can cause elements to appear behind their parent\'s background, ' +
        'which may lead to invisible or inaccessible content.',
      fix:
        'Ensure negative z-index is intentional. The element will appear behind its ' +
        'stacking context parent. Consider if restructuring the DOM would be clearer.',
    });
  }

  // Issue 6: Multiple modal/overlay z-index values
  const modalPatterns = ['modal', 'dialog', 'overlay', 'backdrop', 'drawer', 'sheet'];
  const modalElements = zIndexValues.filter((z) =>
    modalPatterns.some((pattern) => z.element.toLowerCase().includes(pattern))
  );

  if (modalElements.length > 1) {
    const uniqueZValues = new Set(modalElements.map((m) => m.z_index));
    if (uniqueZValues.size > 1) {
      issues.push({
        issue: 'Inconsistent modal/overlay z-index values',
        elements: modalElements.map((z) => `${z.element} (z-${z.z_index})`),
        explanation:
          'Multiple modal or overlay components have different z-index values. ' +
          'This can cause unexpected stacking when multiple modals are open.',
        fix:
          'Standardize modal/overlay z-index values using CSS custom properties or a design system. ' +
          'Consider using a modal manager to control stacking order programmatically.',
      });
    }
  }

  return issues;
}

// =============================================================================
// Handler
// =============================================================================

/**
 * Handles the analyze_stacking_context MCP tool call.
 *
 * Analyzes z-index and stacking contexts in a component file,
 * detecting potential issues and building a stacking context tree.
 *
 * @param args - The analyze_stacking_context tool arguments
 * @returns MCP tool response with stacking analysis
 */
export async function handleAnalyzeStackingContext(
  args: AnalyzeStackingContextArgs
): Promise<ToolResponse> {
  const projectRoot = process.cwd();
  const includePortals = args.include_portals ?? true;

  try {
    // Resolve file path
    const filePath = path.isAbsolute(args.file)
      ? args.file
      : path.resolve(projectRoot, args.file);

    // Check file exists
    if (!fs.existsSync(filePath)) {
      return createErrorResponse(`File not found: ${args.file}`, {
        provided_path: args.file,
        resolved_path: filePath,
      });
    }

    // Check file extension
    const ext = path.extname(filePath).toLowerCase();
    if (!['.tsx', '.jsx', '.vue', '.svelte'].includes(ext)) {
      return createErrorResponse(
        `Unsupported file type: ${ext}. Supported: .tsx, .jsx, .vue, .svelte`,
        { file: args.file }
      );
    }

    // Read file content
    const content = fs.readFileSync(filePath, 'utf-8');

    // For Vue/Svelte, extract template section
    let templateContent = content;
    if (ext === '.vue') {
      const templateMatch = content.match(/<template[^>]*>([\s\S]*?)<\/template>/);
      templateContent = templateMatch ? templateMatch[1] : content;
    } else if (ext === '.svelte') {
      // Svelte template is the whole file minus script/style tags
      templateContent = content
        .replace(/<script[^>]*>[\s\S]*?<\/script>/g, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/g, '');
    }

    // Create TypeScript source file for parsing
    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true,
      ext === '.tsx' ? ts.ScriptKind.TSX : ts.ScriptKind.JSX
    );

    // Analyze elements
    const elements = analyzeJsxFile(filePath, content, sourceFile);

    if (elements.length === 0) {
      return createSuccessResponse({
        file: path.relative(projectRoot, filePath),
        stacking_tree: {
          element: 'root',
          z_index: 'auto',
          creates_context: true,
          context_reason: 'document root',
          children: [],
        },
        context_creators: [],
        z_index_values: [],
        potential_issues: [],
        message: 'No JSX elements with stacking-relevant classes found',
      });
    }

    // Build stacking tree
    const stackingTree = buildStackingTree(elements);

    // Collect context creators
    const contextCreators: ContextCreator[] = elements
      .filter((elem) => elem.creates_context)
      .map((elem) => ({
        element: elem.element,
        reason: elem.context_reason || 'unknown',
        z_index: elem.z_index,
        classes: elem.classes,
      }));

    // Collect z-index values
    const zIndexValues = collectZIndexValues(elements);

    // Detect issues
    const potentialIssues = detectStackingIssues(elements, zIndexValues);

    // Build result
    const result: AnalyzeStackingContextResult = {
      file: path.relative(projectRoot, filePath),
      stacking_tree: stackingTree,
      context_creators: contextCreators,
      z_index_values: zIndexValues,
      potential_issues: potentialIssues,
    };

    // Detect portals if requested
    if (includePortals) {
      const portals = detectPortals(content, sourceFile);
      if (portals.length > 0) {
        result.portals = portals;
      }
    }

    return createSuccessResponse(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown error during analysis';
    return createErrorResponse(message, { file: args.file });
  }
}
