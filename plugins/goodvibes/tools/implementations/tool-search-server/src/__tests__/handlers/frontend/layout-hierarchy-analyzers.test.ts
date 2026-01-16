/**
 * Unit tests for layout-hierarchy-analyzers
 *
 * Tests cover:
 * - detectIssues: issue detection for various layout problems
 * - generateConstraintNotes: constraint documentation generation
 * - generateSummary: summary text generation
 */

import { describe, it, expect } from 'vitest';
import {
  detectIssues,
  generateConstraintNotes,
  generateSummary,
  type LayoutNode,
  type LayoutContext,
} from '../../../handlers/frontend/layout-hierarchy-analyzers.js';

/**
 * Helper to create a minimal LayoutNode for testing
 */
function createNode(overrides: Partial<LayoutNode> = {}): LayoutNode {
  return {
    element: 'div',
    tag: 'div',
    classes: [],
    sizing: {
      width: { strategy: 'auto' },
      height: { strategy: 'auto' },
    },
    display: 'block',
    overflow: { x: 'visible', y: 'visible' },
    position: 'static',
    children: [],
    ...overrides,
  };
}

describe('layout-hierarchy-analyzers', () => {
  describe('detectIssues', () => {
    describe('fixed height container with auto-height children', () => {
      it('should detect fixed height container without overflow handling', () => {
        const node = createNode({
          element: 'container',
          sizing: { width: { strategy: 'auto' }, height: { strategy: 'fixed', value: '200px' } },
          overflow: { x: 'visible', y: 'visible' },
          children: [
            createNode({
              element: 'child',
              sizing: { width: { strategy: 'auto' }, height: { strategy: 'auto' } },
            }),
          ],
        });

        const issues = detectIssues(node);

        expect(issues.length).toBeGreaterThan(0);
        expect(issues.some((i) => i.issue.includes('Fixed height container'))).toBe(true);
        expect(issues.some((i) => i.suggestion.includes('overflow'))).toBe(true);
      });

      it('should not flag fixed height with overflow-hidden', () => {
        const node = createNode({
          element: 'container',
          sizing: { width: { strategy: 'auto' }, height: { strategy: 'fixed', value: '200px' } },
          overflow: { x: 'visible', y: 'hidden' },
          children: [createNode({ sizing: { width: { strategy: 'auto' }, height: { strategy: 'auto' } } })],
        });

        const issues = detectIssues(node);

        expect(issues.some((i) => i.issue.includes('Fixed height container'))).toBe(false);
      });

      it('should not flag when children have fixed height', () => {
        const node = createNode({
          element: 'container',
          sizing: { width: { strategy: 'auto' }, height: { strategy: 'fixed', value: '200px' } },
          overflow: { x: 'visible', y: 'visible' },
          children: [
            createNode({
              sizing: { width: { strategy: 'auto' }, height: { strategy: 'fixed', value: '100px' } },
            }),
          ],
        });

        const issues = detectIssues(node);

        expect(issues.some((i) => i.issue.includes('Fixed height container'))).toBe(false);
      });
    });

    describe('flex item without basis', () => {
      it('should detect flex item with grow but no basis', () => {
        const node = createNode({
          element: 'flex-item',
          sizing: { width: { strategy: 'auto' }, height: { strategy: 'auto' } },
          flex_props: {
            direction: 'row',
            grow: 1,
            shrink: 1,
            basis: 'auto',
          },
        });

        const context: LayoutContext = {
          parentDisplay: 'flex',
          depth: 1,
        };

        const issues = detectIssues(node, context);

        // The message says "Flex item with grow but no explicit basis may collapse unexpectedly"
        expect(issues.some((i) => i.issue.includes('no explicit basis'))).toBe(true);
      });

      it('should not flag when basis is specified', () => {
        const node = createNode({
          element: 'flex-item',
          sizing: { width: { strategy: 'auto' }, height: { strategy: 'auto' } },
          flex_props: {
            direction: 'row',
            grow: 1,
            shrink: 1,
            basis: '0%',
          },
        });

        const context: LayoutContext = {
          parentDisplay: 'flex',
          depth: 1,
        };

        const issues = detectIssues(node, context);

        expect(issues.some((i) => i.issue.includes('no explicit basis'))).toBe(false);
      });
    });

    describe('nested flex containers', () => {
      it('should detect nested flex without explicit sizing', () => {
        const node = createNode({
          element: 'nested-flex',
          display: 'flex',
          sizing: { width: { strategy: 'auto' }, height: { strategy: 'auto' } },
        });

        const context: LayoutContext = {
          parentDisplay: 'flex',
          depth: 1,
        };

        const issues = detectIssues(node, context);

        expect(issues.some((i) => i.issue.includes('Nested flex container'))).toBe(true);
      });

      it('should not flag nested flex with explicit width', () => {
        const node = createNode({
          element: 'nested-flex',
          display: 'flex',
          sizing: { width: { strategy: 'fixed', value: '200px' }, height: { strategy: 'auto' } },
        });

        const context: LayoutContext = {
          parentDisplay: 'flex',
          depth: 1,
        };

        const issues = detectIssues(node, context);

        expect(issues.some((i) => i.issue.includes('Nested flex container'))).toBe(false);
      });
    });

    describe('grid without column definition', () => {
      it('should detect grid without column template', () => {
        const node = createNode({
          element: 'grid-container',
          display: 'grid',
        });

        const issues = detectIssues(node);

        expect(issues.some((i) => i.issue.includes('Grid container without explicit column template'))).toBe(true);
      });

      it('should not flag grid with column template', () => {
        const node = createNode({
          element: 'grid-container',
          display: 'grid',
          grid_props: {
            template_columns: 'repeat(3, 1fr)',
          },
        });

        const issues = detectIssues(node);

        expect(issues.some((i) => i.issue.includes('Grid container without'))).toBe(false);
      });

      it('should detect inline-grid without column template', () => {
        const node = createNode({
          element: 'inline-grid-container',
          display: 'inline-grid',
        });

        const issues = detectIssues(node);

        expect(issues.some((i) => i.issue.includes('Grid container without'))).toBe(true);
      });
    });

    describe('positioned elements without dimensions', () => {
      it('should detect absolute positioned without dimensions', () => {
        const node = createNode({
          element: 'absolute-box',
          position: 'absolute',
          sizing: { width: { strategy: 'auto' }, height: { strategy: 'auto' } },
        });

        const issues = detectIssues(node);

        expect(issues.some((i) => i.issue.includes('absolute positioned element without'))).toBe(true);
      });

      it('should detect fixed positioned without dimensions', () => {
        const node = createNode({
          element: 'fixed-box',
          position: 'fixed',
          sizing: { width: { strategy: 'auto' }, height: { strategy: 'auto' } },
        });

        const issues = detectIssues(node);

        expect(issues.some((i) => i.issue.includes('fixed positioned element without'))).toBe(true);
      });

      it('should not flag positioned element with width', () => {
        const node = createNode({
          element: 'absolute-box',
          position: 'absolute',
          sizing: { width: { strategy: 'fixed', value: '100px' }, height: { strategy: 'auto' } },
        });

        const issues = detectIssues(node);

        expect(issues.some((i) => i.issue.includes('positioned element without explicit dimensions'))).toBe(false);
      });
    });

    describe('percentage height without parent height', () => {
      it('should detect percentage height with auto parent', () => {
        const node = createNode({
          element: 'percent-height',
          sizing: { width: { strategy: 'auto' }, height: { strategy: 'percentage', value: '50%' } },
        });

        const context: LayoutContext = {
          parentSizing: { width: { strategy: 'auto' }, height: { strategy: 'auto' } },
          depth: 1,
        };

        const issues = detectIssues(node, context);

        expect(issues.some((i) => i.issue.includes('Percentage height'))).toBe(true);
      });

      it('should not flag when parent has fixed height', () => {
        const node = createNode({
          element: 'percent-height',
          sizing: { width: { strategy: 'auto' }, height: { strategy: 'percentage', value: '50%' } },
        });

        const context: LayoutContext = {
          parentSizing: { width: { strategy: 'auto' }, height: { strategy: 'fixed', value: '400px' } },
          depth: 1,
        };

        const issues = detectIssues(node, context);

        expect(issues.some((i) => i.issue.includes('Percentage height'))).toBe(false);
      });
    });

    describe('overflow scroll without constraints', () => {
      it('should detect overflow scroll without dimensions', () => {
        const node = createNode({
          element: 'scroll-container',
          overflow: { x: 'auto', y: 'scroll' },
          sizing: { width: { strategy: 'auto' }, height: { strategy: 'auto' } },
          display: 'block',
        });

        const issues = detectIssues(node);

        expect(issues.some((i) => i.issue.includes('Overflow scroll/auto'))).toBe(true);
      });

      it('should not flag overflow scroll in flex container', () => {
        const node = createNode({
          element: 'scroll-container',
          overflow: { x: 'auto', y: 'scroll' },
          sizing: { width: { strategy: 'auto' }, height: { strategy: 'auto' } },
          display: 'flex',
        });

        const issues = detectIssues(node);

        expect(issues.some((i) => i.issue.includes('Overflow scroll/auto'))).toBe(false);
      });

      it('should not flag when parent is flex', () => {
        const node = createNode({
          element: 'scroll-container',
          overflow: { x: 'auto', y: 'scroll' },
          sizing: { width: { strategy: 'auto' }, height: { strategy: 'auto' } },
          display: 'block',
        });

        const context: LayoutContext = {
          parentDisplay: 'flex',
          depth: 1,
        };

        const issues = detectIssues(node, context);

        expect(issues.some((i) => i.issue.includes('Overflow scroll/auto'))).toBe(false);
      });
    });

    describe('recursive issue detection', () => {
      it('should detect issues in nested children', () => {
        const grandchild = createNode({
          element: 'grandchild',
          position: 'absolute',
          sizing: { width: { strategy: 'auto' }, height: { strategy: 'auto' } },
        });

        const child = createNode({
          element: 'child',
          children: [grandchild],
        });

        const root = createNode({
          element: 'root',
          children: [child],
        });

        const issues = detectIssues(root);

        expect(issues.some((i) => i.element === 'grandchild')).toBe(true);
      });
    });
  });

  describe('generateConstraintNotes', () => {
    it('should note fixed width', () => {
      const node = createNode({
        element: 'fixed-width',
        sizing: { width: { strategy: 'fixed', value: '200px' }, height: { strategy: 'auto' } },
      });

      const notes = generateConstraintNotes(node);

      expect(notes.some((n) => n.includes('Fixed width of 200px'))).toBe(true);
    });

    it('should note fixed height', () => {
      const node = createNode({
        element: 'fixed-height',
        sizing: { width: { strategy: 'auto' }, height: { strategy: 'fixed', value: '100px' } },
      });

      const notes = generateConstraintNotes(node);

      expect(notes.some((n) => n.includes('Fixed height of 100px'))).toBe(true);
    });

    it('should note percentage width', () => {
      const node = createNode({
        element: 'percent-width',
        sizing: { width: { strategy: 'percentage', value: '50%' }, height: { strategy: 'auto' } },
      });

      const notes = generateConstraintNotes(node);

      expect(notes.some((n) => n.includes('Width constrained to 50% of parent'))).toBe(true);
    });

    it('should note percentage height', () => {
      const node = createNode({
        element: 'percent-height',
        sizing: { width: { strategy: 'auto' }, height: { strategy: 'percentage', value: '100%' } },
      });

      const notes = generateConstraintNotes(node);

      expect(notes.some((n) => n.includes('Height constrained to 100% of parent'))).toBe(true);
    });

    it('should note flex container properties', () => {
      const node = createNode({
        element: 'flex-container',
        display: 'flex',
        flex_props: {
          direction: 'column',
          grow: 0,
          shrink: 1,
          basis: 'auto',
          gap: '1rem',
          justify: 'center',
          align: 'center',
        },
      });

      const notes = generateConstraintNotes(node);

      expect(notes.some((n) => n.includes('Flex container'))).toBe(true);
      expect(notes.some((n) => n.includes('direction: column'))).toBe(true);
      expect(notes.some((n) => n.includes('gap: 1rem'))).toBe(true);
    });

    it('should not note default flex direction', () => {
      const node = createNode({
        element: 'flex-container',
        display: 'flex',
        flex_props: {
          direction: 'row',
          grow: 0,
          shrink: 1,
          basis: 'auto',
        },
      });

      const notes = generateConstraintNotes(node);

      // Should not have direction: row since it's the default
      expect(notes.some((n) => n.includes('direction: row'))).toBe(false);
    });

    it('should note grid container properties', () => {
      const node = createNode({
        element: 'grid-container',
        display: 'grid',
        grid_props: {
          template_columns: 'repeat(3, 1fr)',
          template_rows: 'auto 1fr',
          gap: '1rem',
        },
      });

      const notes = generateConstraintNotes(node);

      expect(notes.some((n) => n.includes('Grid container'))).toBe(true);
      expect(notes.some((n) => n.includes('columns: repeat(3, 1fr)'))).toBe(true);
      expect(notes.some((n) => n.includes('rows: auto 1fr'))).toBe(true);
    });

    it('should note overflow handling', () => {
      const node = createNode({
        element: 'scroll-container',
        overflow: { x: 'hidden', y: 'auto' },
      });

      const notes = generateConstraintNotes(node);

      expect(notes.some((n) => n.includes('Overflow handling'))).toBe(true);
      expect(notes.some((n) => n.includes('x: hidden, y: auto'))).toBe(true);
    });

    it('should note single overflow value', () => {
      const node = createNode({
        element: 'hidden-container',
        overflow: { x: 'hidden', y: 'hidden' },
      });

      const notes = generateConstraintNotes(node);

      expect(notes.some((n) => n.includes('Overflow handling (hidden)'))).toBe(true);
    });

    it('should note positioned elements', () => {
      const node = createNode({
        element: 'positioned',
        position: 'absolute',
      });

      const notes = generateConstraintNotes(node);

      expect(notes.some((n) => n.includes('Positioned (absolute)'))).toBe(true);
    });

    it('should not note static position', () => {
      const node = createNode({
        element: 'static-el',
        position: 'static',
      });

      const notes = generateConstraintNotes(node);

      expect(notes.some((n) => n.includes('Positioned'))).toBe(false);
    });

    it('should include path for nested elements', () => {
      const child = createNode({
        element: 'child',
        sizing: { width: { strategy: 'fixed', value: '100px' }, height: { strategy: 'auto' } },
      });

      const parent = createNode({
        element: 'parent',
        children: [child],
      });

      const notes = generateConstraintNotes(parent);

      expect(notes.some((n) => n.includes('parent > child'))).toBe(true);
    });
  });

  describe('generateSummary', () => {
    it('should include root element', () => {
      const tree = createNode({ element: 'main.container' });
      const summary = generateSummary(tree, []);

      expect(summary).toContain('Root element: main.container');
    });

    it('should count flex containers', () => {
      const tree = createNode({
        element: 'root',
        display: 'block',
        children: [
          createNode({ element: 'flex1', display: 'flex' }),
          createNode({ element: 'flex2', display: 'inline-flex' }),
          createNode({ element: 'flex3', display: 'flex' }),
        ],
      });

      const summary = generateSummary(tree, []);

      expect(summary).toContain('3 flex containers');
    });

    it('should count grid containers', () => {
      const tree = createNode({
        element: 'root',
        display: 'block',
        children: [
          createNode({ element: 'grid1', display: 'grid' }),
          createNode({ element: 'grid2', display: 'inline-grid' }),
        ],
      });

      const summary = generateSummary(tree, []);

      expect(summary).toContain('2 grid containers');
    });

    it('should count positioned elements', () => {
      const tree = createNode({
        element: 'root',
        children: [
          createNode({ element: 'abs1', position: 'absolute' }),
          createNode({ element: 'abs2', position: 'absolute' }),
          createNode({ element: 'fixed', position: 'fixed' }),
          createNode({ element: 'sticky', position: 'sticky' }),
        ],
      });

      const summary = generateSummary(tree, []);

      expect(summary).toContain('2 absolute');
      expect(summary).toContain('1 fixed');
      expect(summary).toContain('1 sticky');
    });

    it('should report no issues when empty', () => {
      const tree = createNode({ element: 'root' });
      const summary = generateSummary(tree, []);

      expect(summary).toContain('No potential layout issues detected');
    });

    it('should report issue count', () => {
      const tree = createNode({ element: 'root' });
      const issues = [
        { element: 'a', issue: 'issue 1', suggestion: 'fix 1' },
        { element: 'b', issue: 'issue 2', suggestion: 'fix 2' },
        { element: 'c', issue: 'issue 3', suggestion: 'fix 3' },
      ];

      const summary = generateSummary(tree, issues);

      expect(summary).toContain('3 potential issues detected');
    });

    it('should use singular for one issue', () => {
      const tree = createNode({ element: 'root' });
      const issues = [{ element: 'a', issue: 'issue 1', suggestion: 'fix 1' }];

      const summary = generateSummary(tree, issues);

      expect(summary).toContain('1 potential issue detected');
    });
  });
});
