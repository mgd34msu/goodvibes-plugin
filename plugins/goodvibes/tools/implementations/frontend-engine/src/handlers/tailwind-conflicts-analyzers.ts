/**
 * Tailwind Conflicts Analyzers
 *
 * Conflict detection, redundancy detection, specificity issues,
 * and optimization suggestions for Tailwind CSS classes.
 *
 * @module handlers/frontend/tailwind-conflicts-analyzers
 */

import {
  CONTRADICTIONS,
  SHORTHAND_MAP,
  SIZE_SETS_BOTH,
  stripPrefixes,
  groupByVariant,
  getCategory,
  getShorthandPrefix,
  longhandOverridesShorthand,
  getBreakpointPrefix,
} from './tailwind-conflicts-utils.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Conflict type classification
 */
export type ConflictType = 'override' | 'redundant' | 'contradiction';

/**
 * A detected class conflict
 */
export interface Conflict {
  /** Element identifier (tag name with line) */
  element: string;
  /** Line number in source */
  line: number;
  /** Classes involved in the conflict */
  classes: string[];
  /** Type of conflict */
  conflict_type: ConflictType;
  /** Human-readable explanation */
  explanation: string;
  /** Suggested fix */
  fix: string;
}

/**
 * A redundant class detection
 */
export interface RedundantClass {
  /** Element identifier */
  element: string;
  /** The redundant class */
  class: string;
  /** Reason why it's redundant */
  reason: string;
}

/**
 * A specificity/cascade issue
 */
export interface SpecificityIssue {
  /** Element identifier */
  element: string;
  /** Description of the issue */
  issue: string;
  /** What's overriding the expected behavior */
  overriding_source?: string;
  /** Suggested fix */
  fix: string;
}

/**
 * A suggested improvement
 */
export interface Suggestion {
  /** Element identifier */
  element: string;
  /** Current class string */
  current: string;
  /** Suggested replacement */
  suggested: string;
  /** Reason for the suggestion */
  reason: string;
}

/**
 * Internal element representation
 */
export interface ElementInfo {
  /** Element identifier */
  element: string;
  /** Line number */
  line: number;
  /** All CSS classes */
  classes: string[];
  /** Raw className string */
  rawClassName: string;
}

// =============================================================================
// Conflict Detection
// =============================================================================

/**
 * Detect conflicts within a set of classes
 */
export function detectConflicts(
  element: string,
  line: number,
  classes: string[],
  includeArbitrary: boolean
): { conflicts: Conflict[]; redundant: RedundantClass[] } {
  const conflicts: Conflict[] = [];
  const redundant: RedundantClass[] = [];

  // Group by variant to only compare classes at the same variant level
  // This prevents flagging dark:text-white text-black as a conflict
  const variantGroups = groupByVariant(classes);

  for (const [variant, bpClasses] of variantGroups) {
    const breakpointLabel = variant ? `@${variant.slice(0, -1)}` : 'base';

    // Track seen categories and their classes
    const seenCategories = new Map<string, { class: string; index: number }>();

    // Track class pairs already reported as category overrides to avoid double-reporting as contradictions
    const categoryOverridePairs = new Set<string>();

    // Track shorthand classes
    const shorthandClasses = new Map<string, { class: string; index: number }>();

    for (let i = 0; i < bpClasses.length; i++) {
      const cls = bpClasses[i];
      const stripped = stripPrefixes(cls);

      // Skip arbitrary values if not included
      if (!includeArbitrary && stripped.includes('[')) {
        continue;
      }

      // Check for category conflicts (same CSS property set multiple times)
      const category = getCategory(cls);
      if (category) {
        if (seenCategories.has(category)) {
          const prev = seenCategories.get(category)!;
          conflicts.push({
            element,
            line,
            classes: [prev.class, cls],
            conflict_type: 'override',
            explanation: `"${cls}" overrides "${prev.class}" (both set ${category})`,
            fix: `Remove "${prev.class}" since "${cls}" takes precedence`,
          });
          // Track this pair to avoid double-reporting as contradiction
          const pairKey = [stripPrefixes(prev.class), stripped].sort().join('|');
          categoryOverridePairs.add(pairKey);
        }
        seenCategories.set(category, { class: cls, index: i });
      }

      // Check for shorthand/longhand conflicts
      const shorthandPrefix = getShorthandPrefix(cls);
      if (shorthandPrefix && SHORTHAND_MAP[shorthandPrefix]) {
        // This is a shorthand class, check if any longhand was seen
        for (const [seenPrefix, seenData] of shorthandClasses) {
          if (longhandOverridesShorthand(seenData.class, cls)) {
            // Longhand came before shorthand - shorthand will override
            conflicts.push({
              element,
              line,
              classes: [seenData.class, cls],
              conflict_type: 'override',
              explanation: `"${cls}" partially overrides "${seenData.class}"`,
              fix: `Remove "${seenData.class}" or move it after "${cls}" if you want it to take precedence`,
            });
          }
        }
        shorthandClasses.set(shorthandPrefix, { class: cls, index: i });
      }

      // Check for longhand after shorthand (redundancy)
      for (const [shortPrefix, shortData] of shorthandClasses) {
        if (longhandOverridesShorthand(shortData.class, cls)) {
          const shortStripped = stripPrefixes(shortData.class);
          const longStripped = stripped;

          redundant.push({
            element,
            class: shortData.class,
            reason: `Partially overridden by "${cls}" - the ${longStripped.replace(/-\d+$/, '')} from "${shortStripped}" is redundant`,
          });
        }
      }

      // Check for contradiction pairs
      // Contradictions are mutually exclusive classes that cannot coexist
      // (like flex/grid, hidden/flex, invisible/visible, flex-row/flex-col)
      for (const pair of CONTRADICTIONS) {
        const strippedLower = stripped.toLowerCase();
        if (pair.includes(stripped) || pair.includes(strippedLower)) {
          const otherClass = pair.find((p) => p !== stripped && p !== strippedLower);
          if (otherClass) {
            // Look for the other class in previous classes
            for (let j = 0; j < i; j++) {
              const prevStripped = stripPrefixes(bpClasses[j]);
              if (prevStripped === otherClass || prevStripped.toLowerCase() === otherClass) {
                // Skip if this pair was already reported as a category override,
                // UNLESS it's a "true contradiction" (e.g., hidden vs visible display,
                // or mutually exclusive layout modes like flex/grid)
                const pairKey = [prevStripped, stripped].sort().join('|');
                if (categoryOverridePairs.has(pairKey)) {
                  // Check if this is a TRUE contradiction that should still be reported
                  // True contradictions involve: hidden, flex/grid pair, invisible/visible, etc.
                  const isTrueContradiction =
                    pair.includes('hidden') ||
                    pair.includes('invisible') ||
                    pair.includes('visible') ||
                    (pair.includes('flex') && pair.includes('grid')) ||
                    pair.some((p) => p.startsWith('flex-')) ||
                    pair.some((p) => p.startsWith('grow')) ||
                    pair.some((p) => p.startsWith('shrink')) ||
                    pair.some((p) => p.startsWith('text-'));

                  if (!isTrueContradiction) {
                    continue;
                  }
                }
                conflicts.push({
                  element,
                  line,
                  classes: [bpClasses[j], cls],
                  conflict_type: 'contradiction',
                  explanation: `"${cls}" contradicts "${bpClasses[j]}" - these are mutually exclusive`,
                  fix: `Remove one of these classes based on your intended design`,
                });
              }
            }
          }
        }
      }

      // Check for size- conflicts with w- or h-
      if (stripped.startsWith(SIZE_SETS_BOTH)) {
        for (let j = 0; j < bpClasses.length; j++) {
          if (j === i) continue;
          const otherStripped = stripPrefixes(bpClasses[j]);
          if (otherStripped.startsWith('w-') || otherStripped.startsWith('h-')) {
            const prop = otherStripped.startsWith('w-') ? 'width' : 'height';
            if (j < i) {
              conflicts.push({
                element,
                line,
                classes: [bpClasses[j], cls],
                conflict_type: 'override',
                explanation: `"${cls}" sets both width and height, overriding "${bpClasses[j]}"`,
                fix: `Remove "${bpClasses[j]}" since "size-" sets both dimensions`,
              });
            } else {
              conflicts.push({
                element,
                line,
                classes: [cls, bpClasses[j]],
                conflict_type: 'override',
                explanation: `"${bpClasses[j]}" overrides the ${prop} set by "${cls}"`,
                fix: `Consider using specific w- and h- classes instead of size- if you need different values`,
              });
            }
          }
        }
      }
    }
  }

  return { conflicts, redundant };
}

// =============================================================================
// Specificity Issue Detection
// =============================================================================

/**
 * Detect specificity issues
 */
export function detectSpecificityIssues(element: string, classes: string[]): SpecificityIssue[] {
  const issues: SpecificityIssue[] = [];

  // Check for !important patterns (Tailwind's ! prefix modifier)
  const importantClasses = classes.filter((c) => c.startsWith('!') || c.includes(':!'));
  if (importantClasses.length > 0) {
    // Check if there are conflicting classes with the same property
    for (const importantCls of importantClasses) {
      const category = getCategory(importantCls);
      if (category) {
        // Find any other class with the same category
        const conflicting = classes.filter(
          (c) => c !== importantCls && getCategory(c) === category
        );
        if (conflicting.length > 0) {
          issues.push({
            element,
            issue: `!important modifier on "${importantCls}" may override "${conflicting.join(', ')}"`,
            overriding_source: 'Tailwind !important modifier',
            fix: 'Remove one of the conflicting classes or restructure to avoid !important',
          });
        }
      }
    }

    // Also warn if multiple !important modifiers are used
    if (importantClasses.length > 2) {
      issues.push({
        element,
        issue: `Multiple !important modifiers used (${importantClasses.length} classes)`,
        overriding_source: 'Tailwind !important modifier',
        fix: 'Reduce !important usage; restructure CSS specificity instead',
      });
    }
  }

  // Check for z-index without position
  const hasZIndex = classes.some((c) => {
    const stripped = stripPrefixes(c);
    return stripped.startsWith('z-') && !stripped.startsWith('z-auto');
  });
  const hasPosition = classes.some((c) => {
    const stripped = stripPrefixes(c);
    return ['relative', 'absolute', 'fixed', 'sticky'].includes(stripped);
  });

  if (hasZIndex && !hasPosition) {
    issues.push({
      element,
      issue: 'z-index class without explicit position',
      fix: 'Add "relative" to enable z-index (or ensure element is a flex/grid child)',
    });
  }

  return issues;
}

// =============================================================================
// Suggestion Generation
// =============================================================================

/**
 * Generate optimization suggestions
 */
export function generateSuggestions(
  element: string,
  classes: string[],
  rawClassName: string
): Suggestion[] {
  const suggestions: Suggestion[] = [];

  // Suggestion: Use size- instead of same w- and h-
  const widthClasses = classes.filter((c) => stripPrefixes(c).match(/^w-\d+$/));
  const heightClasses = classes.filter((c) => stripPrefixes(c).match(/^h-\d+$/));

  for (const wCls of widthClasses) {
    const wStripped = stripPrefixes(wCls);
    const wValue = wStripped.replace('w-', '');

    for (const hCls of heightClasses) {
      const hStripped = stripPrefixes(hCls);
      const hValue = hStripped.replace('h-', '');

      // Check if they have the same prefix (breakpoint) and value
      const wPrefix = getBreakpointPrefix(wCls);
      const hPrefix = getBreakpointPrefix(hCls);

      if (wPrefix === hPrefix && wValue === hValue) {
        const prefix = wPrefix ? `${wPrefix}:` : '';
        suggestions.push({
          element,
          current: `${wCls} ${hCls}`,
          suggested: `${prefix}size-${wValue}`,
          reason: 'Use size-X shorthand when width and height are equal',
        });
      }
    }
  }

  // Suggestion: Consolidate padding/margin if all sides are set
  const paddingClasses = classes.filter((c) => {
    const stripped = stripPrefixes(c);
    return stripped.match(/^p[trbl]-\d+$/);
  });

  if (paddingClasses.length === 4) {
    const values = paddingClasses.map((c) => stripPrefixes(c).replace(/^p[trbl]-/, ''));
    if (new Set(values).size === 1) {
      suggestions.push({
        element,
        current: paddingClasses.join(' '),
        suggested: `p-${values[0]}`,
        reason: 'Use p-X shorthand when all padding sides are equal',
      });
    }
  }

  // Suggestion: Use px-/py- when left/right or top/bottom are equal
  const pxClasses = classes.filter((c) => {
    const stripped = stripPrefixes(c);
    return stripped.match(/^p[lr]-\d+$/);
  });

  if (pxClasses.length === 2) {
    const leftVal = pxClasses.find((c) => stripPrefixes(c).startsWith('pl-'));
    const rightVal = pxClasses.find((c) => stripPrefixes(c).startsWith('pr-'));

    if (leftVal && rightVal) {
      const lv = stripPrefixes(leftVal).replace('pl-', '');
      const rv = stripPrefixes(rightVal).replace('pr-', '');
      if (lv === rv) {
        suggestions.push({
          element,
          current: `${leftVal} ${rightVal}`,
          suggested: `px-${lv}`,
          reason: 'Use px-X shorthand when left and right padding are equal',
        });
      }
    }
  }

  return suggestions;
}
