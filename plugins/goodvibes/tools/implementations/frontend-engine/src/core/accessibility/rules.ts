/**
 * Accessibility Rules
 *
 * WCAG issue detection, ARIA pattern validation,
 * keyboard interaction analysis, tree building, and summary generation.
 *
 * @module core/accessibility/rules
 */

import type { ElementInfo, A11yNode, FocusOrderEntry, A11yIssue, KeyboardInteractions, AriaPattern } from './types.js';
import {
  ARIA_PATTERNS,
  EXPECTED_KEYBOARD_INTERACTIONS,
  NATIVELY_FOCUSABLE,
  getRole,
  isFocusable,
  getTabIndex,
  isHidden,
} from './scanner.js';

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
 * Validate ARIA patterns in elements
 */
export function validateAriaPatterns(elements: ElementInfo[]): AriaPattern[] {
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
export function detectA11yIssues(elements: ElementInfo[]): A11yIssue[] {
  const issues: A11yIssue[] = [];

  for (const elem of elements) {
    const attrs = elem.attributes;
    const role = getRole(elem.tag, attrs);

    // WCAG 1.1.1: Images without alt text
    if (elem.tag === 'img' && !attrs.has('alt')) {
      const isDecorative =
        attrs.get('aria-hidden') === 'true' ||
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
      const hasLabel =
        attrs.has('aria-label') || attrs.has('aria-labelledby') || attrs.has('id');
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

    // WCAG 2.4.7: Missing focus indicators
    const className = attrs.get('className') || attrs.get('class') || '';
    if (className.includes('outline-none') || className.includes('focus:outline-none')) {
      const hasFocusRing =
        className.includes('focus:ring') ||
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

    // WCAG 1.4.3/1.4.6: Color contrast flag
    if (className.includes('text-gray-') || className.includes('text-slate-')) {
      const lightColors = ['300', '400', '500'];
      if (
        lightColors.some(
          (c) => className.includes(`text-gray-${c}`) || className.includes(`text-slate-${c}`)
        )
      ) {
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
    if (expandableClasses.some((c) => className.toLowerCase().includes(c))) {
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
          if (
            (role2 === 'dialog' || role2 === 'alertdialog') &&
            (req === 'aria-labelledby' || req === 'aria-label')
          ) {
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
 * Analyze keyboard interactions in elements
 */
export function analyzeKeyboardInteractions(elements: ElementInfo[]): KeyboardInteractions {
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
  const missing = [...expected].filter((key) => {
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
// Tree Building
// =============================================================================

/**
 * Build accessibility tree from element list
 */
export function buildA11yTree(elements: ElementInfo[]): A11yNode {
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

    // Skip hidden elements from the tree
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
export function buildFocusOrder(elements: ElementInfo[]): FocusOrderEntry[] {
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
export function generateSummary(
  elements: ElementInfo[],
  issues: A11yIssue[],
  focusOrder: FocusOrderEntry[],
  ariaPatterns: AriaPattern[]
): string {
  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;
  const suggestionCount = issues.filter((i) => i.severity === 'suggestion').length;

  const invalidPatterns = ariaPatterns.filter((p) => !p.valid).length;

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
