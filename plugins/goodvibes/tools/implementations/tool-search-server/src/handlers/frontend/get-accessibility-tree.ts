/**
 * Get Accessibility Tree Handler
 *
 * Builds an accessibility tree from React/Vue/Svelte components and detects
 * WCAG issues. Analyzes semantic roles, focus order, keyboard interactions,
 * and ARIA patterns.
 *
 * @module handlers/frontend/get-accessibility-tree
 */

import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';

// =============================================================================
// Types
// =============================================================================

/**
 * Arguments for the get_accessibility_tree tool
 */
export interface GetAccessibilityTreeArgs {
  /** File path to analyze (relative to project root or absolute) */
  file: string;
  /** Optional: Focus on specific element (by tag or component name) */
  element?: string;
  /** Check for common accessibility patterns (default true) */
  check_patterns?: boolean;
}

/**
 * Represents a node in the accessibility tree
 */
export interface A11yNode {
  /** ARIA role or inferred semantic role */
  role: string;
  /** Accessible name (from aria-label, text content, etc.) */
  name: string;
  /** Accessible description (from aria-describedby, title, etc.) */
  description?: string;
  /** Whether the element can receive focus */
  focusable: boolean;
  /** Whether the element is hidden from assistive technology */
  hidden: boolean;
  /** Expanded state for expandable elements */
  expanded?: boolean;
  /** Selected state for selectable elements */
  selected?: boolean;
  /** Child nodes in the accessibility tree */
  children: A11yNode[];
}

/**
 * Focus order entry
 */
interface FocusOrderEntry {
  /** Order index in focus sequence */
  index: number;
  /** Element identifier */
  element: string;
  /** tabindex value if explicitly set */
  tabindex?: number;
}

/**
 * Accessibility issue detected
 */
interface A11yIssue {
  /** Issue severity */
  severity: 'error' | 'warning' | 'suggestion';
  /** Element where the issue was found */
  element: string;
  /** Description of the issue */
  issue: string;
  /** WCAG criterion if applicable */
  wcag_criterion?: string;
  /** Suggested fix */
  fix: string;
}

/**
 * Keyboard interaction analysis
 */
interface KeyboardInteractions {
  /** Expected keyboard interactions based on role */
  expected: string[];
  /** Implemented keyboard handlers found */
  implemented: string[];
  /** Missing keyboard interactions */
  missing: string[];
}

/**
 * ARIA pattern validation result
 */
interface AriaPattern {
  /** Pattern name (e.g., "dialog", "combobox") */
  pattern: string;
  /** Whether the pattern is valid */
  valid: boolean;
  /** Missing required attributes */
  missing_attributes?: string[];
}

/**
 * Result of accessibility tree analysis
 */
interface GetAccessibilityTreeResult {
  /** File that was analyzed */
  file: string;
  /** Root of the accessibility tree */
  a11y_tree: A11yNode;
  /** Focus order sequence */
  focus_order: FocusOrderEntry[];
  /** Detected accessibility issues */
  issues: A11yIssue[];
  /** Keyboard interaction analysis */
  keyboard_interactions: KeyboardInteractions;
  /** ARIA pattern validation results */
  aria_patterns: AriaPattern[];
  /** Summary of the analysis */
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
 * Internal element representation during analysis
 */
interface ElementInfo {
  /** Tag name or component name */
  tag: string;
  /** Line number in source */
  line: number;
  /** Element identifier (tag:line) */
  identifier: string;
  /** All attributes as key-value pairs */
  attributes: Map<string, string>;
  /** Text content if present */
  textContent: string;
  /** Whether this is a component (uppercase) vs HTML element */
  isComponent: boolean;
  /** Parent element index */
  parentIndex: number | null;
  /** Child element indices */
  childIndices: number[];
}

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
// Role Mapping
// =============================================================================

/**
 * Maps HTML elements to their implicit ARIA roles
 */
const SEMANTIC_ROLES: Record<string, string> = {
  // Interactive elements
  'button': 'button',
  'a': 'link',
  'input': 'textbox', // Default, overridden by type
  'select': 'listbox',
  'textarea': 'textbox',
  'option': 'option',

  // Structural elements
  'nav': 'navigation',
  'header': 'banner',
  'footer': 'contentinfo',
  'main': 'main',
  'aside': 'complementary',
  'article': 'article',
  'section': 'region',

  // List elements
  'ul': 'list',
  'ol': 'list',
  'li': 'listitem',
  'dl': 'list',
  'dt': 'term',
  'dd': 'definition',

  // Table elements
  'table': 'table',
  'thead': 'rowgroup',
  'tbody': 'rowgroup',
  'tfoot': 'rowgroup',
  'tr': 'row',
  'th': 'columnheader',
  'td': 'cell',

  // Form elements
  'form': 'form',
  'fieldset': 'group',
  'legend': 'legend',
  'label': 'label',
  'output': 'status',
  'progress': 'progressbar',
  'meter': 'meter',

  // Heading elements
  'h1': 'heading',
  'h2': 'heading',
  'h3': 'heading',
  'h4': 'heading',
  'h5': 'heading',
  'h6': 'heading',

  // Media elements
  'img': 'img',
  'figure': 'figure',
  'figcaption': 'caption',
  'video': 'video',
  'audio': 'audio',

  // Other semantic elements
  'dialog': 'dialog',
  'details': 'group',
  'summary': 'button',
  'menu': 'menu',
  'menuitem': 'menuitem',
  'hr': 'separator',
  'address': 'contentinfo',
  'blockquote': 'blockquote',
  'code': 'code',
  'pre': 'code',
  'time': 'time',
  'mark': 'mark',
  'search': 'search',
};

/**
 * Input type to role mapping
 */
const INPUT_TYPE_ROLES: Record<string, string> = {
  'text': 'textbox',
  'password': 'textbox',
  'email': 'textbox',
  'tel': 'textbox',
  'url': 'textbox',
  'search': 'searchbox',
  'number': 'spinbutton',
  'range': 'slider',
  'checkbox': 'checkbox',
  'radio': 'radio',
  'button': 'button',
  'submit': 'button',
  'reset': 'button',
  'image': 'button',
  'file': 'button',
  'color': 'button',
  'date': 'textbox',
  'datetime-local': 'textbox',
  'month': 'textbox',
  'week': 'textbox',
  'time': 'textbox',
};

/**
 * Get the ARIA role for an element
 */
function getRole(tag: string, attrs: Map<string, string>): string {
  // Explicit role takes precedence
  const explicitRole = attrs.get('role');
  if (explicitRole) {
    return explicitRole;
  }

  // Handle input types specially
  if (tag === 'input') {
    const type = attrs.get('type') || 'text';
    return INPUT_TYPE_ROLES[type] || 'textbox';
  }

  // Handle anchor without href
  if (tag === 'a' && !attrs.has('href')) {
    return 'generic';
  }

  // Look up semantic role
  return SEMANTIC_ROLES[tag] || 'generic';
}

// =============================================================================
// Focusable Detection
// =============================================================================

/**
 * Natively focusable elements
 */
const NATIVELY_FOCUSABLE = new Set([
  'a', 'button', 'input', 'select', 'textarea', 'details', 'summary',
]);

/**
 * Determine if an element can receive focus
 */
function isFocusable(tag: string, attrs: Map<string, string>): boolean {
  // Check for disabled
  if (attrs.has('disabled')) {
    return false;
  }

  // Check tabindex
  const tabindex = attrs.get('tabindex') || attrs.get('tabIndex');
  if (tabindex === '-1') {
    return false;
  }
  if (tabindex && parseInt(tabindex, 10) >= 0) {
    return true;
  }

  // Check natively focusable elements
  if (NATIVELY_FOCUSABLE.has(tag)) {
    // Anchor needs href to be focusable by default
    if (tag === 'a' && !attrs.has('href')) {
      return false;
    }
    return true;
  }

  // Check for contenteditable
  if (attrs.get('contenteditable') === 'true') {
    return true;
  }

  return false;
}

/**
 * Get tabindex value for focus order sorting
 */
function getTabIndex(tag: string, attrs: Map<string, string>): number {
  const tabindex = attrs.get('tabindex') || attrs.get('tabIndex');
  if (tabindex) {
    return parseInt(tabindex, 10);
  }
  // Natively focusable elements have implicit tabindex of 0
  if (NATIVELY_FOCUSABLE.has(tag) && tag !== 'a') {
    return 0;
  }
  if (tag === 'a' && attrs.has('href')) {
    return 0;
  }
  return -1;
}

// =============================================================================
// Hidden Detection
// =============================================================================

/**
 * Check if element is hidden from assistive technology
 */
function isHidden(attrs: Map<string, string>): boolean {
  // aria-hidden="true"
  if (attrs.get('aria-hidden') === 'true') {
    return true;
  }

  // hidden attribute
  if (attrs.has('hidden')) {
    return true;
  }

  // Check for common hidden patterns in className
  const className = attrs.get('className') || attrs.get('class') || '';
  const hiddenPatterns = ['hidden', 'invisible', 'sr-only', 'visually-hidden'];
  if (hiddenPatterns.some(pattern => className.includes(pattern))) {
    return true;
  }

  return false;
}

// =============================================================================
// Accessible Name Computation
// =============================================================================

/**
 * Compute accessible name for an element
 */
function getAccessibleName(elem: ElementInfo, elements: ElementInfo[]): string {
  const attrs = elem.attributes;

  // Priority 1: aria-labelledby
  const labelledBy = attrs.get('aria-labelledby');
  if (labelledBy) {
    // Would need to resolve referenced element - return placeholder
    return `[referenced: ${labelledBy}]`;
  }

  // Priority 2: aria-label
  const ariaLabel = attrs.get('aria-label');
  if (ariaLabel) {
    return ariaLabel;
  }

  // Priority 3: For inputs, look for associated label
  if (['input', 'select', 'textarea'].includes(elem.tag)) {
    const id = attrs.get('id');
    if (id) {
      // Would need to find label with matching for - return placeholder
      return `[label for: ${id}]`;
    }
  }

  // Priority 4: For images, use alt
  if (elem.tag === 'img') {
    const alt = attrs.get('alt');
    if (alt !== undefined) {
      return alt;
    }
    return '';
  }

  // Priority 5: For buttons/links, use text content
  if (['button', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(elem.tag)) {
    if (elem.textContent) {
      return elem.textContent.trim();
    }
  }

  // Priority 6: title attribute
  const title = attrs.get('title');
  if (title) {
    return title;
  }

  // Priority 7: placeholder for inputs
  if (['input', 'textarea'].includes(elem.tag)) {
    const placeholder = attrs.get('placeholder');
    if (placeholder) {
      return `[placeholder: ${placeholder}]`;
    }
  }

  // Priority 8: value for buttons
  if (elem.tag === 'input') {
    const type = attrs.get('type');
    if (['button', 'submit', 'reset'].includes(type || '')) {
      const value = attrs.get('value');
      if (value) {
        return value;
      }
    }
  }

  return '';
}

/**
 * Get accessible description
 */
function getAccessibleDescription(attrs: Map<string, string>): string | undefined {
  // aria-describedby
  const describedBy = attrs.get('aria-describedby');
  if (describedBy) {
    return `[referenced: ${describedBy}]`;
  }

  // title can serve as description if not used as name
  const title = attrs.get('title');
  if (title) {
    return title;
  }

  return undefined;
}

// =============================================================================
// ARIA Pattern Validation
// =============================================================================

/**
 * ARIA pattern definitions with required and optional attributes
 */
const ARIA_PATTERNS: Record<string, { required: string[]; optional?: string[]; children_role?: string }> = {
  'dialog': {
    required: ['aria-labelledby', 'aria-label'],
    optional: ['aria-describedby', 'aria-modal'],
  },
  'alertdialog': {
    required: ['aria-labelledby', 'aria-label'],
    optional: ['aria-describedby', 'aria-modal'],
  },
  'combobox': {
    required: ['aria-expanded', 'aria-controls'],
    optional: ['aria-haspopup', 'aria-autocomplete', 'aria-activedescendant'],
  },
  'listbox': {
    required: [],
    optional: ['aria-multiselectable', 'aria-activedescendant', 'aria-labelledby'],
    children_role: 'option',
  },
  'menu': {
    required: [],
    optional: ['aria-labelledby', 'aria-activedescendant'],
    children_role: 'menuitem',
  },
  'menubar': {
    required: [],
    optional: ['aria-labelledby'],
    children_role: 'menuitem',
  },
  'tablist': {
    required: [],
    optional: ['aria-labelledby', 'aria-orientation'],
    children_role: 'tab',
  },
  'tab': {
    required: ['aria-selected'],
    optional: ['aria-controls'],
  },
  'tabpanel': {
    required: ['aria-labelledby'],
    optional: [],
  },
  'tree': {
    required: [],
    optional: ['aria-labelledby', 'aria-multiselectable'],
    children_role: 'treeitem',
  },
  'grid': {
    required: [],
    optional: ['aria-labelledby', 'aria-rowcount', 'aria-colcount'],
    children_role: 'row',
  },
  'slider': {
    required: ['aria-valuenow', 'aria-valuemin', 'aria-valuemax'],
    optional: ['aria-valuetext', 'aria-labelledby'],
  },
  'spinbutton': {
    required: ['aria-valuenow', 'aria-valuemin', 'aria-valuemax'],
    optional: ['aria-valuetext', 'aria-labelledby'],
  },
  'progressbar': {
    required: [],
    optional: ['aria-valuenow', 'aria-valuemin', 'aria-valuemax', 'aria-valuetext'],
  },
  'tooltip': {
    required: [],
    optional: [],
  },
  'switch': {
    required: ['aria-checked'],
    optional: ['aria-labelledby'],
  },
};

/**
 * Validate ARIA patterns in elements
 */
function validateAriaPatterns(elements: ElementInfo[]): AriaPattern[] {
  const patterns: AriaPattern[] = [];

  for (const elem of elements) {
    const role = getRole(elem.tag, elem.attributes);
    const pattern = ARIA_PATTERNS[role];

    if (pattern) {
      const missingAttrs: string[] = [];

      // Check required attributes (some patterns have OR requirements)
      if (pattern.required.length > 0) {
        // For dialog/alertdialog, need either aria-labelledby OR aria-label
        if (role === 'dialog' || role === 'alertdialog') {
          const hasLabelledBy = elem.attributes.has('aria-labelledby');
          const hasLabel = elem.attributes.has('aria-label');
          if (!hasLabelledBy && !hasLabel) {
            missingAttrs.push('aria-labelledby or aria-label');
          }
        } else {
          // Normal required check
          for (const attr of pattern.required) {
            if (!elem.attributes.has(attr)) {
              missingAttrs.push(attr);
            }
          }
        }
      }

      patterns.push({
        pattern: role,
        valid: missingAttrs.length === 0,
        missing_attributes: missingAttrs.length > 0 ? missingAttrs : undefined,
      });
    }
  }

  return patterns;
}

// =============================================================================
// WCAG Issue Detection
// =============================================================================

/**
 * Detect accessibility issues based on WCAG criteria
 */
function detectA11yIssues(elements: ElementInfo[]): A11yIssue[] {
  const issues: A11yIssue[] = [];

  for (const elem of elements) {
    const attrs = elem.attributes;
    const role = getRole(elem.tag, attrs);

    // WCAG 1.1.1: Images without alt text
    if (elem.tag === 'img' && !attrs.has('alt')) {
      // Check if it's decorative (aria-hidden or role="presentation")
      const isDecorative = attrs.get('aria-hidden') === 'true' ||
                          attrs.get('role') === 'presentation' ||
                          attrs.get('role') === 'none';
      if (!isDecorative) {
        issues.push({
          severity: 'error',
          element: elem.identifier,
          issue: 'Image missing alt attribute',
          wcag_criterion: '1.1.1 Non-text Content',
          fix: 'Add alt attribute with descriptive text, or alt="" if decorative',
        });
      }
    }

    // WCAG 4.1.2: Buttons without accessible name
    if (role === 'button') {
      const name = getAccessibleName(elem, elements);
      if (!name || name.startsWith('[')) {
        const hasIconOnly = (attrs.get('className') || '').includes('icon');
        if (hasIconOnly) {
          issues.push({
            severity: 'error',
            element: elem.identifier,
            issue: 'Icon button missing accessible name',
            wcag_criterion: '4.1.2 Name, Role, Value',
            fix: 'Add aria-label="description" or visually hidden text',
          });
        } else {
          issues.push({
            severity: 'warning',
            element: elem.identifier,
            issue: 'Button may be missing accessible name',
            wcag_criterion: '4.1.2 Name, Role, Value',
            fix: 'Ensure button has visible text, aria-label, or aria-labelledby',
          });
        }
      }
    }

    // WCAG 4.1.2: Links without accessible name
    if (role === 'link') {
      const name = getAccessibleName(elem, elements);
      if (!name || name.startsWith('[')) {
        issues.push({
          severity: 'warning',
          element: elem.identifier,
          issue: 'Link may be missing accessible name',
          wcag_criterion: '4.1.2 Name, Role, Value',
          fix: 'Ensure link has visible text or aria-label',
        });
      }
    }

    // WCAG 1.3.1: Form inputs without labels
    if (['input', 'select', 'textarea'].includes(elem.tag)) {
      const hasLabel = attrs.has('aria-label') ||
                      attrs.has('aria-labelledby') ||
                      attrs.has('id'); // Assuming there might be a label
      const isHiddenInput = attrs.get('type') === 'hidden';

      if (!hasLabel && !isHiddenInput) {
        issues.push({
          severity: 'error',
          element: elem.identifier,
          issue: 'Form input missing label',
          wcag_criterion: '1.3.1 Info and Relationships',
          fix: 'Add <label for="id">, aria-label, or aria-labelledby',
        });
      }
    }

    // WCAG 4.1.2: Click handlers on non-interactive elements
    const hasClickHandler = attrs.has('onClick') || attrs.has('onclick');
    const isInteractive = NATIVELY_FOCUSABLE.has(elem.tag) || attrs.has('role');

    if (hasClickHandler && !isInteractive && !elem.isComponent) {
      issues.push({
        severity: 'error',
        element: elem.identifier,
        issue: 'Click handler on non-interactive element without role',
        wcag_criterion: '4.1.2 Name, Role, Value',
        fix: 'Add role="button" tabIndex={0} and keyboard event handlers',
      });
    }

    // WCAG 2.4.7: Missing focus indicators (check for outline-none without replacement)
    const className = attrs.get('className') || attrs.get('class') || '';
    if (className.includes('outline-none') || className.includes('focus:outline-none')) {
      const hasFocusRing = className.includes('focus:ring') ||
                          className.includes('focus-visible:ring') ||
                          className.includes('focus:border') ||
                          className.includes('focus:shadow');
      if (!hasFocusRing && isFocusable(elem.tag, attrs)) {
        issues.push({
          severity: 'warning',
          element: elem.identifier,
          issue: 'Focus outline removed without visible replacement',
          wcag_criterion: '2.4.7 Focus Visible',
          fix: 'Add focus:ring-* or other visible focus indicator',
        });
      }
    }

    // WCAG 1.4.3/1.4.6: Color contrast (flag for manual check)
    if (className.includes('text-gray-') || className.includes('text-slate-')) {
      const lightColors = ['300', '400', '500'];
      if (lightColors.some(c => className.includes(`text-gray-${c}`) || className.includes(`text-slate-${c}`))) {
        issues.push({
          severity: 'suggestion',
          element: elem.identifier,
          issue: 'Light text color may have contrast issues',
          wcag_criterion: '1.4.3 Contrast (Minimum)',
          fix: 'Verify color contrast ratio meets WCAG requirements (4.5:1 for normal text)',
        });
      }
    }

    // Missing aria-expanded for expandable elements
    const expandableClasses = ['accordion', 'collapse', 'dropdown', 'expandable'];
    if (expandableClasses.some(c => className.toLowerCase().includes(c))) {
      if (!attrs.has('aria-expanded')) {
        issues.push({
          severity: 'warning',
          element: elem.identifier,
          issue: 'Expandable element missing aria-expanded',
          wcag_criterion: '4.1.2 Name, Role, Value',
          fix: 'Add aria-expanded="true/false" to indicate expansion state',
        });
      }
    }

    // ARIA pattern validation issues
    const role2 = attrs.get('role');
    if (role2 && ARIA_PATTERNS[role2]) {
      const pattern = ARIA_PATTERNS[role2];
      for (const req of pattern.required) {
        if (!attrs.has(req)) {
          // Skip if it's the dialog OR case (handled separately)
          if ((role2 === 'dialog' || role2 === 'alertdialog') &&
              (req === 'aria-labelledby' || req === 'aria-label')) {
            if (!attrs.has('aria-labelledby') && !attrs.has('aria-label')) {
              issues.push({
                severity: 'error',
                element: elem.identifier,
                issue: `${role2} missing required aria-labelledby or aria-label`,
                wcag_criterion: '4.1.2 Name, Role, Value',
                fix: `Add aria-labelledby pointing to title element, or aria-label`,
              });
            }
          } else {
            issues.push({
              severity: 'error',
              element: elem.identifier,
              issue: `${role2} missing required ${req}`,
              wcag_criterion: '4.1.2 Name, Role, Value',
              fix: `Add ${req} attribute to ${role2} element`,
            });
          }
        }
      }
    }
  }

  return issues;
}

// =============================================================================
// Keyboard Interaction Analysis
// =============================================================================

/**
 * Expected keyboard interactions for different roles
 */
const EXPECTED_KEYBOARD_INTERACTIONS: Record<string, string[]> = {
  'button': ['Enter', 'Space'],
  'link': ['Enter'],
  'checkbox': ['Space'],
  'radio': ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'],
  'slider': ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'],
  'spinbutton': ['ArrowUp', 'ArrowDown'],
  'combobox': ['ArrowUp', 'ArrowDown', 'Enter', 'Escape'],
  'listbox': ['ArrowUp', 'ArrowDown', 'Home', 'End', 'Enter'],
  'menu': ['ArrowUp', 'ArrowDown', 'Enter', 'Escape'],
  'menubar': ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', 'Escape'],
  'tablist': ['ArrowLeft', 'ArrowRight', 'Home', 'End'],
  'tab': ['Enter', 'Space'],
  'tree': ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Home', 'End'],
  'dialog': ['Escape', 'Tab'],
  'alertdialog': ['Escape', 'Tab'],
  'grid': ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'],
  'switch': ['Space', 'Enter'],
};

/**
 * Analyze keyboard interactions in elements
 */
function analyzeKeyboardInteractions(elements: ElementInfo[]): KeyboardInteractions {
  const expected = new Set<string>();
  const implemented = new Set<string>();

  for (const elem of elements) {
    const role = getRole(elem.tag, elem.attributes);
    const attrs = elem.attributes;

    // Add expected interactions for this role
    if (EXPECTED_KEYBOARD_INTERACTIONS[role]) {
      for (const key of EXPECTED_KEYBOARD_INTERACTIONS[role]) {
        expected.add(key);
      }
    }

    // Check for implemented keyboard handlers
    const keyHandlers = ['onKeyDown', 'onKeyUp', 'onKeyPress', 'onkeydown', 'onkeyup', 'onkeypress'];
    for (const handler of keyHandlers) {
      if (attrs.has(handler)) {
        // Try to detect which keys are handled from the handler code
        // This is a simplified detection
        implemented.add('Custom handler present');
        break;
      }
    }

    // Check for common keyboard handling patterns in className
    const className = attrs.get('className') || '';
    if (className.includes('keyboard') || className.includes('keydown')) {
      implemented.add('Custom handler present');
    }
  }

  // Calculate missing
  const missing = [...expected].filter(key => {
    // If custom handler is present, we can't know for sure what's implemented
    if (implemented.has('Custom handler present')) {
      return false;
    }
    return !implemented.has(key);
  });

  return {
    expected: [...expected],
    implemented: [...implemented],
    missing,
  };
}

// =============================================================================
// AST Analysis
// =============================================================================

/**
 * Extract attribute value from a JSX attribute
 */
function extractAttributeValue(attr: ts.JsxAttribute, sourceFile: ts.SourceFile): string {
  if (!attr.initializer) {
    // Boolean attribute (e.g., disabled)
    return 'true';
  }

  // String literal: attr="value"
  if (ts.isStringLiteral(attr.initializer)) {
    return attr.initializer.text;
  }

  // JSX expression: attr={value}
  if (ts.isJsxExpression(attr.initializer) && attr.initializer.expression) {
    const expr = attr.initializer.expression;

    // String literal in expression: attr={"value"}
    if (ts.isStringLiteral(expr)) {
      return expr.text;
    }

    // Boolean literals
    if (expr.kind === ts.SyntaxKind.TrueKeyword) {
      return 'true';
    }
    if (expr.kind === ts.SyntaxKind.FalseKeyword) {
      return 'false';
    }

    // Number literal
    if (ts.isNumericLiteral(expr)) {
      return expr.text;
    }

    // Template literal
    if (ts.isTemplateExpression(expr)) {
      return expr.head.text + '[dynamic]';
    }

    // Identifier (variable)
    if (ts.isIdentifier(expr)) {
      return `[${expr.text}]`;
    }

    // Call expression (e.g., cn(), clsx())
    if (ts.isCallExpression(expr)) {
      const parts: string[] = [];
      for (const arg of expr.arguments) {
        if (ts.isStringLiteral(arg)) {
          parts.push(arg.text);
        }
      }
      return parts.join(' ');
    }

    return '[expression]';
  }

  return '';
}

/**
 * Extract text content from JSX children
 */
function extractTextContent(node: ts.Node, sourceFile: ts.SourceFile): string {
  const textParts: string[] = [];

  function visit(child: ts.Node): void {
    if (ts.isJsxText(child)) {
      const text = child.text.trim();
      if (text) {
        textParts.push(text);
      }
    } else if (ts.isJsxExpression(child) && child.expression) {
      if (ts.isStringLiteral(child.expression)) {
        textParts.push(child.expression.text);
      }
    }
    ts.forEachChild(child, visit);
  }

  ts.forEachChild(node, visit);
  return textParts.join(' ').trim();
}

/**
 * Get line number for a position
 */
function getLineNumber(pos: number, sourceFile: ts.SourceFile): number {
  const { line } = sourceFile.getLineAndCharacterOfPosition(pos);
  return line + 1;
}

/**
 * Analyze JSX file for accessibility tree
 */
function analyzeJsxFile(
  filePath: string,
  content: string,
  sourceFile: ts.SourceFile,
  targetElement?: string
): ElementInfo[] {
  const elements: ElementInfo[] = [];
  const elementStack: number[] = [];

  function visit(node: ts.Node): void {
    // JSX Opening Element or Self-Closing Element
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tagName = node.tagName.getText(sourceFile);
      const line = getLineNumber(node.getStart(), sourceFile);
      const isComponent = /^[A-Z]/.test(tagName);

      // Filter by target element if specified
      if (targetElement && tagName !== targetElement) {
        if (ts.isJsxOpeningElement(node)) {
          elementStack.push(-1); // Push placeholder
        }
        ts.forEachChild(node, visit);
        return;
      }

      // Extract all attributes
      const attributes = new Map<string, string>();
      for (const attr of node.attributes.properties) {
        if (ts.isJsxAttribute(attr) && attr.name) {
          const attrName = attr.name.getText(sourceFile);
          const attrValue = extractAttributeValue(attr, sourceFile);
          attributes.set(attrName, attrValue);
        }
        // Handle spread attributes
        if (ts.isJsxSpreadAttribute(attr)) {
          attributes.set('[spread]', 'true');
        }
      }

      // Get text content for this element
      let textContent = '';
      if (ts.isJsxElement(node.parent)) {
        textContent = extractTextContent(node.parent, sourceFile);
      }

      const elementInfo: ElementInfo = {
        tag: tagName,
        line,
        identifier: `${tagName}:${line}`,
        attributes,
        textContent,
        isComponent,
        parentIndex: elementStack.length > 0 ? elementStack[elementStack.length - 1] : null,
        childIndices: [],
      };

      const currentIndex = elements.length;
      elements.push(elementInfo);

      // Update parent's children
      if (elementInfo.parentIndex !== null && elementInfo.parentIndex >= 0) {
        elements[elementInfo.parentIndex].childIndices.push(currentIndex);
      }

      // If opening element, push to stack
      if (ts.isJsxOpeningElement(node)) {
        elementStack.push(currentIndex);
      }
    }

    // JSX Closing Element - pop from stack
    if (ts.isJsxClosingElement(node)) {
      elementStack.pop();
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return elements;
}

// =============================================================================
// Tree Building
// =============================================================================

/**
 * Build accessibility tree from element list
 */
function buildA11yTree(elements: ElementInfo[]): A11yNode {
  const root: A11yNode = {
    role: 'document',
    name: 'Document',
    focusable: false,
    hidden: false,
    children: [],
  };

  // Build node map
  const nodeMap = new Map<number, A11yNode>();

  for (let i = 0; i < elements.length; i++) {
    const elem = elements[i];
    const attrs = elem.attributes;

    const node: A11yNode = {
      role: getRole(elem.tag, attrs),
      name: getAccessibleName(elem, elements),
      description: getAccessibleDescription(attrs),
      focusable: isFocusable(elem.tag, attrs),
      hidden: isHidden(attrs),
      children: [],
    };

    // Add state attributes
    if (attrs.has('aria-expanded')) {
      node.expanded = attrs.get('aria-expanded') === 'true';
    }
    if (attrs.has('aria-selected')) {
      node.selected = attrs.get('aria-selected') === 'true';
    }

    nodeMap.set(i, node);
  }

  // Build tree structure
  for (let i = 0; i < elements.length; i++) {
    const elem = elements[i];
    const node = nodeMap.get(i)!;

    // Skip hidden elements from the tree (but still include in analysis)
    if (node.hidden) {
      continue;
    }

    if (elem.parentIndex !== null && elem.parentIndex >= 0) {
      const parentNode = nodeMap.get(elem.parentIndex);
      if (parentNode && !parentNode.hidden) {
        parentNode.children.push(node);
      } else {
        root.children.push(node);
      }
    } else {
      root.children.push(node);
    }
  }

  return root;
}

/**
 * Build focus order from elements
 */
function buildFocusOrder(elements: ElementInfo[]): FocusOrderEntry[] {
  const focusableElements: { index: number; elem: ElementInfo; tabIndex: number }[] = [];

  for (let i = 0; i < elements.length; i++) {
    const elem = elements[i];
    if (isFocusable(elem.tag, elem.attributes) && !isHidden(elem.attributes)) {
      const tabIndex = getTabIndex(elem.tag, elem.attributes);
      focusableElements.push({ index: i, elem, tabIndex });
    }
  }

  // Sort by tabindex (positive first, then 0s in document order)
  focusableElements.sort((a, b) => {
    // Positive tabindex comes first
    if (a.tabIndex > 0 && b.tabIndex <= 0) return -1;
    if (b.tabIndex > 0 && a.tabIndex <= 0) return 1;
    // Both positive: sort by value
    if (a.tabIndex > 0 && b.tabIndex > 0) return a.tabIndex - b.tabIndex;
    // Both 0 or negative: keep document order
    return a.index - b.index;
  });

  return focusableElements.map((item, idx) => ({
    index: idx + 1,
    element: item.elem.identifier,
    tabindex: item.tabIndex !== 0 ? item.tabIndex : undefined,
  }));
}

// =============================================================================
// Summary Generation
// =============================================================================

/**
 * Generate summary of accessibility analysis
 */
function generateSummary(
  elements: ElementInfo[],
  issues: A11yIssue[],
  focusOrder: FocusOrderEntry[],
  ariaPatterns: AriaPattern[]
): string {
  const errorCount = issues.filter(i => i.severity === 'error').length;
  const warningCount = issues.filter(i => i.severity === 'warning').length;
  const suggestionCount = issues.filter(i => i.severity === 'suggestion').length;

  const invalidPatterns = ariaPatterns.filter(p => !p.valid).length;

  let summary = `Analyzed ${elements.length} elements. `;
  summary += `${focusOrder.length} focusable elements in tab order. `;

  if (errorCount > 0 || warningCount > 0) {
    summary += `Found ${errorCount} errors, ${warningCount} warnings`;
    if (suggestionCount > 0) {
      summary += `, ${suggestionCount} suggestions`;
    }
    summary += '. ';
  } else {
    summary += 'No critical accessibility issues detected. ';
  }

  if (ariaPatterns.length > 0) {
    if (invalidPatterns > 0) {
      summary += `${invalidPatterns}/${ariaPatterns.length} ARIA patterns have issues. `;
    } else {
      summary += `${ariaPatterns.length} ARIA patterns validated. `;
    }
  }

  return summary.trim();
}

// =============================================================================
// Handler
// =============================================================================

/**
 * Handles the get_accessibility_tree MCP tool call.
 *
 * Builds an accessibility tree from a component file and detects WCAG issues.
 *
 * @param args - The get_accessibility_tree tool arguments
 * @returns MCP tool response with accessibility analysis
 */
export async function handleGetAccessibilityTree(
  args: GetAccessibilityTreeArgs
): Promise<ToolResponse> {
  const projectRoot = process.cwd();
  const checkPatterns = args.check_patterns ?? true;

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
    let templateContent = content;
    if (ext === '.vue') {
      const templateMatch = content.match(/<template[^>]*>([\s\S]*?)<\/template>/);
      templateContent = templateMatch ? templateMatch[1] : content;
    } else if (ext === '.svelte') {
      templateContent = content
        .replace(/<script[^>]*>[\s\S]*?<\/script>/g, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/g, '');
    }

    // Create TypeScript source file for parsing
    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true,
      ext === '.tsx' ? ts.ScriptKind.TSX : ts.ScriptKind.JSX
    );

    // Analyze elements
    const elements = analyzeJsxFile(filePath, content, sourceFile, args.element);

    if (elements.length === 0) {
      return createSuccessResponse({
        file: path.relative(projectRoot, filePath),
        a11y_tree: {
          role: 'document',
          name: 'Document',
          focusable: false,
          hidden: false,
          children: [],
        },
        focus_order: [],
        issues: [],
        keyboard_interactions: {
          expected: [],
          implemented: [],
          missing: [],
        },
        aria_patterns: [],
        summary: 'No JSX elements found to analyze',
      });
    }

    // Build accessibility tree
    const a11yTree = buildA11yTree(elements);

    // Build focus order
    const focusOrder = buildFocusOrder(elements);

    // Detect issues
    const issues = detectA11yIssues(elements);

    // Analyze keyboard interactions
    const keyboardInteractions = analyzeKeyboardInteractions(elements);

    // Validate ARIA patterns
    const ariaPatterns = checkPatterns ? validateAriaPatterns(elements) : [];

    // Generate summary
    const summary = generateSummary(elements, issues, focusOrder, ariaPatterns);

    const result: GetAccessibilityTreeResult = {
      file: path.relative(projectRoot, filePath),
      a11y_tree: a11yTree,
      focus_order: focusOrder,
      issues,
      keyboard_interactions: keyboardInteractions,
      aria_patterns: ariaPatterns,
      summary,
    };

    return createSuccessResponse(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown error during analysis';
    return createErrorResponse(message, { file: args.file });
  }
}
