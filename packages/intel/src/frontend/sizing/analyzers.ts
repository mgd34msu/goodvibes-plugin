/**
 * Sizing analyzers — Lane 4.
 * Ported from frontend-engine `core/sizing/analyzers.ts` (width/height strategy +
 * flex/grid behavior for the selected element).
 *
 * @module frontend/sizing/analyzers
 */

import type { ElementNode } from '../tailwind/types.js';
import { createElementIdentifier } from '../tailwind/identifier.js';
import type { SizingDimension, FlexBehavior, GridBehavior } from './context.js';
import { getStrategyDescription } from './context.js';

/** Analyze the width strategy of an element considering parent context. */
export function analyzeWidthStrategy(element: ElementNode): SizingDimension {
  const constraints: string[] = [];
  let strategy = element.width?.strategy ?? ('auto' as const);
  let specified = element.width
    ? element.width.classes.join(' ') || element.width.value || 'auto'
    : 'auto';

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

  if (element.parent?.display === 'grid' || element.parent?.display === 'inline-grid') {
    if (element.gridColumn) {
      if (!element.width || element.width.strategy === 'auto') {
        strategy = 'grid-controlled';
        specified = element.gridColumn;
      }
      constraints.push(`grid-column: ${element.gridColumn}`);
    }
  }

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
    specified, strategy,
    description: getStrategyDescription(strategy, element.width?.value),
    constrained_by: constraints.length > 0 ? constraints : undefined,
  };
}

/** Analyze the height strategy of an element considering parent context. */
export function analyzeHeightStrategy(element: ElementNode): SizingDimension {
  const constraints: string[] = [];
  let strategy = element.height?.strategy ?? ('auto' as const);
  let specified = element.height
    ? element.height.classes.join(' ') || element.height.value || 'auto'
    : 'auto';

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

  if (element.parent?.display === 'grid' || element.parent?.display === 'inline-grid') {
    if (element.gridRow) {
      if (!element.height || element.height.strategy === 'auto') {
        strategy = 'grid-controlled';
        specified = element.gridRow;
      }
      constraints.push(`grid-row: ${element.gridRow}`);
    }
  }

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
    specified, strategy,
    description: getStrategyDescription(strategy, element.height?.value),
    constrained_by: constraints.length > 0 ? constraints : undefined,
  };
}

/** Analyze flex behavior. */
export function analyzeFlexBehavior(element: ElementNode): FlexBehavior | undefined {
  const hasFlex = element.flexGrow !== undefined || element.flexShrink !== undefined || element.flexBasis !== undefined;
  const isFlexContainer = element.display === 'flex' || element.display === 'inline-flex';
  const parentIsFlexContainer = element.parent?.display === 'flex' || element.parent?.display === 'inline-flex';
  if (!hasFlex && !isFlexContainer && !parentIsFlexContainer) {return undefined;}

  const grow = element.flexGrow ?? 0;
  const shrink = element.flexShrink ?? 1;
  const basis = element.flexBasis || 'auto';
  return { grow, shrink, basis, will_shrink: shrink > 0, will_grow: grow > 0 };
}

/** Analyze grid behavior. */
export function analyzeGridBehavior(element: ElementNode): GridBehavior | undefined {
  const hasGrid = element.gridColumn !== undefined || element.gridRow !== undefined || element.gridArea !== undefined;
  const isGridContainer = element.display === 'grid' || element.display === 'inline-grid';
  const parentIsGridContainer = element.parent?.display === 'grid' || element.parent?.display === 'inline-grid';
  if (!hasGrid && !isGridContainer && !parentIsGridContainer) {return undefined;}

  const columnSpan = element.gridColumn?.match(/span\s+(\d+)/)?.[1];
  const rowSpan = element.gridRow?.match(/span\s+(\d+)/)?.[1];
  return {
    column: element.gridColumn || 'auto',
    row: element.gridRow || 'auto',
    area: element.gridArea,
    ...(columnSpan ? { column_span: parseInt(columnSpan, 10) } : {}),
    ...(rowSpan ? { row_span: parseInt(rowSpan, 10) } : {}),
  };
}
