/**
 * Tailwind Conflicts Scanner
 *
 * CSS class categorization, shorthand/longhand mappings,
 * contradiction definitions, utility functions, and JSX file analysis.
 *
 * @module core/tailwind-conflicts/scanner
 */

import ts from 'typescript';
import type { ElementInfo } from './types.js';
import { extractClassesFromAttribute } from '../jsx/class-extractor.js';

// =============================================================================
// Class Category Mapping
// =============================================================================

/**
 * Maps CSS property categories to their Tailwind class prefixes
 */
export const CLASS_CATEGORIES: Record<string, string[]> = {
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

  // Border Radius - includes bare 'rounded' and all variants
  'border-radius': [
    'rounded', 'rounded-', 'rounded-none', 'rounded-sm', 'rounded-md',
    'rounded-lg', 'rounded-xl', 'rounded-2xl', 'rounded-3xl', 'rounded-full',
  ],
  'border-radius-t': ['rounded-t', 'rounded-t-'],
  'border-radius-r': ['rounded-r', 'rounded-r-'],
  'border-radius-b': ['rounded-b', 'rounded-b-'],
  'border-radius-l': ['rounded-l', 'rounded-l-'],
  'border-radius-tl': ['rounded-tl', 'rounded-tl-'],
  'border-radius-tr': ['rounded-tr', 'rounded-tr-'],
  'border-radius-bl': ['rounded-bl', 'rounded-bl-'],
  'border-radius-br': ['rounded-br', 'rounded-br-'],

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

// =============================================================================
// Shorthand Mappings
// =============================================================================

/**
 * Shorthand to longhand mappings for detecting redundant classes
 */
export const SHORTHAND_MAP: Record<string, string[]> = {
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

// =============================================================================
// Contradictions
// =============================================================================

/**
 * Classes that contradict each other (mutually exclusive)
 */
export const CONTRADICTIONS: string[][] = [
  // Display contradictions
  ['flex', 'grid'],
  ['flex', 'block'],
  ['flex', 'inline'],
  ['flex', 'inline-block'],
  ['flex', 'inline-grid'],
  ['grid', 'block'],
  ['grid', 'inline'],
  ['grid', 'inline-block'],
  ['grid', 'inline-flex'],
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
export const SIZE_SETS_BOTH = 'size-';

// =============================================================================
// Class Analysis Utilities
// =============================================================================

/**
 * Strip responsive/state prefixes from a class
 */
export function stripPrefixes(cls: string): string {
  const prefixPattern = /^(?:(?:sm|md|lg|xl|2xl|dark|light|hover|focus|active|disabled|group-hover|focus-within|focus-visible|first|last|odd|even|motion-safe|motion-reduce|print|portrait|landscape|placeholder|selection|marker|before|after|file|open|closed|data-\[.+?\]|aria-\[.+?\]):)*/;
  return cls.replace(prefixPattern, '');
}

/**
 * Extract the breakpoint prefix from a class if present
 */
export function getBreakpointPrefix(cls: string): string | null {
  const match = cls.match(/^(sm|md|lg|xl|2xl):/);
  return match ? match[1] : null;
}

/**
 * Extract all variant prefixes from a class (dark:, hover:, sm:, etc.)
 */
export function getVariantPrefix(cls: string): string {
  // Match all variants at the start of the class (sm:hover:dark:class becomes "sm:hover:dark:")
  const variantPattern = /^(?:(?:sm|md|lg|xl|2xl|dark|light|hover|focus|active|disabled|group-hover|focus-within|focus-visible|first|last|odd|even|motion-safe|motion-reduce|print|portrait|landscape|placeholder|selection|marker|before|after|file|open|closed|data-\[.+?\]|aria-\[.+?\]):|!)*/;
  const match = cls.match(variantPattern);
  return match ? match[0] : '';
}

/**
 * Group classes by their breakpoint prefix
 */
export function groupByBreakpoint(classes: string[]): Map<string | null, string[]> {
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
 * Group classes by their full variant prefix (dark:, hover:, sm:hover:, etc.)
 * This is more thorough than breakpoint grouping as it considers all variants
 */
export function groupByVariant(classes: string[]): Map<string, string[]> {
  const groups = new Map<string, string[]>();

  for (const cls of classes) {
    const variant = getVariantPrefix(cls);
    if (!groups.has(variant)) {
      groups.set(variant, []);
    }
    groups.get(variant)!.push(cls);
  }

  return groups;
}

/**
 * Get the CSS property category for a Tailwind class
 */
export function getCategory(cls: string): string | null {
  let stripped = stripPrefixes(cls);

  // Handle !important modifier at the start (Tailwind's ! prefix)
  if (stripped.startsWith('!')) {
    stripped = stripped.slice(1);
  }

  // Handle negative values
  const baseClass = stripped.startsWith('-') ? stripped.slice(1) : stripped;

  // Check exact matches first
  for (const [category, prefixes] of Object.entries(CLASS_CATEGORIES)) {
    for (const prefix of prefixes) {
      // Exact match for classes without prefixes
      if (prefix === baseClass) {
        return category;
      }
      // Prefix match for classes with values
      if (prefix.endsWith('-') && baseClass.startsWith(prefix)) {
        return category;
      }
    }
  }

  // Special handling for arbitrary values
  if (baseClass.includes('[') && baseClass.includes(']')) {
    const arbitraryMatch = baseClass.match(/^([a-z-]+)-?\[/);
    if (arbitraryMatch) {
      const utilityPrefix = arbitraryMatch[1] + '-';
      for (const [category, prefixes] of Object.entries(CLASS_CATEGORIES)) {
        if (prefixes.some((p) => p === utilityPrefix || utilityPrefix.startsWith(p))) {
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
export function getShorthandPrefix(cls: string): string | null {
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
export function longhandOverridesShorthand(shorthandClass: string, longhandClass: string): boolean {
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

// =============================================================================
// AST Analysis
// =============================================================================

/**
 * Get line number for a position
 */
export function getLineNumber(pos: number, sourceFile: ts.SourceFile): number {
  const { line } = sourceFile.getLineAndCharacterOfPosition(pos);
  return line + 1;
}

/**
 * Get raw className string
 */
export function getRawClassName(attr: ts.JsxAttribute, sourceFile: ts.SourceFile): string {
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

  /* v8 ignore next */
  return '';
}

// =============================================================================
// JSX File Analysis
// =============================================================================

/**
 * Analyze JSX file for class conflicts
 */
export function analyzeJsxFile(content: string, sourceFile: ts.SourceFile): ElementInfo[] {
  const elements: ElementInfo[] = [];

  function visit(node: ts.Node): void {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tagName = node.tagName.getText(sourceFile);
      const line = getLineNumber(node.getStart(), sourceFile);

      for (const attr of node.attributes.properties) {
        if (ts.isJsxAttribute(attr)) {
          const attrName = attr.name.getText(sourceFile);
          if (attrName === 'className' || attrName === 'class') {
            const classes = extractClassesFromAttribute(attr);
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
