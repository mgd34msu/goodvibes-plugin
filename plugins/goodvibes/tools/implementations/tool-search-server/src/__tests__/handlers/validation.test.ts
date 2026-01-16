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
import * as fsPromises from 'fs/promises';

import {
  handleValidateImplementation,
  handleCheckTypes,
} from '../../handlers/validation.js';
import {
  sampleTypeScriptWithIssues,
  sampleCleanTypeScript,
} from '../setup.js';

/** Validation issue reported by the validator */
interface ValidationIssue {
  rule: string;
  message: string;
  file: string;
  line?: number;
  severity: 'error' | 'warning' | 'info';
}

// Mock modules
vi.mock('fs/promises');
vi.mock('../../config.js', () => ({
  PLUGIN_ROOT: '/mock/plugin/root',
  PROJECT_ROOT: '/mock/project/root',
}));
vi.mock('../../utils.js', async (importOriginal) => {
  const actual = await importOriginal();
  interface UtilsModule {
    safeExec: (cmd: string) => Promise<{ stdout: string; stderr: string; error?: Error }>;
    parseSkillMetadata: (content: string) => Record<string, unknown>;
    extractSkillPatterns: (content: string) => Record<string, unknown>;
    extractFunctionBody: (content: string) => string;
    fileExists: (path: string) => Promise<boolean>;
  }

  return {
    ...actual as object,
    safeExec: vi.fn().mockResolvedValue({ stdout: '', stderr: '', error: undefined }),
    parseSkillMetadata: vi.fn().mockReturnValue({}),
    extractSkillPatterns: vi.fn().mockReturnValue({}),
    extractFunctionBody: (actual as UtilsModule).extractFunctionBody,
    fileExists: vi.fn().mockResolvedValue(true),
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
    beforeEach(async () => {
      // Default: files exist
      const { fileExists } = await import('../../utils.js');
      vi.mocked(fileExists).mockResolvedValue(true);
    });

    describe('file existence checks', () => {
      it('should report error for non-existent file', async () => {
        const { fileExists } = await import('../../utils.js');
        vi.mocked(fileExists).mockResolvedValue(false);

        const result = await handleValidateImplementation({
          files: ['nonexistent.ts'],
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.issues.some((i: ValidationIssue) => i.rule === 'file/exists')).toBe(true);
        expect(data.valid).toBe(false);
      });

      it('should continue checking other files after missing file', async () => {
        const { fileExists } = await import('../../utils.js');
        vi.mocked(fileExists).mockImplementation(async (p: string) => {
          return String(p).includes('existing');
        });
        vi.mocked(fsPromises.readFile).mockResolvedValue(sampleCleanTypeScript);

        const result = await handleValidateImplementation({
          files: ['missing.ts', 'existing.ts'],
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.summary.files_checked).toBe(2);
      });
    });

    describe('security checks', () => {
      it('should detect hardcoded passwords', async () => {
        vi.mocked(fsPromises.readFile).mockResolvedValue('const password = "secret123";');

        const result = await handleValidateImplementation({
          files: ['test.ts'],
          checks: ['security'],
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.issues.some((i: ValidationIssue) => i.rule === 'security/no-hardcoded-secrets')).toBe(true);
      });

      it('should detect hardcoded API keys', async () => {
        vi.mocked(fsPromises.readFile).mockResolvedValue('const apiKey = "sk_live_abc123";');

        const result = await handleValidateImplementation({
          files: ['test.ts'],
          checks: ['security'],
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.issues.some((i: ValidationIssue) => i.message.includes('API key'))).toBe(true);
      });

      it('should not flag environment variables', async () => {
        vi.mocked(fsPromises.readFile).mockResolvedValue('const apiKey = process.env.API_KEY;');

        const result = await handleValidateImplementation({
          files: ['test.ts'],
          checks: ['security'],
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.issues.filter((i: ValidationIssue) => i.rule === 'security/no-hardcoded-secrets').length).toBe(0);
      });

      it('should detect eval usage', async () => {
        vi.mocked(fsPromises.readFile).mockResolvedValue('const result = eval(userInput);');

        const result = await handleValidateImplementation({
          files: ['test.ts'],
          checks: ['security'],
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.issues.some((i: ValidationIssue) => i.rule === 'security/no-eval')).toBe(true);
      });

      it('should detect innerHTML usage', async () => {
        vi.mocked(fsPromises.readFile).mockResolvedValue('element.innerHTML = userContent;');

        const result = await handleValidateImplementation({
          files: ['test.ts'],
          checks: ['security'],
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.issues.some((i: ValidationIssue) => i.rule === 'security/no-innerhtml')).toBe(true);
      });

      it('should detect dangerouslySetInnerHTML', async () => {
        vi.mocked(fsPromises.readFile).mockResolvedValue('<div dangerouslySetInnerHTML={{ __html: content }} />');

        const result = await handleValidateImplementation({
          files: ['test.tsx'],
          checks: ['security'],
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.issues.some((i: ValidationIssue) => i.rule === 'security/dangerously-set-inner-html')).toBe(true);
      });

      it('should detect SQL injection risk', async () => {
        vi.mocked(fsPromises.readFile).mockResolvedValue('db.query(`SELECT * FROM users WHERE id = ${userId}`);');

        const result = await handleValidateImplementation({
          files: ['test.ts'],
          checks: ['security'],
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.issues.some((i: ValidationIssue) => i.rule === 'security/sql-injection')).toBe(true);
      });
    });

    describe('structure checks', () => {
      it('should warn about missing exports', async () => {
        vi.mocked(fsPromises.readFile).mockResolvedValue('const internal = 42;');

        const result = await handleValidateImplementation({
          files: ['module.ts'],
          checks: ['structure'],
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.issues.some((i: ValidationIssue) => i.rule === 'structure/missing-export')).toBe(true);
      });

      it('should not warn about missing exports in index files', async () => {
        vi.mocked(fsPromises.readFile).mockResolvedValue('// barrel export file');

        const result = await handleValidateImplementation({
          files: ['index.ts'],
          checks: ['structure'],
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.issues.filter((i: ValidationIssue) => i.rule === 'structure/missing-export').length).toBe(0);
      });

      it('should warn about non-PascalCase React component files', async () => {
        vi.mocked(fsPromises.readFile).mockResolvedValue("import React from 'react';\nexport const Component = () => <div />;");

        const result = await handleValidateImplementation({
          files: ['myComponent.tsx'],
          checks: ['structure'],
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.issues.some((i: ValidationIssue) => i.rule === 'structure/component-naming')).toBe(true);
      });

      it('should detect conditional hook usage', async () => {
        // The hook check looks for patterns like "if (...useState" or "&& useState" on the same line
        vi.mocked(fsPromises.readFile).mockResolvedValue(`
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

        expect(data.issues.some((i: ValidationIssue) => i.rule === 'react/hooks-rules')).toBe(true);
      });

      it('should warn about large files', async () => {
        vi.mocked(fsPromises.readFile).mockResolvedValue('line\n'.repeat(600));

        const result = await handleValidateImplementation({
          files: ['large.ts'],
          checks: ['structure'],
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.issues.some((i: ValidationIssue) => i.rule === 'structure/file-size')).toBe(true);
      });
    });

    describe('error handling checks', () => {
      it('should warn about async functions without try/catch', async () => {
        vi.mocked(fsPromises.readFile).mockResolvedValue(`
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

        expect(data.issues.some((i: ValidationIssue) => i.rule === 'error-handling/async-try-catch')).toBe(true);
      });

      it('should not warn about async functions with try/catch', async () => {
        vi.mocked(fsPromises.readFile).mockResolvedValue(sampleCleanTypeScript);

        const result = await handleValidateImplementation({
          files: ['api.ts'],
          checks: ['errors'],
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.issues.filter((i: ValidationIssue) => i.rule === 'error-handling/async-try-catch').length).toBe(0);
      });

      it('should warn about empty catch blocks', async () => {
        vi.mocked(fsPromises.readFile).mockResolvedValue(`
try { doSomething(); } catch (e) {}
`);

        const result = await handleValidateImplementation({
          files: ['error.ts'],
          checks: ['errors'],
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.issues.some((i: ValidationIssue) => i.rule === 'error-handling/empty-catch')).toBe(true);
      });
    });

    describe('TypeScript checks', () => {
      it('should warn about using any type', async () => {
        vi.mocked(fsPromises.readFile).mockResolvedValue('const data: any = {};');

        const result = await handleValidateImplementation({
          files: ['data.ts'],
          checks: ['typescript'],
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.issues.some((i: ValidationIssue) => i.rule === 'typescript/no-any')).toBe(true);
      });

      it('should warn about @ts-ignore without explanation', async () => {
        vi.mocked(fsPromises.readFile).mockResolvedValue(`
// @ts-ignore
const x = something();
`);

        const result = await handleValidateImplementation({
          files: ['ignored.ts'],
          checks: ['typescript'],
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.issues.some((i: ValidationIssue) => i.rule === 'typescript/no-ts-ignore')).toBe(true);
      });

      it('should warn about excessive non-null assertions', async () => {
        vi.mocked(fsPromises.readFile).mockResolvedValue(`
const a = obj!.prop!.value!.nested!.deep!.deeper!.data;
`);

        const result = await handleValidateImplementation({
          files: ['assertions.ts'],
          checks: ['typescript'],
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.issues.some((i: ValidationIssue) => i.rule === 'typescript/excessive-non-null')).toBe(true);
      });
    });

    describe('naming conventions', () => {
      it('should suggest camelCase for functions', async () => {
        // The naming check triggers for function names that are NOT camelCase AND NOT PascalCase
        // "my_function" contains underscore so it doesn't match either pattern
        vi.mocked(fsPromises.readFile).mockResolvedValue('function my_invalid_function() {}');

        const result = await handleValidateImplementation({
          files: ['naming.ts'],
          checks: ['naming'],
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.issues.some((i: ValidationIssue) => i.rule === 'naming/camelCase')).toBe(true);
      });
    });

    describe('best practices', () => {
      it('should detect console.log', async () => {
        vi.mocked(fsPromises.readFile).mockResolvedValue('console.log("debug");');

        const result = await handleValidateImplementation({
          files: ['debug.ts'],
          checks: ['best-practices'],
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.issues.some((i: ValidationIssue) => i.rule === 'best-practices/no-console')).toBe(true);
      });

      it('should detect TODO comments', async () => {
        vi.mocked(fsPromises.readFile).mockResolvedValue('// TODO: Fix this later');

        const result = await handleValidateImplementation({
          files: ['todo.ts'],
          checks: ['best-practices'],
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.issues.some((i: ValidationIssue) => i.rule === 'best-practices/no-todo')).toBe(true);
      });
    });

    describe('summary and scoring', () => {
      it('should calculate score based on issues', async () => {
        vi.mocked(fsPromises.readFile).mockResolvedValue(sampleTypeScriptWithIssues);

        const result = await handleValidateImplementation({
          files: ['issues.ts'],
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.score).toBeLessThan(100);
        expect(typeof data.score).toBe('number');
      });

      it('should assign grades based on score', async () => {
        vi.mocked(fsPromises.readFile).mockResolvedValue(sampleCleanTypeScript);

        const result = await handleValidateImplementation({
          files: ['clean.tsx'],
        });
        const data = JSON.parse(result.content[0].text);

        expect(['A', 'B', 'C', 'D', 'F']).toContain(data.grade);
      });

      it('should report valid as false when errors exist', async () => {
        vi.mocked(fsPromises.readFile).mockResolvedValue('eval(userInput);');

        const result = await handleValidateImplementation({
          files: ['eval.ts'],
          checks: ['security'],
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.valid).toBe(false);
      });

      it('should report checks_run in summary', async () => {
        vi.mocked(fsPromises.readFile).mockResolvedValue('const x = 1;');

        const result = await handleValidateImplementation({
          files: ['test.ts'],
          checks: ['security', 'structure'],
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.summary.checks_run).toContain('security');
        expect(data.summary.checks_run).toContain('structure');
      });

      // Grade calculation tests for all branches (score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F')
      it('should assign grade A for score >= 90 (clean code)', async () => {
        // Clean export with no issues = score 100 = grade A
        vi.mocked(fsPromises.readFile).mockResolvedValue('export const clean = 1;');

        const result = await handleValidateImplementation({
          files: ['clean.ts'],
          checks: ['security'], // Only security checks, no issues expected
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.score).toBeGreaterThanOrEqual(90);
        expect(data.grade).toBe('A');
      });

      it('should assign grade B for score 80-89 (3 warnings)', async () => {
        // TypeScript 'any' types trigger warnings (-5 each)
        // 3 warnings = score 100 - 15 = 85 = grade B
        vi.mocked(fsPromises.readFile).mockResolvedValue(`
const a: any = 1;
const b: any = 2;
const c: any = 3;
`);

        const result = await handleValidateImplementation({
          files: ['warnings.ts'],
          checks: ['typescript'],
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.score).toBeGreaterThanOrEqual(80);
        expect(data.score).toBeLessThan(90);
        expect(data.grade).toBe('B');
      });

      it('should assign grade C for score 70-79 (5 warnings)', async () => {
        // TypeScript 'any' types trigger warnings (-5 each)
        // 5 warnings = score 100 - 25 = 75 = grade C
        vi.mocked(fsPromises.readFile).mockResolvedValue(`
const a: any = 1;
const b: any = 2;
const c: any = 3;
const d: any = 4;
const e: any = 5;
`);

        const result = await handleValidateImplementation({
          files: ['warnings.ts'],
          checks: ['typescript'],
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.score).toBeGreaterThanOrEqual(70);
        expect(data.score).toBeLessThan(80);
        expect(data.grade).toBe('C');
      });

      it('should assign grade D for score 60-69 (7 warnings)', async () => {
        // TypeScript 'any' types trigger warnings (-5 each)
        // 7 warnings = score 100 - 35 = 65 = grade D
        vi.mocked(fsPromises.readFile).mockResolvedValue(`
const a: any = 1;
const b: any = 2;
const c: any = 3;
const d: any = 4;
const e: any = 5;
const f: any = 6;
const g: any = 7;
`);

        const result = await handleValidateImplementation({
          files: ['warnings.ts'],
          checks: ['typescript'],
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.score).toBeGreaterThanOrEqual(60);
        expect(data.score).toBeLessThan(70);
        expect(data.grade).toBe('D');
      });

      it('should assign grade F for score < 60 (3+ errors or 9+ warnings)', async () => {
        // 3 errors = score 100 - 60 = 40 = grade F
        // Use eval 3 times to trigger 3 security errors
        vi.mocked(fsPromises.readFile).mockResolvedValue(`
export const x = eval('1');
export const y = eval('2');
export const z = eval('3');
`);

        const result = await handleValidateImplementation({
          files: ['errors.ts'],
          checks: ['security'],
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.score).toBeLessThan(60);
        expect(data.grade).toBe('F');
      });
    });

    describe('skill pattern validation', () => {
      it('should load skill patterns when skill is specified', async () => {
        const { parseSkillMetadata, extractSkillPatterns } = await import('../../utils.js');
        vi.mocked(fsPromises.readFile).mockResolvedValue('const x = 1; export default x;');
        vi.mocked(extractSkillPatterns).mockResolvedValue({
          required_imports: ['lodash'],
          must_not_include: ['eval'],
        });

        const result = await handleValidateImplementation({
          files: ['test.ts'],
          skill: 'typescript',
          checks: ['security'],
        });
        const data = JSON.parse(result.content[0].text);

        expect(parseSkillMetadata).toHaveBeenCalledWith('typescript');
        expect(extractSkillPatterns).toHaveBeenCalledWith('typescript');
        expect(data.skill).toBe('typescript');
      });

      it('should run skill pattern checks when skill is provided', async () => {
        const { extractSkillPatterns } = await import('../../utils.js');
        vi.mocked(fsPromises.readFile).mockResolvedValue('const x = 1; export default x;');
        vi.mocked(extractSkillPatterns).mockResolvedValue({
          required_imports: ['lodash'],
        });

        const result = await handleValidateImplementation({
          files: ['test.ts'],
          skill: 'react-query',
          checks: ['security'],
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.summary.checks_run).toContain('skill-patterns');
      });

      it('should include skill in response when specified', async () => {
        const { extractSkillPatterns } = await import('../../utils.js');
        vi.mocked(fsPromises.readFile).mockResolvedValue('export const x = 1;');
        vi.mocked(extractSkillPatterns).mockResolvedValue({});

        const result = await handleValidateImplementation({
          files: ['module.ts'],
          skill: 'vitest',
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.skill).toBe('vitest');
      });

      it('should set skill to null when not specified', async () => {
        vi.mocked(fsPromises.readFile).mockResolvedValue('export const x = 1;');

        const result = await handleValidateImplementation({
          files: ['module.ts'],
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.skill).toBeNull();
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

      // Files are resolved to absolute paths in the command
      expect(safeExec).toHaveBeenCalledWith(
        expect.stringMatching(/a.ts.*b.ts/),
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

    describe('tsconfig.json discovery (findTsConfig)', () => {
      it('should use --project flag when tsconfig.json is found', async () => {
        const { safeExec, fileExists } = await import('../../utils.js');
        vi.mocked(safeExec).mockResolvedValue({ stdout: '', stderr: '' });
        // Simulate tsconfig.json exists in project root
        vi.mocked(fileExists).mockResolvedValue(true);

        await handleCheckTypes({});

        // Should include --project flag with tsconfig path
        expect(safeExec).toHaveBeenCalledWith(
          expect.stringContaining('--project'),
          expect.any(String),
          expect.any(Number)
        );
      });

      it('should not use --project flag when no tsconfig.json found', async () => {
        const { safeExec, fileExists } = await import('../../utils.js');
        vi.mocked(safeExec).mockResolvedValue({ stdout: '', stderr: '' });
        // Simulate no tsconfig.json anywhere
        vi.mocked(fileExists).mockResolvedValue(false);

        await handleCheckTypes({});

        // The command should not contain --project
        const callArgs = vi.mocked(safeExec).mock.calls[0][0];
        expect(callArgs).not.toContain('--project');
      });

      it('should search parent directories for tsconfig.json', async () => {
        const { safeExec, fileExists } = await import('../../utils.js');
        vi.mocked(safeExec).mockResolvedValue({ stdout: '', stderr: '' });
        // Simulate tsconfig only exists in a parent directory
        vi.mocked(fileExists).mockImplementation(async (p: string) => {
          // Only return true for a specific parent path
          return String(p).endsWith('tsconfig.json') && String(p).includes('mock');
        });

        await handleCheckTypes({ files: ['src/deep/nested/file.ts'] });

        // fileExists should be called multiple times walking up the tree
        expect(fileExists).toHaveBeenCalled();
      });

      it('should check root directory for tsconfig.json as last resort', async () => {
        const { safeExec, fileExists } = await import('../../utils.js');
        vi.mocked(safeExec).mockResolvedValue({ stdout: '', stderr: '' });

        // Track all paths checked
        const checkedPaths: string[] = [];
        vi.mocked(fileExists).mockImplementation(async (p: string) => {
          checkedPaths.push(String(p));
          // Return true only for root tsconfig
          return String(p) === '/tsconfig.json' || String(p) === 'C:\\tsconfig.json';
        });

        await handleCheckTypes({});

        // Should have checked multiple paths
        expect(checkedPaths.length).toBeGreaterThan(0);
      });

      it('should include tsconfig path in summary when found', async () => {
        const { safeExec, fileExists } = await import('../../utils.js');
        vi.mocked(safeExec).mockResolvedValue({ stdout: '', stderr: '' });
        vi.mocked(fileExists).mockResolvedValue(true);

        const result = await handleCheckTypes({});
        const data = JSON.parse(result.content[0].text);

        // tsconfig should be reported in summary
        expect(data.summary.tsconfig).not.toBeNull();
      });

      it('should report null tsconfig in summary when not found', async () => {
        const { safeExec, fileExists } = await import('../../utils.js');
        vi.mocked(safeExec).mockResolvedValue({ stdout: '', stderr: '' });
        vi.mocked(fileExists).mockResolvedValue(false);

        const result = await handleCheckTypes({});
        const data = JSON.parse(result.content[0].text);

        expect(data.summary.tsconfig).toBeNull();
      });
    });

    describe('error path normalization', () => {
      it('should normalize absolute paths in errors to relative paths', async () => {
        const { safeExec } = await import('../../utils.js');
        // Return error with absolute path
        vi.mocked(safeExec).mockResolvedValue({
          stdout: "/mock/project/root/src/file.ts(5,10): error TS2345: Argument type mismatch.",
          stderr: '',
        });

        const result = await handleCheckTypes({});
        const data = JSON.parse(result.content[0].text);

        // Error file path should be normalized to relative
        expect(data.errors.length).toBe(1);
        expect(data.errors[0].file).not.toContain('/mock/project/root/');
      });

      it('should keep relative paths unchanged', async () => {
        const { safeExec } = await import('../../utils.js');
        vi.mocked(safeExec).mockResolvedValue({
          stdout: "src/utils.ts(15,3): error TS2551: Property 'naem' does not exist.",
          stderr: '',
        });

        const result = await handleCheckTypes({});
        const data = JSON.parse(result.content[0].text);

        expect(data.errors[0].file).toBe('src/utils.ts');
      });

      it('should handle errors from both stdout and stderr', async () => {
        const { safeExec } = await import('../../utils.js');
        vi.mocked(safeExec).mockResolvedValue({
          stdout: "file1.ts(1,1): error TS2304: Cannot find name 'a'.",
          stderr: "file2.ts(2,2): error TS2304: Cannot find name 'b'.",
        });

        const result = await handleCheckTypes({});
        const data = JSON.parse(result.content[0].text);

        // Should parse errors from both stdout and stderr
        expect(data.errors.length).toBe(2);
      });
    });

    describe('suggestion generation (getSuggestionForError)', () => {
      it('should provide suggestion for TS2307 (module not found)', async () => {
        const { safeExec } = await import('../../utils.js');
        vi.mocked(safeExec).mockResolvedValue({
          stdout: "test.ts(1,1): error TS2307: Cannot find module './missing'.",
          stderr: '',
        });

        const result = await handleCheckTypes({ include_suggestions: true });
        const data = JSON.parse(result.content[0].text);

        expect(data.errors[0].suggestion).toContain('module path');
      });

      it('should provide suggestion for TS2345 (argument type mismatch)', async () => {
        const { safeExec } = await import('../../utils.js');
        vi.mocked(safeExec).mockResolvedValue({
          stdout: "test.ts(1,1): error TS2345: Argument type mismatch.",
          stderr: '',
        });

        const result = await handleCheckTypes({ include_suggestions: true });
        const data = JSON.parse(result.content[0].text);

        expect(data.errors[0].suggestion).toContain('argument');
      });

      it('should provide suggestion for TS2339 (property does not exist)', async () => {
        const { safeExec } = await import('../../utils.js');
        vi.mocked(safeExec).mockResolvedValue({
          stdout: "test.ts(1,1): error TS2339: Property 'foo' does not exist.",
          stderr: '',
        });

        const result = await handleCheckTypes({ include_suggestions: true });
        const data = JSON.parse(result.content[0].text);

        expect(data.errors[0].suggestion).toContain('Property');
      });

      it('should provide suggestion for TS2532 (possibly undefined)', async () => {
        const { safeExec } = await import('../../utils.js');
        vi.mocked(safeExec).mockResolvedValue({
          stdout: "test.ts(1,1): error TS2532: Object is possibly 'undefined'.",
          stderr: '',
        });

        const result = await handleCheckTypes({ include_suggestions: true });
        const data = JSON.parse(result.content[0].text);

        expect(data.errors[0].suggestion).toContain('null check');
      });

      it('should provide suggestion for TS6133 (unused variable)', async () => {
        const { safeExec } = await import('../../utils.js');
        vi.mocked(safeExec).mockResolvedValue({
          stdout: "test.ts(1,1): error TS6133: 'x' is declared but never used.",
          stderr: '',
        });

        const result = await handleCheckTypes({ include_suggestions: true });
        const data = JSON.parse(result.content[0].text);

        expect(data.errors[0].suggestion).toContain('Unused');
      });

      it('should provide generic suggestion for unknown error codes', async () => {
        const { safeExec } = await import('../../utils.js');
        vi.mocked(safeExec).mockResolvedValue({
          stdout: "test.ts(1,1): error TS9999: Some unknown error.",
          stderr: '',
        });

        const result = await handleCheckTypes({ include_suggestions: true });
        const data = JSON.parse(result.content[0].text);

        // Should have a default suggestion
        expect(data.errors[0].suggestion).toBeDefined();
        expect(data.errors[0].suggestion.length).toBeGreaterThan(0);
      });

      it('should not include suggestions when include_suggestions is false', async () => {
        const { safeExec } = await import('../../utils.js');
        vi.mocked(safeExec).mockResolvedValue({
          stdout: "test.ts(1,1): error TS2304: Cannot find name 'x'.",
          stderr: '',
        });

        const result = await handleCheckTypes({ include_suggestions: false });
        const data = JSON.parse(result.content[0].text);

        // Suggestion should be empty string when not requested
        expect(data.errors[0].suggestion).toBe('');
      });
    });

    describe('files_checked in summary', () => {
      it('should report "all" when no specific files provided', async () => {
        const { safeExec } = await import('../../utils.js');
        vi.mocked(safeExec).mockResolvedValue({ stdout: '', stderr: '' });

        const result = await handleCheckTypes({});
        const data = JSON.parse(result.content[0].text);

        expect(data.summary.files_checked).toBe('all');
      });

      it('should report count when specific files provided', async () => {
        const { safeExec } = await import('../../utils.js');
        vi.mocked(safeExec).mockResolvedValue({ stdout: '', stderr: '' });

        const result = await handleCheckTypes({ files: ['a.ts', 'b.ts', 'c.ts'] });
        const data = JSON.parse(result.content[0].text);

        expect(data.summary.files_checked).toBe(3);
      });
    });
  });
});
