/**
 * Issue Detector for Responsive Breakpoints
 *
 * Detects potential responsive design issues.
 *
 * @module handlers/frontend/responsive-breakpoints/issue-detector
 */

import type { ElementAnalysis, Warning } from './types.js';
import { BREAKPOINTS } from './constants.js';
import { getPropertyFromClass } from './class-parser.js';

/**
 * Detect potential responsive design issues
 */
export function detectIssues(elements: ElementAnalysis[]): Warning[] {
  const warnings: Warning[] = [];

  for (const el of elements) {
    // Issue 1: Desktop-first pattern - property defined at lg: but not at base
    for (const change of el.property_changes) {
      if (change.base_value === '' && change.transitions.length > 0) {
        const firstBreakpoint = change.transitions[0].breakpoint;

        // Skip if it starts from sm (might be intentional hide-on-mobile)
        if (firstBreakpoint !== 'sm') {
          warnings.push({
            element: el.element,
            breakpoint: firstBreakpoint,
            issue: `Desktop-first pattern: "${change.property}" only defined at ${firstBreakpoint}: breakpoint with no mobile base`,
            suggestion: `Add base mobile class for ${change.property} (mobile-first approach)`,
          });
        }
      }
    }

    // Issue 2: Hidden on mobile without show class
    const hasHiddenBase = el.classes_by_breakpoint.base.includes('hidden');
    const hasBlockBreakpoint = BREAKPOINTS.some((bp) => {
      const classes = el.classes_by_breakpoint[bp];
      return classes?.some((c) => ['block', 'flex', 'grid', 'inline', 'inline-block', 'inline-flex', 'inline-grid'].includes(c));
    });

    if (hasHiddenBase && !hasBlockBreakpoint) {
      warnings.push({
        element: el.element,
        issue: 'Element hidden on mobile but never shown at larger breakpoints',
        suggestion: 'Add a breakpoint display class (e.g., md:block) to show the element on larger screens',
      });
    }

    // Issue 3: Gap in breakpoint coverage (e.g., sm and xl defined, but md skipped)
    const usedBreakpoints = BREAKPOINTS.filter((bp) => {
      const classes = el.classes_by_breakpoint[bp];
      return classes && classes.length > 0;
    });

    if (usedBreakpoints.length >= 2) {
      const indices = usedBreakpoints.map((bp) => BREAKPOINTS.indexOf(bp));
      for (let i = 1; i < indices.length; i++) {
        const gap = indices[i] - indices[i - 1];
        if (gap > 1) {
          const skippedBreakpoints = BREAKPOINTS.slice(indices[i - 1] + 1, indices[i]);
          warnings.push({
            element: el.element,
            issue: `Breakpoint gap: defined at ${usedBreakpoints[i - 1]} and ${usedBreakpoints[i]}, skipping ${skippedBreakpoints.join(', ')}`,
            suggestion: `Consider if ${skippedBreakpoints.join(', ')} breakpoints need specific styling`,
          });
        }
      }
    }

    // Issue 4: Conflicting flex-direction without proper breakpoint organization
    const flexDirectionChanges = el.property_changes.find((p) => p.property === 'flex-direction');
    if (flexDirectionChanges && flexDirectionChanges.transitions.length > 0) {
      const hasBaseDirection = flexDirectionChanges.base_value !== '';
      if (!hasBaseDirection) {
        warnings.push({
          element: el.element,
          issue: 'flex-direction changes at breakpoint without base direction',
          suggestion: 'Add base flex-direction class (e.g., flex-col for mobile, then md:flex-row)',
        });
      }
    }

    // Issue 5: Multiple display property classes at same breakpoint
    for (const [bpKey, classes] of Object.entries(el.classes_by_breakpoint)) {
      if (!classes) continue;
      const displayClasses = classes.filter((c: string) => getPropertyFromClass(c) === 'display');
      if (displayClasses.length > 1) {
        warnings.push({
          element: el.element,
          breakpoint: bpKey === 'base' ? undefined : bpKey,
          issue: `Multiple display classes at ${bpKey}: ${displayClasses.join(', ')}`,
          suggestion: 'Use only one display class per breakpoint',
        });
      }
    }
  }

  return warnings;
}
