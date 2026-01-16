/**
 * Unit tests for layout-hierarchy-core
 *
 * Tests cover:
 * - extractClassName: JSX className extraction from various formats
 * - extractId: JSX id attribute extraction
 * - createElementIdentifier: element identifier string creation
 * - buildLayoutNode: LayoutNode construction
 * - matchesSelector: CSS selector matching
 * - parseJsxElement: JSX tree parsing
 * - findRootJsx: root JSX element finding
 */

import { describe, it, expect } from 'vitest';
import ts from 'typescript';
import {
  extractClassName,
  extractId,
  createElementIdentifier,
  buildLayoutNode,
  matchesSelector,
  parseJsxElement,
  findRootJsx,
} from '../../../handlers/frontend/layout-hierarchy-core.js';

/**
 * Helper to create a TypeScript source file from code string
 */
function createSourceFile(code: string): ts.SourceFile {
  return ts.createSourceFile('test.tsx', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

/**
 * Helper to find first JSX element in source file
 */
function findFirstJsxElement(
  sourceFile: ts.SourceFile
): ts.JsxOpeningElement | ts.JsxSelfClosingElement | null {
  let result: ts.JsxOpeningElement | ts.JsxSelfClosingElement | null = null;

  function visit(node: ts.Node): void {
    if (result) return;
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      result = node;
      return;
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return result;
}

describe('layout-hierarchy-core', () => {
  describe('extractClassName', () => {
    it('should extract classes from string literal', () => {
      const code = `<div className="flex items-center gap-4" />`;
      const sourceFile = createSourceFile(code);
      const element = findFirstJsxElement(sourceFile)!;

      const classes = extractClassName(element, sourceFile);

      expect(classes).toEqual(['flex', 'items-center', 'gap-4']);
    });

    it('should extract classes from template literal', () => {
      const code = '<div className={`flex items-center`} />';
      const sourceFile = createSourceFile(code);
      const element = findFirstJsxElement(sourceFile)!;

      const classes = extractClassName(element, sourceFile);

      expect(classes).toContain('flex');
      expect(classes).toContain('items-center');
    });

    it('should extract classes from template expression head', () => {
      const code = '<div className={`flex ${condition} items-center`} />';
      const sourceFile = createSourceFile(code);
      const element = findFirstJsxElement(sourceFile)!;

      const classes = extractClassName(element, sourceFile);

      expect(classes).toContain('flex');
      expect(classes).toContain('items-center');
    });

    it('should extract classes from cn/clsx call with string args', () => {
      const code = `<div className={cn("flex", "items-center")} />`;
      const sourceFile = createSourceFile(code);
      const element = findFirstJsxElement(sourceFile)!;

      const classes = extractClassName(element, sourceFile);

      expect(classes).toContain('flex');
      expect(classes).toContain('items-center');
    });

    it('should handle multiple classes in single string arg', () => {
      const code = `<div className={cn("flex items-center gap-4")} />`;
      const sourceFile = createSourceFile(code);
      const element = findFirstJsxElement(sourceFile)!;

      const classes = extractClassName(element, sourceFile);

      expect(classes).toEqual(['flex', 'items-center', 'gap-4']);
    });

    it('should handle class attribute for Vue/Svelte', () => {
      const code = `<div class="flex items-center" />`;
      const sourceFile = createSourceFile(code);
      const element = findFirstJsxElement(sourceFile)!;

      const classes = extractClassName(element, sourceFile);

      expect(classes).toEqual(['flex', 'items-center']);
    });

    it('should return empty array for no className', () => {
      const code = `<div id="test" />`;
      const sourceFile = createSourceFile(code);
      const element = findFirstJsxElement(sourceFile)!;

      const classes = extractClassName(element, sourceFile);

      expect(classes).toEqual([]);
    });

    it('should filter empty strings', () => {
      const code = `<div className="  flex   items-center  " />`;
      const sourceFile = createSourceFile(code);
      const element = findFirstJsxElement(sourceFile)!;

      const classes = extractClassName(element, sourceFile);

      expect(classes).toEqual(['flex', 'items-center']);
    });
  });

  describe('extractId', () => {
    it('should extract id from string literal', () => {
      const code = `<div id="main-container" />`;
      const sourceFile = createSourceFile(code);
      const element = findFirstJsxElement(sourceFile)!;

      const id = extractId(element, sourceFile);

      expect(id).toBe('main-container');
    });

    it('should return undefined for no id', () => {
      const code = `<div className="flex" />`;
      const sourceFile = createSourceFile(code);
      const element = findFirstJsxElement(sourceFile)!;

      const id = extractId(element, sourceFile);

      expect(id).toBeUndefined();
    });

    it('should return undefined for dynamic id', () => {
      const code = `<div id={dynamicId} />`;
      const sourceFile = createSourceFile(code);
      const element = findFirstJsxElement(sourceFile)!;

      const id = extractId(element, sourceFile);

      expect(id).toBeUndefined();
    });
  });

  describe('createElementIdentifier', () => {
    it('should use id if present', () => {
      const identifier = createElementIdentifier('div', ['flex', 'items-center'], 'main');

      expect(identifier).toBe('div#main');
    });

    it('should use layout classes if no id', () => {
      const identifier = createElementIdentifier('div', ['flex', 'w-full', 'h-screen', 'bg-white'], undefined);

      expect(identifier).toBe('div.flex.w-full.h-screen');
    });

    it('should use first few classes if no layout classes', () => {
      const identifier = createElementIdentifier('div', ['bg-white', 'text-black'], undefined);

      expect(identifier).toBe('div.bg-white.text-black');
    });

    it('should return just tag name if no classes or id', () => {
      const identifier = createElementIdentifier('span', [], undefined);

      expect(identifier).toBe('span');
    });

    it('should prioritize layout-relevant classes', () => {
      const identifier = createElementIdentifier(
        'div',
        ['bg-white', 'grid', 'overflow-hidden', 'text-black'],
        undefined
      );

      expect(identifier).toBe('div.grid.overflow-hidden');
    });

    it('should include block, inline, hidden in layout classes', () => {
      const identifier = createElementIdentifier('div', ['block', 'bg-white'], undefined);
      expect(identifier).toBe('div.block');

      const identifier2 = createElementIdentifier('span', ['inline', 'text-sm'], undefined);
      expect(identifier2).toBe('span.inline');

      const identifier3 = createElementIdentifier('div', ['hidden', 'bg-red'], undefined);
      expect(identifier3).toBe('div.hidden');
    });
  });

  describe('buildLayoutNode', () => {
    it('should build node with default values', () => {
      const node = buildLayoutNode('div', [], undefined, {}, []);

      expect(node.element).toBe('div');
      expect(node.tag).toBe('div');
      expect(node.classes).toEqual([]);
      expect(node.sizing.width.strategy).toBe('auto');
      expect(node.sizing.height.strategy).toBe('auto');
      expect(node.display).toBe('block');
      expect(node.overflow.x).toBe('visible');
      expect(node.overflow.y).toBe('visible');
      expect(node.position).toBe('static');
      expect(node.children).toEqual([]);
    });

    it('should build node with flex properties', () => {
      const props = {
        display: 'flex' as const,
        flexDirection: 'column',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem',
        flexGrow: 1,
        flexShrink: 0,
        flexBasis: '0%',
      };

      const node = buildLayoutNode('div', ['flex', 'flex-col'], undefined, props, []);

      expect(node.display).toBe('flex');
      expect(node.flex_props).toBeDefined();
      expect(node.flex_props!.direction).toBe('column');
      expect(node.flex_props!.wrap).toBe('wrap');
      expect(node.flex_props!.align).toBe('center');
      expect(node.flex_props!.justify).toBe('space-between');
      expect(node.flex_props!.gap).toBe('1rem');
      expect(node.flex_props!.grow).toBe(1);
      expect(node.flex_props!.shrink).toBe(0);
      expect(node.flex_props!.basis).toBe('0%');
    });

    it('should build node with grid properties', () => {
      const props = {
        display: 'grid' as const,
        gridTemplateColumns: 'repeat(3, 1fr)',
        gridTemplateRows: 'auto 1fr',
        gap: '1rem',
        gridColumn: 'span 2',
        gridRow: '1 / 3',
        gridArea: 'header',
      };

      const node = buildLayoutNode('div', ['grid'], undefined, props, []);

      expect(node.display).toBe('grid');
      expect(node.grid_props).toBeDefined();
      expect(node.grid_props!.template_columns).toBe('repeat(3, 1fr)');
      expect(node.grid_props!.template_rows).toBe('auto 1fr');
      expect(node.grid_props!.gap).toBe('1rem');
      expect(node.grid_props!.column).toBe('span 2');
      expect(node.grid_props!.row).toBe('1 / 3');
      expect(node.grid_props!.area).toBe('header');
    });

    it('should build node with grid props when grid item properties exist', () => {
      const props = {
        display: 'block' as const,
        gridColumn: 'span 2',
      };

      const node = buildLayoutNode('div', [], undefined, props, []);

      expect(node.grid_props).toBeDefined();
      expect(node.grid_props!.column).toBe('span 2');
    });

    it('should use id in element identifier', () => {
      const node = buildLayoutNode('div', ['flex'], 'main', {}, []);

      expect(node.element).toBe('div#main');
    });

    it('should handle overflow properties', () => {
      const props = {
        overflow: 'auto',
        overflowX: 'hidden',
        overflowY: 'scroll',
      };

      const node = buildLayoutNode('div', [], undefined, props, []);

      expect(node.overflow.x).toBe('hidden');
      expect(node.overflow.y).toBe('scroll');
    });

    it('should fallback to overflow for x/y', () => {
      const props = {
        overflow: 'hidden',
      };

      const node = buildLayoutNode('div', [], undefined, props, []);

      expect(node.overflow.x).toBe('hidden');
      expect(node.overflow.y).toBe('hidden');
    });
  });

  describe('matchesSelector', () => {
    it('should match id selector', () => {
      expect(matchesSelector('div', ['flex'], 'main', '#main')).toBe(true);
      expect(matchesSelector('div', ['flex'], 'other', '#main')).toBe(false);
      expect(matchesSelector('div', ['flex'], undefined, '#main')).toBe(false);
    });

    it('should match class selector', () => {
      expect(matchesSelector('div', ['flex', 'items-center'], undefined, '.flex')).toBe(true);
      expect(matchesSelector('div', ['flex', 'items-center'], undefined, '.items-center')).toBe(true);
      expect(matchesSelector('div', ['flex', 'items-center'], undefined, '.grid')).toBe(false);
    });

    it('should match tag name selector (case insensitive)', () => {
      expect(matchesSelector('div', [], undefined, 'div')).toBe(true);
      expect(matchesSelector('DIV', [], undefined, 'div')).toBe(true);
      expect(matchesSelector('div', [], undefined, 'DIV')).toBe(true);
      expect(matchesSelector('div', [], undefined, 'span')).toBe(false);
    });
  });

  describe('parseJsxElement', () => {
    it('should parse self-closing element', () => {
      const code = `<div className="flex w-full" />`;
      const sourceFile = createSourceFile(code);
      const jsxElement = findFirstJsxElement(sourceFile);

      const node = parseJsxElement(jsxElement!, sourceFile);

      expect(node).not.toBeNull();
      expect(node!.tag).toBe('div');
      expect(node!.classes).toContain('flex');
      expect(node!.classes).toContain('w-full');
      expect(node!.display).toBe('flex');
    });

    it('should parse element with children', () => {
      const code = `
        function Component() {
          return (
            <div className="flex">
              <span className="text-sm">Hello</span>
            </div>
          );
        }
      `;
      const sourceFile = createSourceFile(code);
      const rootJsx = findRootJsx(sourceFile);

      const node = parseJsxElement(rootJsx!, sourceFile);

      expect(node).not.toBeNull();
      expect(node!.tag).toBe('div');
      expect(node!.children.length).toBe(1);
      expect(node!.children[0].tag).toBe('span');
    });

    it('should filter by selector when provided', () => {
      const code = `
        function Component() {
          return (
            <div className="outer">
              <div className="inner target">
                <span>Content</span>
              </div>
            </div>
          );
        }
      `;
      const sourceFile = createSourceFile(code);
      const rootJsx = findRootJsx(sourceFile);

      const node = parseJsxElement(rootJsx!, sourceFile, '.target');

      expect(node).not.toBeNull();
      expect(node!.classes).toContain('target');
    });

    it('should handle JSX fragments', () => {
      const code = `
        function Component() {
          return (
            <>
              <div className="first" />
              <div className="second" />
            </>
          );
        }
      `;
      const sourceFile = createSourceFile(code);
      const rootJsx = findRootJsx(sourceFile);

      const node = parseJsxElement(rootJsx!, sourceFile);

      expect(node).not.toBeNull();
      // Fragment with multiple children creates a Fragment wrapper
      if (node!.tag === 'Fragment') {
        expect(node!.children.length).toBeGreaterThan(0);
      }
    });

    it('should return null for non-JSX nodes', () => {
      const code = `const x = 5;`;
      const sourceFile = createSourceFile(code);

      const node = parseJsxElement(sourceFile, sourceFile);

      expect(node).toBeNull();
    });
  });

  describe('findRootJsx', () => {
    it('should find JSX in return statement', () => {
      const code = `
        function Component() {
          return <div className="flex">Hello</div>;
        }
      `;
      const sourceFile = createSourceFile(code);

      const rootJsx = findRootJsx(sourceFile);

      expect(rootJsx).not.toBeNull();
      expect(ts.isJsxElement(rootJsx!)).toBe(true);
    });

    it('should find JSX in parenthesized return', () => {
      const code = `
        function Component() {
          return (
            <div className="flex">
              Hello
            </div>
          );
        }
      `;
      const sourceFile = createSourceFile(code);

      const rootJsx = findRootJsx(sourceFile);

      expect(rootJsx).not.toBeNull();
      expect(ts.isJsxElement(rootJsx!)).toBe(true);
    });

    it('should find JSX in arrow function implicit return', () => {
      const code = `const Component = () => <div className="flex" />;`;
      const sourceFile = createSourceFile(code);

      const rootJsx = findRootJsx(sourceFile);

      expect(rootJsx).not.toBeNull();
      expect(ts.isJsxSelfClosingElement(rootJsx!)).toBe(true);
    });

    it('should find JSX in arrow function with parenthesized body', () => {
      const code = `
        const Component = () => (
          <div className="flex">
            Hello
          </div>
        );
      `;
      const sourceFile = createSourceFile(code);

      const rootJsx = findRootJsx(sourceFile);

      expect(rootJsx).not.toBeNull();
      expect(ts.isJsxElement(rootJsx!)).toBe(true);
    });

    it('should find JSX fragment', () => {
      const code = `
        function Component() {
          return (
            <>
              <div />
              <span />
            </>
          );
        }
      `;
      const sourceFile = createSourceFile(code);

      const rootJsx = findRootJsx(sourceFile);

      expect(rootJsx).not.toBeNull();
      expect(ts.isJsxFragment(rootJsx!)).toBe(true);
    });

    it('should return null for file without JSX', () => {
      const code = `
        function helper() {
          return { value: 42 };
        }
      `;
      const sourceFile = createSourceFile(code);

      const rootJsx = findRootJsx(sourceFile);

      expect(rootJsx).toBeNull();
    });
  });
});
