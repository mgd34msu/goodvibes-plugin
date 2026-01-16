/**
 * Unit tests for accessibility-tree-analyzers
 *
 * Tests cover:
 * - getAccessibleName: accessible name computation
 * - getAccessibleDescription: description computation
 * - validateAriaPatterns: ARIA pattern validation
 * - detectA11yIssues: WCAG issue detection
 * - analyzeKeyboardInteractions: keyboard handler analysis
 * - buildA11yTree: accessibility tree construction
 * - buildFocusOrder: focus order calculation
 * - generateSummary: summary text generation
 */

import { describe, it, expect } from 'vitest';
import {
  getAccessibleName,
  getAccessibleDescription,
  validateAriaPatterns,
  detectA11yIssues,
  analyzeKeyboardInteractions,
  buildA11yTree,
  buildFocusOrder,
  generateSummary,
} from '../../../handlers/frontend/accessibility-tree-analyzers.js';
import type { ElementInfo } from '../../../handlers/frontend/accessibility-tree-utils.js';

/**
 * Helper to create ElementInfo for testing
 */
function createElementInfo(overrides: Partial<ElementInfo> = {}): ElementInfo {
  return {
    tag: 'div',
    line: 1,
    identifier: 'div:1',
    attributes: new Map(),
    textContent: '',
    isComponent: false,
    parentIndex: null,
    childIndices: [],
    ...overrides,
  };
}

describe('accessibility-tree-analyzers', () => {
  describe('getAccessibleName', () => {
    it('should return aria-labelledby reference', () => {
      const elem = createElementInfo({
        attributes: new Map([['aria-labelledby', 'title-id']]),
      });

      expect(getAccessibleName(elem, [])).toBe('[referenced: title-id]');
    });

    it('should return aria-label', () => {
      const elem = createElementInfo({
        attributes: new Map([['aria-label', 'Close dialog']]),
      });

      expect(getAccessibleName(elem, [])).toBe('Close dialog');
    });

    it('should return label reference for form inputs', () => {
      const elem = createElementInfo({
        tag: 'input',
        attributes: new Map([['id', 'email-input']]),
      });

      expect(getAccessibleName(elem, [])).toBe('[label for: email-input]');
    });

    it('should handle select elements', () => {
      const elem = createElementInfo({
        tag: 'select',
        attributes: new Map([['id', 'country']]),
      });

      expect(getAccessibleName(elem, [])).toBe('[label for: country]');
    });

    it('should handle textarea elements', () => {
      const elem = createElementInfo({
        tag: 'textarea',
        attributes: new Map([['id', 'message']]),
      });

      expect(getAccessibleName(elem, [])).toBe('[label for: message]');
    });

    it('should return alt text for images', () => {
      const elem = createElementInfo({
        tag: 'img',
        attributes: new Map([['alt', 'Company logo']]),
      });

      expect(getAccessibleName(elem, [])).toBe('Company logo');
    });

    it('should return empty string for image without alt', () => {
      const elem = createElementInfo({
        tag: 'img',
        attributes: new Map(),
      });

      expect(getAccessibleName(elem, [])).toBe('');
    });

    it('should return text content for buttons', () => {
      const elem = createElementInfo({
        tag: 'button',
        textContent: 'Submit Form',
      });

      expect(getAccessibleName(elem, [])).toBe('Submit Form');
    });

    it('should return text content for links', () => {
      const elem = createElementInfo({
        tag: 'a',
        textContent: 'Learn more',
      });

      expect(getAccessibleName(elem, [])).toBe('Learn more');
    });

    it('should return text content for headings', () => {
      const elem = createElementInfo({
        tag: 'h1',
        textContent: 'Welcome Page',
      });

      expect(getAccessibleName(elem, [])).toBe('Welcome Page');
    });

    it('should return title attribute', () => {
      const elem = createElementInfo({
        attributes: new Map([['title', 'More information']]),
      });

      expect(getAccessibleName(elem, [])).toBe('More information');
    });

    it('should return placeholder for inputs', () => {
      const elem = createElementInfo({
        tag: 'input',
        attributes: new Map([['placeholder', 'Enter email']]),
      });

      expect(getAccessibleName(elem, [])).toBe('[placeholder: Enter email]');
    });

    it('should return value for button inputs', () => {
      const elem = createElementInfo({
        tag: 'input',
        attributes: new Map([
          ['type', 'submit'],
          ['value', 'Submit'],
        ]),
      });

      expect(getAccessibleName(elem, [])).toBe('Submit');
    });

    it('should follow priority order', () => {
      const elem = createElementInfo({
        tag: 'button',
        textContent: 'Click me',
        attributes: new Map([
          ['aria-label', 'Important button'],
          ['title', 'Some title'],
        ]),
      });

      // aria-label takes priority
      expect(getAccessibleName(elem, [])).toBe('Important button');
    });

    it('should return empty string when no name found', () => {
      const elem = createElementInfo({
        tag: 'div',
      });

      expect(getAccessibleName(elem, [])).toBe('');
    });
  });

  describe('getAccessibleDescription', () => {
    it('should return aria-describedby reference', () => {
      const attrs = new Map([['aria-describedby', 'desc-id']]);

      expect(getAccessibleDescription(attrs)).toBe('[referenced: desc-id]');
    });

    it('should return title as description', () => {
      const attrs = new Map([['title', 'Additional information']]);

      expect(getAccessibleDescription(attrs)).toBe('Additional information');
    });

    it('should return undefined when no description', () => {
      const attrs = new Map();

      expect(getAccessibleDescription(attrs)).toBeUndefined();
    });
  });

  describe('validateAriaPatterns', () => {
    it('should validate dialog pattern', () => {
      const elements = [
        createElementInfo({
          tag: 'div',
          attributes: new Map([
            ['role', 'dialog'],
            ['aria-labelledby', 'dialog-title'],
          ]),
        }),
      ];

      const patterns = validateAriaPatterns(elements);

      expect(patterns.length).toBe(1);
      expect(patterns[0].pattern).toBe('dialog');
      expect(patterns[0].valid).toBe(true);
    });

    it('should detect missing dialog label', () => {
      const elements = [
        createElementInfo({
          tag: 'div',
          attributes: new Map([['role', 'dialog']]),
        }),
      ];

      const patterns = validateAriaPatterns(elements);

      expect(patterns[0].valid).toBe(false);
      expect(patterns[0].missing_attributes).toContain('aria-labelledby or aria-label');
    });

    it('should validate combobox pattern', () => {
      const elements = [
        createElementInfo({
          tag: 'input',
          attributes: new Map([
            ['role', 'combobox'],
            ['aria-expanded', 'false'],
            ['aria-controls', 'list-id'],
          ]),
        }),
      ];

      const patterns = validateAriaPatterns(elements);

      expect(patterns[0].pattern).toBe('combobox');
      expect(patterns[0].valid).toBe(true);
    });

    it('should detect missing combobox attributes', () => {
      const elements = [
        createElementInfo({
          tag: 'input',
          attributes: new Map([['role', 'combobox']]),
        }),
      ];

      const patterns = validateAriaPatterns(elements);

      expect(patterns[0].valid).toBe(false);
      expect(patterns[0].missing_attributes).toContain('aria-expanded');
      expect(patterns[0].missing_attributes).toContain('aria-controls');
    });

    it('should validate slider pattern', () => {
      const elements = [
        createElementInfo({
          tag: 'div',
          attributes: new Map([
            ['role', 'slider'],
            ['aria-valuenow', '50'],
            ['aria-valuemin', '0'],
            ['aria-valuemax', '100'],
          ]),
        }),
      ];

      const patterns = validateAriaPatterns(elements);

      expect(patterns[0].pattern).toBe('slider');
      expect(patterns[0].valid).toBe(true);
    });

    it('should skip elements without ARIA patterns', () => {
      const elements = [
        createElementInfo({
          tag: 'div',
          attributes: new Map([['role', 'presentation']]),
        }),
      ];

      const patterns = validateAriaPatterns(elements);

      expect(patterns.length).toBe(0);
    });
  });

  describe('detectA11yIssues', () => {
    it('should detect image without alt', () => {
      const elements = [
        createElementInfo({
          tag: 'img',
          identifier: 'img:5',
          attributes: new Map(),
        }),
      ];

      const issues = detectA11yIssues(elements);

      expect(issues.some((i) => i.issue.includes('alt'))).toBe(true);
      expect(issues.some((i) => i.wcag_criterion === '1.1.1 Non-text Content')).toBe(true);
    });

    it('should not flag decorative images', () => {
      const elements = [
        createElementInfo({
          tag: 'img',
          attributes: new Map([['aria-hidden', 'true']]),
        }),
      ];

      const issues = detectA11yIssues(elements);

      expect(issues.some((i) => i.issue.includes('alt'))).toBe(false);
    });

    it('should not flag images with role presentation', () => {
      const elements = [
        createElementInfo({
          tag: 'img',
          attributes: new Map([['role', 'presentation']]),
        }),
      ];

      const issues = detectA11yIssues(elements);

      expect(issues.some((i) => i.issue.includes('alt'))).toBe(false);
    });

    it('should detect button without accessible name', () => {
      const elements = [
        createElementInfo({
          tag: 'button',
          identifier: 'button:10',
          attributes: new Map(),
          textContent: '',
        }),
      ];

      const issues = detectA11yIssues(elements);

      expect(issues.some((i) => i.issue.includes('Button'))).toBe(true);
    });

    it('should detect icon button without label', () => {
      const elements = [
        createElementInfo({
          tag: 'button',
          identifier: 'button:10',
          attributes: new Map([['className', 'icon-button']]),
          textContent: '',
        }),
      ];

      const issues = detectA11yIssues(elements);

      expect(issues.some((i) => i.issue.includes('Icon button'))).toBe(true);
      expect(issues.some((i) => i.severity === 'error')).toBe(true);
    });

    it('should detect link without accessible name', () => {
      const elements = [
        createElementInfo({
          tag: 'a',
          identifier: 'a:15',
          attributes: new Map([['href', '/page']]),
          textContent: '',
        }),
      ];

      const issues = detectA11yIssues(elements);

      expect(issues.some((i) => i.issue.includes('Link'))).toBe(true);
    });

    it('should detect form input without label', () => {
      const elements = [
        createElementInfo({
          tag: 'input',
          identifier: 'input:20',
          attributes: new Map([['type', 'text']]),
        }),
      ];

      const issues = detectA11yIssues(elements);

      expect(issues.some((i) => i.issue.includes('Form input missing label'))).toBe(true);
    });

    it('should not flag hidden inputs', () => {
      const elements = [
        createElementInfo({
          tag: 'input',
          attributes: new Map([['type', 'hidden']]),
        }),
      ];

      const issues = detectA11yIssues(elements);

      expect(issues.some((i) => i.issue.includes('Form input missing label'))).toBe(false);
    });

    it('should detect click on non-interactive element', () => {
      const elements = [
        createElementInfo({
          tag: 'div',
          identifier: 'div:25',
          attributes: new Map([['onClick', 'handleClick']]),
          isComponent: false,
        }),
      ];

      const issues = detectA11yIssues(elements);

      expect(issues.some((i) => i.issue.includes('Click handler on non-interactive'))).toBe(true);
    });

    it('should not flag click on component', () => {
      const elements = [
        createElementInfo({
          tag: 'CustomComponent',
          attributes: new Map([['onClick', 'handleClick']]),
          isComponent: true,
        }),
      ];

      const issues = detectA11yIssues(elements);

      expect(issues.some((i) => i.issue.includes('Click handler on non-interactive'))).toBe(false);
    });

    it('should detect removed focus outline without replacement', () => {
      const elements = [
        createElementInfo({
          tag: 'button',
          identifier: 'button:30',
          attributes: new Map([['className', 'outline-none']]),
        }),
      ];

      const issues = detectA11yIssues(elements);

      expect(issues.some((i) => i.issue.includes('Focus outline removed'))).toBe(true);
    });

    it('should not flag focus outline removed with ring replacement', () => {
      const elements = [
        createElementInfo({
          tag: 'button',
          attributes: new Map([['className', 'outline-none focus:ring-2']]),
        }),
      ];

      const issues = detectA11yIssues(elements);

      expect(issues.some((i) => i.issue.includes('Focus outline removed'))).toBe(false);
    });

    it('should detect potential contrast issues', () => {
      const elements = [
        createElementInfo({
          tag: 'p',
          identifier: 'p:35',
          attributes: new Map([['className', 'text-gray-400']]),
        }),
      ];

      const issues = detectA11yIssues(elements);

      expect(issues.some((i) => i.issue.includes('contrast'))).toBe(true);
      expect(issues.some((i) => i.severity === 'suggestion')).toBe(true);
    });

    it('should detect missing aria-expanded on expandable elements', () => {
      const elements = [
        createElementInfo({
          tag: 'button',
          identifier: 'button:40',
          attributes: new Map([['className', 'accordion-toggle']]),
          textContent: 'Toggle',
        }),
      ];

      const issues = detectA11yIssues(elements);

      expect(issues.some((i) => i.issue.includes('aria-expanded'))).toBe(true);
    });

    it('should detect missing dialog label', () => {
      const elements = [
        createElementInfo({
          tag: 'div',
          identifier: 'div:45',
          attributes: new Map([['role', 'dialog']]),
        }),
      ];

      const issues = detectA11yIssues(elements);

      expect(issues.some((i) => i.issue.includes('dialog missing required'))).toBe(true);
    });

    it('should detect missing alertdialog label (line 412)', () => {
      const elements = [
        createElementInfo({
          tag: 'div',
          identifier: 'div:50',
          attributes: new Map([['role', 'alertdialog']]),
        }),
      ];

      const issues = detectA11yIssues(elements);

      expect(issues.some((i) => i.issue.includes('alertdialog missing required'))).toBe(true);
    });

    it('should detect missing required attribute for standard role (line 419)', () => {
      const elements = [
        createElementInfo({
          tag: 'div',
          identifier: 'div:55',
          attributes: new Map([['role', 'combobox']]),
        }),
      ];

      const issues = detectA11yIssues(elements);

      // Combobox requires aria-expanded and aria-controls
      expect(issues.some((i) => i.issue.includes('combobox missing required aria-expanded'))).toBe(true);
    });

    it('should not flag click on interactive elements or components (branch coverage line 362)', () => {
      const elements = [
        createElementInfo({
          tag: 'button',
          attributes: new Map([['onClick', 'handleClick']]),
        }),
        createElementInfo({
          tag: 'Custom',
          attributes: new Map([['onClick', 'handleClick']]),
          isComponent: true,
        }),
        createElementInfo({
          tag: 'div',
          attributes: new Map([['role', 'link'], ['onClick', 'handleClick']]),
        }),
      ];

      const issues = detectA11yIssues(elements);
      expect(issues.some((i) => i.issue.includes('Click handler on non-interactive'))).toBe(false);
    });

    it('should not flag dark gray text colors (branch coverage line 380)', () => {
      const elements = [
        createElementInfo({
          tag: 'span',
          attributes: new Map([['className', 'text-gray-900']]),
        }),
      ];

      const issues = detectA11yIssues(elements);
      expect(issues.some((i) => i.issue.includes('contrast'))).toBe(false);
    });

    it('should not flag non-expandable elements (branch coverage line 402)', () => {
      const elements = [
        createElementInfo({
          tag: 'div',
          attributes: new Map([['className', 'regular-box']]),
        }),
      ];

      const issues = detectA11yIssues(elements);
      expect(issues.some((i) => i.issue.includes('aria-expanded'))).toBe(false);
    });
  });

  describe('analyzeKeyboardInteractions', () => {
    it('should identify expected interactions', () => {
      const elements = [
        createElementInfo({
          tag: 'button',
          attributes: new Map(),
        }),
        createElementInfo({
          tag: 'input',
          attributes: new Map([['role', 'slider']]),
        }),
      ];

      const result = analyzeKeyboardInteractions(elements);

      expect(result.expected).toContain('Enter');
      expect(result.expected).toContain('Space');
      expect(result.expected).toContain('ArrowUp');
      expect(result.expected).toContain('ArrowDown');
    });

    it('should detect implemented handlers', () => {
      const elements = [
        createElementInfo({
          tag: 'div',
          attributes: new Map([['onKeyDown', 'handleKey']]),
        }),
      ];

      const result = analyzeKeyboardInteractions(elements);

      expect(result.implemented).toContain('Custom handler present');
    });

    it('should detect keyboard class hints', () => {
      const elements = [
        createElementInfo({
          tag: 'div',
          attributes: new Map([['className', 'keyboard-nav']]),
        }),
      ];

      const result = analyzeKeyboardInteractions(elements);

      expect(result.implemented).toContain('Custom handler present');
    });

    it('should identify missing interactions when no handler present', () => {
      const elements = [
        createElementInfo({
          tag: 'div',
          attributes: new Map([['role', 'button']]),
        }),
      ];

      const result = analyzeKeyboardInteractions(elements);

      expect(result.expected.length).toBeGreaterThan(0);
      expect(result.missing.length).toBeGreaterThan(0);
    });

    it('should not report missing when handler is present', () => {
      const elements = [
        createElementInfo({
          tag: 'div',
          attributes: new Map([
            ['role', 'button'],
            ['onKeyDown', 'handleKey'],
          ]),
        }),
      ];

      const result = analyzeKeyboardInteractions(elements);

      expect(result.missing.length).toBe(0);
    });
  });

  describe('buildA11yTree', () => {
    it('should create document root', () => {
      const tree = buildA11yTree([]);

      expect(tree.role).toBe('document');
      expect(tree.name).toBe('Document');
      expect(tree.children).toEqual([]);
    });

    it('should add elements as children', () => {
      const elements = [
        createElementInfo({
          tag: 'main',
          attributes: new Map(),
        }),
      ];

      const tree = buildA11yTree(elements);

      expect(tree.children.length).toBe(1);
      expect(tree.children[0].role).toBe('main');
    });

    it('should set focusable property', () => {
      const elements = [
        createElementInfo({
          tag: 'button',
          attributes: new Map(),
        }),
      ];

      const tree = buildA11yTree(elements);

      expect(tree.children[0].focusable).toBe(true);
    });

    it('should skip hidden elements', () => {
      const elements = [
        createElementInfo({
          tag: 'div',
          attributes: new Map([['aria-hidden', 'true']]),
        }),
      ];

      const tree = buildA11yTree(elements);

      expect(tree.children.length).toBe(0);
    });

    it('should set expanded state', () => {
      const elements = [
        createElementInfo({
          tag: 'button',
          attributes: new Map([['aria-expanded', 'true']]),
        }),
      ];

      const tree = buildA11yTree(elements);

      expect(tree.children[0].expanded).toBe(true);
    });

    it('should set selected state', () => {
      const elements = [
        createElementInfo({
          tag: 'div',
          attributes: new Map([
            ['role', 'tab'],
            ['aria-selected', 'true'],
          ]),
        }),
      ];

      const tree = buildA11yTree(elements);

      expect(tree.children[0].selected).toBe(true);
    });

    it('should handle parent-child relationships', () => {
      const elements = [
        createElementInfo({
          tag: 'nav',
          parentIndex: null,
          childIndices: [1],
        }),
        createElementInfo({
          tag: 'a',
          attributes: new Map([['href', '/']]),
          parentIndex: 0,
        }),
      ];

      const tree = buildA11yTree(elements);

      expect(tree.children.length).toBe(1);
      expect(tree.children[0].role).toBe('navigation');
      expect(tree.children[0].children.length).toBe(1);
      expect(tree.children[0].children[0].role).toBe('link');
    });

    it('should add child to root if parent is hidden (line 539)', () => {
      const elements = [
        createElementInfo({
          tag: 'div',
          attributes: new Map([['aria-hidden', 'true']]),
          childIndices: [1],
        }),
        createElementInfo({
          tag: 'button',
          parentIndex: 0,
        }),
      ];

      const tree = buildA11yTree(elements);

      // Parent is hidden and skipped, so child should be at root
      expect(tree.children.length).toBe(1);
      expect(tree.children[0].role).toBe('button');
    });
  });

  describe('buildFocusOrder', () => {
    it('should return empty array for no focusable elements', () => {
      const elements = [
        createElementInfo({ tag: 'div' }),
        createElementInfo({ tag: 'span' }),
      ];

      const order = buildFocusOrder(elements);

      expect(order).toEqual([]);
    });

    it('should include focusable elements', () => {
      const elements = [
        createElementInfo({ tag: 'button', identifier: 'button:1' }),
        createElementInfo({
          tag: 'input',
          identifier: 'input:2',
        }),
      ];

      const order = buildFocusOrder(elements);

      expect(order.length).toBe(2);
    });

    it('should exclude hidden elements', () => {
      const elements = [
        createElementInfo({
          tag: 'button',
          attributes: new Map([['aria-hidden', 'true']]),
        }),
      ];

      const order = buildFocusOrder(elements);

      expect(order.length).toBe(0);
    });

    it('should sort positive tabindex first', () => {
      const elements = [
        createElementInfo({
          tag: 'button',
          identifier: 'button:1',
          attributes: new Map(),
        }),
        createElementInfo({
          tag: 'button',
          identifier: 'button:2',
          attributes: new Map([['tabindex', '1']]),
        }),
      ];

      const order = buildFocusOrder(elements);

      expect(order[0].element).toBe('button:2');
      expect(order[0].tabindex).toBe(1);
    });

    it('should sort multiple positive tabindex by value', () => {
      const elements = [
        createElementInfo({
          tag: 'button',
          identifier: 'button:1',
          attributes: new Map([['tabindex', '2']]),
        }),
        createElementInfo({
          tag: 'button',
          identifier: 'button:2',
          attributes: new Map([['tabindex', '1']]),
        }),
      ];

      const order = buildFocusOrder(elements);

      expect(order[0].element).toBe('button:2');
      expect(order[1].element).toBe('button:1');
    });

    it('should maintain document order for tabindex 0', () => {
      const elements = [
        createElementInfo({
          tag: 'button',
          identifier: 'button:1',
        }),
        createElementInfo({
          tag: 'button',
          identifier: 'button:2',
        }),
      ];

      const order = buildFocusOrder(elements);

      expect(order[0].element).toBe('button:1');
      expect(order[1].element).toBe('button:2');
    });
  });

  describe('generateSummary', () => {
    const emptyElements: ElementInfo[] = [];
    const emptyIssues: { severity: 'error' | 'warning' | 'suggestion'; element: string; issue: string; fix: string }[] = [];
    const emptyFocusOrder: { index: number; element: string }[] = [];
    const emptyPatterns: { pattern: string; valid: boolean }[] = [];

    it('should report element count', () => {
      const elements = [
        createElementInfo({ tag: 'div' }),
        createElementInfo({ tag: 'button' }),
      ];

      const summary = generateSummary(elements, emptyIssues, emptyFocusOrder, emptyPatterns);

      expect(summary).toContain('Analyzed 2 elements');
    });

    it('should report focusable element count', () => {
      const focusOrder = [
        { index: 1, element: 'button:1' },
        { index: 2, element: 'input:2' },
      ];

      const summary = generateSummary(emptyElements, emptyIssues, focusOrder, emptyPatterns);

      expect(summary).toContain('2 focusable elements');
    });

    it('should report error and warning counts', () => {
      const issues = [
        { severity: 'error' as const, element: 'img:1', issue: 'Missing alt', fix: 'Add alt' },
        { severity: 'error' as const, element: 'button:2', issue: 'No name', fix: 'Add name' },
        { severity: 'warning' as const, element: 'div:3', issue: 'Contrast', fix: 'Fix contrast' },
      ];

      const summary = generateSummary(emptyElements, issues, emptyFocusOrder, emptyPatterns);

      expect(summary).toContain('2 errors');
      expect(summary).toContain('1 warning');
    });

    it('should report no issues when clean', () => {
      const summary = generateSummary(emptyElements, emptyIssues, emptyFocusOrder, emptyPatterns);

      expect(summary).toContain('No critical accessibility issues');
    });

    it('should report ARIA pattern validation', () => {
      const patterns = [
        { pattern: 'dialog', valid: true },
        { pattern: 'combobox', valid: false },
      ];

      const summary = generateSummary(emptyElements, emptyIssues, emptyFocusOrder, patterns);

      expect(summary).toContain('1/2 ARIA patterns have issues');
    });

    it('should report all patterns valid', () => {
      const patterns = [
        { pattern: 'dialog', valid: true },
        { pattern: 'tab', valid: true },
      ];

      const summary = generateSummary(emptyElements, emptyIssues, emptyFocusOrder, patterns);

      expect(summary).toContain('2 ARIA patterns validated');
    });

    it('should include suggestion count', () => {
      const issues = [
        { severity: 'error' as const, element: 'img:1', issue: 'Missing alt', fix: 'Add alt' },
        { severity: 'suggestion' as const, element: 'p:2', issue: 'Contrast', fix: 'Check contrast' },
        { severity: 'suggestion' as const, element: 'p:3', issue: 'Contrast', fix: 'Check contrast' },
      ];

      const summary = generateSummary(emptyElements, issues, emptyFocusOrder, emptyPatterns);

      expect(summary).toContain('2 suggestions');
    });
  });
});
