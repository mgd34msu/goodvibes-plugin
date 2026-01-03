/**
 * Unit tests for validation handlers
 *
 * Tests cover:
 * - handleValidateImplementation
 * - handleCheckTypes
 * - Security checks
 * - Structure checks
 * - Error handling checks
 * - TypeScript checks
 * - Naming conventions
 * - Best practices
 * - Skill pattern validation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';

import {
  handleValidateImplementation,
  handleCheckTypes,
} from '../../handlers/validation.js';
import {
  sampleTypeScriptWithIssues,
  sampleCleanTypeScript,
} from '../setup.js';

// Mock modules
vi.mock('fs');
vi.mock('../../config.js', () => ({
  PLUGIN_ROOT: '/mock/plugin/root',
  PROJECT_ROOT: '/mock/project/root',
}));
vi.mock('../../utils.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual as object,
    safeExec: vi.fn().mockResolvedValue({ stdout: '', stderr: '', error: undefined }),
    parseSkillMetadata: vi.fn().mockReturnValue({}),
    extractSkillPatterns: vi.fn().mockReturnValue({}),
    extractFunctionBody: (actual as any).extractFunctionBody,
  };
});

describe('validation handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('handleValidateImplementation', () => {
    describe('file existence checks', () => {
      it('should report error for non-existent file', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(false);

        const result = await handleValidateImplementation({
          files: ['nonexistent.ts'],
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.issues.some((i: any) => i.rule === 'file/exists')).toBe(true);
        expect(data.valid).toBe(false);
      });

      it('should continue checking other files after missing file', async () => {
        vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
          return String(p).includes('existing');
        });
        vi.mocked(fs.readFileSync).mockReturnValue(sampleCleanTypeScript);

        const result = await handleValidateImplementation({
          files: ['missing.ts', 'existing.ts'],
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.summary.files_checked).toBe(2);
      });
    });

    describe('security checks', () => {
      it('should detect hardcoded passwords', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue('const password = "secret123";');

        const result = await handleValidateImplementation({
          files: ['test.ts'],
          checks: ['security'],
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.issues.some((i: any) => i.rule === 'security/no-hardcoded-secrets')).toBe(true);
      });

      it('should detect hardcoded API keys', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue('const apiKey = "sk_live_abc123";');

        const result = await handleValidateImplementation({
          files: ['test.ts'],
          checks: ['security'],
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.issues.some((i: any) => i.message.includes('API key'))).toBe(true);
      });

      it('should not flag environment variables', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue('const apiKey = process.env.API_KEY;');

        const result = await handleValidateImplementation({
          files: ['test.ts'],
          checks: ['security'],
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.issues.filter((i: any) => i.rule === 'security/no-hardcoded-secrets').length).toBe(0);
      });

      it('should detect eval usage', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue('const result = eval(userInput);');

        const result = await handleValidateImplementation({
          files: ['test.ts'],
          checks: ['security'],
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.issues.some((i: any) => i.rule === 'security/no-eval')).toBe(true);
      });

      it('should detect innerHTML usage', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue('element.innerHTML = userContent;');

        const result = await handleValidateImplementation({
          files: ['test.ts'],
          checks: ['security'],
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.issues.some((i: any) => i.rule === 'security/no-innerhtml')).toBe(true);
      });

      it('should detect dangerouslySetInnerHTML', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue('<div dangerouslySetInnerHTML={{ __html: content }} />');

        const result = await handleValidateImplementation({
          files: ['test.tsx'],
          checks: ['security'],
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.issues.some((i: any) => i.rule === 'security/dangerously-set-inner-html')).toBe(true);
      });

      it('should detect SQL injection risk', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue('db.query(`SELECT * FROM users WHERE id = ${userId}`);');

        const result = await handleValidateImplementation({
          files: ['test.ts'],
          checks: ['security'],
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.issues.some((i: any) => i.rule === 'security/sql-injection')).toBe(true);
      });
    });

    describe('structure checks', () => {
      it('should warn about missing exports', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue('const internal = 42;');

        const result = await handleValidateImplementation({
          files: ['module.ts'],
          checks: ['structure'],
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.issues.some((i: any) => i.rule === 'structure/missing-export')).toBe(true);
      });

      it('should not warn about missing exports in index files', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue('// barrel export file');

        const result = await handleValidateImplementation({
          files: ['index.ts'],
          checks: ['structure'],
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.issues.filter((i: any) => i.rule === 'structure/missing-export').length).toBe(0);
      });

      it('should warn about non-PascalCase React component files', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue("import React from 'react';\nexport const Component = () => <div />;");

        const result = await handleValidateImplementation({
          files: ['myComponent.tsx'],
          checks: ['structure'],
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.issues.some((i: any) => i.rule === 'structure/component-naming')).toBe(true);
      });

      it('should detect conditional hook usage', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        // The hook check looks for patterns like "if (...useState" or "&& useState" on the same line
        vi.mocked(fs.readFileSync).mockReturnValue(`
import React from 'react';
export function Component() {
  if (condition && useState()) {
    console.log('hook called conditionally');
  }
  return <div />;
}
`);

        const result = await handleValidateImplementation({
          files: ['Component.tsx'],
          checks: ['structure'],
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.issues.some((i: any) => i.rule === 'react/hooks-rules')).toBe(true);
      });

      it('should warn about large files', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue('line\n'.repeat(600));

        const result = await handleValidateImplementation({
          files: ['large.ts'],
          checks: ['structure'],
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.issues.some((i: any) => i.rule === 'structure/file-size')).toBe(true);
      });
    });

    describe('error handling checks', () => {
      it('should warn about async functions without try/catch', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(`
export async function fetchData() {
  const response = await fetch('/api');
  return response.json();
}
`);

        const result = await handleValidateImplementation({
          files: ['api.ts'],
          checks: ['errors'],
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.issues.some((i: any) => i.rule === 'error-handling/async-try-catch')).toBe(true);
      });

      it('should not warn about async functions with try/catch', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(sampleCleanTypeScript);

        const result = await handleValidateImplementation({
          files: ['api.ts'],
          checks: ['errors'],
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.issues.filter((i: any) => i.rule === 'error-handling/async-try-catch').length).toBe(0);
      });

      it('should warn about empty catch blocks', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(`
try { doSomething(); } catch (e) {}
`);

        const result = await handleValidateImplementation({
          files: ['error.ts'],
          checks: ['errors'],
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.issues.some((i: any) => i.rule === 'error-handling/empty-catch')).toBe(true);
      });
    });

    describe('TypeScript checks', () => {
      it('should warn about using any type', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue('const data: any = {};');

        const result = await handleValidateImplementation({
          files: ['data.ts'],
          checks: ['typescript'],
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.issues.some((i: any) => i.rule === 'typescript/no-any')).toBe(true);
      });

      it('should warn about @ts-ignore without explanation', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(`
// @ts-ignore
const x = something();
`);

        const result = await handleValidateImplementation({
          files: ['ignored.ts'],
          checks: ['typescript'],
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.issues.some((i: any) => i.rule === 'typescript/no-ts-ignore')).toBe(true);
      });

      it('should warn about excessive non-null assertions', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(`
const a = obj!.prop!.value!.nested!.deep!.deeper!.data;
`);

        const result = await handleValidateImplementation({
          files: ['assertions.ts'],
          checks: ['typescript'],
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.issues.some((i: any) => i.rule === 'typescript/excessive-non-null')).toBe(true);
      });
    });

    describe('naming conventions', () => {
      it('should suggest camelCase for functions', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        // The naming check triggers for function names that are NOT camelCase AND NOT PascalCase
        // "my_function" contains underscore so it doesn't match either pattern
        vi.mocked(fs.readFileSync).mockReturnValue('function my_invalid_function() {}');

        const result = await handleValidateImplementation({
          files: ['naming.ts'],
          checks: ['naming'],
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.issues.some((i: any) => i.rule === 'naming/camelCase')).toBe(true);
      });
    });

    describe('best practices', () => {
      it('should detect console.log', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue('console.log("debug");');

        const result = await handleValidateImplementation({
          files: ['debug.ts'],
          checks: ['best-practices'],
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.issues.some((i: any) => i.rule === 'best-practices/no-console')).toBe(true);
      });

      it('should detect TODO comments', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue('// TODO: Fix this later');

        const result = await handleValidateImplementation({
          files: ['todo.ts'],
          checks: ['best-practices'],
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.issues.some((i: any) => i.rule === 'best-practices/no-todo')).toBe(true);
      });
    });

    describe('summary and scoring', () => {
      it('should calculate score based on issues', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(sampleTypeScriptWithIssues);

        const result = await handleValidateImplementation({
          files: ['issues.ts'],
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.score).toBeLessThan(100);
        expect(typeof data.score).toBe('number');
      });

      it('should assign grades based on score', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(sampleCleanTypeScript);

        const result = await handleValidateImplementation({
          files: ['clean.tsx'],
        });
        const data = JSON.parse(result.content[0].text);

        expect(['A', 'B', 'C', 'D', 'F']).toContain(data.grade);
      });

      it('should report valid as false when errors exist', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue('eval(userInput);');

        const result = await handleValidateImplementation({
          files: ['eval.ts'],
          checks: ['security'],
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.valid).toBe(false);
      });

      it('should report checks_run in summary', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue('const x = 1;');

        const result = await handleValidateImplementation({
          files: ['test.ts'],
          checks: ['security', 'structure'],
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.summary.checks_run).toContain('security');
        expect(data.summary.checks_run).toContain('structure');
      });
    });
  });

  describe('handleCheckTypes', () => {
    it('should run TypeScript type checking', async () => {
      const { safeExec } = await import('../../utils.js');
      vi.mocked(safeExec).mockResolvedValue({ stdout: '', stderr: '' });

      const result = await handleCheckTypes({});
      const data = JSON.parse(result.content[0].text);

      expect(safeExec).toHaveBeenCalled();
      expect(data.valid).toBe(true);
    });

    it('should parse TypeScript errors', async () => {
      const { safeExec } = await import('../../utils.js');
      vi.mocked(safeExec).mockResolvedValue({
        stdout: "src/test.ts(10,5): error TS2322: Type 'string' is not assignable to type 'number'.",
        stderr: '',
      });

      const result = await handleCheckTypes({});
      const data = JSON.parse(result.content[0].text);

      expect(data.valid).toBe(false);
      expect(data.errors.length).toBe(1);
      expect(data.errors[0].file).toBe('src/test.ts');
      expect(data.errors[0].line).toBe(10);
      expect(data.errors[0].code).toBe('TS2322');
    });

    it('should use strict mode when requested', async () => {
      const { safeExec } = await import('../../utils.js');
      vi.mocked(safeExec).mockResolvedValue({ stdout: '', stderr: '' });

      await handleCheckTypes({ strict: true });

      expect(safeExec).toHaveBeenCalledWith(
        expect.stringContaining('--strict'),
        expect.any(String),
        expect.any(Number)
      );
    });

    it('should check specific files when provided', async () => {
      const { safeExec } = await import('../../utils.js');
      vi.mocked(safeExec).mockResolvedValue({ stdout: '', stderr: '' });

      await handleCheckTypes({ files: ['src/a.ts', 'src/b.ts'] });

      expect(safeExec).toHaveBeenCalledWith(
        expect.stringContaining('src/a.ts src/b.ts'),
        expect.any(String),
        expect.any(Number)
      );
    });

    it('should include suggestions when requested', async () => {
      const { safeExec } = await import('../../utils.js');
      vi.mocked(safeExec).mockResolvedValue({
        stdout: "test.ts(1,1): error TS2304: Cannot find name 'x'.",
        stderr: '',
      });

      const result = await handleCheckTypes({ include_suggestions: true });
      const data = JSON.parse(result.content[0].text);

      expect(data.errors[0].suggestion).toBeDefined();
      expect(data.errors[0].suggestion.length).toBeGreaterThan(0);
    });
  });
});
