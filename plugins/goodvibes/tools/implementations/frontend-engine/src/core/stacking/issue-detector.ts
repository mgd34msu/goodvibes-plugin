/**
 * Issue Detector for Stacking Context
 *
 * Detects potential stacking and z-index issues.
 *
 * @module core/stacking/issue-detector
 */

import type { ElementInfo, ZIndexInfo, StackingIssue, StackingThresholds } from './types.js';
import { DEFAULT_STACKING_THRESHOLDS } from './types.js';

/**
 * CSS class names for flex/grid display utilities.
 * Flex/grid children can use z-index without position, so we flag
 * these separately rather than treating them as errors.
 */
const FLEX_GRID_CLASSES = ['flex', 'grid', 'inline-flex', 'inline-grid'];

/**
 * Reason strings returned by context-rules.ts createsStackingContext()
 * that represent isolation-style stacking contexts (not positional).
 * These are matched against elem.context_reason to detect cases where
 * child z-index values are trapped inside an accidentally isolated context.
 */
const ISOLATION_CAUSING_REASONS = ['isolate', 'transform', 'filter', 'opacity'];

/**
 * Detect potential stacking issues
 * @param elements - Flat list of analyzed elements
 * @param zIndexValues - Collected z-index values
 * @param thresholds - Optional threshold overrides (falls back to DEFAULT_STACKING_THRESHOLDS)
 */
export function detectStackingIssues(
  elements: ElementInfo[],
  zIndexValues: ZIndexInfo[],
  thresholds?: Partial<StackingThresholds>
): StackingIssue[] {
  const t: StackingThresholds = { ...DEFAULT_STACKING_THRESHOLDS, ...thresholds };
  const issues: StackingIssue[] = [];

  // Issue 1: z-index inflation (too many high z-index values)
  const highZElements = zIndexValues.filter((z) => z.z_index >= t.highZIndex);
  if (highZElements.length > t.zInflationCount) {
    issues.push({
      issue: 'z-index inflation detected',
      elements: highZElements.map((z) => `${z.element} (z-${z.z_index})`),
      explanation:
        `Multiple elements with z-index >= ${t.highZIndex} indicate potential layering confusion. ` +
        'This often leads to an "arms race" where z-index values keep increasing.',
      fix:
        'Restructure components to use fewer z-index values. Consider using ' +
        'CSS isolation ("isolate" class) to create local stacking contexts, ' +
        'or reorganize DOM structure so fewer elements need explicit z-index.',
    });
  }

  // Issue 2: Very high z-index values
  const veryHighZ = zIndexValues.filter((z) => z.z_index >= t.veryHighZIndex);
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
  // Note: flex/grid children legitimately use z-index without position, but we can only
  // detect flex/grid utility classes on the *same* element (not its parent) statically.
  const zWithoutPosition = elements.filter((elem) => {
    const hasZ = typeof elem.z_index === 'number';
    const hasPosition = elem.classes.some((c) =>
      ['relative', 'absolute', 'fixed', 'sticky'].includes(c)
    );
    return hasZ && !hasPosition;
  });

  // Separate: elements with z-index, no position, but flex/grid on the same element
  // — these are likely valid (parent container) but worth noting
  const zWithFlexGrid = zWithoutPosition.filter((elem) =>
    elem.classes.some((c) => FLEX_GRID_CLASSES.includes(c))
  );
  const zTrulyWithoutContext = zWithoutPosition.filter(
    (elem) => !elem.classes.some((c) => FLEX_GRID_CLASSES.includes(c))
  );

  if (zTrulyWithoutContext.length > 0) {
    issues.push({
      issue: 'z-index without positioning context',
      elements: zTrulyWithoutContext.map((e) => e.element),
      explanation:
        'Elements with z-index but no position (relative, absolute, fixed, sticky) ' +
        'will not have their z-index applied unless they are flex or grid children. ' +
        'Static elements ignore z-index entirely.',
      fix:
        'Add "relative" class to elements that need z-index to work. ' +
        'Example: className="relative z-10" instead of just "z-10". ' +
        'If this element is a flex/grid child, z-index will work without position.',
    });
  }

  if (zWithFlexGrid.length > 0) {
    issues.push({
      issue: 'z-index on flex/grid container without position',
      elements: zWithFlexGrid.map((e) => e.element),
      explanation:
        'These elements use z-index with flex/grid display utilities but no explicit position. ' +
        'If they are themselves flex/grid children, z-index will work correctly. ' +
        'However, if they are at the top of their stacking context, z-index may not apply as expected.',
      fix:
        'Verify this element is a child of a flex or grid parent for z-index to take effect. ' +
        'If not, add "relative" to establish a positioning context.',
    });
  }

  // Issue 4: Isolated contexts preventing expected layering
  const isolatedContexts = elements.filter(
    (elem) =>
      elem.creates_context &&
      elem.context_reason &&
      ISOLATION_CAUSING_REASONS.includes(elem.context_reason.toLowerCase())
  );

  if (isolatedContexts.length > 0) {
    // Check if there are z-index values inside these contexts
    for (const ctx of isolatedContexts) {
      const childrenWithZ = zIndexValues.filter(
        (z) => z.context_parent === ctx.element
      );

      if (childrenWithZ.some((z) => z.z_index > t.isolationChildZIndex)) {
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
