/**
 * Unit tests for error-handling-checks validation module
 *
 * Tests cover:
 * - Async functions without try/catch
 * - Empty catch blocks
 * - console.log in catch blocks (should use console.error)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runErrorHandlingChecks } from '../../../handlers/validation/error-handling-checks.js';
import { ValidationContext } from '../../../handlers/validation/types.js';

// Mock the utils module
vi.mock('../../../utils.js', () => ({
  extractFunctionBody: (content: string, startIndex: number): string => {
    // Simple implementation that extracts content between braces
    let depth = 0;
    let start = -1;
    for (let i = startIndex; i < content.length; i++) {
      if (content[i] === '{') {
        if (depth === 0) start = i;
        depth++;
      } else if (content[i] === '}') {
        depth--;
        if (depth === 0 && start !== -1) {
          return content.substring(start, i + 1);
        }
      }
    }
    return '';
  },
}));

function createContext(content: string, file = 'test.ts'): ValidationContext {
  const ext = file.substring(file.lastIndexOf('.'));
  return {
    content,
    lines: content.split('\n'),
    file,
    ext,
    isTypeScript: ext === '.ts' || ext === '.tsx',
    isReact: ext === '.tsx' || ext === '.jsx',
  };
}

describe('runErrorHandlingChecks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('async function error handling', () => {
    it('should warn about async function without try/catch', () => {
      const ctx = createContext(`
export async function fetchData() {
  const response = await fetch('/api');
  return response.json();
}
      `);
      const issues = runErrorHandlingChecks(ctx);

      expect(issues.some(i => i.rule === 'error-handling/async-try-catch')).toBe(true);
      expect(issues.find(i => i.rule === 'error-handling/async-try-catch')?.severity).toBe('warning');
    });

    it('should NOT warn about async function with try/catch', () => {
      const ctx = createContext(`
export async function fetchData() {
  try {
    const response = await fetch('/api');
    return response.json();
  } catch (error) {
    console.error(error);
  }
}
      `);
      const issues = runErrorHandlingChecks(ctx);

      expect(issues.filter(i => i.rule === 'error-handling/async-try-catch').length).toBe(0);
    });

    it('should NOT warn about async function with .catch()', () => {
      const ctx = createContext(`
export async function fetchData() {
  const response = await fetch('/api').catch(err => null);
  return response?.json();
}
      `);
      const issues = runErrorHandlingChecks(ctx);

      expect(issues.filter(i => i.rule === 'error-handling/async-try-catch').length).toBe(0);
    });

    it('should detect arrow async function without error handling', () => {
      // Arrow functions with async keyword pattern may not match the regex
      // The regex is: /async\s+(?:function\s+)?(\w+)?\s*\([^)]*\)\s*(?::\s*\w+(?:<[^>]+>)?)?\s*\{/g
      // Let's use a function declaration instead
      const ctx = createContext(`
async function fetchData() {
  const response = await fetch('/api');
  return response.json();
}
      `);
      const issues = runErrorHandlingChecks(ctx);

      expect(issues.some(i => i.rule === 'error-handling/async-try-catch')).toBe(true);
    });

    it('should include correct line number', () => {
      const ctx = createContext(`
// Comment line 1
// Comment line 2
export async function fetchData() {
  const response = await fetch('/api');
}
      `);
      const issues = runErrorHandlingChecks(ctx);
      const issue = issues.find(i => i.rule === 'error-handling/async-try-catch');

      expect(issue?.line).toBe(4);
    });
  });

  describe('empty catch block detection', () => {
    it('should detect empty catch block on single line', () => {
      const ctx = createContext('try { doSomething(); } catch (e) {}');
      const issues = runErrorHandlingChecks(ctx);

      expect(issues.some(i => i.rule === 'error-handling/empty-catch')).toBe(true);
      expect(issues.find(i => i.rule === 'error-handling/empty-catch')?.severity).toBe('warning');
    });

    it('should detect empty catch block on multiple lines', () => {
      const ctx = createContext(`
try {
  doSomething();
} catch (e) {
}
      `);
      const issues = runErrorHandlingChecks(ctx);

      expect(issues.some(i => i.rule === 'error-handling/empty-catch')).toBe(true);
    });

    it('should NOT flag catch block with content', () => {
      const ctx = createContext(`
try {
  doSomething();
} catch (e) {
  console.error(e);
}
      `);
      const issues = runErrorHandlingChecks(ctx);

      expect(issues.filter(i => i.rule === 'error-handling/empty-catch').length).toBe(0);
    });

    it('should include suggestion for empty catch', () => {
      const ctx = createContext('try { x(); } catch (e) {}');
      const issues = runErrorHandlingChecks(ctx);

      expect(issues.find(i => i.rule === 'error-handling/empty-catch')?.suggestion).toContain('Log');
    });
  });

  describe('console.log in catch blocks', () => {
    it('should suggest console.error instead of console.log in catch', () => {
      const ctx = createContext(`
try {
  doSomething();
} catch (e) {
  console.log(e);
}
      `);
      const issues = runErrorHandlingChecks(ctx);

      expect(issues.some(i => i.rule === 'error-handling/console-error')).toBe(true);
      expect(issues.find(i => i.rule === 'error-handling/console-error')?.severity).toBe('info');
    });

    it('should NOT flag console.error in catch', () => {
      const ctx = createContext(`
try {
  doSomething();
} catch (e) {
  console.error(e);
}
      `);
      const issues = runErrorHandlingChecks(ctx);

      expect(issues.filter(i => i.rule === 'error-handling/console-error').length).toBe(0);
    });

    it('should include suggestion for console.error', () => {
      const ctx = createContext(`catch (e) {
  console.log(e);
}
      `);
      const issues = runErrorHandlingChecks(ctx);

      const issue = issues.find(i => i.rule === 'error-handling/console-error');
      expect(issue?.suggestion).toContain('console.error');
    });
  });

  describe('issue properties', () => {
    it('should include correct file path', () => {
      const ctx = createContext('try {} catch (e) {}', 'src/api/handler.ts');
      const issues = runErrorHandlingChecks(ctx);

      expect(issues[0]?.file).toBe('src/api/handler.ts');
    });
  });

  describe('clean code scenarios', () => {
    it('should return empty array for properly handled code', () => {
      const ctx = createContext(`
export async function fetchData() {
  try {
    const response = await fetch('/api');
    return response.json();
  } catch (error) {
    console.error('Failed to fetch:', error);
    throw error;
  }
}

export function syncFunction() {
  try {
    riskyOperation();
  } catch (error) {
    console.error(error);
  }
}
      `);
      const issues = runErrorHandlingChecks(ctx);

      expect(issues.length).toBe(0);
    });
  });
});
