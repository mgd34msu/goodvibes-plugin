/**
 * Diagnose Overflow Handler
 *
 * Analyzes CSS/Tailwind layout patterns to diagnose overflow issues and
 * recommend fixes. Leverages the analyze_layout_hierarchy handler to parse
 * JSX/TSX files, then identifies overflow-prone patterns and generates
 * actionable fix options.
 *
 * @module handlers/frontend/diagnose-overflow
 */

import * as path from 'path';
import { ToolResponse } from '../../types.js';
import { PROJECT_ROOT } from '../../config.js';
import {
  handleAnalyzeLayoutHierarchy,
  LayoutNode as BaseLayoutNode,
  AnalyzeLayoutHierarchyResult,
} from './analyze-layout-hierarchy.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Arguments for the diagnose_overflow tool
 */
export interface DiagnoseOverflowArgs {
  /** File path to analyze (relative to project root or absolute) */
  file: string;
  /** Description of the overflow problem (e.g., "content overflowing container") */
  problem_description?: string;
  /** Class name or selector to focus analysis on */
  element_hint?: string;
}

/**
 * Extended layout node with parent reference for traversal
 */
interface LayoutNode extends BaseLayoutNode {
  parent?: LayoutNode;
}

/**
 * Overflow pattern detection result
 */
interface OverflowPattern {
  type:
    | 'fixed_parent_auto_children'
    | 'constrained_flex_no_overflow'
    | 'nested_percentage_heights'
    | 'absolute_no_containment'
    | 'flex_no_shrink'
    | 'grid_overflow'
    | 'min_height_zero_missing';
  severity: 'high' | 'medium' | 'low';
  description: string;
  parent?: LayoutNode;
  element?: LayoutNode;
  children?: LayoutNode[];
}

/**
 * Constraint chain entry
 */
interface ConstraintChainEntry {
  element: string;
  constrains: string;
  receives_from_parent?: string;
}

/**
 * Fix option for overflow issue
 */
interface FixOption {
  location: 'inside' | 'outside' | 'chain';
  element: string;
  fix: string;
  code_change: string;
  trade_off: string;
}

/**
 * Recommendation for fixing overflow
 */
interface Recommendation {
  location: 'inside' | 'outside';
  reason: string;
  suggested_fix: string;
  suggested_code: string;
}

/**
 * Diagnosis result
 */
interface Diagnosis {
  overflow_likely: boolean;
  overflow_source?: string;
  container?: string;
  cause: string;
  constraint_chain: ConstraintChainEntry[];
  fix_options: FixOption[];
  recommendation: Recommendation;
}

/**
 * Complete result structure
 */
interface DiagnoseOverflowResult {
  file: string;
  diagnosis: Diagnosis;
  related_elements: string[];
}

// =============================================================================
// Response Helpers
// =============================================================================

function createSuccessResponse<T>(data: T): ToolResponse {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  };
}

function createErrorResponse(
  message: string,
  context?: Record<string, unknown>
): ToolResponse {
  return {
    content: [
      { type: 'text', text: JSON.stringify({ error: message, ...context }, null, 2) },
    ],
    isError: true,
  };
}

// =============================================================================
// Tree Enrichment
// =============================================================================

/**
 * Add parent references to the layout tree for traversal
 */
function enrichTreeWithParents(
  node: BaseLayoutNode,
  parent?: LayoutNode
): LayoutNode {
  const enrichedNode: LayoutNode = {
    ...node,
    parent,
    children: [],
  };

  enrichedNode.children = node.children.map((child) =>
    enrichTreeWithParents(child, enrichedNode)
  );

  return enrichedNode;
}

// =============================================================================
// Overflow Pattern Detection
// =============================================================================

/**
 * Check if sizing is fixed (has explicit dimension)
 */
function isFixedSizing(
  strategy: 'fixed' | 'percentage' | 'auto' | 'flex' | 'fit-content'
): boolean {
  return strategy === 'fixed' || strategy === 'percentage';
}

/**
 * Check if sizing is auto or undefined
 */
function isAutoSizing(
  strategy: 'fixed' | 'percentage' | 'auto' | 'flex' | 'fit-content'
): boolean {
  return strategy === 'auto';
}

/**
 * Check if a node has auto height children
 */
function hasAutoHeightChildren(node: LayoutNode): boolean {
  return node.children.some((child) => isAutoSizing(child.sizing.height.strategy));
}

/**
 * Check if element matches the hint
 */
function matchesHint(node: LayoutNode, hint?: string): boolean {
  if (!hint) return true;
  const hintLower = hint.toLowerCase();
  return (
    node.element.toLowerCase().includes(hintLower) ||
    node.classes.some((c) => c.toLowerCase().includes(hintLower))
  );
}

/**
 * Find overflow-prone patterns in the layout tree
 */
function findOverflowPatterns(tree: LayoutNode, hint?: string): OverflowPattern[] {
  const patterns: OverflowPattern[] = [];

  function traverse(node: LayoutNode): void {
    // Pattern 1: Fixed height parent + auto height children (no overflow)
    if (
      isFixedSizing(node.sizing.height.strategy) &&
      hasAutoHeightChildren(node) &&
      node.overflow.y === 'visible' &&
      matchesHint(node, hint)
    ) {
      patterns.push({
        type: 'fixed_parent_auto_children',
        severity: 'high',
        description: 'Fixed-height container with auto-height children may overflow',
        parent: node,
        children: node.children.filter((c) => isAutoSizing(c.sizing.height.strategy)),
      });
    }

    // Pattern 2: Flex container without overflow handling
    if (
      (node.display === 'flex' || node.display === 'inline-flex') &&
      node.overflow.y === 'visible' &&
      isFixedSizing(node.sizing.height.strategy) &&
      matchesHint(node, hint)
    ) {
      patterns.push({
        type: 'constrained_flex_no_overflow',
        severity: 'medium',
        description: 'Flex container with constrained height but no overflow handling',
        element: node,
      });
    }

    // Pattern 3: Nested percentage heights without height chain
    if (
      node.sizing.height.strategy === 'percentage' &&
      node.parent &&
      node.parent.sizing.height.strategy === 'auto' &&
      matchesHint(node, hint)
    ) {
      patterns.push({
        type: 'nested_percentage_heights',
        severity: 'medium',
        description: 'Percentage height on child but parent has no defined height',
        element: node,
        parent: node.parent,
      });
    }

    // Pattern 4: Absolute positioning without relative parent
    if (
      node.position === 'absolute' &&
      node.parent &&
      node.parent.position === 'static' &&
      matchesHint(node, hint)
    ) {
      patterns.push({
        type: 'absolute_no_containment',
        severity: 'low',
        description: 'Absolute positioned element may overflow non-relative parent',
        element: node,
        parent: node.parent,
      });
    }

    // Pattern 5: Flex children without shrink in constrained container
    if (
      node.flex_props &&
      node.flex_props.shrink === 0 &&
      node.parent &&
      (node.parent.display === 'flex' || node.parent.display === 'inline-flex') &&
      isFixedSizing(node.parent.sizing.height.strategy) &&
      matchesHint(node, hint)
    ) {
      patterns.push({
        type: 'flex_no_shrink',
        severity: 'low',
        description: 'Flex child with shrink-0 may cause parent overflow',
        element: node,
        parent: node.parent,
      });
    }

    // Pattern 6: Grid with constrained height but no overflow
    if (
      (node.display === 'grid' || node.display === 'inline-grid') &&
      node.overflow.y === 'visible' &&
      isFixedSizing(node.sizing.height.strategy) &&
      matchesHint(node, hint)
    ) {
      patterns.push({
        type: 'grid_overflow',
        severity: 'medium',
        description: 'Grid container with constrained height but no overflow handling',
        element: node,
      });
    }

    // Pattern 7: Nested flex without min-h-0 (common gotcha)
    if (
      (node.display === 'flex' || node.display === 'inline-flex') &&
      node.parent &&
      (node.parent.display === 'flex' || node.parent.display === 'inline-flex') &&
      !node.classes.includes('min-h-0') &&
      node.flex_props?.grow === 1 &&
      matchesHint(node, hint)
    ) {
      patterns.push({
        type: 'min_height_zero_missing',
        severity: 'high',
        description: 'Nested flex container without min-h-0 may not scroll properly',
        element: node,
        parent: node.parent,
      });
    }

    // Recurse into children
    for (const child of node.children) {
      traverse(child);
    }
  }

  traverse(tree);

  // Sort by severity
  const severityOrder = { high: 0, medium: 1, low: 2 };
  patterns.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return patterns;
}

// =============================================================================
// Constraint Chain Building
// =============================================================================

/**
 * Describe the constraint a node applies
 */
function describeConstraint(node: LayoutNode): string {
  const constraints: string[] = [];

  if (node.sizing.height.strategy === 'fixed' && node.sizing.height.value) {
    constraints.push(`fixed height (${node.sizing.height.value})`);
  } else if (node.sizing.height.strategy === 'percentage' && node.sizing.height.value) {
    constraints.push(`percentage height (${node.sizing.height.value})`);
  }

  if (node.sizing.width.strategy === 'fixed' && node.sizing.width.value) {
    constraints.push(`fixed width (${node.sizing.width.value})`);
  }

  if (node.overflow.y !== 'visible') {
    constraints.push(`overflow-y: ${node.overflow.y}`);
  }

  if ((node.display === 'flex' || node.display === 'inline-flex') && node.flex_props) {
    constraints.push(`flex ${node.flex_props.direction}`);
    if (node.flex_props.wrap === 'nowrap') {
      constraints.push('no-wrap');
    }
  }

  if (node.display === 'grid' || node.display === 'inline-grid') {
    constraints.push('grid layout');
  }

  return constraints.length > 0 ? constraints.join(', ') : 'no explicit constraints';
}

/**
 * Build constraint chain from tree to target element
 */
function buildConstraintChain(tree: LayoutNode, target: string): ConstraintChainEntry[] {
  const chain: ConstraintChainEntry[] = [];
  const targetLower = target.toLowerCase();

  function traverse(node: LayoutNode, path: LayoutNode[]): boolean {
    const elementLower = node.element.toLowerCase();
    const classMatch = node.classes.some((c) => c.toLowerCase().includes(targetLower));

    if (elementLower.includes(targetLower) || classMatch) {
      // Found target, build chain from path
      for (let i = 0; i < path.length; i++) {
        const ancestor = path[i];
        const entry: ConstraintChainEntry = {
          element: ancestor.element,
          constrains: describeConstraint(ancestor),
        };

        if (i > 0) {
          const parent = path[i - 1];
          if (
            parent.display === 'flex' ||
            parent.display === 'inline-flex' ||
            parent.display === 'grid' ||
            parent.display === 'inline-grid'
          ) {
            entry.receives_from_parent = `${parent.display} layout constraints`;
          } else if (parent.sizing.height.strategy !== 'auto') {
            entry.receives_from_parent = 'height constraint from parent';
          }
        }

        chain.push(entry);
      }

      // Add the target itself
      chain.push({
        element: node.element,
        constrains: describeConstraint(node),
        receives_from_parent: path.length > 0 ? 'constraints from parent' : undefined,
      });

      return true;
    }

    for (const child of node.children) {
      if (traverse(child, [...path, node])) {
        return true;
      }
    }

    return false;
  }

  traverse(tree, []);
  return chain;
}

// =============================================================================
// Fix Generation
// =============================================================================

/**
 * Generate fix options for a pattern
 */
function generateFixes(pattern: OverflowPattern): FixOption[] {
  const fixes: FixOption[] = [];

  switch (pattern.type) {
    case 'fixed_parent_auto_children':
      if (pattern.parent) {
        fixes.push({
          location: 'inside',
          element: pattern.parent.element,
          fix: 'Add overflow handling to container',
          code_change: 'overflow-y-auto',
          trade_off: 'Content will scroll within container',
        });

        if (pattern.children && pattern.children.length > 0) {
          fixes.push({
            location: 'inside',
            element: pattern.children[0].element,
            fix: 'Add max-height and overflow to child content',
            code_change: 'max-h-full overflow-y-auto',
            trade_off: 'Individual child scrolls instead of container',
          });
        }

        fixes.push({
          location: 'outside',
          element: pattern.parent.element,
          fix: 'Remove fixed height constraint',
          code_change: `h-auto min-h-[${pattern.parent.sizing.height.value || 'original-height'}]`,
          trade_off: 'Container grows with content, may affect overall layout',
        });
      }
      break;

    case 'constrained_flex_no_overflow':
      if (pattern.element) {
        fixes.push({
          location: 'inside',
          element: pattern.element.element,
          fix: 'Add min-h-0 and overflow for proper flex scrolling',
          code_change: 'min-h-0 overflow-y-auto',
          trade_off: 'Required for nested flex containers to properly overflow',
        });

        fixes.push({
          location: 'inside',
          element: pattern.element.element,
          fix: 'Add overflow handling to flex container',
          code_change: 'overflow-y-auto',
          trade_off: 'Flex items scroll when exceeding container height',
        });

        fixes.push({
          location: 'outside',
          element: pattern.element.element,
          fix: 'Convert to auto height',
          code_change: 'h-auto',
          trade_off: 'Container grows with content',
        });
      }
      break;

    case 'nested_percentage_heights':
      if (pattern.element && pattern.parent) {
        fixes.push({
          location: 'chain',
          element: pattern.parent.element,
          fix: 'Add explicit height to parent for percentage to work',
          code_change: 'h-full',
          trade_off: 'Requires height chain from root',
        });

        fixes.push({
          location: 'inside',
          element: pattern.element.element,
          fix: 'Use flex-1 instead of percentage height',
          code_change: 'flex-1 min-h-0',
          trade_off: 'More reliable in flex contexts',
        });
      }
      break;

    case 'absolute_no_containment':
      if (pattern.parent) {
        fixes.push({
          location: 'chain',
          element: pattern.parent.element,
          fix: 'Add relative positioning to parent',
          code_change: 'relative',
          trade_off: 'Establishes positioning context for absolute child',
        });

        fixes.push({
          location: 'inside',
          element: pattern.parent.element,
          fix: 'Add overflow hidden to contain absolute element',
          code_change: 'relative overflow-hidden',
          trade_off: 'Clips any overflow from absolute positioned children',
        });
      }
      break;

    case 'flex_no_shrink':
      if (pattern.element) {
        fixes.push({
          location: 'inside',
          element: pattern.element.element,
          fix: 'Allow element to shrink',
          code_change: 'shrink (remove shrink-0)',
          trade_off: 'Element may become smaller than content size',
        });

        fixes.push({
          location: 'inside',
          element: pattern.element.element,
          fix: 'Add min-width-0 to allow shrinking',
          code_change: 'min-w-0',
          trade_off: 'Allows text truncation in flex items',
        });
      }
      break;

    case 'grid_overflow':
      if (pattern.element) {
        fixes.push({
          location: 'inside',
          element: pattern.element.element,
          fix: 'Add overflow handling to grid container',
          code_change: 'overflow-y-auto',
          trade_off: 'Grid items scroll when exceeding container',
        });

        fixes.push({
          location: 'outside',
          element: pattern.element.element,
          fix: 'Use auto-rows to allow content sizing',
          code_change: 'grid-rows-[auto_1fr]',
          trade_off: 'Grid adapts to content height',
        });
      }
      break;

    case 'min_height_zero_missing':
      if (pattern.element) {
        fixes.push({
          location: 'inside',
          element: pattern.element.element,
          fix: 'Add min-h-0 for proper flex overflow behavior',
          code_change: 'min-h-0',
          trade_off: 'Enables flex children to shrink below content size',
        });

        fixes.push({
          location: 'inside',
          element: pattern.element.element,
          fix: 'Add min-h-0 with overflow for scrollable content',
          code_change: 'min-h-0 overflow-y-auto',
          trade_off: 'Content scrolls within flex container',
        });
      }
      break;
  }

  return fixes;
}

/**
 * Generate recommendation based on context
 */
function generateRecommendation(
  patterns: OverflowPattern[],
  fixes: FixOption[]
): Recommendation {
  if (patterns.length === 0 || fixes.length === 0) {
    return {
      location: 'inside',
      reason: 'No specific overflow pattern detected',
      suggested_fix: 'Add overflow-y-auto to the container',
      suggested_code: 'overflow-y-auto',
    };
  }

  const primaryPattern = patterns[0];
  const primaryElement = primaryPattern.element || primaryPattern.parent;

  // Special handling for min-h-0 pattern (very common)
  if (primaryPattern.type === 'min_height_zero_missing') {
    return {
      location: 'inside',
      reason: 'Nested flex containers require min-h-0 to properly constrain height',
      suggested_fix: 'Add min-h-0 to the flex child',
      suggested_code: 'min-h-0',
    };
  }

  // Check if element is in a controlled layout
  const inFlexLayout =
    primaryElement?.parent?.display === 'flex' ||
    primaryElement?.parent?.display === 'inline-flex';
  const inGridLayout =
    primaryElement?.parent?.display === 'grid' ||
    primaryElement?.parent?.display === 'inline-grid';

  if (inFlexLayout || inGridLayout) {
    const insideFix = fixes.find((f) => f.location === 'inside');
    if (insideFix) {
      return {
        location: 'inside',
        reason: `Element is in a ${inFlexLayout ? 'flex' : 'grid'} layout, inside fix maintains layout integrity`,
        suggested_fix: insideFix.fix,
        suggested_code: insideFix.code_change,
      };
    }
  }

  // Default to inside fix as safer option
  const insideFix = fixes.find((f) => f.location === 'inside');
  if (insideFix) {
    return {
      location: 'inside',
      reason: 'Inside fix is generally safer and more targeted',
      suggested_fix: insideFix.fix,
      suggested_code: insideFix.code_change,
    };
  }

  // Fallback to outside fix
  const outsideFix = fixes.find((f) => f.location === 'outside');
  if (outsideFix) {
    return {
      location: 'outside',
      reason: 'Outside fix addresses the root constraint',
      suggested_fix: outsideFix.fix,
      suggested_code: outsideFix.code_change,
    };
  }

  return {
    location: 'inside',
    reason: 'Default recommendation',
    suggested_fix: 'Add overflow-y-auto to the container',
    suggested_code: 'overflow-y-auto',
  };
}

/**
 * Collect related elements from the tree
 */
function collectRelatedElements(patterns: OverflowPattern[]): string[] {
  const elements = new Set<string>();

  for (const pattern of patterns) {
    if (pattern.element) elements.add(pattern.element.element);
    if (pattern.parent) elements.add(pattern.parent.element);
    if (pattern.children) {
      for (const child of pattern.children) {
        elements.add(child.element);
      }
    }
  }

  return Array.from(elements);
}

// =============================================================================
// Handler
// =============================================================================

/**
 * Handles the diagnose_overflow MCP tool call.
 *
 * Analyzes CSS/Tailwind layout patterns in JSX/TSX files to diagnose
 * overflow issues and generate actionable fix recommendations.
 *
 * @param args - The diagnose_overflow tool arguments
 * @returns MCP tool response with overflow diagnosis
 */
export async function handleDiagnoseOverflow(
  args: DiagnoseOverflowArgs
): Promise<ToolResponse> {
  // First, use the layout hierarchy analyzer to parse the file
  const layoutResult = await handleAnalyzeLayoutHierarchy({
    file: args.file,
    selector: args.element_hint,
  });

  // Check if layout analysis failed
  const resultText = layoutResult.content[0]?.text;
  if (!resultText) {
    return createErrorResponse('Failed to analyze layout hierarchy');
  }

  let parsedResult: AnalyzeLayoutHierarchyResult;
  try {
    parsedResult = JSON.parse(resultText);
  } catch {
    return createErrorResponse('Failed to parse layout analysis result');
  }

  // Check for error in result
  if ('error' in parsedResult) {
    return layoutResult; // Pass through the error
  }

  // Enrich the tree with parent references
  const enrichedTree = enrichTreeWithParents(parsedResult.layout_tree);

  // Find overflow patterns
  const patterns = findOverflowPatterns(enrichedTree, args.element_hint);

  // Build constraint chain if we have an element hint
  const constraintChain = args.element_hint
    ? buildConstraintChain(enrichedTree, args.element_hint)
    : [];

  // Generate fixes for all patterns
  const allFixes: FixOption[] = [];
  for (const pattern of patterns) {
    allFixes.push(...generateFixes(pattern));
  }

  // Deduplicate fixes by code_change and element
  const uniqueFixes = allFixes.filter(
    (fix, index, arr) =>
      index ===
      arr.findIndex(
        (f) => f.code_change === fix.code_change && f.element === fix.element
      )
  );

  // Generate recommendation
  const recommendation = generateRecommendation(patterns, uniqueFixes);

  // Determine cause description
  let cause = 'No specific overflow issue detected';
  if (patterns.length > 0) {
    const primaryPattern = patterns[0];
    cause = primaryPattern.description;
    if (args.problem_description) {
      cause = `${primaryPattern.description}. User reports: ${args.problem_description}`;
    }
  } else if (args.problem_description) {
    cause = `User reports: ${args.problem_description}. No matching pattern found in layout analysis.`;
  }

  // Build result
  const diagnosis: Diagnosis = {
    overflow_likely: patterns.length > 0,
    overflow_source:
      patterns[0]?.element?.element || patterns[0]?.children?.[0]?.element,
    container: patterns[0]?.parent?.element || patterns[0]?.element?.element,
    cause,
    constraint_chain: constraintChain,
    fix_options: uniqueFixes.slice(0, 6), // Limit to top 6 fixes
    recommendation,
  };

  const relativePath = path.isAbsolute(args.file)
    ? path.relative(PROJECT_ROOT, args.file).replace(/\\/g, '/')
    : args.file;

  const result: DiagnoseOverflowResult = {
    file: relativePath,
    diagnosis,
    related_elements: collectRelatedElements(patterns),
  };

  return createSuccessResponse(result);
}
