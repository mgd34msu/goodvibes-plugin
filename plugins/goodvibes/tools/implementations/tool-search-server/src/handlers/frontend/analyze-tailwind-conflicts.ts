/**
 * Analyze Tailwind Conflicts Handler
 *
 * Detects conflicting and redundant Tailwind CSS classes in React/Vue/Svelte
 * components. Identifies overrides, redundant shorthand/longhand combinations,
 * contradictory classes, and provides fix suggestions.
 *
 * @module handlers/frontend/analyze-tailwind-conflicts
 */

import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';

// =============================================================================
// Types
// =============================================================================

/**
 * Arguments for the analyze_tailwind_conflicts tool
 */
export interface AnalyzeTailwindConflictsArgs {
  /** File path to analyze (relative to project root or absolute) */
  file: string;
  /** Check arbitrary values like [100px] (default true) */
  include_arbitrary?: boolean;
}

/**
 * Conflict type classification
 */
type ConflictType = 'override' | 'redundant' | 'contradiction';

/**
 * A detected class conflict
 */
interface Conflict {
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
interface RedundantClass {
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
interface SpecificityIssue {
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
interface Suggestion {
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
 * Complete analysis result
 */
interface AnalyzeTailwindConflictsResult {
  /** File that was analyzed */
  file: string;
  /** Number of elements analyzed */
  elements_analyzed: number;
  /** Detected conflicts */
  conflicts: Conflict[];
  /** Redundant classes */
  redundant_classes: RedundantClass[];
  /** Specificity issues */
  specificity_issues: SpecificityIssue[];
  /** Improvement suggestions */
  suggestions: Suggestion[];
  /** Summary of findings */
  summary: string;
}

/**
 * Tool response format
 */
interface ToolResponse {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

/**
 * Internal element representation
 */
interface ElementInfo {
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
// Class Category Mapping
// =============================================================================

/**
 * Maps CSS property categories to their Tailwind class prefixes
 */
const CLASS_CATEGORIES: Record<string, string[]> = {
  // Spacing - Padding
  'padding': ['p-'],
  'padding-x': ['px-'],
  'padding-y': ['py-'],
  'padding-top': ['pt-'],
  'padding-right': ['pr-'],
  'padding-bottom': ['pb-'],
  'padding-left': ['pl-'],
  'padding-start': ['ps-'],
  'padding-end': ['pe-'],

  // Spacing - Margin
  'margin': ['m-'],
  'margin-x': ['mx-'],
  'margin-y': ['my-'],
  'margin-top': ['mt-'],
  'margin-right': ['mr-'],
  'margin-bottom': ['mb-'],
  'margin-left': ['ml-'],
  'margin-start': ['ms-'],
  'margin-end': ['me-'],

  // Sizing
  'width': ['w-'],
  'min-width': ['min-w-'],
  'max-width': ['max-w-'],
  'height': ['h-'],
  'min-height': ['min-h-'],
  'max-height': ['max-h-'],
  'size': ['size-'],

  // Display
  'display': [
    'block', 'inline', 'inline-block', 'flex', 'inline-flex',
    'grid', 'inline-grid', 'hidden', 'contents', 'flow-root',
    'table', 'table-row', 'table-cell', 'table-caption',
    'list-item',
  ],

  // Position
  'position': ['static', 'relative', 'absolute', 'fixed', 'sticky'],

  // Visibility
  'visibility': ['visible', 'invisible', 'collapse'],

  // Flex Direction
  'flex-direction': ['flex-row', 'flex-col', 'flex-row-reverse', 'flex-col-reverse'],

  // Flex Wrap
  'flex-wrap': ['flex-wrap', 'flex-nowrap', 'flex-wrap-reverse'],

  // Flex
  'flex': ['flex-1', 'flex-auto', 'flex-initial', 'flex-none'],

  // Flex Grow
  'flex-grow': ['grow', 'grow-0'],

  // Flex Shrink
  'flex-shrink': ['shrink', 'shrink-0'],

  // Justify Content
  'justify-content': [
    'justify-start', 'justify-end', 'justify-center',
    'justify-between', 'justify-around', 'justify-evenly', 'justify-stretch',
  ],

  // Align Items
  'align-items': [
    'items-start', 'items-end', 'items-center',
    'items-baseline', 'items-stretch',
  ],

  // Align Self
  'align-self': [
    'self-auto', 'self-start', 'self-end', 'self-center',
    'self-stretch', 'self-baseline',
  ],

  // Grid Columns
  'grid-template-columns': ['grid-cols-'],

  // Grid Rows
  'grid-template-rows': ['grid-rows-'],

  // Gap
  'gap': ['gap-'],
  'gap-x': ['gap-x-'],
  'gap-y': ['gap-y-'],

  // Text Color
  'text-color': ['text-'],

  // Background Color
  'bg-color': ['bg-'],

  // Font Size
  'font-size': [
    'text-xs', 'text-sm', 'text-base', 'text-lg',
    'text-xl', 'text-2xl', 'text-3xl', 'text-4xl',
    'text-5xl', 'text-6xl', 'text-7xl', 'text-8xl', 'text-9xl',
  ],

  // Font Weight
  'font-weight': [
    'font-thin', 'font-extralight', 'font-light', 'font-normal',
    'font-medium', 'font-semibold', 'font-bold', 'font-extrabold', 'font-black',
  ],

  // Text Align
  'text-align': [
    'text-left', 'text-center', 'text-right', 'text-justify',
    'text-start', 'text-end',
  ],

  // Border Radius
  'border-radius': ['rounded-'],
  'border-radius-t': ['rounded-t-'],
  'border-radius-r': ['rounded-r-'],
  'border-radius-b': ['rounded-b-'],
  'border-radius-l': ['rounded-l-'],
  'border-radius-tl': ['rounded-tl-'],
  'border-radius-tr': ['rounded-tr-'],
  'border-radius-bl': ['rounded-bl-'],
  'border-radius-br': ['rounded-br-'],

  // Border Width
  'border-width': ['border-'],
  'border-width-t': ['border-t-'],
  'border-width-r': ['border-r-'],
  'border-width-b': ['border-b-'],
  'border-width-l': ['border-l-'],
  'border-width-x': ['border-x-'],
  'border-width-y': ['border-y-'],

  // Z-Index
  'z-index': ['z-'],

  // Overflow
  'overflow': ['overflow-'],
  'overflow-x': ['overflow-x-'],
  'overflow-y': ['overflow-y-'],

  // Opacity
  'opacity': ['opacity-'],

  // Cursor
  'cursor': ['cursor-'],

  // Pointer Events
  'pointer-events': ['pointer-events-'],

  // User Select
  'user-select': ['select-'],

  // Transition
  'transition': ['transition-'],
  'transition-duration': ['duration-'],
  'transition-timing': ['ease-'],
  'transition-delay': ['delay-'],

  // Transform
  'rotate': ['rotate-'],
  'scale': ['scale-'],
  'translate-x': ['translate-x-'],
  'translate-y': ['translate-y-'],

  // Object Fit
  'object-fit': ['object-contain', 'object-cover', 'object-fill', 'object-none', 'object-scale-down'],

  // Object Position
  'object-position': [
    'object-bottom', 'object-center', 'object-left', 'object-left-bottom',
    'object-left-top', 'object-right', 'object-right-bottom', 'object-right-top', 'object-top',
  ],

  // Aspect Ratio
  'aspect-ratio': ['aspect-'],

  // Inset
  'inset': ['inset-'],
  'inset-x': ['inset-x-'],
  'inset-y': ['inset-y-'],
  'top': ['top-'],
  'right': ['right-'],
  'bottom': ['bottom-'],
  'left': ['left-'],
  'start': ['start-'],
  'end': ['end-'],

  // Line Height
  'line-height': ['leading-'],

  // Letter Spacing
  'letter-spacing': ['tracking-'],

  // White Space
  'white-space': ['whitespace-'],

  // Word Break
  'word-break': ['break-normal', 'break-words', 'break-all', 'break-keep'],

  // Text Overflow
  'text-overflow': ['truncate', 'text-ellipsis', 'text-clip'],

  // Text Decoration
  'text-decoration': ['underline', 'overline', 'line-through', 'no-underline'],

  // Text Transform
  'text-transform': ['uppercase', 'lowercase', 'capitalize', 'normal-case'],

  // Font Style
  'font-style': ['italic', 'not-italic'],

  // Box Shadow
  'box-shadow': ['shadow-'],

  // Ring
  'ring': ['ring-'],
  'ring-offset': ['ring-offset-'],

  // Outline
  'outline': ['outline-'],
  'outline-offset': ['outline-offset-'],

  // Filter
  'blur': ['blur-'],
  'brightness': ['brightness-'],
  'contrast': ['contrast-'],
  'grayscale': ['grayscale-', 'grayscale'],
  'hue-rotate': ['hue-rotate-'],
  'invert': ['invert-', 'invert'],
  'saturate': ['saturate-'],
  'sepia': ['sepia-', 'sepia'],
  'drop-shadow': ['drop-shadow-'],

  // Backdrop Filter
  'backdrop-blur': ['backdrop-blur-'],
  'backdrop-brightness': ['backdrop-brightness-'],
  'backdrop-contrast': ['backdrop-contrast-'],
  'backdrop-grayscale': ['backdrop-grayscale-', 'backdrop-grayscale'],
  'backdrop-hue-rotate': ['backdrop-hue-rotate-'],
  'backdrop-invert': ['backdrop-invert-', 'backdrop-invert'],
  'backdrop-opacity': ['backdrop-opacity-'],
  'backdrop-saturate': ['backdrop-saturate-'],
  'backdrop-sepia': ['backdrop-sepia-', 'backdrop-sepia'],
};

/**
 * Shorthand to longhand mappings for detecting redundant classes
 * The shorthand class sets multiple properties that longhand classes override
 */
const SHORTHAND_MAP: Record<string, string[]> = {
  // Padding shorthand
  'p-': ['px-', 'py-', 'pt-', 'pr-', 'pb-', 'pl-', 'ps-', 'pe-'],
  'px-': ['pr-', 'pl-'],
  'py-': ['pt-', 'pb-'],

  // Margin shorthand
  'm-': ['mx-', 'my-', 'mt-', 'mr-', 'mb-', 'ml-', 'ms-', 'me-'],
  'mx-': ['mr-', 'ml-'],
  'my-': ['mt-', 'mb-'],

  // Inset shorthand
  'inset-': ['inset-x-', 'inset-y-', 'top-', 'right-', 'bottom-', 'left-', 'start-', 'end-'],
  'inset-x-': ['right-', 'left-', 'start-', 'end-'],
  'inset-y-': ['top-', 'bottom-'],

  // Border radius shorthand
  'rounded-': [
    'rounded-t-', 'rounded-r-', 'rounded-b-', 'rounded-l-',
    'rounded-tl-', 'rounded-tr-', 'rounded-bl-', 'rounded-br-',
  ],
  'rounded-t-': ['rounded-tl-', 'rounded-tr-'],
  'rounded-r-': ['rounded-tr-', 'rounded-br-'],
  'rounded-b-': ['rounded-bl-', 'rounded-br-'],
  'rounded-l-': ['rounded-tl-', 'rounded-bl-'],

  // Border width shorthand
  'border-': ['border-t-', 'border-r-', 'border-b-', 'border-l-', 'border-x-', 'border-y-'],
  'border-x-': ['border-r-', 'border-l-'],
  'border-y-': ['border-t-', 'border-b-'],

  // Gap shorthand
  'gap-': ['gap-x-', 'gap-y-'],

  // Overflow shorthand
  'overflow-': ['overflow-x-', 'overflow-y-'],

  // Scale shorthand
  'scale-': ['scale-x-', 'scale-y-'],
};

/**
 * Classes that contradict each other (mutually exclusive)
 */
const CONTRADICTIONS: string[][] = [
  // Display contradictions
  ['hidden', 'flex'],
  ['hidden', 'block'],
  ['hidden', 'grid'],
  ['hidden', 'inline'],
  ['hidden', 'inline-block'],
  ['hidden', 'inline-flex'],
  ['hidden', 'inline-grid'],
  ['hidden', 'contents'],
  ['hidden', 'flow-root'],
  ['hidden', 'table'],

  // Visibility contradictions
  ['invisible', 'visible'],

  // Position contradictions
  ['static', 'relative'],
  ['static', 'absolute'],
  ['static', 'fixed'],
  ['static', 'sticky'],
  ['relative', 'absolute'],
  ['relative', 'fixed'],
  ['relative', 'sticky'],
  ['absolute', 'fixed'],
  ['absolute', 'sticky'],
  ['fixed', 'sticky'],

  // Flex direction contradictions
  ['flex-row', 'flex-col'],
  ['flex-row', 'flex-col-reverse'],
  ['flex-row', 'flex-row-reverse'],
  ['flex-col', 'flex-col-reverse'],
  ['flex-col', 'flex-row-reverse'],
  ['flex-row-reverse', 'flex-col-reverse'],

  // Flex wrap contradictions
  ['flex-wrap', 'flex-nowrap'],
  ['flex-wrap', 'flex-wrap-reverse'],
  ['flex-nowrap', 'flex-wrap-reverse'],

  // Text align contradictions
  ['text-left', 'text-center'],
  ['text-left', 'text-right'],
  ['text-left', 'text-justify'],
  ['text-center', 'text-right'],
  ['text-center', 'text-justify'],
  ['text-right', 'text-justify'],

  // Font style contradictions
  ['italic', 'not-italic'],

  // Text decoration contradictions
  ['underline', 'no-underline'],
  ['line-through', 'no-underline'],
  ['overline', 'no-underline'],

  // Text transform contradictions
  ['uppercase', 'lowercase'],
  ['uppercase', 'capitalize'],
  ['uppercase', 'normal-case'],
  ['lowercase', 'capitalize'],
  ['lowercase', 'normal-case'],
  ['capitalize', 'normal-case'],

  // Grow/shrink contradictions
  ['grow', 'grow-0'],
  ['shrink', 'shrink-0'],

  // Object fit contradictions
  ['object-contain', 'object-cover'],
  ['object-contain', 'object-fill'],
  ['object-contain', 'object-none'],
  ['object-contain', 'object-scale-down'],
  ['object-cover', 'object-fill'],
  ['object-cover', 'object-none'],
  ['object-cover', 'object-scale-down'],
  ['object-fill', 'object-none'],
  ['object-fill', 'object-scale-down'],
  ['object-none', 'object-scale-down'],
];

/**
 * Size class sets both width and height
 */
const SIZE_SETS_BOTH = 'size-';

// =============================================================================
// Response Helpers
// =============================================================================

function createSuccessResponse<T>(data: T): ToolResponse {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  };
}

function createErrorResponse(message: string, context?: Record<string, unknown>): ToolResponse {
  return {
    content: [{ type: 'text', text: JSON.stringify({ error: message, ...context }, null, 2) }],
    isError: true,
  };
}

// =============================================================================
// Class Analysis Utilities
// =============================================================================

/**
 * Strip responsive/state prefixes from a class
 * e.g., "md:hover:bg-red-500" -> "bg-red-500"
 */
function stripPrefixes(cls: string): string {
  // Common prefixes: breakpoints, states, dark mode
  const prefixPattern = /^(?:(?:sm|md|lg|xl|2xl|dark|light|hover|focus|active|disabled|group-hover|focus-within|focus-visible|first|last|odd|even|motion-safe|motion-reduce|print|portrait|landscape|placeholder|selection|marker|before|after|file|open|closed|data-\[.+?\]|aria-\[.+?\]):)*/;
  return cls.replace(prefixPattern, '');
}

/**
 * Extract the breakpoint prefix from a class if present
 */
function getBreakpointPrefix(cls: string): string | null {
  const match = cls.match(/^(sm|md|lg|xl|2xl):/);
  return match ? match[1] : null;
}

/**
 * Group classes by their breakpoint prefix
 */
function groupByBreakpoint(classes: string[]): Map<string | null, string[]> {
  const groups = new Map<string | null, string[]>();

  for (const cls of classes) {
    const bp = getBreakpointPrefix(cls);
    if (!groups.has(bp)) {
      groups.set(bp, []);
    }
    groups.get(bp)!.push(cls);
  }

  return groups;
}

/**
 * Get the CSS property category for a Tailwind class
 */
function getCategory(cls: string): string | null {
  const stripped = stripPrefixes(cls);

  // Handle negative values
  const baseClass = stripped.startsWith('-') ? stripped.slice(1) : stripped;

  // Check exact matches first
  for (const [category, prefixes] of Object.entries(CLASS_CATEGORIES)) {
    for (const prefix of prefixes) {
      // Exact match for classes without prefixes (e.g., 'block', 'hidden')
      if (prefix === baseClass) {
        return category;
      }
      // Prefix match for classes with values (e.g., 'p-4', 'bg-red-500')
      if (prefix.endsWith('-') && baseClass.startsWith(prefix)) {
        return category;
      }
    }
  }

  // Special handling for arbitrary values: [...]
  if (baseClass.includes('[') && baseClass.includes(']')) {
    // Extract the utility prefix before the arbitrary value
    const arbitraryMatch = baseClass.match(/^([a-z-]+)-?\[/);
    if (arbitraryMatch) {
      const utilityPrefix = arbitraryMatch[1] + '-';
      for (const [category, prefixes] of Object.entries(CLASS_CATEGORIES)) {
        if (prefixes.some(p => p === utilityPrefix || utilityPrefix.startsWith(p))) {
          return category;
        }
      }
    }
  }

  return null;
}

/**
 * Get the shorthand prefix a class belongs to
 */
function getShorthandPrefix(cls: string): string | null {
  const stripped = stripPrefixes(cls);
  const baseClass = stripped.startsWith('-') ? stripped.slice(1) : stripped;

  for (const prefix of Object.keys(SHORTHAND_MAP)) {
    if (baseClass.startsWith(prefix)) {
      return prefix;
    }
  }
  return null;
}

/**
 * Check if class A's longhand overrides shorthand B
 */
function longhandOverridesShorthand(shorthandClass: string, longhandClass: string): boolean {
  const shorthand = stripPrefixes(shorthandClass);
  const longhand = stripPrefixes(longhandClass);

  for (const [shortPrefix, longPrefixes] of Object.entries(SHORTHAND_MAP)) {
    if (shorthand.startsWith(shortPrefix)) {
      for (const longPrefix of longPrefixes) {
        if (longhand.startsWith(longPrefix)) {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * Detect conflicts within a set of classes
 */
function detectConflicts(
  element: string,
  line: number,
  classes: string[],
  includeArbitrary: boolean
): { conflicts: Conflict[]; redundant: RedundantClass[] } {
  const conflicts: Conflict[] = [];
  const redundant: RedundantClass[] = [];

  // Group by breakpoint to only compare classes at the same breakpoint level
  const breakpointGroups = groupByBreakpoint(classes);

  for (const [bp, bpClasses] of breakpointGroups) {
    const breakpointLabel = bp ? `@${bp}` : 'base';

    // Track seen categories and their classes
    const seenCategories = new Map<string, { class: string; index: number }>();

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
      for (const pair of CONTRADICTIONS) {
        const strippedLower = stripped.toLowerCase();
        if (pair.includes(stripped) || pair.includes(strippedLower)) {
          const otherClass = pair.find(p => p !== stripped && p !== strippedLower);
          if (otherClass) {
            // Look for the other class in previous classes
            for (let j = 0; j < i; j++) {
              const prevStripped = stripPrefixes(bpClasses[j]);
              if (prevStripped === otherClass || prevStripped.toLowerCase() === otherClass) {
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
        // size-X was found, check for w- or h- classes
        for (let j = 0; j < bpClasses.length; j++) {
          if (j === i) continue;
          const otherStripped = stripPrefixes(bpClasses[j]);
          if (otherStripped.startsWith('w-') || otherStripped.startsWith('h-')) {
            const prop = otherStripped.startsWith('w-') ? 'width' : 'height';
            if (j < i) {
              // w-/h- came before size-, size- overrides
              conflicts.push({
                element,
                line,
                classes: [bpClasses[j], cls],
                conflict_type: 'override',
                explanation: `"${cls}" sets both width and height, overriding "${bpClasses[j]}"`,
                fix: `Remove "${bpClasses[j]}" since "size-" sets both dimensions`,
              });
            } else {
              // w-/h- came after size-, partial override
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

/**
 * Detect specificity issues
 */
function detectSpecificityIssues(
  element: string,
  classes: string[]
): SpecificityIssue[] {
  const issues: SpecificityIssue[] = [];

  // Check for !important patterns (arbitrary values with !)
  const importantClasses = classes.filter(c => c.includes('!'));
  if (importantClasses.length > 2) {
    issues.push({
      element,
      issue: `Multiple !important modifiers used (${importantClasses.length} classes)`,
      overriding_source: 'Tailwind !important modifier',
      fix: 'Reduce !important usage; restructure CSS specificity instead',
    });
  }

  // Check for z-index without position
  const hasZIndex = classes.some(c => {
    const stripped = stripPrefixes(c);
    return stripped.startsWith('z-') && !stripped.startsWith('z-auto');
  });
  const hasPosition = classes.some(c => {
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

/**
 * Generate optimization suggestions
 */
function generateSuggestions(
  element: string,
  classes: string[],
  rawClassName: string
): Suggestion[] {
  const suggestions: Suggestion[] = [];

  // Suggestion: Use size- instead of same w- and h-
  const widthClasses = classes.filter(c => stripPrefixes(c).match(/^w-\d+$/));
  const heightClasses = classes.filter(c => stripPrefixes(c).match(/^h-\d+$/));

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
  const paddingClasses = classes.filter(c => {
    const stripped = stripPrefixes(c);
    return stripped.match(/^p[trbl]-\d+$/);
  });

  if (paddingClasses.length === 4) {
    const values = paddingClasses.map(c => stripPrefixes(c).replace(/^p[trbl]-/, ''));
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
  const pxClasses = classes.filter(c => {
    const stripped = stripPrefixes(c);
    return stripped.match(/^p[lr]-\d+$/);
  });

  if (pxClasses.length === 2) {
    const leftVal = pxClasses.find(c => stripPrefixes(c).startsWith('pl-'));
    const rightVal = pxClasses.find(c => stripPrefixes(c).startsWith('pr-'));

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

// =============================================================================
// AST Analysis
// =============================================================================

/**
 * Extract CSS classes from a JSX className attribute
 */
function extractClassesFromAttribute(
  attr: ts.JsxAttribute,
  sourceFile: ts.SourceFile
): string[] {
  if (!attr.initializer) return [];

  // className="class1 class2"
  if (ts.isStringLiteral(attr.initializer)) {
    return attr.initializer.text.split(/\s+/).filter(Boolean);
  }

  // className={...}
  if (ts.isJsxExpression(attr.initializer) && attr.initializer.expression) {
    const expr = attr.initializer.expression;

    // className={"class1 class2"}
    if (ts.isStringLiteral(expr)) {
      return expr.text.split(/\s+/).filter(Boolean);
    }

    // className={`class1 ${dynamic} class2`}
    if (ts.isTemplateExpression(expr)) {
      const classes: string[] = [];
      if (expr.head.text) {
        classes.push(...expr.head.text.split(/\s+/).filter(Boolean));
      }
      for (const span of expr.templateSpans) {
        if (span.literal.text) {
          classes.push(...span.literal.text.split(/\s+/).filter(Boolean));
        }
      }
      return classes;
    }

    // className={cn("class1", "class2")} or clsx() or classNames()
    if (ts.isCallExpression(expr)) {
      const classes: string[] = [];
      for (const arg of expr.arguments) {
        if (ts.isStringLiteral(arg)) {
          classes.push(...arg.text.split(/\s+/).filter(Boolean));
        }
        if (ts.isObjectLiteralExpression(arg)) {
          for (const prop of arg.properties) {
            if (ts.isPropertyAssignment(prop)) {
              if (ts.isStringLiteral(prop.name)) {
                classes.push(...prop.name.text.split(/\s+/).filter(Boolean));
              } else if (ts.isIdentifier(prop.name)) {
                classes.push(prop.name.text);
              }
            }
            if (ts.isShorthandPropertyAssignment(prop)) {
              classes.push(prop.name.text);
            }
          }
        }
      }
      return classes;
    }
  }

  return [];
}

/**
 * Get raw className string
 */
function getRawClassName(
  attr: ts.JsxAttribute,
  sourceFile: ts.SourceFile
): string {
  if (!attr.initializer) return '';

  if (ts.isStringLiteral(attr.initializer)) {
    return attr.initializer.text;
  }

  if (ts.isJsxExpression(attr.initializer) && attr.initializer.expression) {
    const expr = attr.initializer.expression;
    if (ts.isStringLiteral(expr)) {
      return expr.text;
    }
    // For more complex expressions, return the source text
    return expr.getText(sourceFile);
  }

  return '';
}

/**
 * Get line number for a position
 */
function getLineNumber(pos: number, sourceFile: ts.SourceFile): number {
  const { line } = sourceFile.getLineAndCharacterOfPosition(pos);
  return line + 1;
}

/**
 * Analyze JSX file for class conflicts
 */
function analyzeJsxFile(
  content: string,
  sourceFile: ts.SourceFile
): ElementInfo[] {
  const elements: ElementInfo[] = [];

  function visit(node: ts.Node): void {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tagName = node.tagName.getText(sourceFile);
      const line = getLineNumber(node.getStart(), sourceFile);

      for (const attr of node.attributes.properties) {
        if (ts.isJsxAttribute(attr)) {
          const attrName = attr.name.getText(sourceFile);
          if (attrName === 'className' || attrName === 'class') {
            const classes = extractClassesFromAttribute(attr, sourceFile);
            const rawClassName = getRawClassName(attr, sourceFile);

            if (classes.length > 0) {
              elements.push({
                element: `${tagName}:${line}`,
                line,
                classes,
                rawClassName,
              });
            }
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return elements;
}

// =============================================================================
// Handler
// =============================================================================

/**
 * Handles the analyze_tailwind_conflicts MCP tool call.
 *
 * Analyzes Tailwind CSS classes in a component file to detect:
 * - Override conflicts (same property set multiple times)
 * - Redundant classes (shorthand + longhand combinations)
 * - Contradiction conflicts (mutually exclusive classes)
 * - Specificity issues
 * - Optimization suggestions
 *
 * @param args - The analyze_tailwind_conflicts tool arguments
 * @returns MCP tool response with conflict analysis
 */
export async function handleAnalyzeTailwindConflicts(
  args: AnalyzeTailwindConflictsArgs
): Promise<ToolResponse> {
  const projectRoot = process.cwd();
  const includeArbitrary = args.include_arbitrary ?? true;

  try {
    // Resolve file path
    const filePath = path.isAbsolute(args.file)
      ? args.file
      : path.resolve(projectRoot, args.file);

    // Check file exists
    if (!fs.existsSync(filePath)) {
      return createErrorResponse(`File not found: ${args.file}`, {
        provided_path: args.file,
        resolved_path: filePath,
      });
    }

    // Check file extension
    const ext = path.extname(filePath).toLowerCase();
    if (!['.tsx', '.jsx', '.vue', '.svelte'].includes(ext)) {
      return createErrorResponse(
        `Unsupported file type: ${ext}. Supported: .tsx, .jsx, .vue, .svelte`,
        { file: args.file }
      );
    }

    // Read file content
    const content = fs.readFileSync(filePath, 'utf-8');

    // For Vue/Svelte, extract template section
    let processableContent = content;
    if (ext === '.vue') {
      const templateMatch = content.match(/<template[^>]*>([\s\S]*?)<\/template>/);
      if (templateMatch) {
        processableContent = `function Component() { return (<>${templateMatch[1]}</>) }`;
      }
    } else if (ext === '.svelte') {
      let templateContent = content;
      templateContent = templateContent
        .replace(/<script[^>]*>[\s\S]*?<\/script>/g, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/g, '');
      processableContent = `function Component() { return (<>${templateContent}</>) }`;
    }

    // Create TypeScript source file for parsing
    const sourceFile = ts.createSourceFile(
      filePath,
      processableContent,
      ts.ScriptTarget.Latest,
      true,
      ext === '.tsx' ? ts.ScriptKind.TSX : ts.ScriptKind.JSX
    );

    // Analyze elements
    const elements = analyzeJsxFile(processableContent, sourceFile);

    if (elements.length === 0) {
      return createSuccessResponse({
        file: path.relative(projectRoot, filePath),
        elements_analyzed: 0,
        conflicts: [],
        redundant_classes: [],
        specificity_issues: [],
        suggestions: [],
        summary: 'No elements with className/class attributes found',
      } as AnalyzeTailwindConflictsResult);
    }

    // Analyze each element
    const allConflicts: Conflict[] = [];
    const allRedundant: RedundantClass[] = [];
    const allSpecificityIssues: SpecificityIssue[] = [];
    const allSuggestions: Suggestion[] = [];

    for (const elem of elements) {
      const { conflicts, redundant } = detectConflicts(
        elem.element,
        elem.line,
        elem.classes,
        includeArbitrary
      );

      allConflicts.push(...conflicts);
      allRedundant.push(...redundant);

      const specificityIssues = detectSpecificityIssues(elem.element, elem.classes);
      allSpecificityIssues.push(...specificityIssues);

      const suggestions = generateSuggestions(elem.element, elem.classes, elem.rawClassName);
      allSuggestions.push(...suggestions);
    }

    // Generate summary
    const summaryParts: string[] = [];
    summaryParts.push(`Analyzed ${elements.length} elements with Tailwind classes`);

    if (allConflicts.length === 0 && allRedundant.length === 0 && allSpecificityIssues.length === 0) {
      summaryParts.push('No conflicts detected');
    } else {
      if (allConflicts.length > 0) {
        const overrides = allConflicts.filter(c => c.conflict_type === 'override').length;
        const contradictions = allConflicts.filter(c => c.conflict_type === 'contradiction').length;
        summaryParts.push(`Found ${allConflicts.length} conflicts (${overrides} overrides, ${contradictions} contradictions)`);
      }
      if (allRedundant.length > 0) {
        summaryParts.push(`Found ${allRedundant.length} redundant classes`);
      }
      if (allSpecificityIssues.length > 0) {
        summaryParts.push(`Found ${allSpecificityIssues.length} specificity issues`);
      }
    }

    if (allSuggestions.length > 0) {
      summaryParts.push(`${allSuggestions.length} optimization suggestions available`);
    }

    const result: AnalyzeTailwindConflictsResult = {
      file: path.relative(projectRoot, filePath).replace(/\\/g, '/'),
      elements_analyzed: elements.length,
      conflicts: allConflicts,
      redundant_classes: allRedundant,
      specificity_issues: allSpecificityIssues,
      suggestions: allSuggestions,
      summary: summaryParts.join('. '),
    };

    return createSuccessResponse(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown error during analysis';
    return createErrorResponse(message, { file: args.file });
  }
}
