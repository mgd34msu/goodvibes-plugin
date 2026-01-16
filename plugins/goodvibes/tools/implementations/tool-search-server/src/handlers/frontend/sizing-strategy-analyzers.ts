/**
 * Sizing Strategy Analyzers
 *
 * Analysis functions for width, height, flex, grid, position,
 * and ancestor chain sizing strategies.
 *
 * @module handlers/frontend/sizing-strategy-analyzers
 */

import type { ElementNode, SizingStrategyType } from './sizing-strategy-utils.js';
import { createElementIdentifier } from './sizing-strategy-utils.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Width or height sizing info
 */
export interface SizingDimension {
  /** The Tailwind class or CSS value specified */
  specified: string;
  /** The sizing strategy type: fixed, percentage, viewport, content-based, flex-controlled, grid-controlled, auto, inherit */
  strategy: SizingStrategyType;
  /** Human-readable description of the sizing strategy */
  description: string;
  /** Parent/ancestor constraints affecting this dimension */
  constrained_by?: string[];
}

/**
 * Flex behavior analysis
 */
export interface FlexBehavior {
  grow: number;
  shrink: number;
  basis: string;
  will_shrink: boolean;
  will_grow: boolean;
}

/**
 * Grid behavior analysis
 */
export interface GridBehavior {
  column: string;
  row: string;
  area?: string;
  /** Numeric column span value if using col-span-X class */
  column_span?: number;
  /** Numeric row span value if using row-span-X class */
  row_span?: number;
}

/**
 * Ancestor in the constraint chain
 */
export interface AncestorNode {
  element: string;
  sizing_impact: string;
}

// =============================================================================
// Strategy Description
// =============================================================================

/**
 * Determine strategy description from type
 */
export function getStrategyDescription(strategy: SizingStrategyType, value?: string): string {
  switch (strategy) {
    case 'fixed':
      return `Fixed size (${value || 'explicit value'})`;
    case 'percentage':
      return `Percentage of parent (${value || 'calculated'})`;
    case 'viewport':
      return `Viewport-relative (${value || 'vw/vh'})`;
    case 'content-based':
      return `Content-based (${value || 'intrinsic'})`;
    case 'flex-controlled':
      return 'Controlled by flex properties';
    case 'grid-controlled':
      return 'Controlled by grid placement';
    case 'auto':
      return 'Auto (browser default)';
    case 'inherit':
      return 'Inherited from parent';
    default:
      return 'Unknown';
  }
}

// =============================================================================
// Width Analysis
// =============================================================================

/**
 * Analyze width strategy considering parent context
 */
export function analyzeWidthStrategy(element: ElementNode): SizingDimension {
  const constraints: string[] = [];
  let strategy: SizingStrategyType = 'auto';
  let specified = 'auto';

  // Check explicit width
  if (element.width) {
    strategy = element.width.strategy;
    specified = element.width.classes.join(' ') || element.width.value || 'auto';
  }

  // Check if controlled by flex
  if (element.parent?.display === 'flex' || element.parent?.display === 'inline-flex') {
    const parentDir = element.parent.flexDirection || 'row';
    const isMainAxis = parentDir === 'row' || parentDir === 'row-reverse';

    if (isMainAxis) {
      if (element.flexGrow !== undefined && element.flexGrow > 0) {
        if (!element.width || element.width.strategy === 'auto') {
          strategy = 'flex-controlled';
          specified = element.flexBasis || 'flex-grow';
        }
        constraints.push(`flex-grow: ${element.flexGrow}`);
      }
      if (element.flexBasis && element.flexBasis !== 'auto') {
        constraints.push(`flex-basis: ${element.flexBasis}`);
      }
    }
  }

  // Check if controlled by grid
  if (element.parent?.display === 'grid' || element.parent?.display === 'inline-grid') {
    if (element.gridColumn) {
      if (!element.width || element.width.strategy === 'auto') {
        strategy = 'grid-controlled';
        specified = element.gridColumn;
      }
      constraints.push(`grid-column: ${element.gridColumn}`);
    }
  }

  // Walk ancestor chain for constraints
  let current = element.parent;
  while (current) {
    if (current.maxWidth) {
      constraints.push(`max-width: ${current.maxWidth} (from ${createElementIdentifier(current.tagName, current.classes, current.id)})`);
    }
    if (current.width?.strategy === 'fixed' || current.width?.strategy === 'viewport') {
      constraints.push(`parent width: ${current.width.value} (from ${createElementIdentifier(current.tagName, current.classes, current.id)})`);
    }
    if (current.overflowX === 'hidden' || current.overflowX === 'clip') {
      constraints.push(`overflow-x: ${current.overflowX} (from ${createElementIdentifier(current.tagName, current.classes, current.id)})`);
    }
    current = current.parent;
  }

  return {
    specified,
    strategy,
    description: getStrategyDescription(strategy, element.width?.value),
    constrained_by: constraints.length > 0 ? constraints : undefined,
  };
}

// =============================================================================
// Height Analysis
// =============================================================================

/**
 * Analyze height strategy considering parent context
 */
export function analyzeHeightStrategy(element: ElementNode): SizingDimension {
  const constraints: string[] = [];
  let strategy: SizingStrategyType = 'auto';
  let specified = 'auto';

  // Check explicit height
  if (element.height) {
    strategy = element.height.strategy;
    specified = element.height.classes.join(' ') || element.height.value || 'auto';
  }

  // Check if controlled by flex
  if (element.parent?.display === 'flex' || element.parent?.display === 'inline-flex') {
    const parentDir = element.parent.flexDirection || 'row';
    const isMainAxis = parentDir === 'column' || parentDir === 'column-reverse';

    if (isMainAxis) {
      if (element.flexGrow !== undefined && element.flexGrow > 0) {
        if (!element.height || element.height.strategy === 'auto') {
          strategy = 'flex-controlled';
          specified = element.flexBasis || 'flex-grow';
        }
        constraints.push(`flex-grow: ${element.flexGrow}`);
      }
      if (element.flexBasis && element.flexBasis !== 'auto') {
        constraints.push(`flex-basis: ${element.flexBasis}`);
      }
    }
  }

  // Check if controlled by grid
  if (element.parent?.display === 'grid' || element.parent?.display === 'inline-grid') {
    if (element.gridRow) {
      if (!element.height || element.height.strategy === 'auto') {
        strategy = 'grid-controlled';
        specified = element.gridRow;
      }
      constraints.push(`grid-row: ${element.gridRow}`);
    }
  }

  // Walk ancestor chain for constraints
  let current = element.parent;
  while (current) {
    if (current.maxHeight) {
      constraints.push(`max-height: ${current.maxHeight} (from ${createElementIdentifier(current.tagName, current.classes, current.id)})`);
    }
    if (current.height?.strategy === 'fixed' || current.height?.strategy === 'viewport') {
      constraints.push(`parent height: ${current.height.value} (from ${createElementIdentifier(current.tagName, current.classes, current.id)})`);
    }
    if (current.overflowY === 'hidden' || current.overflowY === 'clip') {
      constraints.push(`overflow-y: ${current.overflowY} (from ${createElementIdentifier(current.tagName, current.classes, current.id)})`);
    }
    // Check for percentage height without parent height (common issue)
    if (
      element.height?.strategy === 'percentage' &&
      (!current.height || current.height.strategy === 'auto') &&
      current.display !== 'flex' &&
      current.display !== 'grid'
    ) {
      constraints.push(`WARNING: percentage height may not work (${createElementIdentifier(current.tagName, current.classes, current.id)} has auto height)`);
    }
    current = current.parent;
  }

  return {
    specified,
    strategy,
    description: getStrategyDescription(strategy, element.height?.value),
    constrained_by: constraints.length > 0 ? constraints : undefined,
  };
}

// =============================================================================
// Flex Behavior Analysis
// =============================================================================

/**
 * Analyze flex behavior
 */
export function analyzeFlexBehavior(element: ElementNode): FlexBehavior | undefined {
  // Return flex behavior if:
  // 1. Element has flex item classes (flex-grow, flex-shrink, flex-basis)
  // 2. Element is itself a flex container
  // 3. Parent is a flex container
  const hasFlex = element.flexGrow !== undefined || element.flexShrink !== undefined || element.flexBasis !== undefined;
  const isFlexContainer = element.display === 'flex' || element.display === 'inline-flex';
  const parentIsFlexContainer = element.parent?.display === 'flex' || element.parent?.display === 'inline-flex';

  if (!hasFlex && !isFlexContainer && !parentIsFlexContainer) {
    return undefined;
  }

  const grow = element.flexGrow ?? 0;
  const shrink = element.flexShrink ?? 1;
  const basis = element.flexBasis || 'auto';

  return {
    grow,
    shrink,
    basis,
    will_shrink: shrink > 0,
    will_grow: grow > 0,
  };
}

// =============================================================================
// Grid Behavior Analysis
// =============================================================================

/**
 * Analyze grid behavior
 */
export function analyzeGridBehavior(element: ElementNode): GridBehavior | undefined {
  // Return grid behavior if:
  // 1. Element has grid item classes (gridColumn, gridRow, gridArea)
  // 2. Element is itself a grid container
  // 3. Parent is a grid container
  const hasGrid = element.gridColumn !== undefined || element.gridRow !== undefined || element.gridArea !== undefined;
  const isGridContainer = element.display === 'grid' || element.display === 'inline-grid';
  const parentIsGridContainer = element.parent?.display === 'grid' || element.parent?.display === 'inline-grid';

  if (!hasGrid && !isGridContainer && !parentIsGridContainer) {
    return undefined;
  }

  // Extract numeric span values if present
  const columnSpan = element.gridColumn?.match(/span\s+(\d+)/)?.[1];
  const rowSpan = element.gridRow?.match(/span\s+(\d+)/)?.[1];

  return {
    column: element.gridColumn || 'auto',
    row: element.gridRow || 'auto',
    area: element.gridArea,
    // Include numeric span values for easier testing
    ...(columnSpan ? { column_span: parseInt(columnSpan, 10) } : {}),
    ...(rowSpan ? { row_span: parseInt(rowSpan, 10) } : {}),
  };
}

// =============================================================================
// Position Context
// =============================================================================

/**
 * Determine position context
 */
export function getPositionContext(element: ElementNode): string {
  if (element.position === 'fixed') {
    return 'fixed to viewport';
  }

  if (element.position === 'absolute') {
    let current = element.parent;
    while (current) {
      if (current.position !== 'static') {
        return `absolute, relative to ${createElementIdentifier(current.tagName, current.classes, current.id)} (${current.position})`;
      }
      current = current.parent;
    }
    return 'absolute, relative to initial containing block (no positioned ancestor)';
  }

  if (element.position === 'sticky') {
    let current = element.parent;
    while (current) {
      if (current.overflowX !== 'visible' || current.overflowY !== 'visible') {
        return `sticky within ${createElementIdentifier(current.tagName, current.classes, current.id)} (overflow container)`;
      }
      current = current.parent;
    }
    return 'sticky within viewport';
  }

  return element.position === 'relative' ? 'relative (in normal flow, offset relative to self)' : 'static (normal document flow)';
}

// =============================================================================
// Ancestor Chain
// =============================================================================

/**
 * Build ancestor chain with sizing impact
 */
export function buildAncestorChain(element: ElementNode): AncestorNode[] {
  const chain: AncestorNode[] = [];
  let current = element.parent;

  while (current) {
    const impacts: string[] = [];

    // Display type impact
    if (current.display === 'flex' || current.display === 'inline-flex') {
      const dir = current.flexDirection || 'row';
      impacts.push(`flex container (${dir})`);
    } else if (current.display === 'grid' || current.display === 'inline-grid') {
      const cols = current.gridTemplateColumns || 'auto';
      impacts.push(`grid container (${cols})`);
    }

    // Size constraints
    if (current.width?.strategy === 'fixed' || current.width?.strategy === 'percentage') {
      impacts.push(`width: ${current.width.value}`);
    }
    if (current.height?.strategy === 'fixed' || current.height?.strategy === 'percentage') {
      impacts.push(`height: ${current.height.value}`);
    }
    if (current.maxWidth) {
      impacts.push(`max-width: ${current.maxWidth}`);
    }
    if (current.maxHeight) {
      impacts.push(`max-height: ${current.maxHeight}`);
    }

    // Overflow
    if (current.overflowX !== 'visible' || current.overflowY !== 'visible') {
      const overflow =
        current.overflowX === current.overflowY
          ? current.overflowX
          : `x: ${current.overflowX}, y: ${current.overflowY}`;
      impacts.push(`overflow: ${overflow}`);
    }

    // Position
    if (current.position !== 'static') {
      impacts.push(`position: ${current.position}`);
    }

    if (impacts.length > 0) {
      chain.push({
        element: createElementIdentifier(current.tagName, current.classes, current.id),
        sizing_impact: impacts.join('; '),
      });
    }

    current = current.parent;
  }

  return chain;
}

// =============================================================================
// Summary Generation
// =============================================================================

/**
 * Generate human-readable summary
 */
export function generateSummary(
  element: ElementNode,
  widthAnalysis: SizingDimension,
  heightAnalysis: SizingDimension,
  flexBehavior?: FlexBehavior,
  gridBehavior?: GridBehavior
): string {
  const parts: string[] = [];

  // Helper to get strategy type from strategy_type field or parse from strategy description
  const getStrategyType = (analysis: SizingDimension): SizingStrategyType => {
    if (analysis.strategy_type) return analysis.strategy_type;
    const s = (analysis.strategy || '').toLowerCase();
    if (s.includes('fixed')) return 'fixed';
    if (s.includes('percentage')) return 'percentage';
    if (s.includes('flex')) return 'flex-controlled';
    if (s.includes('grid')) return 'grid-controlled';
    if (s.includes('viewport')) return 'viewport';
    return 'auto';
  };

  const widthType = getStrategyType(widthAnalysis);
  const heightType = getStrategyType(heightAnalysis);

  // Width summary
  if (widthType === 'fixed') {
    parts.push(`Width is fixed at ${element.width?.value || 'explicit value'}.`);
  } else if (widthType === 'percentage') {
    parts.push(`Width is ${element.width?.value || '100%'} of parent.`);
  } else if (widthType === 'flex-controlled') {
    parts.push(`Width is controlled by flex layout${flexBehavior?.will_grow ? ' and will grow to fill available space' : ''}.`);
  } else if (widthType === 'grid-controlled') {
    parts.push(`Width is determined by grid column placement.`);
  } else if (widthType === 'viewport') {
    parts.push(`Width is viewport-relative (${element.width?.value || 'vw'}).`);
  } else {
    parts.push(`Width is auto (determined by content).`);
  }

  // Height summary
  if (heightType === 'fixed') {
    parts.push(`Height is fixed at ${element.height?.value || 'explicit value'}.`);
  } else if (heightType === 'percentage') {
    parts.push(`Height is ${element.height?.value || '100%'} of parent.`);
  } else if (heightType === 'flex-controlled') {
    parts.push(`Height is controlled by flex layout.`);
  } else if (heightType === 'grid-controlled') {
    parts.push(`Height is determined by grid row placement.`);
  } else if (heightType === 'viewport') {
    parts.push(`Height is viewport-relative (${element.height?.value || 'vh'}).`);
  } else {
    parts.push(`Height is auto (determined by content).`);
  }

  // Flex behavior
  if (flexBehavior) {
    if (flexBehavior.will_grow && flexBehavior.will_shrink) {
      parts.push(`As a flex item, it will both grow and shrink as needed.`);
    } else if (flexBehavior.will_grow) {
      parts.push(`As a flex item, it will grow but not shrink.`);
    } else if (flexBehavior.will_shrink) {
      parts.push(`As a flex item, it will shrink if needed but not grow.`);
    } else {
      parts.push(`As a flex item, it maintains its size (flex-none behavior).`);
    }
  }

  // Grid behavior
  if (gridBehavior) {
    if (gridBehavior.column !== 'auto' || gridBehavior.row !== 'auto') {
      parts.push(`Grid placement: column ${gridBehavior.column}, row ${gridBehavior.row}.`);
    }
  }

  // Constraints warning
  const widthConstraints = widthAnalysis.constrained_by?.filter((c) => c.includes('WARNING')) || [];
  const heightConstraints = heightAnalysis.constrained_by?.filter((c) => c.includes('WARNING')) || [];
  if (widthConstraints.length > 0 || heightConstraints.length > 0) {
    parts.push(`Note: There are potential sizing issues that may need attention.`);
  }

  return parts.join(' ');
}
