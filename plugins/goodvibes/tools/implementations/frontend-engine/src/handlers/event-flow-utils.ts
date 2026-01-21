/**
 * Event Flow Utilities
 *
 * Constants and helper functions for event handling analysis.
 *
 * @module handlers/frontend/event-flow-utils
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Information about an event handler
 */
export interface EventHandler {
  /** Element or component name */
  element: string;
  /** Event type (click, change, etc.) */
  event: string;
  /** Handler function name or inline code */
  handler: string;
  /** Line number where handler is defined */
  line: number;
  /** Whether handler calls stopPropagation */
  stops_propagation: boolean;
  /** Whether handler calls preventDefault */
  prevents_default: boolean;
}

/**
 * Internal node tracking for component tree
 */
export interface ComponentNode {
  element: string;
  parent: ComponentNode | null;
  children: ComponentNode[];
  handlers: EventHandler[];
  line: number;
  depth: number;
}

// =============================================================================
// Constants
// =============================================================================

/**
 * React event prop names mapped to DOM event types
 */
export const EVENT_PROPS: Record<string, string> = {
  // Mouse events
  onClick: 'click',
  onDoubleClick: 'dblclick',
  onMouseDown: 'mousedown',
  onMouseUp: 'mouseup',
  onMouseEnter: 'mouseenter',
  onMouseLeave: 'mouseleave',
  onMouseMove: 'mousemove',
  onMouseOver: 'mouseover',
  onMouseOut: 'mouseout',
  onContextMenu: 'contextmenu',

  // Form events
  onChange: 'change',
  onInput: 'input',
  onSubmit: 'submit',
  onReset: 'reset',
  onFocus: 'focus',
  onBlur: 'blur',

  // Keyboard events
  onKeyDown: 'keydown',
  onKeyUp: 'keyup',
  onKeyPress: 'keypress',

  // Touch events
  onTouchStart: 'touchstart',
  onTouchEnd: 'touchend',
  onTouchMove: 'touchmove',
  onTouchCancel: 'touchcancel',

  // Drag events
  onDrag: 'drag',
  onDragStart: 'dragstart',
  onDragEnd: 'dragend',
  onDragEnter: 'dragenter',
  onDragLeave: 'dragleave',
  onDragOver: 'dragover',
  onDrop: 'drop',

  // Scroll/Wheel events
  onScroll: 'scroll',
  onWheel: 'wheel',

  // Pointer events
  onPointerDown: 'pointerdown',
  onPointerUp: 'pointerup',
  onPointerMove: 'pointermove',
  onPointerEnter: 'pointerenter',
  onPointerLeave: 'pointerleave',
  onPointerCancel: 'pointercancel',

  // Clipboard events
  onCopy: 'copy',
  onCut: 'cut',
  onPaste: 'paste',

  // Animation events
  onAnimationStart: 'animationstart',
  onAnimationEnd: 'animationend',
  onAnimationIteration: 'animationiteration',

  // Transition events
  onTransitionEnd: 'transitionend',
};

/**
 * Events that bubble by default
 */
export const BUBBLING_EVENTS = new Set([
  'click',
  'dblclick',
  'mousedown',
  'mouseup',
  'mousemove',
  'mouseover',
  'mouseout',
  'contextmenu',
  'keydown',
  'keyup',
  'keypress',
  'change',
  'input',
  'submit',
  'reset',
  'scroll',
  'wheel',
  'touchstart',
  'touchend',
  'touchmove',
  'drag',
  'dragstart',
  'dragend',
  'dragenter',
  'dragleave',
  'dragover',
  'drop',
  'pointerdown',
  'pointerup',
  'pointermove',
  'copy',
  'cut',
  'paste',
]);

/**
 * Interactive HTML elements that should have keyboard support
 */
export const INTERACTIVE_ELEMENTS = new Set([
  'button',
  'a',
  'input',
  'select',
  'textarea',
  'summary',
]);

/**
 * Non-interactive elements that often get click handlers
 */
export const NON_INTERACTIVE_ELEMENTS = new Set([
  'div',
  'span',
  'p',
  'section',
  'article',
  'aside',
  'header',
  'footer',
  'main',
  'nav',
  'li',
  'ul',
  'ol',
  'table',
  'tr',
  'td',
  'th',
  'img',
]);

// =============================================================================
// Path Helpers
// =============================================================================

/**
 * Normalize file path
 */
export function normalizeFilePath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}
