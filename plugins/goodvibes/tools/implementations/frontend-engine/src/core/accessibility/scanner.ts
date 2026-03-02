/**
 * Accessibility Scanner
 *
 * AST analysis, element extraction, attribute scanning,
 * ARIA role resolution, and focusability detection.
 *
 * @module core/accessibility/scanner
 */

import ts from 'typescript';
import type { ElementInfo, AriaPatternDef } from './types.js';

// =============================================================================
// Semantic Role Constants
// =============================================================================

/**
 * Maps HTML elements to their implicit ARIA roles
 */
export const SEMANTIC_ROLES: Record<string, string> = {
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
export const INPUT_TYPE_ROLES: Record<string, string> = {
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
 * Natively focusable elements
 */
export const NATIVELY_FOCUSABLE = new Set([
  'a', 'button', 'input', 'select', 'textarea', 'details', 'summary',
]);

// =============================================================================
// ARIA Pattern Definitions
// =============================================================================

/**
 * ARIA pattern definitions with required and optional attributes
 */
export const ARIA_PATTERNS: Record<string, AriaPatternDef> = {
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
 * Expected keyboard interactions for different roles
 */
export const EXPECTED_KEYBOARD_INTERACTIONS: Record<string, string[]> = {
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

// =============================================================================
// Role Determination
// =============================================================================

/**
 * Get the ARIA role for an element
 */
export function getRole(tag: string, attrs: Map<string, string>): string {
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
// Focusability Detection
// =============================================================================

/**
 * Determine if an element can receive focus
 */
export function isFocusable(tag: string, attrs: Map<string, string>): boolean {
  // Check for disabled
  if (attrs.has('disabled')) {
    return false;
  }

  // Check tabindex - check both lowercase and camelCase variants
  const tabindex = attrs.get('tabindex') ?? attrs.get('tabIndex');
  if (tabindex !== undefined) {
    const tabIndexNum = parseInt(tabindex, 10);
    return tabIndexNum >= 0;
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
export function getTabIndex(tag: string, attrs: Map<string, string>): number {
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
export function isHidden(attrs: Map<string, string>): boolean {
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
// AST Analysis Helpers
// =============================================================================

/**
 * Get line number for a position
 */
export function getLineNumber(pos: number, sourceFile: ts.SourceFile): number {
  const { line } = sourceFile.getLineAndCharacterOfPosition(pos);
  return line + 1;
}

/**
 * Extract attribute value from a JSX attribute
 */
export function extractAttributeValue(attr: ts.JsxAttribute, sourceFile: ts.SourceFile): string {
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

    // Prefix unary expression (e.g., -1 for tabIndex={-1})
    if (ts.isPrefixUnaryExpression(expr)) {
      if (expr.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(expr.operand)) {
        return '-' + expr.operand.text;
      }
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

  /* v8 ignore next -- defensive: unreachable when initializer exists but matches no patterns */
  return '';
}

/**
 * Extract text content from JSX children
 */
export function extractTextContent(node: ts.Node, sourceFile: ts.SourceFile): string {
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

// =============================================================================
// JSX File Analysis
// =============================================================================

/**
 * Analyze JSX file for accessibility tree
 */
export function analyzeJsxFile(
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
