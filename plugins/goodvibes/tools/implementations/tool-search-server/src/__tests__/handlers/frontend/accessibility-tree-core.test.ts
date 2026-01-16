/**
 * Unit tests for accessibility-tree-core
 *
 * Tests cover:
 * - getLineNumber: line number calculation
 * - extractAttributeValue: attribute value extraction
 * - extractTextContent: text content extraction
 * - analyzeJsxFile: JSX file analysis
 */

import { describe, it, expect } from 'vitest';
import ts from 'typescript';
import {
  getLineNumber,
  extractAttributeValue,
  extractTextContent,
  analyzeJsxFile,
} from '../../../handlers/frontend/accessibility-tree-core.js';

/**
 * Create TypeScript source file from code
 */
function createSourceFile(code: string): ts.SourceFile {
  return ts.createSourceFile('test.tsx', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

/**
 * Find first JSX attribute
 */
function findFirstAttribute(sourceFile: ts.SourceFile): ts.JsxAttribute | null {
  let result: ts.JsxAttribute | null = null;

  function visit(node: ts.Node): void {
    if (result) return;
    if (ts.isJsxAttribute(node)) {
      result = node;
      return;
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return result;
}

/**
 * Find first JSX element
 */
function findFirstJsxElement(sourceFile: ts.SourceFile): ts.JsxElement | null {
  let result: ts.JsxElement | null = null;

  function visit(node: ts.Node): void {
    if (result) return;
    if (ts.isJsxElement(node)) {
      result = node;
      return;
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return result;
}

describe('accessibility-tree-core', () => {
  describe('getLineNumber', () => {
    it('should return 1-based line number', () => {
      const code = `const x = 1;
const y = 2;
const z = 3;`;
      const sourceFile = createSourceFile(code);

      // First line (position 0)
      expect(getLineNumber(0, sourceFile)).toBe(1);

      // Second line
      expect(getLineNumber(14, sourceFile)).toBe(2);

      // Third line
      expect(getLineNumber(28, sourceFile)).toBe(3);
    });
  });

  describe('extractAttributeValue', () => {
    it('should extract string literal value', () => {
      const code = `<div id="main-container" />`;
      const sourceFile = createSourceFile(code);
      const attr = findFirstAttribute(sourceFile)!;

      expect(extractAttributeValue(attr, sourceFile)).toBe('main-container');
    });

    it('should return true for boolean attribute', () => {
      const code = `<input disabled />`;
      const sourceFile = createSourceFile(code);
      const attr = findFirstAttribute(sourceFile)!;

      expect(extractAttributeValue(attr, sourceFile)).toBe('true');
    });

    it('should extract string literal in JSX expression', () => {
      const code = `<div id={"my-id"} />`;
      const sourceFile = createSourceFile(code);
      const attr = findFirstAttribute(sourceFile)!;

      expect(extractAttributeValue(attr, sourceFile)).toBe('my-id');
    });

    it('should extract true boolean in JSX expression', () => {
      const code = `<input disabled={true} />`;
      const sourceFile = createSourceFile(code);
      const attr = findFirstAttribute(sourceFile)!;

      expect(extractAttributeValue(attr, sourceFile)).toBe('true');
    });

    it('should extract false boolean in JSX expression', () => {
      const code = `<input disabled={false} />`;
      const sourceFile = createSourceFile(code);
      const attr = findFirstAttribute(sourceFile)!;

      expect(extractAttributeValue(attr, sourceFile)).toBe('false');
    });

    it('should extract numeric literal', () => {
      const code = `<input tabIndex={0} />`;
      const sourceFile = createSourceFile(code);
      const attr = findFirstAttribute(sourceFile)!;

      expect(extractAttributeValue(attr, sourceFile)).toBe('0');
    });

    it('should handle template expression', () => {
      const code = '<div className={`static ${dynamic}`} />';
      const sourceFile = createSourceFile(code);
      const attr = findFirstAttribute(sourceFile)!;

      expect(extractAttributeValue(attr, sourceFile)).toContain('static');
      expect(extractAttributeValue(attr, sourceFile)).toContain('[dynamic]');
    });

    it('should handle identifier reference', () => {
      const code = `<div onClick={handleClick} />`;
      const sourceFile = createSourceFile(code);
      const attr = findFirstAttribute(sourceFile)!;

      expect(extractAttributeValue(attr, sourceFile)).toBe('[handleClick]');
    });

    it('should handle call expression', () => {
      const code = `<div className={cn("flex", "items-center")} />`;
      const sourceFile = createSourceFile(code);
      const attr = findFirstAttribute(sourceFile)!;

      expect(extractAttributeValue(attr, sourceFile)).toBe('flex items-center');
    });

    it('should return [expression] for complex expressions', () => {
      const code = `<div value={a + b} />`;
      const sourceFile = createSourceFile(code);
      const attr = findFirstAttribute(sourceFile)!;

      expect(extractAttributeValue(attr, sourceFile)).toBe('[expression]');
    });
  });

  describe('extractTextContent', () => {
    it('should extract simple text', () => {
      const code = `<button>Click me</button>`;
      const sourceFile = createSourceFile(code);
      const element = findFirstJsxElement(sourceFile)!;

      expect(extractTextContent(element, sourceFile)).toBe('Click me');
    });

    it('should extract text with whitespace trimmed', () => {
      const code = `<p>
        Some text content
      </p>`;
      const sourceFile = createSourceFile(code);
      const element = findFirstJsxElement(sourceFile)!;

      expect(extractTextContent(element, sourceFile)).toBe('Some text content');
    });

    it('should extract string literal in JSX expression', () => {
      const code = `<span>{"Hello"}</span>`;
      const sourceFile = createSourceFile(code);
      const element = findFirstJsxElement(sourceFile)!;

      expect(extractTextContent(element, sourceFile)).toBe('Hello');
    });

    it('should combine multiple text nodes', () => {
      const code = `<p>First part{"second"}third</p>`;
      const sourceFile = createSourceFile(code);
      const element = findFirstJsxElement(sourceFile)!;

      const text = extractTextContent(element, sourceFile);
      expect(text).toContain('First part');
      expect(text).toContain('second');
      expect(text).toContain('third');
    });

    it('should return empty string for no text', () => {
      const code = `<div><span /></div>`;
      const sourceFile = createSourceFile(code);
      const element = findFirstJsxElement(sourceFile)!;

      expect(extractTextContent(element, sourceFile)).toBe('');
    });
  });

  describe('analyzeJsxFile', () => {
    it('should analyze simple JSX file', () => {
      const code = `
        function Component() {
          return <div className="container"><button>Click</button></div>;
        }
      `;
      const sourceFile = createSourceFile(code);

      const elements = analyzeJsxFile('test.tsx', code, sourceFile);

      expect(elements.length).toBe(2);
      expect(elements.some((e) => e.tag === 'div')).toBe(true);
      expect(elements.some((e) => e.tag === 'button')).toBe(true);
    });

    it('should extract attributes', () => {
      const code = `<input type="email" id="email" aria-label="Email address" />`;
      const sourceFile = createSourceFile(code);

      const elements = analyzeJsxFile('test.tsx', code, sourceFile);

      expect(elements.length).toBe(1);
      expect(elements[0].attributes.get('type')).toBe('email');
      expect(elements[0].attributes.get('id')).toBe('email');
      expect(elements[0].attributes.get('aria-label')).toBe('Email address');
    });

    it('should set line numbers', () => {
      const code = `<div>
<button>Click</button>
</div>`;
      const sourceFile = createSourceFile(code);

      const elements = analyzeJsxFile('test.tsx', code, sourceFile);

      expect(elements[0].line).toBe(1);
      expect(elements[1].line).toBe(2);
    });

    it('should set identifier', () => {
      const code = `<button>Click</button>`;
      const sourceFile = createSourceFile(code);

      const elements = analyzeJsxFile('test.tsx', code, sourceFile);

      expect(elements[0].identifier).toBe('button:1');
    });

    it('should detect components', () => {
      const code = `<CustomButton onClick={handleClick} />`;
      const sourceFile = createSourceFile(code);

      const elements = analyzeJsxFile('test.tsx', code, sourceFile);

      expect(elements[0].isComponent).toBe(true);
    });

    it('should detect HTML elements', () => {
      const code = `<button onClick={handleClick} />`;
      const sourceFile = createSourceFile(code);

      const elements = analyzeJsxFile('test.tsx', code, sourceFile);

      expect(elements[0].isComponent).toBe(false);
    });

    it('should handle spread attributes', () => {
      const code = `<input {...props} type="text" />`;
      const sourceFile = createSourceFile(code);

      const elements = analyzeJsxFile('test.tsx', code, sourceFile);

      expect(elements[0].attributes.has('[spread]')).toBe(true);
    });

    it('should track parent-child relationships', () => {
      const code = `
        function Component() {
          return (
            <div>
              <section>
                <button>Click</button>
              </section>
            </div>
          );
        }
      `;
      const sourceFile = createSourceFile(code);

      const elements = analyzeJsxFile('test.tsx', code, sourceFile);

      // Find the button
      const button = elements.find((e) => e.tag === 'button');
      expect(button).toBeDefined();
      expect(button!.parentIndex).not.toBeNull();

      // Parent should be section
      const section = elements.find((e) => e.tag === 'section');
      expect(section).toBeDefined();
      expect(section!.childIndices).toContain(elements.indexOf(button!));
    });

    it('should extract text content', () => {
      const code = `<button>Submit Form</button>`;
      const sourceFile = createSourceFile(code);

      const elements = analyzeJsxFile('test.tsx', code, sourceFile);

      expect(elements[0].textContent).toBe('Submit Form');
    });

    it('should filter by target element', () => {
      const code = `
        function Component() {
          return (
            <div>
              <button>Click</button>
              <span>Text</span>
            </div>
          );
        }
      `;
      const sourceFile = createSourceFile(code);

      const elements = analyzeJsxFile('test.tsx', code, sourceFile, 'button');

      expect(elements.length).toBe(1);
      expect(elements[0].tag).toBe('button');
    });

    it('should handle self-closing elements', () => {
      const code = `
        function Component() {
          return (
            <form>
              <input type="text" />
              <input type="submit" value="Send" />
            </form>
          );
        }
      `;
      const sourceFile = createSourceFile(code);

      const elements = analyzeJsxFile('test.tsx', code, sourceFile);

      const inputs = elements.filter((e) => e.tag === 'input');
      expect(inputs.length).toBe(2);
    });

    it('should handle complex nested structure', () => {
      const code = `
        function Component() {
          return (
            <nav aria-label="Main">
              <ul>
                <li><a href="/">Home</a></li>
                <li><a href="/about">About</a></li>
              </ul>
            </nav>
          );
        }
      `;
      const sourceFile = createSourceFile(code);

      const elements = analyzeJsxFile('test.tsx', code, sourceFile);

      expect(elements.some((e) => e.tag === 'nav')).toBe(true);
      expect(elements.some((e) => e.tag === 'ul')).toBe(true);
      expect(elements.filter((e) => e.tag === 'li').length).toBe(2);
      expect(elements.filter((e) => e.tag === 'a').length).toBe(2);
    });
  });
});
