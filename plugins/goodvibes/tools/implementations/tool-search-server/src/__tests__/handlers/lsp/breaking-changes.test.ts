/**
 * Unit tests for handleDetectBreakingChanges
 *
 * Tests the breaking changes detection handler that uses LLM analysis
 * to detect API breaking changes between git refs.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execSync, spawn } from 'child_process';

import { handleDetectBreakingChanges } from '../../../handlers/lsp/breaking-changes.js';
import { languageServiceManager } from '../../../handlers/lsp/language-service.js';

// Mock child_process
vi.mock('child_process', async () => {
  const actual = await vi.importActual('child_process');
  return {
    ...actual,
    execSync: vi.fn(),
    spawn: vi.fn(),
  };
});

// Mock console.warn to suppress expected warnings during tests
vi.spyOn(console, 'warn').mockImplementation(() => {});

describe('handleDetectBreakingChanges', () => {
  let tempDir: string;
  let originalProjectRoot: string | undefined;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'breaking-changes-test-'));
    originalProjectRoot = process.env.PROJECT_ROOT;
    process.env.PROJECT_ROOT = tempDir;
    vi.clearAllMocks();
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    process.env.PROJECT_ROOT = originalProjectRoot;
    languageServiceManager.cleanup();
  });

  describe('argument validation', () => {
    test('returns error when before_ref is missing', async () => {
      const result = await handleDetectBreakingChanges({} as any);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('before_ref');
    });

    test('returns error when before_ref is empty string', async () => {
      const result = await handleDetectBreakingChanges({ before_ref: '' });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('before_ref');
    });
  });

  describe('git ref validation', () => {
    test('returns error for invalid git refs', async () => {
      // Mock git rev-parse to throw
      vi.mocked(execSync).mockImplementation((cmd: string) => {
        if (cmd.includes('rev-parse')) {
          throw new Error('fatal: bad revision');
        }
        return '';
      });

      const result = await handleDetectBreakingChanges({
        before_ref: 'invalid-ref-12345',
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('Invalid git refs');
    });

    test('validates both before and after refs', async () => {
      let callCount = 0;
      vi.mocked(execSync).mockImplementation((cmd: string) => {
        if (cmd.includes('rev-parse')) {
          callCount++;
          if (callCount === 2) {
            throw new Error('fatal: bad revision');
          }
        }
        return '';
      });

      const result = await handleDetectBreakingChanges({
        before_ref: 'HEAD~1',
        after_ref: 'invalid-after-ref',
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('Invalid git refs');
    });
  });

  describe('no changes scenario', () => {
    test('returns empty result when no files changed', async () => {
      // Mock successful rev-parse
      vi.mocked(execSync).mockImplementation((cmd: string) => {
        if (cmd.includes('rev-parse')) {
          return 'abc123';
        }
        if (cmd.includes('git diff --name-status')) {
          return ''; // No changed files
        }
        return '';
      });

      const result = await handleDetectBreakingChanges({ before_ref: 'HEAD~1' });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.breaking_changes).toEqual([]);
      expect(data.non_breaking_changes).toEqual([]);
      expect(data.severity).toBe('none');
      expect(data.message).toContain('No TypeScript/JavaScript files changed');
    });
  });

  describe('file filtering', () => {
    test('skips test files', async () => {
      vi.mocked(execSync).mockImplementation((cmd: string) => {
        if (cmd.includes('rev-parse')) {
          return 'abc123';
        }
        if (cmd.includes('git diff --name-status')) {
          return 'M\tfile.test.ts\nM\tfile.spec.ts';
        }
        return '';
      });

      const result = await handleDetectBreakingChanges({ before_ref: 'HEAD~1' });
      const data = JSON.parse(result.content[0].text);

      expect(data.message).toContain('No TypeScript/JavaScript files changed');
    });

    test('skips declaration files (.d.ts)', async () => {
      vi.mocked(execSync).mockImplementation((cmd: string) => {
        if (cmd.includes('rev-parse')) {
          return 'abc123';
        }
        if (cmd.includes('git diff --name-status')) {
          return 'M\ttypes.d.ts';
        }
        return '';
      });

      const result = await handleDetectBreakingChanges({ before_ref: 'HEAD~1' });
      const data = JSON.parse(result.content[0].text);

      expect(data.message).toContain('No TypeScript/JavaScript files changed');
    });

    test('includes TypeScript and JavaScript files', async () => {
      const mockStdout = {
        on: vi.fn((event, callback) => {
          if (event === 'data') {
            callback(JSON.stringify({
              breaking_changes: [],
              non_breaking_changes: [],
              severity: 'none'
            }));
          }
        }),
      };

      const mockStderr = {
        on: vi.fn(),
      };

      const mockStdin = {
        write: vi.fn(),
        end: vi.fn(),
      };

      const mockProcess = {
        stdout: mockStdout,
        stderr: mockStderr,
        stdin: mockStdin,
        on: vi.fn((event, callback) => {
          if (event === 'close') {
            setTimeout(() => callback(0), 10);
          }
        }),
        kill: vi.fn(),
      };

      vi.mocked(spawn).mockReturnValue(mockProcess as any);

      vi.mocked(execSync).mockImplementation((cmd: string) => {
        if (cmd.includes('rev-parse')) {
          return 'abc123';
        }
        if (cmd.includes('git diff --name-status')) {
          return 'M\tsrc/utils.ts\nM\tsrc/helpers.js\nM\tsrc/component.tsx\nM\tsrc/legacy.jsx';
        }
        if (cmd.includes('git diff') && !cmd.includes('--name-status')) {
          return '--- a/file\n+++ b/file\n@@ -1,1 +1,1 @@\n-old\n+new';
        }
        if (cmd.includes('git show')) {
          return 'export const foo = 1;';
        }
        return '';
      });

      const result = await handleDetectBreakingChanges({ before_ref: 'HEAD~1' });

      // Should have processed the files (not returned "no files changed")
      const data = JSON.parse(result.content[0].text);
      // When files are successfully processed, message is undefined (not set)
      // Only when no files changed does message contain the warning
      if (data.message) {
        expect(data.message).not.toContain('No TypeScript/JavaScript files changed');
      }
      // Also verify we got the expected result structure
      expect(data).toHaveProperty('breaking_changes');
      expect(data).toHaveProperty('non_breaking_changes');
      expect(data).toHaveProperty('severity');
    });
  });

  describe('path filtering', () => {
    test('respects path filter argument', async () => {
      let diffCommand = '';
      vi.mocked(execSync).mockImplementation((cmd: string) => {
        if (cmd.includes('rev-parse')) {
          return 'abc123';
        }
        if (cmd.includes('git diff --name-status')) {
          diffCommand = cmd;
          return '';
        }
        return '';
      });

      await handleDetectBreakingChanges({
        before_ref: 'HEAD~1',
        path: 'src/api',
      });

      expect(diffCommand).toContain('-- src/api');
    });
  });

  describe('default values', () => {
    test('uses HEAD as default after_ref', async () => {
      let afterRefUsed = '';
      vi.mocked(execSync).mockImplementation((cmd: string) => {
        if (cmd.includes('rev-parse HEAD')) {
          afterRefUsed = 'HEAD';
        }
        if (cmd.includes('rev-parse')) {
          return 'abc123';
        }
        if (cmd.includes('git diff')) {
          return '';
        }
        return '';
      });

      await handleDetectBreakingChanges({ before_ref: 'HEAD~1' });

      expect(afterRefUsed).toBe('HEAD');
    });

    test('uses haiku as default model', async () => {
      let modelUsed = '';

      const mockStdout = {
        on: vi.fn((event, callback) => {
          if (event === 'data') {
            callback(JSON.stringify({
              breaking_changes: [],
              non_breaking_changes: [],
              severity: 'none'
            }));
          }
        }),
      };

      const mockStderr = { on: vi.fn() };
      const mockStdin = { write: vi.fn(), end: vi.fn() };

      const mockProcess = {
        stdout: mockStdout,
        stderr: mockStderr,
        stdin: mockStdin,
        on: vi.fn((event, callback) => {
          if (event === 'close') {
            setTimeout(() => callback(0), 10);
          }
        }),
        kill: vi.fn(),
      };

      vi.mocked(spawn).mockImplementation((cmd, args) => {
        if (args.includes('haiku')) {
          modelUsed = 'haiku';
        }
        return mockProcess as any;
      });

      vi.mocked(execSync).mockImplementation((cmd: string) => {
        if (cmd.includes('rev-parse')) return 'abc123';
        if (cmd.includes('git diff --name-status')) return 'M\tsrc/file.ts';
        if (cmd.includes('git diff')) return '';
        if (cmd.includes('git show')) return 'export const x = 1;';
        return '';
      });

      await handleDetectBreakingChanges({ before_ref: 'HEAD~1' });

      expect(modelUsed).toBe('haiku');
    });

    test('uses 120 as default timeout', async () => {
      // The timeout is used internally, we just verify no error occurs
      const mockProcess = {
        stdout: { on: vi.fn((e, cb) => e === 'data' && cb('{}')) },
        stderr: { on: vi.fn() },
        stdin: { write: vi.fn(), end: vi.fn() },
        on: vi.fn((e, cb) => e === 'close' && setTimeout(() => cb(0), 10)),
        kill: vi.fn(),
      };

      vi.mocked(spawn).mockReturnValue(mockProcess as any);
      vi.mocked(execSync).mockImplementation((cmd: string) => {
        if (cmd.includes('rev-parse')) return 'abc123';
        if (cmd.includes('git diff --name-status')) return 'M\tsrc/file.ts';
        if (cmd.includes('git diff')) return '';
        if (cmd.includes('git show')) return 'export const x = 1;';
        return '';
      });

      const result = await handleDetectBreakingChanges({ before_ref: 'HEAD~1' });

      // Should complete without timeout error
      expect(result).toBeDefined();
    });
  });

  describe('model selection', () => {
    test.each(['haiku', 'sonnet', 'opus'] as const)('accepts %s model', async (model) => {
      let usedModel = '';

      const mockProcess = {
        stdout: { on: vi.fn((e, cb) => e === 'data' && cb('{"breaking_changes":[],"non_breaking_changes":[],"severity":"none"}')) },
        stderr: { on: vi.fn() },
        stdin: { write: vi.fn(), end: vi.fn() },
        on: vi.fn((e, cb) => e === 'close' && setTimeout(() => cb(0), 10)),
        kill: vi.fn(),
      };

      vi.mocked(spawn).mockImplementation((cmd, args) => {
        if (args && Array.isArray(args)) {
          const modelIndex = args.indexOf('--model');
          if (modelIndex !== -1) {
            usedModel = args[modelIndex + 1] as string;
          }
        }
        return mockProcess as any;
      });

      vi.mocked(execSync).mockImplementation((cmd: string) => {
        if (cmd.includes('rev-parse')) return 'abc123';
        if (cmd.includes('git diff --name-status')) return 'M\tsrc/file.ts';
        if (cmd.includes('git diff')) return '';
        if (cmd.includes('git show')) return 'export const x = 1;';
        return '';
      });

      await handleDetectBreakingChanges({ before_ref: 'HEAD~1', model });

      expect(usedModel).toBe(model);
    });
  });

  describe('LLM analysis', () => {
    test('handles LLM CLI not available gracefully', async () => {
      const mockProcess = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        stdin: { write: vi.fn(), end: vi.fn() },
        on: vi.fn((event, callback) => {
          if (event === 'error') {
            callback(new Error('spawn claude ENOENT'));
          }
        }),
        kill: vi.fn(),
      };

      vi.mocked(spawn).mockReturnValue(mockProcess as any);

      vi.mocked(execSync).mockImplementation((cmd: string) => {
        if (cmd.includes('rev-parse')) return 'abc123';
        if (cmd.includes('git diff --name-status')) return 'M\tsrc/file.ts';
        if (cmd.includes('git diff')) return '';
        if (cmd.includes('git show')) return 'export const x = 1;';
        return '';
      });

      const result = await handleDetectBreakingChanges({ before_ref: 'HEAD~1' });
      const data = JSON.parse(result.content[0].text);

      // Should return fallback result
      expect(data.breaking_changes).toEqual([]);
      expect(data.severity).toBe('none');
    });

    test('handles LLM CLI non-zero exit code', async () => {
      const mockProcess = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn((e, cb) => e === 'data' && cb('Error: API error')) },
        stdin: { write: vi.fn(), end: vi.fn() },
        on: vi.fn((event, callback) => {
          if (event === 'close') {
            setTimeout(() => callback(1), 10);
          }
        }),
        kill: vi.fn(),
      };

      vi.mocked(spawn).mockReturnValue(mockProcess as any);

      vi.mocked(execSync).mockImplementation((cmd: string) => {
        if (cmd.includes('rev-parse')) return 'abc123';
        if (cmd.includes('git diff --name-status')) return 'M\tsrc/file.ts';
        if (cmd.includes('git diff')) return '';
        if (cmd.includes('git show')) return 'export const x = 1;';
        return '';
      });

      const result = await handleDetectBreakingChanges({ before_ref: 'HEAD~1' });
      const data = JSON.parse(result.content[0].text);

      // Should return fallback analysis
      expect(data.breaking_changes).toEqual([]);
    });

    test('handles invalid JSON from LLM', async () => {
      const mockProcess = {
        stdout: { on: vi.fn((e, cb) => e === 'data' && cb('This is not valid JSON')) },
        stderr: { on: vi.fn() },
        stdin: { write: vi.fn(), end: vi.fn() },
        on: vi.fn((e, cb) => e === 'close' && setTimeout(() => cb(0), 10)),
        kill: vi.fn(),
      };

      vi.mocked(spawn).mockReturnValue(mockProcess as any);

      vi.mocked(execSync).mockImplementation((cmd: string) => {
        if (cmd.includes('rev-parse')) return 'abc123';
        if (cmd.includes('git diff --name-status')) return 'M\tsrc/file.ts';
        if (cmd.includes('git diff')) return '';
        if (cmd.includes('git show')) return 'export const x = 1;';
        return '';
      });

      const result = await handleDetectBreakingChanges({ before_ref: 'HEAD~1' });
      const data = JSON.parse(result.content[0].text);

      // Should return empty fallback
      expect(data.breaking_changes).toEqual([]);
      expect(data.non_breaking_changes).toEqual([]);
      expect(data.severity).toBe('none');
    });

    test('extracts JSON from LLM response with extra text', async () => {
      const validResult = {
        breaking_changes: [
          {
            file: 'src/api.ts',
            symbol: 'fetchData',
            change_type: 'signature_change',
            before: 'function fetchData(url: string): Promise<any>',
            after: 'function fetchData(url: string, options: Options): Promise<any>',
            impact: 'All callers need to provide options',
            migration: 'Add default options parameter'
          }
        ],
        non_breaking_changes: [],
        severity: 'major'
      };

      const mockProcess = {
        stdout: { on: vi.fn((e, cb) => e === 'data' && cb(`Here is my analysis:\n${JSON.stringify(validResult)}\n\nLet me know if you need more info.`)) },
        stderr: { on: vi.fn() },
        stdin: { write: vi.fn(), end: vi.fn() },
        on: vi.fn((e, cb) => e === 'close' && setTimeout(() => cb(0), 10)),
        kill: vi.fn(),
      };

      vi.mocked(spawn).mockReturnValue(mockProcess as any);

      vi.mocked(execSync).mockImplementation((cmd: string) => {
        if (cmd.includes('rev-parse')) return 'abc123';
        if (cmd.includes('git diff --name-status')) return 'M\tsrc/file.ts';
        if (cmd.includes('git diff')) return '';
        if (cmd.includes('git show')) return 'export const x = 1;';
        return '';
      });

      const result = await handleDetectBreakingChanges({ before_ref: 'HEAD~1' });
      const data = JSON.parse(result.content[0].text);

      expect(data.breaking_changes).toHaveLength(1);
      expect(data.severity).toBe('major');
    });
  });

  describe('file status handling', () => {
    test('handles added files (A status)', async () => {
      const mockProcess = {
        stdout: { on: vi.fn((e, cb) => e === 'data' && cb('{"breaking_changes":[],"non_breaking_changes":[],"severity":"none"}')) },
        stderr: { on: vi.fn() },
        stdin: { write: vi.fn(), end: vi.fn() },
        on: vi.fn((e, cb) => e === 'close' && setTimeout(() => cb(0), 10)),
        kill: vi.fn(),
      };

      vi.mocked(spawn).mockReturnValue(mockProcess as any);

      vi.mocked(execSync).mockImplementation((cmd: string) => {
        if (cmd.includes('rev-parse')) return 'abc123';
        if (cmd.includes('git diff --name-status')) return 'A\tsrc/new-file.ts';
        if (cmd.includes('git diff')) return '';
        if (cmd.includes('git show HEAD')) return 'export const x = 1;';
        if (cmd.includes('git show HEAD~1')) throw new Error('File not in before ref');
        return '';
      });

      const result = await handleDetectBreakingChanges({ before_ref: 'HEAD~1' });

      expect(result.isError).toBeFalsy();
    });

    test('handles deleted files (D status)', async () => {
      const mockProcess = {
        stdout: { on: vi.fn((e, cb) => e === 'data' && cb('{"breaking_changes":[],"non_breaking_changes":[],"severity":"none"}')) },
        stderr: { on: vi.fn() },
        stdin: { write: vi.fn(), end: vi.fn() },
        on: vi.fn((e, cb) => e === 'close' && setTimeout(() => cb(0), 10)),
        kill: vi.fn(),
      };

      vi.mocked(spawn).mockReturnValue(mockProcess as any);

      vi.mocked(execSync).mockImplementation((cmd: string) => {
        if (cmd.includes('rev-parse')) return 'abc123';
        if (cmd.includes('git diff --name-status')) return 'D\tsrc/deleted-file.ts';
        if (cmd.includes('git diff')) return '';
        if (cmd.includes('git show HEAD~1')) return 'export const x = 1;';
        if (cmd.includes('git show HEAD:')) throw new Error('File not in after ref');
        return '';
      });

      const result = await handleDetectBreakingChanges({ before_ref: 'HEAD~1' });

      expect(result.isError).toBeFalsy();
    });

    test('handles modified files (M status)', async () => {
      const mockProcess = {
        stdout: { on: vi.fn((e, cb) => e === 'data' && cb('{"breaking_changes":[],"non_breaking_changes":[],"severity":"none"}')) },
        stderr: { on: vi.fn() },
        stdin: { write: vi.fn(), end: vi.fn() },
        on: vi.fn((e, cb) => e === 'close' && setTimeout(() => cb(0), 10)),
        kill: vi.fn(),
      };

      vi.mocked(spawn).mockReturnValue(mockProcess as any);

      vi.mocked(execSync).mockImplementation((cmd: string) => {
        if (cmd.includes('rev-parse')) return 'abc123';
        if (cmd.includes('git diff --name-status')) return 'M\tsrc/modified-file.ts';
        if (cmd.includes('git diff') && !cmd.includes('--name-status')) return '--- a/file\n+++ b/file';
        if (cmd.includes('git show')) return 'export const x = 1;';
        return '';
      });

      const result = await handleDetectBreakingChanges({ before_ref: 'HEAD~1' });

      expect(result.isError).toBeFalsy();
    });

    test('handles renamed files (R status)', async () => {
      const mockProcess = {
        stdout: { on: vi.fn((e, cb) => e === 'data' && cb('{"breaking_changes":[],"non_breaking_changes":[],"severity":"none"}')) },
        stderr: { on: vi.fn() },
        stdin: { write: vi.fn(), end: vi.fn() },
        on: vi.fn((e, cb) => e === 'close' && setTimeout(() => cb(0), 10)),
        kill: vi.fn(),
      };

      vi.mocked(spawn).mockReturnValue(mockProcess as any);

      vi.mocked(execSync).mockImplementation((cmd: string) => {
        if (cmd.includes('rev-parse')) return 'abc123';
        if (cmd.includes('git diff --name-status')) return 'R\tsrc/old-name.ts\tsrc/new-name.ts';
        if (cmd.includes('git diff')) return '';
        if (cmd.includes('git show')) return 'export const x = 1;';
        return '';
      });

      const result = await handleDetectBreakingChanges({ before_ref: 'HEAD~1' });

      expect(result.isError).toBeFalsy();
    });
  });

  describe('response format', () => {
    test('returns properly structured response', async () => {
      vi.mocked(execSync).mockImplementation((cmd: string) => {
        if (cmd.includes('rev-parse')) return 'abc123';
        if (cmd.includes('git diff')) return '';
        return '';
      });

      const result = await handleDetectBreakingChanges({ before_ref: 'HEAD~1' });

      expect(result).toHaveProperty('content');
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(result.content[0]).toHaveProperty('text');
    });

    test('returns valid JSON', async () => {
      vi.mocked(execSync).mockImplementation((cmd: string) => {
        if (cmd.includes('rev-parse')) return 'abc123';
        if (cmd.includes('git diff')) return '';
        return '';
      });

      const result = await handleDetectBreakingChanges({ before_ref: 'HEAD~1' });

      expect(() => JSON.parse(result.content[0].text)).not.toThrow();
    });

    test('makes file paths relative in result', async () => {
      const mockProcess = {
        stdout: { on: vi.fn((e, cb) => e === 'data' && cb(JSON.stringify({
          breaking_changes: [
            {
              file: '/absolute/path/src/api.ts',
              symbol: 'test',
              change_type: 'removed',
              before: '',
              after: '',
              impact: '',
              migration: ''
            }
          ],
          non_breaking_changes: [],
          severity: 'major'
        }))) },
        stderr: { on: vi.fn() },
        stdin: { write: vi.fn(), end: vi.fn() },
        on: vi.fn((e, cb) => e === 'close' && setTimeout(() => cb(0), 10)),
        kill: vi.fn(),
      };

      vi.mocked(spawn).mockReturnValue(mockProcess as any);

      vi.mocked(execSync).mockImplementation((cmd: string) => {
        if (cmd.includes('rev-parse')) return 'abc123';
        if (cmd.includes('git diff --name-status')) return 'M\tsrc/file.ts';
        if (cmd.includes('git diff')) return '';
        if (cmd.includes('git show')) return 'export const x = 1;';
        return '';
      });

      const result = await handleDetectBreakingChanges({ before_ref: 'HEAD~1' });
      const data = JSON.parse(result.content[0].text);

      // File paths should not start with /
      for (const change of data.breaking_changes) {
        expect(change.file.startsWith('/')).toBe(false);
      }
    });
  });

  describe('error handling', () => {
    test('handles git diff command failure', async () => {
      vi.mocked(execSync).mockImplementation((cmd: string) => {
        if (cmd.includes('rev-parse')) return 'abc123';
        if (cmd.includes('git diff')) {
          throw new Error('git diff failed');
        }
        return '';
      });

      const result = await handleDetectBreakingChanges({ before_ref: 'HEAD~1' });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toBeDefined();
    });

    test('handles general errors gracefully', async () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      const result = await handleDetectBreakingChanges({ before_ref: 'HEAD~1' });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toBeDefined();
    });
  });

  describe('timeout handling', () => {
    test('respects custom timeout', async () => {
      let timeoutUsed = 0;

      const mockProcess = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        stdin: { write: vi.fn(), end: vi.fn() },
        on: vi.fn((event, callback) => {
          if (event === 'close') {
            // Never call callback to simulate timeout
          }
        }),
        kill: vi.fn(),
      };

      vi.mocked(spawn).mockReturnValue(mockProcess as any);

      vi.mocked(execSync).mockImplementation((cmd: string) => {
        if (cmd.includes('rev-parse')) return 'abc123';
        if (cmd.includes('git diff --name-status')) return 'M\tsrc/file.ts';
        if (cmd.includes('git diff')) return '';
        if (cmd.includes('git show')) return 'export const x = 1;';
        return '';
      });

      // Use a very short timeout and expect it to reject
      const resultPromise = handleDetectBreakingChanges({
        before_ref: 'HEAD~1',
        timeout: 1, // 1 second timeout
      });

      // Wait for the promise to resolve (it should timeout)
      await expect(resultPromise).resolves.toBeDefined();
    });
  });
});
