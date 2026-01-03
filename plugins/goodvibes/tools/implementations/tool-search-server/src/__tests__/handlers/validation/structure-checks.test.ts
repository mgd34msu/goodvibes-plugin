/**
 * Unit tests for structure-checks validation module
 *
 * Tests cover:
 * - Missing exports detection
 * - React component file naming (PascalCase)
 * - Conditional hook usage detection
 * - Large file detection
 * - Empty index file detection
 */

import { describe, it, expect } from 'vitest';
import { runStructureChecks } from '../../../handlers/validation/structure-checks.js';
import { ValidationContext } from '../../../handlers/validation/types.js';

function createContext(content: string, file = 'test.ts'): ValidationContext {
  const ext = file.substring(file.lastIndexOf('.'));
  return {
    content,
    lines: content.split('\n'),
    file,
    ext,
    isTypeScript: ext === '.ts' || ext === '.tsx',
    isReact: ext === '.tsx' || ext === '.jsx' || content.includes('import React'),
  };
}

describe('runStructureChecks', () => {
  describe('exports detection', () => {
    it('should warn about missing exports', () => {
      const ctx = createContext('const internal = 42;\nfunction helper() {}');
      const issues = runStructureChecks(ctx);

      expect(issues.some(i => i.rule === 'structure/missing-export')).toBe(true);
      expect(issues.find(i => i.rule === 'structure/missing-export')?.severity).toBe('warning');
    });

    it('should NOT warn about missing exports in index files', () => {
      const ctx = createContext('// barrel export file', 'index.ts');
      const issues = runStructureChecks(ctx);

      expect(issues.filter(i => i.rule === 'structure/missing-export').length).toBe(0);
    });

    it('should NOT warn about missing exports in .d.ts files', () => {
      const ctx = createContext('interface Config { key: string; }', 'types.d.ts');
      const issues = runStructureChecks(ctx);

      expect(issues.filter(i => i.rule === 'structure/missing-export').length).toBe(0);
    });

    it('should NOT warn when export default exists', () => {
      const ctx = createContext('const Component = () => null;\nexport default Component;');
      const issues = runStructureChecks(ctx);

      expect(issues.filter(i => i.rule === 'structure/missing-export').length).toBe(0);
    });

    it('should NOT warn when export const exists', () => {
      const ctx = createContext('export const myValue = 42;');
      const issues = runStructureChecks(ctx);

      expect(issues.filter(i => i.rule === 'structure/missing-export').length).toBe(0);
    });

    it('should NOT warn when export function exists', () => {
      const ctx = createContext('export function myFunc() {}');
      const issues = runStructureChecks(ctx);

      expect(issues.filter(i => i.rule === 'structure/missing-export').length).toBe(0);
    });

    it('should NOT warn when export class exists', () => {
      const ctx = createContext('export class MyClass {}');
      const issues = runStructureChecks(ctx);

      expect(issues.filter(i => i.rule === 'structure/missing-export').length).toBe(0);
    });

    it('should NOT warn when export type exists', () => {
      const ctx = createContext('export type MyType = string;');
      const issues = runStructureChecks(ctx);

      expect(issues.filter(i => i.rule === 'structure/missing-export').length).toBe(0);
    });

    it('should NOT warn when export interface exists', () => {
      const ctx = createContext('export interface MyInterface { key: string; }');
      const issues = runStructureChecks(ctx);

      expect(issues.filter(i => i.rule === 'structure/missing-export').length).toBe(0);
    });

    it('should NOT warn when export { } exists', () => {
      const ctx = createContext('const a = 1;\nconst b = 2;\nexport { a, b };');
      const issues = runStructureChecks(ctx);

      expect(issues.filter(i => i.rule === 'structure/missing-export').length).toBe(0);
    });
  });

  describe('React component naming', () => {
    it('should warn about non-PascalCase React component files', () => {
      const ctx = createContext("import React from 'react';\nexport const Component = () => <div />;", 'myComponent.tsx');
      const issues = runStructureChecks(ctx);

      expect(issues.some(i => i.rule === 'structure/component-naming')).toBe(true);
      expect(issues.find(i => i.rule === 'structure/component-naming')?.severity).toBe('info');
    });

    it('should NOT warn about PascalCase React component files', () => {
      const ctx = createContext("import React from 'react';\nexport const Component = () => <div />;", 'MyComponent.tsx');
      const issues = runStructureChecks(ctx);

      expect(issues.filter(i => i.rule === 'structure/component-naming').length).toBe(0);
    });

    it('should NOT warn about index files in React', () => {
      const ctx = createContext("import React from 'react';\nexport const Component = () => <div />;", 'index.tsx');
      const issues = runStructureChecks(ctx);

      expect(issues.filter(i => i.rule === 'structure/component-naming').length).toBe(0);
    });

    it('should NOT warn about hook files (use prefix)', () => {
      const ctx = createContext("import { useState } from 'react';\nexport function useCustomHook() {}", 'useCustomHook.tsx');
      const issues = runStructureChecks(ctx);

      expect(issues.filter(i => i.rule === 'structure/component-naming').length).toBe(0);
    });

    it('should include suggestion for proper naming', () => {
      const ctx = createContext("import React from 'react';", 'button.tsx');
      const issues = runStructureChecks(ctx);
      const namingIssue = issues.find(i => i.rule === 'structure/component-naming');

      expect(namingIssue?.suggestion).toContain('Button');
    });
  });

  describe('conditional hook usage', () => {
    it('should detect conditional hook with if statement', () => {
      const ctx = createContext(`
import React from 'react';
export function Component() {
  if (condition && useState()) {
    console.log('conditional');
  }
  return <div />;
}
      `, 'Component.tsx');
      const issues = runStructureChecks(ctx);

      expect(issues.some(i => i.rule === 'react/hooks-rules')).toBe(true);
      expect(issues.find(i => i.rule === 'react/hooks-rules')?.severity).toBe('error');
    });

    it('should detect conditional hook with && operator', () => {
      const ctx = createContext(`
import React from 'react';
export function Component() {
  const value = condition && useEffect(() => {});
  return <div />;
}
      `, 'Component.tsx');
      const issues = runStructureChecks(ctx);

      expect(issues.some(i => i.rule === 'react/hooks-rules')).toBe(true);
    });

    it('should NOT flag normal hook usage', () => {
      const ctx = createContext(`
import React, { useState, useEffect } from 'react';
export function Component() {
  const [value, setValue] = useState(0);
  useEffect(() => {}, []);
  return <div />;
}
      `, 'Component.tsx');
      const issues = runStructureChecks(ctx);

      expect(issues.filter(i => i.rule === 'react/hooks-rules').length).toBe(0);
    });

    it('should NOT check hooks in non-React files', () => {
      const ctx = createContext(`
function util() {
  if (condition && useState) {
    // Not React
  }
}
      `, 'util.ts');
      const issues = runStructureChecks(ctx);

      expect(issues.filter(i => i.rule === 'react/hooks-rules').length).toBe(0);
    });
  });

  describe('file size checks', () => {
    it('should warn about large files (>500 lines)', () => {
      const content = 'export const x = 1;\n'.repeat(550);
      const ctx = createContext(content);
      const issues = runStructureChecks(ctx);

      expect(issues.some(i => i.rule === 'structure/file-size')).toBe(true);
      expect(issues.find(i => i.rule === 'structure/file-size')?.severity).toBe('info');
    });

    it('should include line count in message', () => {
      const content = 'export const x = 1;\n'.repeat(600);
      const ctx = createContext(content);
      const issues = runStructureChecks(ctx);

      // The message includes the actual line count which may be 600 or 601 depending on trailing newline
      expect(issues.find(i => i.rule === 'structure/file-size')?.message).toMatch(/\d+ lines/);
    });

    it('should NOT warn about files with fewer than 500 lines', () => {
      // Use 499 lines to ensure we're under the threshold
      const content = 'export const x = 1;\n'.repeat(499);
      const ctx = createContext(content);
      const issues = runStructureChecks(ctx);

      expect(issues.filter(i => i.rule === 'structure/file-size').length).toBe(0);
    });
  });

  describe('empty index file detection', () => {
    it('should detect empty index file', () => {
      const ctx = createContext('// Empty', 'index.ts');
      const issues = runStructureChecks(ctx);

      expect(issues.some(i => i.rule === 'structure/empty-index')).toBe(true);
    });

    it('should NOT flag index files with exports', () => {
      const ctx = createContext("export * from './module';", 'index.ts');
      const issues = runStructureChecks(ctx);

      expect(issues.filter(i => i.rule === 'structure/empty-index').length).toBe(0);
    });

    it('should NOT flag index files with substantial content', () => {
      const ctx = createContext('// This is an index file with substantial content that is more than 50 characters', 'index.ts');
      const issues = runStructureChecks(ctx);

      expect(issues.filter(i => i.rule === 'structure/empty-index').length).toBe(0);
    });
  });

  describe('issue properties', () => {
    it('should include correct file path', () => {
      const ctx = createContext('const internal = 1;', 'src/utils/helper.ts');
      const issues = runStructureChecks(ctx);

      expect(issues.find(i => i.rule === 'structure/missing-export')?.file).toBe('src/utils/helper.ts');
    });

    it('should include suggestion', () => {
      const ctx = createContext('const internal = 1;');
      const issues = runStructureChecks(ctx);

      expect(issues[0]?.suggestion).toBeDefined();
      expect(issues[0]?.suggestion.length).toBeGreaterThan(0);
    });
  });
});
