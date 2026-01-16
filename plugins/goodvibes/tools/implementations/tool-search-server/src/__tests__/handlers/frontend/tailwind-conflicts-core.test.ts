/**
 * Unit tests for tailwind-conflicts-core
 *
 * Tests cover:
 * - getLineNumber: line number calculation
 * - extractClassesFromAttribute: class extraction from JSX
 * - getRawClassName: raw className string extraction
 * - analyzeJsxFile: JSX file analysis
 */

import { describe, it, expect } from 'vitest';
import ts from 'typescript';
import {
  getLineNumber,
  extractClassesFromAttribute,
  getRawClassName,
  analyzeJsxFile,
} from '../../../handlers/frontend/tailwind-conflicts-core.js';

/**
 * Create TypeScript source file from code
 */
function createSourceFile(code: string): ts.SourceFile {
  return ts.createSourceFile('test.tsx', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

/**
 * Find first JSX attribute
 */
function findFirstAttribute(sourceFile: ts.SourceFile, name: string): ts.JsxAttribute | null {
  let result: ts.JsxAttribute | null = null;

  function visit(node: ts.Node): void {
    if (result) return;
    if (ts.isJsxAttribute(node) && node.name.getText(sourceFile) === name) {
      result = node;
      return;
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return result;
}

describe('tailwind-conflicts-core', () => {
  describe('getLineNumber', () => {
    it('should return 1-based line number', () => {
      const code = `line1
line2
line3`;
      const sourceFile = createSourceFile(code);

      expect(getLineNumber(0, sourceFile)).toBe(1);
      expect(getLineNumber(6, sourceFile)).toBe(2);
      expect(getLineNumber(12, sourceFile)).toBe(3);
    });
  });

  describe('extractClassesFromAttribute', () => {
    it('should extract from string literal', () => {
      const code = `<div className="flex items-center gap-4" />`;
      const sourceFile = createSourceFile(code);
      const attr = findFirstAttribute(sourceFile, 'className')!;

      const classes = extractClassesFromAttribute(attr, sourceFile);

      expect(classes).toEqual(['flex', 'items-center', 'gap-4']);
    });

    it('should extract from string in JSX expression', () => {
      const code = `<div className={"flex items-center"} />`;
      const sourceFile = createSourceFile(code);
      const attr = findFirstAttribute(sourceFile, 'className')!;

      const classes = extractClassesFromAttribute(attr, sourceFile);

      expect(classes).toEqual(['flex', 'items-center']);
    });

    it('should extract from template expression', () => {
      const code = '<div className={`flex ${condition} items-center`} />';
      const sourceFile = createSourceFile(code);
      const attr = findFirstAttribute(sourceFile, 'className')!;

      const classes = extractClassesFromAttribute(attr, sourceFile);

      expect(classes).toContain('flex');
      expect(classes).toContain('items-center');
    });

    it('should extract from cn/clsx call', () => {
      const code = `<div className={cn("flex", "items-center")} />`;
      const sourceFile = createSourceFile(code);
      const attr = findFirstAttribute(sourceFile, 'className')!;

      const classes = extractClassesFromAttribute(attr, sourceFile);

      expect(classes).toContain('flex');
      expect(classes).toContain('items-center');
    });

    it('should extract from cn call with spaces', () => {
      const code = `<div className={cn("flex items-center gap-4")} />`;
      const sourceFile = createSourceFile(code);
      const attr = findFirstAttribute(sourceFile, 'className')!;

      const classes = extractClassesFromAttribute(attr, sourceFile);

      expect(classes).toEqual(['flex', 'items-center', 'gap-4']);
    });

    it('should extract from object literal in cn', () => {
      const code = `<div className={cn("flex", { "hidden": isHidden, "visible": !isHidden })} />`;
      const sourceFile = createSourceFile(code);
      const attr = findFirstAttribute(sourceFile, 'className')!;

      const classes = extractClassesFromAttribute(attr, sourceFile);

      expect(classes).toContain('flex');
      expect(classes).toContain('hidden');
      expect(classes).toContain('visible');
    });

    it('should extract from shorthand property', () => {
      const code = `<div className={cn({ active })} />`;
      const sourceFile = createSourceFile(code);
      const attr = findFirstAttribute(sourceFile, 'className')!;

      const classes = extractClassesFromAttribute(attr, sourceFile);

      expect(classes).toContain('active');
    });

    it('should extract from property assignment with identifier (line 74)', () => {
      const code = `<div className={cn({ flex: isFlex })} />`;
      const sourceFile = createSourceFile(code);
      const attr = findFirstAttribute(sourceFile, 'className')!;

      const classes = extractClassesFromAttribute(attr, sourceFile);

      expect(classes).toContain('flex');
    });

    it('should return empty for no initializer', () => {
      const code = `<input disabled />`;
      const sourceFile = createSourceFile(code);
      const attr = findFirstAttribute(sourceFile, 'disabled')!;

      const classes = extractClassesFromAttribute(attr, sourceFile);

      expect(classes).toEqual([]);
    });

    it('should filter empty strings', () => {
      const code = `<div className="  flex   items-center  " />`;
      const sourceFile = createSourceFile(code);
      const attr = findFirstAttribute(sourceFile, 'className')!;

      const classes = extractClassesFromAttribute(attr, sourceFile);

      expect(classes).toEqual(['flex', 'items-center']);
    });
  });

  describe('getRawClassName', () => {
    it('should return string literal value', () => {
      const code = `<div className="flex items-center" />`;
      const sourceFile = createSourceFile(code);
      const attr = findFirstAttribute(sourceFile, 'className')!;

      expect(getRawClassName(attr, sourceFile)).toBe('flex items-center');
    });

    it('should return string from JSX expression', () => {
      const code = `<div className={"flex items-center"} />`;
      const sourceFile = createSourceFile(code);
      const attr = findFirstAttribute(sourceFile, 'className')!;

      expect(getRawClassName(attr, sourceFile)).toBe('flex items-center');
    });

    it('should return source text for complex expressions', () => {
      const code = `<div className={cn("flex", isActive && "active")} />`;
      const sourceFile = createSourceFile(code);
      const attr = findFirstAttribute(sourceFile, 'className')!;

      const raw = getRawClassName(attr, sourceFile);
      expect(raw).toContain('cn');
      expect(raw).toContain('flex');
    });

    it('should return source text for very complex expression (line 110)', () => {
      const code = `<div className={isActive ? "a" : "b"} />`;
      const sourceFile = createSourceFile(code);
      const attr = findFirstAttribute(sourceFile, 'className')!;

      const raw = getRawClassName(attr, sourceFile);
      expect(raw).toBe('isActive ? "a" : "b"');
    });

    it('should return empty for no initializer', () => {
      const code = `<input disabled />`;
      const sourceFile = createSourceFile(code);
      const attr = findFirstAttribute(sourceFile, 'disabled')!;

      expect(getRawClassName(attr, sourceFile)).toBe('');
    });
  });

  describe('analyzeJsxFile', () => {
    it('should extract elements with className', () => {
      const code = `
        function Component() {
          return (
            <div className="flex">
              <span className="text-sm">Text</span>
            </div>
          );
        }
      `;
      const sourceFile = createSourceFile(code);

      const elements = analyzeJsxFile(code, sourceFile);

      expect(elements.length).toBe(2);
      expect(elements.some((e) => e.element.startsWith('div'))).toBe(true);
      expect(elements.some((e) => e.element.startsWith('span'))).toBe(true);
    });

    it('should capture line numbers', () => {
      const code = `<div className="flex">
<span className="text-sm">Text</span>
</div>`;
      const sourceFile = createSourceFile(code);

      const elements = analyzeJsxFile(code, sourceFile);

      expect(elements[0].line).toBe(1);
      expect(elements[1].line).toBe(2);
    });

    it('should capture classes array', () => {
      const code = `<div className="flex items-center gap-4" />`;
      const sourceFile = createSourceFile(code);

      const elements = analyzeJsxFile(code, sourceFile);

      expect(elements[0].classes).toEqual(['flex', 'items-center', 'gap-4']);
    });

    it('should capture raw className', () => {
      const code = `<div className="flex items-center" />`;
      const sourceFile = createSourceFile(code);

      const elements = analyzeJsxFile(code, sourceFile);

      expect(elements[0].rawClassName).toBe('flex items-center');
    });

    it('should format element identifier', () => {
      const code = `<button className="btn" />`;
      const sourceFile = createSourceFile(code);

      const elements = analyzeJsxFile(code, sourceFile);

      expect(elements[0].element).toBe('button:1');
    });

    it('should handle class attribute (Vue/Svelte)', () => {
      const code = `<div class="flex items-center" />`;
      const sourceFile = createSourceFile(code);

      const elements = analyzeJsxFile(code, sourceFile);

      expect(elements.length).toBe(1);
      expect(elements[0].classes).toEqual(['flex', 'items-center']);
    });

    it('should skip elements without className', () => {
      const code = `<div><span>Text</span></div>`;
      const sourceFile = createSourceFile(code);

      const elements = analyzeJsxFile(code, sourceFile);

      expect(elements.length).toBe(0);
    });

    it('should skip empty className', () => {
      const code = `<div className="" />`;
      const sourceFile = createSourceFile(code);

      const elements = analyzeJsxFile(code, sourceFile);

      expect(elements.length).toBe(0);
    });

    it('should handle deeply nested elements', () => {
      const code = `
        function Component() {
          return (
            <div className="outer">
              <div className="middle">
                <div className="inner">
                  <span className="text">Content</span>
                </div>
              </div>
            </div>
          );
        }
      `;
      const sourceFile = createSourceFile(code);

      const elements = analyzeJsxFile(code, sourceFile);

      expect(elements.length).toBe(4);
      expect(elements.some((e) => e.classes.includes('outer'))).toBe(true);
      expect(elements.some((e) => e.classes.includes('middle'))).toBe(true);
      expect(elements.some((e) => e.classes.includes('inner'))).toBe(true);
      expect(elements.some((e) => e.classes.includes('text'))).toBe(true);
    });

    it('should handle self-closing elements', () => {
      const code = `
        function Component() {
          return (
            <form className="form">
              <input className="input" />
              <button className="btn">Submit</button>
            </form>
          );
        }
      `;
      const sourceFile = createSourceFile(code);

      const elements = analyzeJsxFile(code, sourceFile);

      expect(elements.length).toBe(3);
    });

    it('should handle multiple components', () => {
      const code = `
        const A = () => <div className="a" />;
        const B = () => <div className="b" />;
      `;
      const sourceFile = createSourceFile(code);

      const elements = analyzeJsxFile(code, sourceFile);

      expect(elements.length).toBe(2);
      expect(elements.some((e) => e.classes.includes('a'))).toBe(true);
      expect(elements.some((e) => e.classes.includes('b'))).toBe(true);
    });
  });
});
