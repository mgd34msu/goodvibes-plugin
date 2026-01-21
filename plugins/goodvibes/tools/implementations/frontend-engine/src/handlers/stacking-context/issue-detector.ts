/**
 * Issue Detector for Stacking Context
 *
 * Detects potential stacking and z-index issues.
 *
 * @module handlers/frontend/stacking-context/issue-detector
 */

import type { ElementInfo, ZIndexInfo, StackingIssue } from './types.js';

/**
 * Detect potential stacking issues
 */
export function detectStackingIssues(
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
    // If element has z-index but no position, it's a potential issue
    // (unless it's a flex/grid child - but we can't know that statically)
    return hasZ && !hasPosition;
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
