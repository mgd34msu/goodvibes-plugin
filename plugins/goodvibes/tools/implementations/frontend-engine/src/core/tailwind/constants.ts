/**
 * Tailwind Core Constants
 *
 * Shared constants for Tailwind CSS class parsing and breakpoint analysis.
 * Extracted from sizing-strategy-utils and responsive-breakpoints/constants.
 *
 * @module core/tailwind/constants
 */

// =============================================================================
// Spacing Scale
// =============================================================================

/**
 * Tailwind spacing scale to CSS values
 */
export const TAILWIND_SPACING: Record<string, string> = {
  '0': '0px',
  'px': '1px',
  '0.5': '0.125rem',
  '1': '0.25rem',
  '1.5': '0.375rem',
  '2': '0.5rem',
  '2.5': '0.625rem',
  '3': '0.75rem',
  '3.5': '0.875rem',
  '4': '1rem',
  '5': '1.25rem',
  '6': '1.5rem',
  '7': '1.75rem',
  '8': '2rem',
  '9': '2.25rem',
  '10': '2.5rem',
  '11': '2.75rem',
  '12': '3rem',
  '14': '3.5rem',
  '16': '4rem',
  '20': '5rem',
  '24': '6rem',
  '28': '7rem',
  '32': '8rem',
  '36': '9rem',
  '40': '10rem',
  '44': '11rem',
  '48': '12rem',
  '52': '13rem',
  '56': '14rem',
  '60': '15rem',
  '64': '16rem',
  '72': '18rem',
  '80': '20rem',
  '96': '24rem',
};

/**
 * Tailwind fraction widths
 */
export const TAILWIND_FRACTIONS: Record<string, string> = {
  '1/2': '50%',
  '1/3': '33.333333%',
  '2/3': '66.666667%',
  '1/4': '25%',
  '2/4': '50%',
  '3/4': '75%',
  '1/5': '20%',
  '2/5': '40%',
  '3/5': '60%',
  '4/5': '80%',
  '1/6': '16.666667%',
  '2/6': '33.333333%',
  '3/6': '50%',
  '4/6': '66.666667%',
  '5/6': '83.333333%',
  '1/12': '8.333333%',
  '2/12': '16.666667%',
  '3/12': '25%',
  '4/12': '33.333333%',
  '5/12': '41.666667%',
  '6/12': '50%',
  '7/12': '58.333333%',
  '8/12': '66.666667%',
  '9/12': '75%',
  '10/12': '83.333333%',
  '11/12': '91.666667%',
};

/**
 * Max width named values
 */
export const MAX_WIDTH_VALUES: Record<string, string> = {
  'none': 'none',
  'xs': '20rem',
  'sm': '24rem',
  'md': '28rem',
  'lg': '32rem',
  'xl': '36rem',
  '2xl': '42rem',
  '3xl': '48rem',
  '4xl': '56rem',
  '5xl': '64rem',
  '6xl': '72rem',
  '7xl': '80rem',
  'full': '100%',
  'min': 'min-content',
  'max': 'max-content',
  'fit': 'fit-content',
  'prose': '65ch',
  'screen-sm': '640px',
  'screen-md': '768px',
  'screen-lg': '1024px',
  'screen-xl': '1280px',
  'screen-2xl': '1536px',
};

// =============================================================================
// Breakpoints
// =============================================================================

/**
 * Breakpoint sizes for reference
 */
export const BREAKPOINT_SIZES: Record<string, string> = {
  base: '0px',
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
};

/**
 * Ordered list of breakpoint names from smallest to largest
 */
export const BREAKPOINT_ORDER: string[] = ['base', 'sm', 'md', 'lg', 'xl', '2xl'];

// =============================================================================
// Class-to-Property Mappings
// =============================================================================

/**
 * Mapping of Tailwind classes to CSS properties
 * This enables tracking which CSS properties change across breakpoints
 */
export const CLASS_TO_PROPERTY: Record<string, string> = {
  // Display
  flex: 'display',
  grid: 'display',
  block: 'display',
  hidden: 'display',
  inline: 'display',
  'inline-block': 'display',
  'inline-flex': 'display',
  'inline-grid': 'display',
  contents: 'display',
  'flow-root': 'display',

  // Flex direction
  'flex-row': 'flex-direction',
  'flex-col': 'flex-direction',
  'flex-row-reverse': 'flex-direction',
  'flex-col-reverse': 'flex-direction',

  // Flex wrap
  'flex-wrap': 'flex-wrap',
  'flex-nowrap': 'flex-wrap',
  'flex-wrap-reverse': 'flex-wrap',

  // Justify content
  'justify-start': 'justify-content',
  'justify-end': 'justify-content',
  'justify-center': 'justify-content',
  'justify-between': 'justify-content',
  'justify-around': 'justify-content',
  'justify-evenly': 'justify-content',

  // Align items
  'items-start': 'align-items',
  'items-end': 'align-items',
  'items-center': 'align-items',
  'items-baseline': 'align-items',
  'items-stretch': 'align-items',

  // Grid columns
  'grid-cols-1': 'grid-template-columns',
  'grid-cols-2': 'grid-template-columns',
  'grid-cols-3': 'grid-template-columns',
  'grid-cols-4': 'grid-template-columns',
  'grid-cols-5': 'grid-template-columns',
  'grid-cols-6': 'grid-template-columns',
  'grid-cols-7': 'grid-template-columns',
  'grid-cols-8': 'grid-template-columns',
  'grid-cols-9': 'grid-template-columns',
  'grid-cols-10': 'grid-template-columns',
  'grid-cols-11': 'grid-template-columns',
  'grid-cols-12': 'grid-template-columns',
  'grid-cols-none': 'grid-template-columns',
  'grid-cols-subgrid': 'grid-template-columns',

  // Grid rows
  'grid-rows-1': 'grid-template-rows',
  'grid-rows-2': 'grid-template-rows',
  'grid-rows-3': 'grid-template-rows',
  'grid-rows-4': 'grid-template-rows',
  'grid-rows-5': 'grid-template-rows',
  'grid-rows-6': 'grid-template-rows',
  'grid-rows-none': 'grid-template-rows',
  'grid-rows-subgrid': 'grid-template-rows',

  // Order
  'order-first': 'order',
  'order-last': 'order',
  'order-none': 'order',

  // Position
  static: 'position',
  fixed: 'position',
  absolute: 'position',
  relative: 'position',
  sticky: 'position',

  // Visibility
  visible: 'visibility',
  invisible: 'visibility',
  collapse: 'visibility',

  // Overflow
  'overflow-auto': 'overflow',
  'overflow-hidden': 'overflow',
  'overflow-clip': 'overflow',
  'overflow-visible': 'overflow',
  'overflow-scroll': 'overflow',
  'overflow-x-auto': 'overflow-x',
  'overflow-y-auto': 'overflow-y',
  'overflow-x-hidden': 'overflow-x',
  'overflow-y-hidden': 'overflow-y',
  'overflow-x-scroll': 'overflow-x',
  'overflow-y-scroll': 'overflow-y',

  // Text alignment
  'text-left': 'text-align',
  'text-center': 'text-align',
  'text-right': 'text-align',
  'text-justify': 'text-align',
  'text-start': 'text-align',
  'text-end': 'text-align',

  // Float
  'float-start': 'float',
  'float-end': 'float',
  'float-right': 'float',
  'float-left': 'float',
  'float-none': 'float',
};

/**
 * Class prefix patterns that map to CSS properties
 */
export const CLASS_PREFIX_TO_PROPERTY: Array<[RegExp, string]> = [
  // Width
  [/^w-/, 'width'],
  [/^min-w-/, 'min-width'],
  [/^max-w-/, 'max-width'],

  // Height
  [/^h-/, 'height'],
  [/^min-h-/, 'min-height'],
  [/^max-h-/, 'max-height'],

  // Sizing
  [/^size-/, 'size'],

  // Gap
  [/^gap-/, 'gap'],
  [/^gap-x-/, 'column-gap'],
  [/^gap-y-/, 'row-gap'],

  // Padding
  [/^p-/, 'padding'],
  [/^px-/, 'padding-inline'],
  [/^py-/, 'padding-block'],
  [/^pt-/, 'padding-top'],
  [/^pr-/, 'padding-right'],
  [/^pb-/, 'padding-bottom'],
  [/^pl-/, 'padding-left'],
  [/^ps-/, 'padding-inline-start'],
  [/^pe-/, 'padding-inline-end'],

  // Margin
  [/^m-/, 'margin'],
  [/^mx-/, 'margin-inline'],
  [/^my-/, 'margin-block'],
  [/^mt-/, 'margin-top'],
  [/^mr-/, 'margin-right'],
  [/^mb-/, 'margin-bottom'],
  [/^ml-/, 'margin-left'],
  [/^ms-/, 'margin-inline-start'],
  [/^me-/, 'margin-inline-end'],
  [/^-m-/, 'margin'],
  [/^-mx-/, 'margin-inline'],
  [/^-my-/, 'margin-block'],
  [/^-mt-/, 'margin-top'],
  [/^-mr-/, 'margin-right'],
  [/^-mb-/, 'margin-bottom'],
  [/^-ml-/, 'margin-left'],

  // Space between
  [/^space-x-/, 'space-x'],
  [/^space-y-/, 'space-y'],
  [/^-space-x-/, 'space-x'],
  [/^-space-y-/, 'space-y'],

  // Font size
  [/^text-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl)$/, 'font-size'],

  // Font weight
  [/^font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)$/, 'font-weight'],

  // Line height
  [/^leading-/, 'line-height'],

  // Flex
  [/^flex-1$/, 'flex'],
  [/^flex-auto$/, 'flex'],
  [/^flex-initial$/, 'flex'],
  [/^flex-none$/, 'flex'],
  [/^flex-grow/, 'flex-grow'],
  [/^flex-shrink/, 'flex-shrink'],
  [/^grow/, 'flex-grow'],
  [/^shrink/, 'flex-shrink'],
  [/^basis-/, 'flex-basis'],

  // Grid span
  [/^col-span-/, 'grid-column'],
  [/^col-start-/, 'grid-column-start'],
  [/^col-end-/, 'grid-column-end'],
  [/^row-span-/, 'grid-row'],
  [/^row-start-/, 'grid-row-start'],
  [/^row-end-/, 'grid-row-end'],

  // Positioning
  [/^inset-/, 'inset'],
  [/^top-/, 'top'],
  [/^right-/, 'right'],
  [/^bottom-/, 'bottom'],
  [/^left-/, 'left'],
  [/^start-/, 'inset-inline-start'],
  [/^end-/, 'inset-inline-end'],
  [/^-inset-/, 'inset'],
  [/^-top-/, 'top'],
  [/^-right-/, 'right'],
  [/^-bottom-/, 'bottom'],
  [/^-left-/, 'left'],

  // Z-index
  [/^z-/, 'z-index'],
  [/^-z-/, 'z-index'],

  // Order
  [/^order-\d+$/, 'order'],
  [/^-order-\d+$/, 'order'],

  // Aspect ratio
  [/^aspect-/, 'aspect-ratio'],

  // Object fit/position
  [/^object-(contain|cover|fill|none|scale-down)$/, 'object-fit'],
  [/^object-(bottom|center|left|left-bottom|left-top|right|right-bottom|right-top|top)$/, 'object-position'],

  // Container
  [/^container$/, 'container'],

  // Columns
  [/^columns-/, 'columns'],

  // Break
  [/^break-after-/, 'break-after'],
  [/^break-before-/, 'break-before'],
  [/^break-inside-/, 'break-inside'],

  // Box decoration
  [/^box-decoration-/, 'box-decoration-break'],
  [/^box-/, 'box-sizing'],

  // Isolation
  [/^isolate/, 'isolation'],
];
