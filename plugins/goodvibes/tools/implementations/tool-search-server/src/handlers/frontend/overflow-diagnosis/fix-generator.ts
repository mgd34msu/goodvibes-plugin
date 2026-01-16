/**
 * Fix Generator for Overflow Diagnosis
 *
 * Generates fix options and recommendations for overflow patterns.
 *
 * @module handlers/frontend/overflow-diagnosis/fix-generator
 */

import type { OverflowPattern, FixOption, Recommendation } from './types.js';

/**
 * Generate fix options for a pattern
 */
export function generateFixes(pattern: OverflowPattern): FixOption[] {
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
export function generateRecommendation(
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
export function collectRelatedElements(patterns: OverflowPattern[]): string[] {
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
