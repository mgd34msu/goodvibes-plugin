/**
 * Sizing context — Lane 4.
 * Ported from frontend-engine `core/sizing/context.ts` (types + ancestor chain +
 * strategy descriptions used by the merged sizing section, §4.4.2).
 *
 * @module frontend/sizing/context
 */

import type { ElementNode, SizingStrategyType } from '../tailwind/types.js';
import { createElementIdentifier } from '../tailwind/identifier.js';

export interface SizingDimension {
  specified: string;
  strategy: SizingStrategyType;
  description: string;
  constrained_by?: string[];
}

export interface FlexBehavior {
  grow: number;
  shrink: number;
  basis: string;
  will_shrink: boolean;
  will_grow: boolean;
}

export interface GridBehavior {
  column: string;
  row: string;
  area?: string;
  column_span?: number;
  row_span?: number;
}

export interface AncestorNode {
  element: string;
  sizing_impact: string;
}

/** Describe a sizing strategy. */
export function getStrategyDescription(strategy: SizingStrategyType, value?: string): string {
  switch (strategy) {
    case 'fixed': return `Fixed size (${value || 'explicit value'})`;
    case 'percentage': return `Percentage of parent (${value || 'calculated'})`;
    case 'viewport': return `Viewport-relative (${value || 'vw/vh'})`;
    case 'content-based': return `Content-based (${value || 'intrinsic'})`;
    case 'flex-controlled': return 'Controlled by flex properties';
    case 'grid-controlled': return 'Controlled by grid placement';
    case 'auto': return 'Auto (browser default)';
    case 'inherit': return 'Inherited from parent';
    default: return 'Unknown';
  }
}

/** Build the ancestor constraint chain (sizing impact per ancestor). */
export function buildAncestorChain(element: ElementNode): AncestorNode[] {
  const chain: AncestorNode[] = [];
  let current = element.parent;

  while (current) {
    const impacts: string[] = [];

    if (current.display === 'flex' || current.display === 'inline-flex') {
      const dir = current.flexDirection || 'row';
      impacts.push(`flex container (${dir})`);
    } else if (current.display === 'grid' || current.display === 'inline-grid') {
      const cols = current.gridTemplateColumns || 'auto';
      impacts.push(`grid container (${cols})`);
    }

    if (current.width?.strategy === 'fixed' || current.width?.strategy === 'percentage') {
      impacts.push(`width: ${current.width.value}`);
    }
    if (current.height?.strategy === 'fixed' || current.height?.strategy === 'percentage') {
      impacts.push(`height: ${current.height.value}`);
    }
    if (current.maxWidth) impacts.push(`max-width: ${current.maxWidth}`);
    if (current.maxHeight) impacts.push(`max-height: ${current.maxHeight}`);

    if (current.overflowX !== 'visible' || current.overflowY !== 'visible') {
      const overflow =
        current.overflowX === current.overflowY
          ? current.overflowX
          : `x: ${current.overflowX}, y: ${current.overflowY}`;
      impacts.push(`overflow: ${overflow}`);
    }

    if (current.position !== 'static') impacts.push(`position: ${current.position}`);

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
