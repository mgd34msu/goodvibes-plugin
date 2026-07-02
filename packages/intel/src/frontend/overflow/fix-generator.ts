/**
 * Overflow fix generator — Lane 4.
 * Ported from frontend-engine `core/overflow/fix-generator.ts` (the `generateFixes`
 * fix-option list the tribunal keeps, §4.4.2). The v1 recommendation/related-element
 * helpers are not needed by the merged shape.
 *
 * @module frontend/overflow/fix-generator
 */

import type { OverflowPattern, FixOption } from './types.js';

/** Generate the fix-option list for an overflow pattern. */
export function generateFixes(pattern: OverflowPattern): FixOption[] {
  const fixes: FixOption[] = [];

  switch (pattern.type) {
    case 'fixed_parent_auto_children':
      if (pattern.parent) {
        fixes.push({
          location: 'inside', element: pattern.parent.element,
          fix: 'Add overflow handling to container', code_change: 'overflow-y-auto',
          trade_off: 'Content will scroll within container',
        });
        if (pattern.children && pattern.children.length > 0) {
          fixes.push({
            location: 'inside', element: pattern.children[0].element,
            fix: 'Add max-height and overflow to child content', code_change: 'max-h-full overflow-y-auto',
            trade_off: 'Individual child scrolls instead of container',
          });
        }
        fixes.push({
          location: 'outside', element: pattern.parent.element,
          fix: 'Remove fixed height constraint',
          code_change: `h-auto min-h-[${pattern.parent.sizing.height.value || 'original-height'}]`,
          trade_off: 'Container grows with content, may affect overall layout',
        });
      }
      break;

    case 'constrained_flex_no_overflow':
      if (pattern.element) {
        fixes.push({
          location: 'inside', element: pattern.element.element,
          fix: 'Add min-h-0 and overflow for proper flex scrolling', code_change: 'min-h-0 overflow-y-auto',
          trade_off: 'Required for nested flex containers to properly overflow',
        });
        fixes.push({
          location: 'inside', element: pattern.element.element,
          fix: 'Add overflow handling to flex container', code_change: 'overflow-y-auto',
          trade_off: 'Flex items scroll when exceeding container height',
        });
        fixes.push({
          location: 'outside', element: pattern.element.element,
          fix: 'Convert to auto height', code_change: 'h-auto', trade_off: 'Container grows with content',
        });
      }
      break;

    case 'nested_percentage_heights':
      if (pattern.element && pattern.parent) {
        fixes.push({
          location: 'chain', element: pattern.parent.element,
          fix: 'Add explicit height to parent for percentage to work', code_change: 'h-full',
          trade_off: 'Requires height chain from root',
        });
        fixes.push({
          location: 'inside', element: pattern.element.element,
          fix: 'Use flex-1 instead of percentage height', code_change: 'flex-1 min-h-0',
          trade_off: 'More reliable in flex contexts',
        });
      }
      break;

    case 'absolute_no_containment':
      if (pattern.parent) {
        fixes.push({
          location: 'chain', element: pattern.parent.element,
          fix: 'Add relative positioning to parent', code_change: 'relative',
          trade_off: 'Establishes positioning context for absolute child',
        });
        fixes.push({
          location: 'inside', element: pattern.parent.element,
          fix: 'Add overflow hidden to contain absolute element', code_change: 'relative overflow-hidden',
          trade_off: 'Clips any overflow from absolute positioned children',
        });
      }
      break;

    case 'flex_no_shrink':
      if (pattern.element) {
        fixes.push({
          location: 'inside', element: pattern.element.element,
          fix: 'Allow element to shrink', code_change: 'shrink (remove shrink-0)',
          trade_off: 'Element may become smaller than content size',
        });
        fixes.push({
          location: 'inside', element: pattern.element.element,
          fix: 'Add min-width-0 to allow shrinking', code_change: 'min-w-0',
          trade_off: 'Allows text truncation in flex items',
        });
      }
      break;

    case 'grid_overflow':
      if (pattern.element) {
        fixes.push({
          location: 'inside', element: pattern.element.element,
          fix: 'Add overflow handling to grid container', code_change: 'overflow-y-auto',
          trade_off: 'Grid items scroll when exceeding container',
        });
        fixes.push({
          location: 'outside', element: pattern.element.element,
          fix: 'Use auto-rows to allow content sizing', code_change: 'grid-rows-[auto_1fr]',
          trade_off: 'Grid adapts to content height',
        });
      }
      break;

    case 'min_height_zero_missing':
      if (pattern.element) {
        fixes.push({
          location: 'inside', element: pattern.element.element,
          fix: 'Add min-h-0 for proper flex overflow behavior', code_change: 'min-h-0',
          trade_off: 'Enables flex children to shrink below content size',
        });
        fixes.push({
          location: 'inside', element: pattern.element.element,
          fix: 'Add min-h-0 with overflow for scrollable content', code_change: 'min-h-0 overflow-y-auto',
          trade_off: 'Content scrolls within flex container',
        });
      }
      break;
  }

  return fixes;
}
