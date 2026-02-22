/**
 * Constants for Analyze Responsive Breakpoints
 *
 * @module handlers/frontend/responsive-breakpoints/constants
 */

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
