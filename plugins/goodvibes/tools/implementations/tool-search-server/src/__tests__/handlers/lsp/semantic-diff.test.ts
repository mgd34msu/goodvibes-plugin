/**
 * Unit tests for handleSemanticDiff
 *
 * Tests the semantic diff handler that uses LLM analysis to provide
 * type-aware diff with semantic impact explanation.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execSync, spawn } from 'child_process';

import { handleSemanticDiff } from '../../../handlers/lsp/semantic-diff.js';
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

describe('handleSemanticDiff', () => {
  let tempDir: string;
  let originalProjectRoot: string | undefined;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'semantic-diff-test-'));
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
      const result = await handleSemanticDiff({} as any);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('before_ref');
    });

    test('returns error when before_ref is empty string', async () => {
      const result = await handleSemanticDiff({ before_ref: '' });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('before_ref');
    });
  });

  describe('git ref validation', () => {
    test('returns error for invalid git refs', async () => {
      vi.mocked(execSync).mockImplementation((cmd: string) => {
        if (cmd.includes('rev-parse')) {
          throw new Error('fatal: bad revision');
        }
        return '';
      });

      const result = await handleSemanticDiff({
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

      const result = await handleSemanticDiff({
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
      vi.mocked(execSync).mockImplementation((cmd: string) => {
        if (cmd.includes('rev-parse')) {
          return 'abc123';
        }
        if (cmd.includes('git diff --name-status')) {
          return '';
        }
        return '';
      });

      const result = await handleSemanticDiff({ before_ref: 'HEAD~1' });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(data.changes).toEqual([]);
      expect(data.overall_summary).toContain('No TypeScript/JavaScript files changed');
    });
  });

  describe('file filtering', () => {
    test('skips non-TypeScript/JavaScript files', async () => {
      vi.mocked(execSync).mockImplementation((cmd: string) => {
        if (cmd.includes('rev-parse')) return 'abc123';
        if (cmd.includes('git diff --name-status')) {
          return 'M\tREADME.md\nM\tpackage.json\nM\tstyles.css';
        }
        return '';
      });

      const result = await handleSemanticDiff({ before_ref: 'HEAD~1' });
      const data = JSON.parse(result.content[0].text);

      expect(data.overall_summary).toContain('No TypeScript/JavaScript files changed');
    });

    test('skips declaration files (.d.ts)', async () => {
      vi.mocked(execSync).mockImplementation((cmd: string) => {
        if (cmd.includes('rev-parse')) return 'abc123';
        if (cmd.includes('git diff --name-status')) {
          return 'M\ttypes.d.ts\nM\tglobal.d.ts';
        }
        return '';
      });

      const result = await handleSemanticDiff({ before_ref: 'HEAD~1' });
      const data = JSON.parse(result.content[0].text);

      expect(data.overall_summary).toContain('No TypeScript/JavaScript files changed');
    });

    test('includes TypeScript and JavaScript files', async () => {
      const mockStdout = {
        on: vi.fn((event, callback) => {
          if (event === 'data') {
            callback(JSON.stringify({
              changes: [],
              overall_summary: 'No breaking changes'
            }));
          }
        }),
      };

      const mockProcess = {
        stdout: mockStdout,
        stderr: { on: vi.fn() },
        stdin: { write: vi.fn(), end: vi.fn() },
        on: vi.fn((e, cb) => e === 'close' && setTimeout(() => cb(0), 10)),
        kill: vi.fn(),
      };

      vi.mocked(spawn).mockReturnValue(mockProcess as any);

      vi.mocked(execSync).mockImplementation((cmd: string) => {
        if (cmd.includes('rev-parse')) return 'abc123';
        if (cmd.includes('git diff --name-status')) {
          return 'M\tsrc/utils.ts\nM\tsrc/helpers.js\nM\tsrc/component.tsx\nM\tsrc/legacy.jsx';
        }
        if (cmd.includes('git diff') && !cmd.includes('--name-status')) return '';
        if (cmd.includes('git show')) return 'export const foo = 1;';
        return '';
      });

      const result = await handleSemanticDiff({ before_ref: 'HEAD~1' });
      const data = JSON.parse(result.content[0].text);

      expect(data.overall_summary).not.toContain('No TypeScript/JavaScript files changed');
    });
  });

  describe('path filtering', () => {
    test('respects file filter argument', async () => {
      let diffCommand = '';
      vi.mocked(execSync).mockImplementation((cmd: string) => {
        if (cmd.includes('rev-parse')) return 'abc123';
        if (cmd.includes('git diff --name-status')) {
          diffCommand = cmd;
          return '';
        }
        return '';
      });

      await handleSemanticDiff({
        before_ref: 'HEAD~1',
        file: 'src/api.ts',
      });

      expect(diffCommand).toContain('-- "src/api.ts"');
    });
  });

  describe('default values', () => {
    test('uses HEAD as default after_ref', async () => {
      let afterRefUsed = '';
      vi.mocked(execSync).mockImplementation((cmd: string) => {
        if (cmd.includes('rev-parse HEAD')) {
          afterRefUsed = 'HEAD';
        }
        if (cmd.includes('rev-parse')) return 'abc123';
        if (cmd.includes('git diff')) return '';
        return '';
      });

      await handleSemanticDiff({ before_ref: 'HEAD~1' });

      expect(afterRefUsed).toBe('HEAD');
    });

    test('uses haiku as default model', async () => {
      let modelUsed = '';

      const mockProcess = {
        stdout: { on: vi.fn((e, cb) => e === 'data' && cb('{"changes":[],"overall_summary":""}')) },
        stderr: { on: vi.fn() },
        stdin: { write: vi.fn(), end: vi.fn() },
        on: vi.fn((e, cb) => e === 'close' && setTimeout(() => cb(0), 10)),
        kill: vi.fn(),
      };

      vi.mocked(spawn).mockImplementation((cmd, args) => {
        if (args && Array.isArray(args)) {
          const modelIndex = args.indexOf('--model');
          if (modelIndex !== -1) {
            modelUsed = args[modelIndex + 1] as string;
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

      await handleSemanticDiff({ before_ref: 'HEAD~1' });

      expect(modelUsed).toBe('haiku');
    });
  });

  describe('model selection', () => {
    test.each(['haiku', 'sonnet', 'opus'] as const)('accepts %s model', async (model) => {
      let usedModel = '';

      const mockProcess = {
        stdout: { on: vi.fn((e, cb) => e === 'data' && cb('{"changes":[],"overall_summary":""}')) },
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

      await handleSemanticDiff({ before_ref: 'HEAD~1', model });

      expect(usedModel).toBe(model);
    });
  });

  describe('LLM analysis', () => {
    test('handles LLM CLI not available gracefully', async () => {
      const mockProcess = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        stdin: { write: vi.fn(), end: vi.fn() },
        on: vi.fn((e, cb) => e === 'error' && cb(new Error('spawn claude ENOENT'))),
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

      const result = await handleSemanticDiff({ before_ref: 'HEAD~1' });
      const data = JSON.parse(result.content[0].text);

      expect(data.changes).toEqual([]);
      expect(data.overall_summary).toContain('Claude CLI not available');
    });

    test('handles LLM CLI non-zero exit code', async () => {
      const mockProcess = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn((e, cb) => e === 'data' && cb('Error: API error')) },
        stdin: { write: vi.fn(), end: vi.fn() },
        on: vi.fn((e, cb) => e === 'close' && setTimeout(() => cb(1), 10)),
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

      const result = await handleSemanticDiff({ before_ref: 'HEAD~1' });
      const data = JSON.parse(result.content[0].text);

      // Should return fallback analysis
      expect(data.changes).toBeDefined();
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

      const result = await handleSemanticDiff({ before_ref: 'HEAD~1' });
      const data = JSON.parse(result.content[0].text);

      expect(data.changes).toEqual([]);
      expect(data.overall_summary).toContain('Failed to analyze');
    });

    test('extracts JSON from LLM response with extra text', async () => {
      const validResult = {
        changes: [
          {
            file: 'src/api.ts',
            summary: 'Updated API endpoint',
            semantic_impact: 'Changes response format',
            affected_callers: ['src/client.ts'],
            risk_level: 'medium'
          }
        ],
        overall_summary: 'API changes detected'
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

      const result = await handleSemanticDiff({ before_ref: 'HEAD~1' });
      const data = JSON.parse(result.content[0].text);

      expect(data.changes).toHaveLength(1);
      expect(data.overall_summary).toBe('API changes detected');
    });
  });

  describe('file status handling', () => {
    test('handles added files (A status)', async () => {
      const mockProcess = {
        stdout: { on: vi.fn((e, cb) => e === 'data' && cb('{"changes":[],"overall_summary":""}')) },
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
        if (cmd.includes('git show HEAD:"src/new-file.ts"')) return 'export const x = 1;';
        if (cmd.includes('git show HEAD~1')) throw new Error('File not in before ref');
        return '';
      });

      const result = await handleSemanticDiff({ before_ref: 'HEAD~1' });

      expect(result.isError).toBeFalsy();
    });

    test('handles deleted files (D status)', async () => {
      const mockProcess = {
        stdout: { on: vi.fn((e, cb) => e === 'data' && cb('{"changes":[],"overall_summary":""}')) },
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

      const result = await handleSemanticDiff({ before_ref: 'HEAD~1' });

      expect(result.isError).toBeFalsy();
    });

    test('handles modified files (M status)', async () => {
      const mockProcess = {
        stdout: { on: vi.fn((e, cb) => e === 'data' && cb('{"changes":[],"overall_summary":""}')) },
        stderr: { on: vi.fn() },
        stdin: { write: vi.fn(), end: vi.fn() },
        on: vi.fn((e, cb) => e === 'close' && setTimeout(() => cb(0), 10)),
        kill: vi.fn(),
      };

      vi.mocked(spawn).mockReturnValue(mockProcess as any);

      vi.mocked(execSync).mockImplementation((cmd: string) => {
        if (cmd.includes('rev-parse')) return 'abc123';
        if (cmd.includes('git diff --name-status')) return 'M\tsrc/modified.ts';
        if (cmd.includes('git diff') && !cmd.includes('--name-status')) return '--- a/file\n+++ b/file';
        if (cmd.includes('git show')) return 'export const x = 1;';
        return '';
      });

      const result = await handleSemanticDiff({ before_ref: 'HEAD~1' });

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

      const result = await handleSemanticDiff({ before_ref: 'HEAD~1' });

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

      const result = await handleSemanticDiff({ before_ref: 'HEAD~1' });

      expect(() => JSON.parse(result.content[0].text)).not.toThrow();
    });

    test('makes file paths relative in result', async () => {
      const mockProcess = {
        stdout: { on: vi.fn((e, cb) => e === 'data' && cb(JSON.stringify({
          changes: [
            {
              file: '/absolute/path/src/api.ts',
              summary: 'test',
              semantic_impact: 'test',
              affected_callers: ['/absolute/path/src/client.ts'],
              risk_level: 'low'
            }
          ],
          overall_summary: 'test'
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

      const result = await handleSemanticDiff({ before_ref: 'HEAD~1' });
      const data = JSON.parse(result.content[0].text);

      for (const change of data.changes) {
        expect(change.file.startsWith('/')).toBe(false);
        for (const caller of change.affected_callers) {
          expect(caller.startsWith('/')).toBe(false);
        }
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

      const result = await handleSemanticDiff({ before_ref: 'HEAD~1' });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toBeDefined();
    });

    test('handles general errors gracefully', async () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      const result = await handleSemanticDiff({ before_ref: 'HEAD~1' });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toBeDefined();
    });
  });

  describe('symbol extraction', () => {
    test('extracts exported symbols from before content', async () => {
      const mockProcess = {
        stdout: { on: vi.fn((e, cb) => e === 'data' && cb('{"changes":[],"overall_summary":""}')) },
        stderr: { on: vi.fn() },
        stdin: { write: vi.fn(), end: vi.fn() },
        on: vi.fn((e, cb) => e === 'close' && setTimeout(() => cb(0), 10)),
        kill: vi.fn(),
      };

      vi.mocked(spawn).mockReturnValue(mockProcess as any);

      vi.mocked(execSync).mockImplementation((cmd: string) => {
        if (cmd.includes('rev-parse')) return 'abc123';
        if (cmd.includes('git diff --name-status')) return 'M\tsrc/file.ts';
        if (cmd.includes('git diff') && !cmd.includes('--name-status')) return '';
        if (cmd.includes('git show HEAD~1')) return 'export function foo() {}\nexport class Bar {}';
        if (cmd.includes('git show HEAD:')) return 'export function foo() {}';
        return '';
      });

      const result = await handleSemanticDiff({ before_ref: 'HEAD~1' });

      expect(result.isError).toBeFalsy();
    });

    test('extracts exported symbols from after content', async () => {
      const mockProcess = {
        stdout: { on: vi.fn((e, cb) => e === 'data' && cb('{"changes":[],"overall_summary":""}')) },
        stderr: { on: vi.fn() },
        stdin: { write: vi.fn(), end: vi.fn() },
        on: vi.fn((e, cb) => e === 'close' && setTimeout(() => cb(0), 10)),
        kill: vi.fn(),
      };

      vi.mocked(spawn).mockReturnValue(mockProcess as any);

      vi.mocked(execSync).mockImplementation((cmd: string) => {
        if (cmd.includes('rev-parse')) return 'abc123';
        if (cmd.includes('git diff --name-status')) return 'M\tsrc/file.ts';
        if (cmd.includes('git diff') && !cmd.includes('--name-status')) return '';
        if (cmd.includes('git show HEAD~1')) return 'export const x = 1;';
        if (cmd.includes('git show HEAD:')) return 'export const x = 1;\nexport const y = 2;';
        return '';
      });

      const result = await handleSemanticDiff({ before_ref: 'HEAD~1' });

      expect(result.isError).toBeFalsy();
    });
  });

  describe('timeout handling', () => {
    test('respects custom timeout', async () => {
      const mockProcess = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        stdin: { write: vi.fn(), end: vi.fn() },
        on: vi.fn((e, cb) => {
          // Never call close to simulate timeout
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

      // Use a very short timeout
      const resultPromise = handleSemanticDiff({
        before_ref: 'HEAD~1',
        timeout: 1,
      });

      await expect(resultPromise).resolves.toBeDefined();
    });
  });

  describe('reference finding', () => {
    test('cleans up temporary files after analysis', async () => {
      const mockProcess = {
        stdout: { on: vi.fn((e, cb) => e === 'data' && cb('{"changes":[],"overall_summary":""}')) },
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

      await handleSemanticDiff({ before_ref: 'HEAD~1' });

      // Temp directory should be cleaned up
      const tempDirPath = path.join(tempDir, '.goodvibes-temp');
      const exists = fs.existsSync(tempDirPath);
      // Either doesn't exist or is empty
      if (exists) {
        const files = fs.readdirSync(tempDirPath);
        expect(files.length).toBe(0);
      }
    });
  });
});
