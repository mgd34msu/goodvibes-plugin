/**
 * Sizing Context
 *
 * Types and context analysis functions for sizing strategy analysis.
 * Extracted from sizing-strategy-analyzers.
 *
 * @module core/sizing/context
 */

import type { ElementNode, SizingStrategyType } from '../tailwind/types.js';
import { createElementIdentifier } from '../tailwind/identifier.js';

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

  // Helper to get strategy type - use the strategy field directly
  const getStrategyType = (analysis: SizingDimension): SizingStrategyType => {
    return analysis.strategy;
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
