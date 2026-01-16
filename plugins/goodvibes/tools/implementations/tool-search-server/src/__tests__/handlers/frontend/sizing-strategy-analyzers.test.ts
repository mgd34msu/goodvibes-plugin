/**
 * Unit tests for sizing-strategy-analyzers
 *
 * Tests cover:
 * - getStrategyDescription: strategy type to description
 * - analyzeWidthStrategy: width analysis with constraints
 * - analyzeHeightStrategy: height analysis with constraints
 * - analyzeFlexBehavior: flex item behavior
 * - analyzeGridBehavior: grid item behavior
 * - getPositionContext: position context determination
 * - buildAncestorChain: ancestor impact chain
 * - generateSummary: human-readable summary
 */

import { describe, it, expect } from 'vitest';
import {
  getStrategyDescription,
  analyzeWidthStrategy,
  analyzeHeightStrategy,
  analyzeFlexBehavior,
  analyzeGridBehavior,
  getPositionContext,
  buildAncestorChain,
  generateSummary,
} from '../../../handlers/frontend/sizing-strategy-analyzers.js';
import type { ElementNode } from '../../../handlers/frontend/sizing-strategy-utils.js';

/**
 * Helper to create a minimal ElementNode for testing
 */
function createElementNode(overrides: Partial<ElementNode> = {}): ElementNode {
  return {
    tagName: 'div',
    classes: [],
    id: undefined,
    parent: undefined,
    children: [],
    display: 'block',
    position: 'static',
    overflowX: 'visible',
    overflowY: 'visible',
    ...overrides,
  };
}

describe('sizing-strategy-analyzers', () => {
  describe('getStrategyDescription', () => {
    it('should describe fixed strategy', () => {
      expect(getStrategyDescription('fixed', '200px')).toBe('Fixed size (200px)');
      expect(getStrategyDescription('fixed')).toBe('Fixed size (explicit value)');
    });

    it('should describe percentage strategy', () => {
      expect(getStrategyDescription('percentage', '50%')).toBe('Percentage of parent (50%)');
      expect(getStrategyDescription('percentage')).toBe('Percentage of parent (calculated)');
    });

    it('should describe viewport strategy', () => {
      expect(getStrategyDescription('viewport', '100vh')).toBe('Viewport-relative (100vh)');
      expect(getStrategyDescription('viewport')).toBe('Viewport-relative (vw/vh)');
    });

    it('should describe content-based strategy', () => {
      expect(getStrategyDescription('content-based', 'min-content')).toBe('Content-based (min-content)');
      expect(getStrategyDescription('content-based')).toBe('Content-based (intrinsic)');
    });

    it('should describe flex-controlled strategy', () => {
      expect(getStrategyDescription('flex-controlled')).toBe('Controlled by flex properties');
    });

    it('should describe grid-controlled strategy', () => {
      expect(getStrategyDescription('grid-controlled')).toBe('Controlled by grid placement');
    });

    it('should describe auto strategy', () => {
      expect(getStrategyDescription('auto')).toBe('Auto (browser default)');
    });

    it('should describe inherit strategy', () => {
      expect(getStrategyDescription('inherit')).toBe('Inherited from parent');
    });

    it('should handle unknown strategy', () => {
      expect(getStrategyDescription('unknown' as any)).toBe('Unknown');
    });
  });

  describe('analyzeWidthStrategy', () => {
    it('should return auto for element without explicit width', () => {
      const element = createElementNode();
      const result = analyzeWidthStrategy(element);

      expect(result.specified).toBe('auto');
      expect(result.strategy).toBe('auto');
    });

    it('should analyze fixed width', () => {
      const element = createElementNode({
        width: { strategy: 'fixed', value: '200px', classes: ['w-[200px]'] },
      });

      const result = analyzeWidthStrategy(element);

      expect(result.specified).toBe('w-[200px]');
      expect(result.strategy).toBe('fixed');
    });

    it('should analyze percentage width', () => {
      const element = createElementNode({
        width: { strategy: 'percentage', value: '50%', classes: ['w-1/2'] },
      });

      const result = analyzeWidthStrategy(element);

      expect(result.specified).toBe('w-1/2');
      expect(result.strategy).toBe('percentage');
    });

    it('should detect flex-controlled width in row container', () => {
      const parent = createElementNode({
        display: 'flex',
        flexDirection: 'row',
      });

      const element = createElementNode({
        parent,
        flexGrow: 1,
        flexBasis: '0%',
      });

      const result = analyzeWidthStrategy(element);

      expect(result.strategy).toContain('flex');
      expect(result.constrained_by).toBeDefined();
      expect(result.constrained_by!.some((c) => c.includes('flex-grow'))).toBe(true);
    });

    it('should not consider flex-controlled in column container', () => {
      const parent = createElementNode({
        display: 'flex',
        flexDirection: 'column',
      });

      const element = createElementNode({
        parent,
        flexGrow: 1,
      });

      const result = analyzeWidthStrategy(element);

      // Width is not main axis in column flex
      expect(result.strategy).not.toContain('flex');
    });

    it('should detect grid-controlled width', () => {
      const parent = createElementNode({
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
      });

      const element = createElementNode({
        parent,
        gridColumn: 'span 2',
      });

      const result = analyzeWidthStrategy(element);

      expect(result.strategy).toContain('grid');
      expect(result.constrained_by).toBeDefined();
      expect(result.constrained_by!.some((c) => c.includes('grid-column'))).toBe(true);
    });

    it('should include parent max-width constraints', () => {
      const grandparent = createElementNode({
        tagName: 'main',
        classes: ['max-w-4xl'],
        maxWidth: '56rem',
      });

      const parent = createElementNode({
        parent: grandparent,
      });

      const element = createElementNode({ parent });

      const result = analyzeWidthStrategy(element);

      expect(result.constrained_by).toBeDefined();
      expect(result.constrained_by!.some((c) => c.includes('max-width'))).toBe(true);
    });

    it('should include parent fixed width constraints', () => {
      const parent = createElementNode({
        tagName: 'aside',
        classes: ['w-64'],
        width: { strategy: 'fixed', value: '16rem', classes: ['w-64'] },
      });

      const element = createElementNode({ parent });

      const result = analyzeWidthStrategy(element);

      expect(result.constrained_by).toBeDefined();
      expect(result.constrained_by!.some((c) => c.includes('parent width'))).toBe(true);
    });

    it('should include overflow-x constraints', () => {
      const parent = createElementNode({
        overflowX: 'hidden',
        classes: ['overflow-x-hidden'],
      });

      const element = createElementNode({ parent });

      const result = analyzeWidthStrategy(element);

      expect(result.constrained_by).toBeDefined();
      expect(result.constrained_by!.some((c) => c.includes('overflow-x'))).toBe(true);
    });
  });

  describe('analyzeHeightStrategy', () => {
    it('should return auto for element without explicit height', () => {
      const element = createElementNode();
      const result = analyzeHeightStrategy(element);

      expect(result.specified).toBe('auto');
      expect(result.strategy).toBe('auto');
    });

    it('should analyze fixed height', () => {
      const element = createElementNode({
        height: { strategy: 'fixed', value: '300px', classes: ['h-[300px]'] },
      });

      const result = analyzeHeightStrategy(element);

      expect(result.specified).toBe('h-[300px]');
      expect(result.strategy).toBe('fixed');
    });

    it('should detect flex-controlled height in column container', () => {
      const parent = createElementNode({
        display: 'flex',
        flexDirection: 'column',
      });

      const element = createElementNode({
        parent,
        flexGrow: 1,
      });

      const result = analyzeHeightStrategy(element);

      expect(result.strategy).toContain('flex');
    });

    it('should not consider flex-controlled in row container', () => {
      const parent = createElementNode({
        display: 'flex',
        flexDirection: 'row',
      });

      const element = createElementNode({
        parent,
        flexGrow: 1,
      });

      const result = analyzeHeightStrategy(element);

      // Height is not main axis in row flex
      expect(result.strategy).not.toContain('flex');
    });

    it('should detect grid-controlled height', () => {
      const parent = createElementNode({
        display: 'grid',
      });

      const element = createElementNode({
        parent,
        gridRow: 'span 2',
      });

      const result = analyzeHeightStrategy(element);

      expect(result.strategy).toContain('grid');
    });

    it('should warn about percentage height without parent height', () => {
      const parent = createElementNode({
        display: 'block',
        height: undefined,
      });

      const element = createElementNode({
        parent,
        height: { strategy: 'percentage', value: '100%', classes: ['h-full'] },
      });

      const result = analyzeHeightStrategy(element);

      expect(result.constrained_by).toBeDefined();
      expect(result.constrained_by!.some((c) => c.includes('WARNING'))).toBe(true);
    });

    it('should not warn about percentage height in flex container', () => {
      const parent = createElementNode({
        display: 'flex',
      });

      const element = createElementNode({
        parent,
        height: { strategy: 'percentage', value: '100%', classes: ['h-full'] },
      });

      const result = analyzeHeightStrategy(element);

      const warnings = result.constrained_by?.filter((c) => c.includes('WARNING')) || [];
      expect(warnings.length).toBe(0);
    });

    it('should include parent max-height constraints', () => {
      const parent = createElementNode({
        maxHeight: '500px',
        classes: ['max-h-[500px]'],
      });

      const element = createElementNode({ parent });

      const result = analyzeHeightStrategy(element);

      expect(result.constrained_by).toBeDefined();
      expect(result.constrained_by!.some((c) => c.includes('max-height'))).toBe(true);
    });
  });

  describe('analyzeFlexBehavior', () => {
    it('should return undefined when not in flex container', () => {
      const element = createElementNode();
      const result = analyzeFlexBehavior(element);

      expect(result).toBeUndefined();
    });

    it('should analyze flex item with defaults', () => {
      const parent = createElementNode({ display: 'flex' });
      const element = createElementNode({ parent });

      const result = analyzeFlexBehavior(element);

      expect(result).toBeDefined();
      expect(result!.grow).toBe(0);
      expect(result!.shrink).toBe(1);
      expect(result!.basis).toBe('auto');
      expect(result!.will_grow).toBe(false);
      expect(result!.will_shrink).toBe(true);
    });

    it('should analyze flex-1 behavior', () => {
      const parent = createElementNode({ display: 'flex' });
      const element = createElementNode({
        parent,
        flexGrow: 1,
        flexShrink: 1,
        flexBasis: '0%',
      });

      const result = analyzeFlexBehavior(element);

      expect(result).toBeDefined();
      expect(result!.grow).toBe(1);
      expect(result!.shrink).toBe(1);
      expect(result!.basis).toBe('0%');
      expect(result!.will_grow).toBe(true);
      expect(result!.will_shrink).toBe(true);
    });

    it('should analyze flex-none behavior', () => {
      const parent = createElementNode({ display: 'flex' });
      const element = createElementNode({
        parent,
        flexGrow: 0,
        flexShrink: 0,
        flexBasis: 'auto',
      });

      const result = analyzeFlexBehavior(element);

      expect(result).toBeDefined();
      expect(result!.will_grow).toBe(false);
      expect(result!.will_shrink).toBe(false);
    });

    it('should work with inline-flex container', () => {
      const parent = createElementNode({ display: 'inline-flex' });
      const element = createElementNode({ parent, flexGrow: 1 });

      const result = analyzeFlexBehavior(element);

      expect(result).toBeDefined();
      expect(result!.will_grow).toBe(true);
    });
  });

  describe('analyzeGridBehavior', () => {
    it('should return undefined when not in grid container', () => {
      const element = createElementNode();
      const result = analyzeGridBehavior(element);

      expect(result).toBeUndefined();
    });

    it('should analyze grid item with defaults', () => {
      const parent = createElementNode({ display: 'grid' });
      const element = createElementNode({ parent });

      const result = analyzeGridBehavior(element);

      expect(result).toBeDefined();
      expect(result!.column).toBe('auto');
      expect(result!.row).toBe('auto');
      expect(result!.area).toBeUndefined();
    });

    it('should analyze grid item with column span', () => {
      const parent = createElementNode({ display: 'grid' });
      const element = createElementNode({
        parent,
        gridColumn: 'span 2 / span 2',
      });

      const result = analyzeGridBehavior(element);

      expect(result).toBeDefined();
      expect(result!.column).toBe('span 2 / span 2');
    });

    it('should analyze grid item with area', () => {
      const parent = createElementNode({ display: 'grid' });
      const element = createElementNode({
        parent,
        gridArea: 'header',
      });

      const result = analyzeGridBehavior(element);

      expect(result).toBeDefined();
      expect(result!.area).toBe('header');
    });

    it('should work with inline-grid container', () => {
      const parent = createElementNode({ display: 'inline-grid' });
      const element = createElementNode({
        parent,
        gridColumn: '1 / -1',
      });

      const result = analyzeGridBehavior(element);

      expect(result).toBeDefined();
      expect(result!.column).toBe('1 / -1');
    });
  });

  describe('getPositionContext', () => {
    it('should describe static position', () => {
      const element = createElementNode({ position: 'static' });
      const result = getPositionContext(element);

      expect(result).toContain('static');
      expect(result).toContain('normal document flow');
    });

    it('should describe relative position', () => {
      const element = createElementNode({ position: 'relative' });
      const result = getPositionContext(element);

      expect(result).toContain('relative');
    });

    it('should describe fixed position', () => {
      const element = createElementNode({ position: 'fixed' });
      const result = getPositionContext(element);

      expect(result).toContain('fixed to viewport');
    });

    it('should describe absolute with positioned ancestor', () => {
      const parent = createElementNode({
        position: 'relative',
        tagName: 'section',
        classes: ['relative'],
      });

      const element = createElementNode({
        position: 'absolute',
        parent,
      });

      const result = getPositionContext(element);

      expect(result).toContain('absolute');
      expect(result).toContain('relative to');
      expect(result).toContain('section');
    });

    it('should describe absolute without positioned ancestor', () => {
      const parent = createElementNode({ position: 'static' });
      const element = createElementNode({
        position: 'absolute',
        parent,
      });

      const result = getPositionContext(element);

      expect(result).toContain('initial containing block');
    });

    it('should describe sticky with overflow container', () => {
      const parent = createElementNode({
        overflowY: 'auto',
        tagName: 'div',
        classes: ['overflow-y-auto'],
      });

      const element = createElementNode({
        position: 'sticky',
        parent,
      });

      const result = getPositionContext(element);

      expect(result).toContain('sticky within');
      expect(result).toContain('overflow container');
    });

    it('should describe sticky without overflow container', () => {
      const parent = createElementNode({
        overflowX: 'visible',
        overflowY: 'visible',
      });

      const element = createElementNode({
        position: 'sticky',
        parent,
      });

      const result = getPositionContext(element);

      expect(result).toContain('sticky within viewport');
    });
  });

  describe('buildAncestorChain', () => {
    it('should return empty array for root element', () => {
      const element = createElementNode();
      const result = buildAncestorChain(element);

      expect(result).toEqual([]);
    });

    it('should include flex container ancestor', () => {
      const parent = createElementNode({
        display: 'flex',
        flexDirection: 'column',
        tagName: 'main',
      });

      const element = createElementNode({ parent });
      const result = buildAncestorChain(element);

      expect(result.length).toBe(1);
      expect(result[0].sizing_impact).toContain('flex container');
      expect(result[0].sizing_impact).toContain('column');
    });

    it('should include grid container ancestor', () => {
      const parent = createElementNode({
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        tagName: 'section',
      });

      const element = createElementNode({ parent });
      const result = buildAncestorChain(element);

      expect(result.length).toBe(1);
      expect(result[0].sizing_impact).toContain('grid container');
    });

    it('should include width/height constraints', () => {
      const parent = createElementNode({
        width: { strategy: 'fixed', value: '500px', classes: ['w-[500px]'] },
        height: { strategy: 'percentage', value: '100%', classes: ['h-full'] },
      });

      const element = createElementNode({ parent });
      const result = buildAncestorChain(element);

      expect(result.length).toBe(1);
      expect(result[0].sizing_impact).toContain('width: 500px');
      expect(result[0].sizing_impact).toContain('height: 100%');
    });

    it('should include max-width/max-height', () => {
      const parent = createElementNode({
        maxWidth: '1200px',
        maxHeight: '100vh',
      });

      const element = createElementNode({ parent });
      const result = buildAncestorChain(element);

      expect(result.length).toBe(1);
      expect(result[0].sizing_impact).toContain('max-width: 1200px');
      expect(result[0].sizing_impact).toContain('max-height: 100vh');
    });

    it('should include overflow', () => {
      const parent = createElementNode({
        overflowX: 'auto',
        overflowY: 'scroll',
      });

      const element = createElementNode({ parent });
      const result = buildAncestorChain(element);

      expect(result.length).toBe(1);
      expect(result[0].sizing_impact).toContain('overflow');
      expect(result[0].sizing_impact).toContain('x: auto');
      expect(result[0].sizing_impact).toContain('y: scroll');
    });

    it('should include position', () => {
      const parent = createElementNode({
        position: 'relative',
      });

      const element = createElementNode({ parent });
      const result = buildAncestorChain(element);

      expect(result.length).toBe(1);
      expect(result[0].sizing_impact).toContain('position: relative');
    });

    it('should build full ancestor chain', () => {
      const grandparent = createElementNode({
        display: 'flex',
        tagName: 'main',
      });

      const parent = createElementNode({
        parent: grandparent,
        maxWidth: '800px',
        tagName: 'section',
      });

      const element = createElementNode({ parent });
      const result = buildAncestorChain(element);

      expect(result.length).toBe(2);
    });
  });

  describe('generateSummary', () => {
    it('should summarize fixed width', () => {
      const element = createElementNode({
        width: { strategy: 'fixed', value: '200px', classes: [] },
      });

      const widthAnalysis = { specified: '200px', strategy: 'Fixed size (200px)' };
      const heightAnalysis = { specified: 'auto', strategy: 'Auto (browser default)' };

      const result = generateSummary(element, widthAnalysis, heightAnalysis);

      expect(result).toContain('Width is fixed');
      expect(result).toContain('200px');
    });

    it('should summarize percentage width', () => {
      const element = createElementNode({
        width: { strategy: 'percentage', value: '50%', classes: [] },
      });

      const widthAnalysis = { specified: '50%', strategy: 'Percentage of parent (50%)' };
      const heightAnalysis = { specified: 'auto', strategy: 'Auto (browser default)' };

      const result = generateSummary(element, widthAnalysis, heightAnalysis);

      expect(result).toContain('Width is 50%');
    });

    it('should summarize flex-controlled size', () => {
      const element = createElementNode();
      const widthAnalysis = { specified: 'flex-grow', strategy: 'Controlled by flex properties' };
      const heightAnalysis = { specified: 'auto', strategy: 'Auto (browser default)' };
      const flexBehavior = { grow: 1, shrink: 1, basis: '0%', will_grow: true, will_shrink: true };

      const result = generateSummary(element, widthAnalysis, heightAnalysis, flexBehavior);

      expect(result).toContain('flex layout');
      expect(result).toContain('grow to fill');
    });

    it('should summarize grid-controlled size', () => {
      const element = createElementNode();
      const widthAnalysis = { specified: 'span 2', strategy: 'Controlled by grid placement' };
      const heightAnalysis = { specified: 'auto', strategy: 'Auto (browser default)' };
      const gridBehavior = { column: 'span 2', row: 'auto' };

      const result = generateSummary(element, widthAnalysis, heightAnalysis, undefined, gridBehavior);

      expect(result).toContain('grid column');
      expect(result).toContain('Grid placement');
    });

    it('should describe flex item behavior', () => {
      const element = createElementNode();
      const widthAnalysis = { specified: 'auto', strategy: 'Auto (browser default)' };
      const heightAnalysis = { specified: 'auto', strategy: 'Auto (browser default)' };

      // Will grow and shrink
      let result = generateSummary(
        element,
        widthAnalysis,
        heightAnalysis,
        { grow: 1, shrink: 1, basis: '0%', will_grow: true, will_shrink: true }
      );
      expect(result).toContain('grow and shrink');

      // Will grow only
      result = generateSummary(
        element,
        widthAnalysis,
        heightAnalysis,
        { grow: 1, shrink: 0, basis: 'auto', will_grow: true, will_shrink: false }
      );
      expect(result).toContain('grow but not shrink');

      // Will shrink only
      result = generateSummary(
        element,
        widthAnalysis,
        heightAnalysis,
        { grow: 0, shrink: 1, basis: 'auto', will_grow: false, will_shrink: true }
      );
      expect(result).toContain('shrink if needed but not grow');

      // Flex-none
      result = generateSummary(
        element,
        widthAnalysis,
        heightAnalysis,
        { grow: 0, shrink: 0, basis: 'auto', will_grow: false, will_shrink: false }
      );
      expect(result).toContain('maintains its size');
    });

    it('should note warnings', () => {
      const element = createElementNode();
      const widthAnalysis = {
        specified: 'auto',
        strategy: 'Auto',
        constrained_by: ['WARNING: potential issue'],
      };
      const heightAnalysis = { specified: 'auto', strategy: 'Auto' };

      const result = generateSummary(element, widthAnalysis, heightAnalysis);

      expect(result).toContain('potential sizing issues');
    });

    it('should generate grid determined summary (lines 453, 464)', () => {
      const element = createElementNode({
        parent: createElementNode({ display: 'grid' }),
        gridColumn: 'span 2',
        gridRow: '1 / 3',
      });

      const widthAnalysis = { specified: 'span 2', strategy: 'grid-controlled' };
      const heightAnalysis = { specified: '1 / 3', strategy: 'grid-controlled' };

      const summary = generateSummary(element, widthAnalysis, heightAnalysis);

      expect(summary).toContain('Width is determined by grid column placement');
      expect(summary).toContain('Height is determined by grid row placement');
    });

    it('should generate viewport height summary (line 466)', () => {
      const element = createElementNode({
        height: { strategy: 'viewport', value: '100vh', classes: ['h-screen'] },
      });

      const widthAnalysis = { specified: 'auto', strategy: 'auto' };
      const heightAnalysis = { specified: 'h-screen', strategy: 'viewport' };

      const summary = generateSummary(element, widthAnalysis, heightAnalysis);

      expect(summary).toContain('Height is viewport-relative (100vh)');
    });
  });

  describe('Extra Coverage Constraints', () => {
    it('covers flex-basis constraint (line 196)', () => {
      const element = createElementNode({
        tagName: 'div',
        flexBasis: '200px',
        parent: createElementNode({ display: 'flex', flexDirection: 'column' }),
      });

      const analysis = analyzeHeightStrategy(element);
      expect(analysis.constrained_by).toContain('flex-basis: 200px');
    });

    it('covers ancestor overflow-y hidden constraint (line 222)', () => {
      const parent = createElementNode({ tagName: 'section', overflowY: 'hidden' });
      const element = createElementNode({ tagName: 'div', parent });

      const analysis = analyzeHeightStrategy(element);
      expect(analysis.constrained_by?.some(c => c.includes('overflow-y: hidden'))).toBe(true);
    });
  });
});
