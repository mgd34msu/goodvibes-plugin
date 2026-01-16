/**
 * Unit tests for overflow-diagnosis module
 *
 * Tests cover all exported functions from:
 * - utils.ts: Response helpers, tree enrichment, sizing helpers
 * - pattern-detector.ts: Overflow pattern detection
 * - constraint-builder.ts: Constraint chain building
 * - fix-generator.ts: Fix generation and recommendations
 * - types.ts: Type definitions (implicit testing through usage)
 * - index.ts: Main handler
 */

import { describe, it, expect } from 'vitest';

// Import all functions from the overflow-diagnosis module
import {
  createSuccessResponse,
  createErrorResponse,
  enrichTreeWithParents,
  isFixedSizing,
  isAutoSizing,
  hasAutoHeightChildren,
  matchesHint,
} from '../../../handlers/frontend/overflow-diagnosis/utils.js';

import { findOverflowPatterns } from '../../../handlers/frontend/overflow-diagnosis/pattern-detector.js';

import {
  describeConstraint,
  buildConstraintChain,
} from '../../../handlers/frontend/overflow-diagnosis/constraint-builder.js';

import {
  generateFixes,
  generateRecommendation,
  collectRelatedElements,
} from '../../../handlers/frontend/overflow-diagnosis/fix-generator.js';

import { handleDiagnoseOverflow } from '../../../handlers/frontend/overflow-diagnosis/index.js';

import type { LayoutNode, OverflowPattern } from '../../../handlers/frontend/overflow-diagnosis/types.js';
import type { LayoutNode as BaseLayoutNode } from '../../../handlers/frontend/analyze-layout-hierarchy.js';

// Helper to create a basic layout node
function createLayoutNode(overrides: Partial<BaseLayoutNode> = {}): BaseLayoutNode {
  return {
    element: 'div:1',
    classes: [],
    display: 'block',
    position: 'static',
    sizing: {
      width: { strategy: 'auto' },
      height: { strategy: 'auto' },
    },
    overflow: { x: 'visible', y: 'visible' },
    children: [],
    ...overrides,
  };
}

// Helper to create enriched layout node with parent reference
function createEnrichedNode(
  overrides: Partial<LayoutNode> = {},
  parent?: LayoutNode
): LayoutNode {
  return {
    element: 'div:1',
    classes: [],
    display: 'block',
    position: 'static',
    sizing: {
      width: { strategy: 'auto' },
      height: { strategy: 'auto' },
    },
    overflow: { x: 'visible', y: 'visible' },
    children: [],
    parent,
    ...overrides,
  };
}

describe('overflow-diagnosis/utils', () => {
  describe('createSuccessResponse', () => {
    it('should create a success response with JSON data', () => {
      const data = { file: 'test.tsx', diagnosis: {} };
      const response = createSuccessResponse(data);

      expect(response.content).toHaveLength(1);
      expect(response.content[0].type).toBe('text');
      expect(JSON.parse(response.content[0].text)).toEqual(data);
      expect(response.isError).toBeUndefined();
    });
  });

  describe('createErrorResponse', () => {
    it('should create an error response', () => {
      const response = createErrorResponse('Error message', { file: 'test.tsx' });

      expect(response.isError).toBe(true);
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.error).toBe('Error message');
      expect(parsed.file).toBe('test.tsx');
    });
  });

  describe('enrichTreeWithParents', () => {
    it('should add parent references to children', () => {
      const tree = createLayoutNode({
        element: 'parent:1',
        children: [createLayoutNode({ element: 'child:2' })],
      });

      const enriched = enrichTreeWithParents(tree);

      expect(enriched.children[0].parent).toBe(enriched);
    });

    it('should recursively enrich nested children', () => {
      const tree = createLayoutNode({
        element: 'root:1',
        children: [
          createLayoutNode({
            element: 'child:2',
            children: [createLayoutNode({ element: 'grandchild:3' })],
          }),
        ],
      });

      const enriched = enrichTreeWithParents(tree);

      expect(enriched.children[0].children[0].parent).toBe(enriched.children[0]);
    });

    it('should set undefined parent for root', () => {
      const tree = createLayoutNode();
      const enriched = enrichTreeWithParents(tree);

      expect(enriched.parent).toBeUndefined();
    });
  });

  describe('isFixedSizing', () => {
    it('should return true for fixed strategy', () => {
      expect(isFixedSizing('fixed')).toBe(true);
    });

    it('should return true for percentage strategy', () => {
      expect(isFixedSizing('percentage')).toBe(true);
    });

    it('should return false for auto strategy', () => {
      expect(isFixedSizing('auto')).toBe(false);
    });

    it('should return false for flex strategy', () => {
      expect(isFixedSizing('flex')).toBe(false);
    });

    it('should return false for fit-content strategy', () => {
      expect(isFixedSizing('fit-content')).toBe(false);
    });
  });

  describe('isAutoSizing', () => {
    it('should return true for auto strategy', () => {
      expect(isAutoSizing('auto')).toBe(true);
    });

    it('should return false for fixed strategy', () => {
      expect(isAutoSizing('fixed')).toBe(false);
    });

    it('should return false for percentage strategy', () => {
      expect(isAutoSizing('percentage')).toBe(false);
    });
  });

  describe('hasAutoHeightChildren', () => {
    it('should return true if any child has auto height', () => {
      const node = createEnrichedNode({
        children: [
          createEnrichedNode({ sizing: { width: { strategy: 'auto' }, height: { strategy: 'auto' } } }),
        ],
      });

      expect(hasAutoHeightChildren(node)).toBe(true);
    });

    it('should return false if all children have fixed height', () => {
      const node = createEnrichedNode({
        children: [
          createEnrichedNode({ sizing: { width: { strategy: 'auto' }, height: { strategy: 'fixed', value: '100px' } } }),
        ],
      });

      expect(hasAutoHeightChildren(node)).toBe(false);
    });

    it('should return false for node with no children', () => {
      const node = createEnrichedNode({ children: [] });
      expect(hasAutoHeightChildren(node)).toBe(false);
    });
  });

  describe('matchesHint', () => {
    it('should return true when no hint provided', () => {
      const node = createEnrichedNode();
      expect(matchesHint(node)).toBe(true);
    });

    it('should match element name', () => {
      const node = createEnrichedNode({ element: 'Modal:5' });
      expect(matchesHint(node, 'Modal')).toBe(true);
      expect(matchesHint(node, 'modal')).toBe(true);
    });

    it('should match class names', () => {
      const node = createEnrichedNode({ classes: ['overflow-container', 'flex'] });
      expect(matchesHint(node, 'overflow')).toBe(true);
      expect(matchesHint(node, 'container')).toBe(true);
    });

    it('should return false when no match', () => {
      const node = createEnrichedNode({ element: 'div:1', classes: ['flex'] });
      expect(matchesHint(node, 'Modal')).toBe(false);
    });
  });
});

describe('overflow-diagnosis/pattern-detector', () => {
  describe('findOverflowPatterns', () => {
    it('should detect fixed_parent_auto_children pattern', () => {
      const tree = createEnrichedNode({
        element: 'parent:1',
        sizing: { width: { strategy: 'auto' }, height: { strategy: 'fixed', value: '300px' } },
        overflow: { x: 'visible', y: 'visible' },
        children: [
          createEnrichedNode({
            element: 'child:2',
            sizing: { width: { strategy: 'auto' }, height: { strategy: 'auto' } },
          }),
        ],
      });
      tree.children[0].parent = tree;

      const patterns = findOverflowPatterns(tree);

      expect(patterns.some(p => p.type === 'fixed_parent_auto_children')).toBe(true);
      expect(patterns.find(p => p.type === 'fixed_parent_auto_children')?.severity).toBe('high');
    });

    it('should detect constrained_flex_no_overflow pattern', () => {
      const tree = createEnrichedNode({
        element: 'flex-container:1',
        display: 'flex',
        sizing: { width: { strategy: 'auto' }, height: { strategy: 'fixed', value: '500px' } },
        overflow: { x: 'visible', y: 'visible' },
      });

      const patterns = findOverflowPatterns(tree);

      expect(patterns.some(p => p.type === 'constrained_flex_no_overflow')).toBe(true);
    });

    it('should detect nested_percentage_heights pattern', () => {
      const parent = createEnrichedNode({
        element: 'parent:1',
        sizing: { width: { strategy: 'auto' }, height: { strategy: 'auto' } },
      });
      const child = createEnrichedNode({
        element: 'child:2',
        sizing: { width: { strategy: 'auto' }, height: { strategy: 'percentage', value: '100%' } },
        parent,
      });
      parent.children = [child];

      const patterns = findOverflowPatterns(parent);

      expect(patterns.some(p => p.type === 'nested_percentage_heights')).toBe(true);
    });

    it('should detect absolute_no_containment pattern', () => {
      const parent = createEnrichedNode({
        element: 'parent:1',
        position: 'static',
      });
      const child = createEnrichedNode({
        element: 'child:2',
        position: 'absolute',
        parent,
      });
      parent.children = [child];

      const patterns = findOverflowPatterns(parent);

      expect(patterns.some(p => p.type === 'absolute_no_containment')).toBe(true);
    });

    it('should detect flex_no_shrink pattern', () => {
      const parent = createEnrichedNode({
        element: 'parent:1',
        display: 'flex',
        sizing: { width: { strategy: 'auto' }, height: { strategy: 'fixed', value: '300px' } },
      });
      const child = createEnrichedNode({
        element: 'child:2',
        flex_props: { grow: 0, shrink: 0, direction: 'row', wrap: 'nowrap' },
        parent,
      });
      parent.children = [child];

      const patterns = findOverflowPatterns(parent);

      expect(patterns.some(p => p.type === 'flex_no_shrink')).toBe(true);
    });

    it('should detect grid_overflow pattern', () => {
      const tree = createEnrichedNode({
        element: 'grid:1',
        display: 'grid',
        sizing: { width: { strategy: 'auto' }, height: { strategy: 'fixed', value: '400px' } },
        overflow: { x: 'visible', y: 'visible' },
      });

      const patterns = findOverflowPatterns(tree);

      expect(patterns.some(p => p.type === 'grid_overflow')).toBe(true);
    });

    it('should detect min_height_zero_missing pattern', () => {
      const parent = createEnrichedNode({
        element: 'parent:1',
        display: 'flex',
      });
      const child = createEnrichedNode({
        element: 'child:2',
        display: 'flex',
        classes: [],
        flex_props: { grow: 1, shrink: 0, direction: 'column', wrap: 'nowrap' },
        parent,
      });
      parent.children = [child];

      const patterns = findOverflowPatterns(parent);

      expect(patterns.some(p => p.type === 'min_height_zero_missing')).toBe(true);
    });

    it('should filter patterns by hint', () => {
      const tree = createEnrichedNode({
        element: 'Container:1',
        sizing: { width: { strategy: 'auto' }, height: { strategy: 'fixed', value: '300px' } },
        overflow: { x: 'visible', y: 'visible' },
        children: [
          createEnrichedNode({ element: 'Modal:2' }),
        ],
      });
      tree.children[0].parent = tree;

      const patterns = findOverflowPatterns(tree, 'Modal');

      // Should only include patterns matching Modal
      expect(patterns.every(p =>
        p.element?.element.includes('Modal') ||
        p.parent?.element.includes('Modal') ||
        p.children?.some(c => c.element.includes('Modal'))
      )).toBe(true);
    });

    it('should sort patterns by severity', () => {
      const tree = createEnrichedNode({
        element: 'parent:1',
        display: 'flex',
        sizing: { width: { strategy: 'auto' }, height: { strategy: 'fixed', value: '300px' } },
        overflow: { x: 'visible', y: 'visible' },
        children: [
          createEnrichedNode({
            element: 'child:2',
            sizing: { width: { strategy: 'auto' }, height: { strategy: 'auto' } },
          }),
        ],
      });
      tree.children[0].parent = tree;

      const patterns = findOverflowPatterns(tree);

      // High severity should come before medium
      const severities = patterns.map(p => p.severity);
      const highIndex = severities.indexOf('high');
      const mediumIndex = severities.indexOf('medium');

      if (highIndex !== -1 && mediumIndex !== -1) {
        expect(highIndex).toBeLessThan(mediumIndex);
      }
    });
  });
});

describe('overflow-diagnosis/constraint-builder', () => {
  describe('describeConstraint', () => {
    it('should describe fixed height constraint', () => {
      const node = createEnrichedNode({
        sizing: { width: { strategy: 'auto' }, height: { strategy: 'fixed', value: '300px' } },
      });

      const description = describeConstraint(node);

      expect(description).toContain('fixed height');
      expect(description).toContain('300px');
    });

    it('should describe percentage height constraint', () => {
      const node = createEnrichedNode({
        sizing: { width: { strategy: 'auto' }, height: { strategy: 'percentage', value: '100%' } },
      });

      const description = describeConstraint(node);

      expect(description).toContain('percentage height');
    });

    it('should describe overflow constraint', () => {
      const node = createEnrichedNode({
        overflow: { x: 'visible', y: 'auto' },
      });

      const description = describeConstraint(node);

      expect(description).toContain('overflow-y: auto');
    });

    it('should describe flex layout constraints', () => {
      const node = createEnrichedNode({
        display: 'flex',
        flex_props: { grow: 1, shrink: 0, direction: 'column', wrap: 'nowrap' },
      });

      const description = describeConstraint(node);

      expect(description).toContain('flex column');
      expect(description).toContain('no-wrap');
    });

    it('should describe grid layout', () => {
      const node = createEnrichedNode({ display: 'grid' });

      const description = describeConstraint(node);

      expect(description).toContain('grid layout');
    });

    it('should return "no explicit constraints" when none found', () => {
      const node = createEnrichedNode();

      const description = describeConstraint(node);

      expect(description).toBe('no explicit constraints');
    });
  });

  describe('buildConstraintChain', () => {
    it('should build chain from root to target', () => {
      const root = createEnrichedNode({ element: 'root:1' });
      const parent = createEnrichedNode({ element: 'parent:2', parent: root });
      const target = createEnrichedNode({ element: 'Target:3', parent });
      root.children = [parent];
      parent.children = [target];

      const chain = buildConstraintChain(root, 'Target');

      expect(chain.length).toBeGreaterThan(0);
      expect(chain.some(c => c.element === 'Target:3')).toBe(true);
    });

    it('should match by class name', () => {
      const root = createEnrichedNode({ element: 'div:1' });
      const target = createEnrichedNode({
        element: 'div:2',
        classes: ['overflow-container'],
        parent: root,
      });
      root.children = [target];

      const chain = buildConstraintChain(root, 'overflow');

      expect(chain.length).toBeGreaterThan(0);
    });

    it('should include parent constraint info', () => {
      const root = createEnrichedNode({
        element: 'root:1',
        display: 'flex',
      });
      const target = createEnrichedNode({ element: 'target:2', parent: root });
      root.children = [target];

      const chain = buildConstraintChain(root, 'target');

      const targetEntry = chain.find(c => c.element === 'target:2');
      expect(targetEntry?.receives_from_parent).toBeDefined();
    });

    it('should return empty array when target not found', () => {
      const root = createEnrichedNode({ element: 'div:1' });

      const chain = buildConstraintChain(root, 'NotFound');

      expect(chain).toHaveLength(0);
    });
  });
});

describe('overflow-diagnosis/fix-generator', () => {
  describe('generateFixes', () => {
    it('should generate fixes for fixed_parent_auto_children', () => {
      const pattern: OverflowPattern = {
        type: 'fixed_parent_auto_children',
        severity: 'high',
        description: 'Fixed height with auto children',
        parent: createEnrichedNode({
          element: 'parent:1',
          sizing: { width: { strategy: 'auto' }, height: { strategy: 'fixed', value: '300px' } },
        }),
        children: [createEnrichedNode({ element: 'child:2' })],
      };

      const fixes = generateFixes(pattern);

      expect(fixes.length).toBeGreaterThan(0);
      expect(fixes.some(f => f.code_change.includes('overflow-y-auto'))).toBe(true);
    });

    it('should generate fixes for constrained_flex_no_overflow', () => {
      const pattern: OverflowPattern = {
        type: 'constrained_flex_no_overflow',
        severity: 'medium',
        description: 'Flex without overflow',
        element: createEnrichedNode({ element: 'flex:1' }),
      };

      const fixes = generateFixes(pattern);

      expect(fixes.some(f => f.code_change.includes('min-h-0'))).toBe(true);
    });

    it('should generate fixes for nested_percentage_heights', () => {
      const pattern: OverflowPattern = {
        type: 'nested_percentage_heights',
        severity: 'medium',
        description: 'Percentage height issue',
        element: createEnrichedNode({ element: 'child:2' }),
        parent: createEnrichedNode({ element: 'parent:1' }),
      };

      const fixes = generateFixes(pattern);

      expect(fixes.some(f => f.code_change.includes('h-full'))).toBe(true);
      expect(fixes.some(f => f.code_change.includes('flex-1'))).toBe(true);
    });

    it('should generate fixes for absolute_no_containment', () => {
      const pattern: OverflowPattern = {
        type: 'absolute_no_containment',
        severity: 'low',
        description: 'Absolute without relative parent',
        parent: createEnrichedNode({ element: 'parent:1' }),
      };

      const fixes = generateFixes(pattern);

      expect(fixes.some(f => f.code_change.includes('relative'))).toBe(true);
    });

    it('should generate fixes for flex_no_shrink', () => {
      const pattern: OverflowPattern = {
        type: 'flex_no_shrink',
        severity: 'low',
        description: 'Flex child cannot shrink',
        element: createEnrichedNode({ element: 'child:2' }),
      };

      const fixes = generateFixes(pattern);

      expect(fixes.some(f => f.code_change.includes('shrink'))).toBe(true);
    });

    it('should generate fixes for grid_overflow', () => {
      const pattern: OverflowPattern = {
        type: 'grid_overflow',
        severity: 'medium',
        description: 'Grid overflow issue',
        element: createEnrichedNode({ element: 'grid:1' }),
      };

      const fixes = generateFixes(pattern);

      expect(fixes.some(f => f.code_change.includes('overflow'))).toBe(true);
    });

    it('should generate fixes for min_height_zero_missing', () => {
      const pattern: OverflowPattern = {
        type: 'min_height_zero_missing',
        severity: 'high',
        description: 'Missing min-h-0',
        element: createEnrichedNode({ element: 'flex:1' }),
      };

      const fixes = generateFixes(pattern);

      expect(fixes.some(f => f.code_change === 'min-h-0')).toBe(true);
    });
  });

  describe('generateRecommendation', () => {
    it('should return default recommendation when no patterns', () => {
      const recommendation = generateRecommendation([], []);

      expect(recommendation.location).toBe('inside');
      expect(recommendation.suggested_code).toBe('overflow-y-auto');
    });

    it('should prioritize min-h-0 for nested flex', () => {
      const patterns: OverflowPattern[] = [
        {
          type: 'min_height_zero_missing',
          severity: 'high',
          description: 'Missing min-h-0',
          element: createEnrichedNode({ element: 'flex:1' }),
        },
      ];

      // Need to pass fixes so the function doesn't hit the "no fixes" early return
      const fixes = generateFixes(patterns[0]);
      const recommendation = generateRecommendation(patterns, fixes);

      expect(recommendation.suggested_code).toBe('min-h-0');
    });

    it('should recommend inside fix for flex layouts', () => {
      const parent = createEnrichedNode({ display: 'flex' });
      const element = createEnrichedNode({ element: 'child:1', parent });

      const patterns: OverflowPattern[] = [
        {
          type: 'constrained_flex_no_overflow',
          severity: 'medium',
          description: 'Flex overflow',
          element,
        },
      ];

      const fixes = [
        { location: 'inside' as const, element: 'child:1', fix: 'Add overflow', code_change: 'overflow-y-auto', trade_off: 'test' },
      ];

      const recommendation = generateRecommendation(patterns, fixes);

      expect(recommendation.location).toBe('inside');
    });

    it('should fall back to outside fix when no inside fix', () => {
      const patterns: OverflowPattern[] = [
        {
          type: 'fixed_parent_auto_children',
          severity: 'high',
          description: 'Fixed parent',
        },
      ];

      const fixes = [
        { location: 'outside' as const, element: 'parent:1', fix: 'Remove height', code_change: 'h-auto', trade_off: 'test' },
      ];

      const recommendation = generateRecommendation(patterns, fixes);

      expect(recommendation.location).toBe('outside');
    });
  });

  describe('collectRelatedElements', () => {
    it('should collect all elements from patterns', () => {
      const patterns: OverflowPattern[] = [
        {
          type: 'fixed_parent_auto_children',
          severity: 'high',
          description: 'Test',
          parent: createEnrichedNode({ element: 'parent:1' }),
          children: [createEnrichedNode({ element: 'child:2' }), createEnrichedNode({ element: 'child:3' })],
        },
        {
          type: 'constrained_flex_no_overflow',
          severity: 'medium',
          description: 'Test',
          element: createEnrichedNode({ element: 'flex:4' }),
        },
      ];

      const elements = collectRelatedElements(patterns);

      expect(elements).toContain('parent:1');
      expect(elements).toContain('child:2');
      expect(elements).toContain('child:3');
      expect(elements).toContain('flex:4');
    });

    it('should return empty array for no patterns', () => {
      const elements = collectRelatedElements([]);
      expect(elements).toHaveLength(0);
    });

    it('should deduplicate elements', () => {
      const shared = createEnrichedNode({ element: 'shared:1' });
      const patterns: OverflowPattern[] = [
        {
          type: 'fixed_parent_auto_children',
          severity: 'high',
          description: 'Test',
          element: shared,
        },
        {
          type: 'constrained_flex_no_overflow',
          severity: 'medium',
          description: 'Test',
          element: shared,
        },
      ];

      const elements = collectRelatedElements(patterns);

      expect(elements.filter(e => e === 'shared:1')).toHaveLength(1);
    });
  });
});

// Handler tests use real filesystem since ESM mocking is not supported in Vitest
describe('overflow-diagnosis/handleDiagnoseOverflow', () => {
  it('should return error when file does not exist', async () => {
    const response = await handleDiagnoseOverflow({
      file: '/nonexistent/path/to/file.tsx',
    });

    expect(response.isError).toBe(true);
    expect(response.content[0].text).toContain('not found');
  });

  it('should return error for missing file parameter', async () => {
    const response = await handleDiagnoseOverflow({
      file: '',
    });

    expect(response.isError).toBe(true);
  });

  it('should validate pattern detection works correctly', () => {
    // Test the pattern detection logic using the findOverflowPatterns function
    const tree = createEnrichedNode({
      element: 'parent:1',
      display: 'flex',
      sizing: { width: { strategy: 'auto' }, height: { strategy: 'fixed', value: '300px' } },
      overflow: { x: 'visible', y: 'visible' },
      children: [
        createEnrichedNode({
          element: 'child:2',
          sizing: { width: { strategy: 'auto' }, height: { strategy: 'auto' } },
        }),
      ],
    });
    tree.children[0].parent = tree;

    const patterns = findOverflowPatterns(tree);

    expect(patterns.length).toBeGreaterThan(0);
    expect(patterns.some(p => p.type === 'fixed_parent_auto_children' || p.type === 'constrained_flex_no_overflow')).toBe(true);
  });

  it('should validate fix generation works correctly', () => {
    // Test the fix generation logic
    const pattern: OverflowPattern = {
      type: 'min_height_zero_missing',
      severity: 'high',
      description: 'Missing min-h-0',
      element: createEnrichedNode({ element: 'flex:1' }),
    };

    const fixes = generateFixes(pattern);

    expect(fixes.length).toBeGreaterThan(0);
    expect(fixes.some(f => f.code_change === 'min-h-0')).toBe(true);
  });

  it('should validate constraint chain building works correctly', () => {
    // Test the constraint chain logic
    const root = createEnrichedNode({
      element: 'root:1',
      display: 'flex',
    });
    const target = createEnrichedNode({
      element: 'target:2',
      parent: root,
    });
    root.children = [target];

    const chain = buildConstraintChain(root, 'target');

    expect(chain.length).toBeGreaterThan(0);
    expect(chain.some(c => c.element === 'target:2')).toBe(true);
  });
});
