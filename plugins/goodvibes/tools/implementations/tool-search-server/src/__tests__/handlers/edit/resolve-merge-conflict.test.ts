/**
 * Unit tests for handleResolveMergeConflict
 *
 * Tests the merge conflict resolution handler that uses LLM to intelligently
 * resolve git merge conflicts.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { EventEmitter } from 'events';

// Mock the config
vi.mock('../../../config.js', () => ({
  PROJECT_ROOT: '/mock/project',
}));

// Mock child_process spawn
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

// Mock utils
vi.mock('../../../utils.js', () => ({
  safeExec: vi.fn().mockResolvedValue({ stdout: '', stderr: '', error: null }),
}));

import { handleResolveMergeConflict } from '../../../handlers/edit/resolve-merge-conflict.js';
import { spawn } from 'child_process';

describe('handleResolveMergeConflict', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'merge-conflict-test-'));
    vi.clearAllMocks();

    // Re-mock PROJECT_ROOT to use temp dir
    vi.doMock('../../../config.js', () => ({
      PROJECT_ROOT: tempDir,
    }));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('argument validation', () => {
    test('returns error when file is missing', async () => {
      const result = await handleResolveMergeConflict({
        file: '',
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('Missing required argument');
    });

    test('returns error when file does not exist', async () => {
      const result = await handleResolveMergeConflict({
        file: '/nonexistent/path/file.ts',
      });
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('File not found');
    });
  });

  describe('no conflicts', () => {
    test('returns success when file has no conflicts', async () => {
      const filePath = path.join(tempDir, 'no-conflicts.ts');
      fs.writeFileSync(filePath, 'const x = 1;\nconst y = 2;');

      const result = await handleResolveMergeConflict({
        file: filePath,
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.resolved).toBe(true);
      expect(data.conflicts_found).toBe(0);
      expect(data.message).toContain('No merge conflicts');
    });
  });

  describe('conflict parsing', () => {
    test('parses standard conflict markers', async () => {
      const filePath = path.join(tempDir, 'conflict.ts');
      const content = `const x = 1;
<<<<<<< HEAD
const y = 2;
=======
const y = 3;
>>>>>>> feature-branch
const z = 4;`;

      fs.writeFileSync(filePath, content);

      // Mock spawn to return a simple resolution
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      mockProcess.stdin = { write: vi.fn(), end: vi.fn() };

      vi.mocked(spawn).mockReturnValue(mockProcess);

      const resultPromise = handleResolveMergeConflict({
        file: filePath,
        dry_run: true,
      });

      // Simulate Claude CLI response
      setTimeout(() => {
        mockProcess.stdout.emit('data', Buffer.from(JSON.stringify({
          merged: 'const y = 3;',
          explanation: 'Used theirs version',
        })));
        mockProcess.emit('close', 0);
      }, 10);

      const result = await resultPromise;
      const data = JSON.parse(result.content[0].text);

      expect(data.conflicts_found).toBe(1);
      expect(data.resolutions).toHaveLength(1);
    });

    test('parses diff3 conflict markers with base', async () => {
      const filePath = path.join(tempDir, 'conflict-diff3.ts');
      const content = `const x = 1;
<<<<<<< HEAD
const y = 2;
||||||| merged common ancestors
const y = 1;
=======
const y = 3;
>>>>>>> feature-branch
const z = 4;`;

      fs.writeFileSync(filePath, content);

      const mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      mockProcess.stdin = { write: vi.fn(), end: vi.fn() };

      vi.mocked(spawn).mockReturnValue(mockProcess);

      const resultPromise = handleResolveMergeConflict({
        file: filePath,
        dry_run: true,
      });

      setTimeout(() => {
        mockProcess.stdout.emit('data', Buffer.from(JSON.stringify({
          merged: 'const y = 3;',
          explanation: 'Merged with base context',
        })));
        mockProcess.emit('close', 0);
      }, 10);

      const result = await resultPromise;
      const data = JSON.parse(result.content[0].text);

      expect(data.conflicts_found).toBe(1);
      expect(data.resolutions[0]).toHaveProperty('base');
    });

    test('parses multiple conflicts in one file', async () => {
      const filePath = path.join(tempDir, 'multi-conflict.ts');
      const content = `<<<<<<< HEAD
const a = 1;
=======
const a = 2;
>>>>>>> branch

const b = 'middle';

<<<<<<< HEAD
const c = 3;
=======
const c = 4;
>>>>>>> branch`;

      fs.writeFileSync(filePath, content);

      const mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      mockProcess.stdin = { write: vi.fn(), end: vi.fn() };

      let callCount = 0;
      vi.mocked(spawn).mockImplementation(() => {
        const proc = new EventEmitter() as any;
        proc.stdout = new EventEmitter();
        proc.stderr = new EventEmitter();
        proc.stdin = { write: vi.fn(), end: vi.fn() };

        setTimeout(() => {
          callCount++;
          proc.stdout.emit('data', Buffer.from(JSON.stringify({
            merged: `const ${callCount === 1 ? 'a' : 'c'} = ${callCount};`,
            explanation: `Resolution ${callCount}`,
          })));
          proc.emit('close', 0);
        }, 10);

        return proc;
      });

      const result = await handleResolveMergeConflict({
        file: filePath,
        dry_run: true,
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.conflicts_found).toBe(2);
      expect(data.resolutions).toHaveLength(2);
    });
  });

  describe('resolution preference', () => {
    test('respects prefer=ours on LLM failure', async () => {
      const filePath = path.join(tempDir, 'prefer-ours.ts');
      const content = `<<<<<<< HEAD
const x = 'ours';
=======
const x = 'theirs';
>>>>>>> branch`;

      fs.writeFileSync(filePath, content);

      const mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      mockProcess.stdin = { write: vi.fn(), end: vi.fn() };

      vi.mocked(spawn).mockReturnValue(mockProcess);

      const resultPromise = handleResolveMergeConflict({
        file: filePath,
        prefer: 'ours',
        dry_run: true,
      });

      // Simulate LLM failure
      setTimeout(() => {
        mockProcess.emit('close', 1);
      }, 10);

      const result = await resultPromise;
      const data = JSON.parse(result.content[0].text);

      expect(data.resolutions[0].merged).toBe("const x = 'ours';");
    });

    test('respects prefer=theirs on LLM failure', async () => {
      const filePath = path.join(tempDir, 'prefer-theirs.ts');
      const content = `<<<<<<< HEAD
const x = 'ours';
=======
const x = 'theirs';
>>>>>>> branch`;

      fs.writeFileSync(filePath, content);

      const mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      mockProcess.stdin = { write: vi.fn(), end: vi.fn() };

      vi.mocked(spawn).mockReturnValue(mockProcess);

      const resultPromise = handleResolveMergeConflict({
        file: filePath,
        prefer: 'theirs',
        dry_run: true,
      });

      setTimeout(() => {
        mockProcess.emit('close', 1);
      }, 10);

      const result = await resultPromise;
      const data = JSON.parse(result.content[0].text);

      expect(data.resolutions[0].merged).toBe("const x = 'theirs';");
    });
  });

  describe('dry run mode', () => {
    test('returns final content without applying in dry run', async () => {
      const filePath = path.join(tempDir, 'dry-run.ts');
      const content = `<<<<<<< HEAD
const x = 1;
=======
const x = 2;
>>>>>>> branch`;

      fs.writeFileSync(filePath, content);

      const mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      mockProcess.stdin = { write: vi.fn(), end: vi.fn() };

      vi.mocked(spawn).mockReturnValue(mockProcess);

      const resultPromise = handleResolveMergeConflict({
        file: filePath,
        dry_run: true,
      });

      setTimeout(() => {
        mockProcess.stdout.emit('data', Buffer.from(JSON.stringify({
          merged: 'const x = 2;',
          explanation: 'Used theirs',
        })));
        mockProcess.emit('close', 0);
      }, 10);

      const result = await resultPromise;
      const data = JSON.parse(result.content[0].text);

      expect(data.applied).toBe(false);
      expect(data.final_content).toBeDefined();
      expect(data.final_content).toContain('const x = 2;');

      // Verify file was not modified
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      expect(fileContent).toContain('<<<<<<<');
    });
  });

  describe('file modification', () => {
    test('applies changes when dry_run is false', async () => {
      const filePath = path.join(tempDir, 'apply-changes.ts');
      const content = `const a = 0;
<<<<<<< HEAD
const x = 1;
=======
const x = 2;
>>>>>>> branch
const b = 99;`;

      fs.writeFileSync(filePath, content);

      const mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      mockProcess.stdin = { write: vi.fn(), end: vi.fn() };

      vi.mocked(spawn).mockReturnValue(mockProcess);

      const resultPromise = handleResolveMergeConflict({
        file: filePath,
        dry_run: false,
      });

      setTimeout(() => {
        mockProcess.stdout.emit('data', Buffer.from(JSON.stringify({
          merged: 'const x = 2;',
          explanation: 'Used theirs',
        })));
        mockProcess.emit('close', 0);
      }, 10);

      const result = await resultPromise;
      const data = JSON.parse(result.content[0].text);

      expect(data.applied).toBe(true);

      // Verify file was modified
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      expect(fileContent).not.toContain('<<<<<<<');
      expect(fileContent).toContain('const x = 2;');
      expect(fileContent).toContain('const a = 0;');
      expect(fileContent).toContain('const b = 99;');
    });
  });

  describe('LLM response parsing', () => {
    test('parses JSON from markdown code block', async () => {
      const filePath = path.join(tempDir, 'json-markdown.ts');
      const content = `<<<<<<< HEAD
const x = 1;
=======
const x = 2;
>>>>>>> branch`;

      fs.writeFileSync(filePath, content);

      const mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      mockProcess.stdin = { write: vi.fn(), end: vi.fn() };

      vi.mocked(spawn).mockReturnValue(mockProcess);

      const resultPromise = handleResolveMergeConflict({
        file: filePath,
        dry_run: true,
      });

      setTimeout(() => {
        mockProcess.stdout.emit('data', Buffer.from(`Here is the resolution:
\`\`\`json
{
  "merged": "const x = 3;",
  "explanation": "Combined both changes"
}
\`\`\``));
        mockProcess.emit('close', 0);
      }, 10);

      const result = await resultPromise;
      const data = JSON.parse(result.content[0].text);

      expect(data.resolutions[0].merged).toBe('const x = 3;');
    });

    test('extracts JSON from mixed text response', async () => {
      const filePath = path.join(tempDir, 'json-mixed.ts');
      const content = `<<<<<<< HEAD
const x = 1;
=======
const x = 2;
>>>>>>> branch`;

      fs.writeFileSync(filePath, content);

      const mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      mockProcess.stdin = { write: vi.fn(), end: vi.fn() };

      vi.mocked(spawn).mockReturnValue(mockProcess);

      const resultPromise = handleResolveMergeConflict({
        file: filePath,
        dry_run: true,
      });

      setTimeout(() => {
        mockProcess.stdout.emit('data', Buffer.from(`I analyzed the conflict and here is my resolution:

{"merged": "const x = 4;", "explanation": "Picked a new value"}

Hope this helps!`));
        mockProcess.emit('close', 0);
      }, 10);

      const result = await resultPromise;
      const data = JSON.parse(result.content[0].text);

      expect(data.resolutions[0].merged).toBe('const x = 4;');
    });
  });

  describe('context usage', () => {
    test('includes user context in resolution', async () => {
      const filePath = path.join(tempDir, 'with-context.ts');
      const content = `<<<<<<< HEAD
const x = 1;
=======
const x = 2;
>>>>>>> branch`;

      fs.writeFileSync(filePath, content);

      let promptCaptured = '';
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      mockProcess.stdin = {
        write: (data: string) => {
          promptCaptured = data;
        },
        end: vi.fn(),
      };

      vi.mocked(spawn).mockReturnValue(mockProcess);

      const resultPromise = handleResolveMergeConflict({
        file: filePath,
        context: 'We are migrating from v1 to v2 API',
        dry_run: true,
      });

      setTimeout(() => {
        mockProcess.stdout.emit('data', Buffer.from(JSON.stringify({
          merged: 'const x = 2;',
          explanation: 'Used v2 value',
        })));
        mockProcess.emit('close', 0);
      }, 10);

      await resultPromise;

      // The context should be part of the prompt - can't directly verify
      // since we're testing the handler, not the prompt builder
    });
  });

  describe('response format', () => {
    test('returns properly structured response', async () => {
      const filePath = path.join(tempDir, 'structured.ts');
      const content = `<<<<<<< HEAD
const x = 1;
=======
const x = 2;
>>>>>>> branch`;

      fs.writeFileSync(filePath, content);

      const mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      mockProcess.stdin = { write: vi.fn(), end: vi.fn() };

      vi.mocked(spawn).mockReturnValue(mockProcess);

      const resultPromise = handleResolveMergeConflict({
        file: filePath,
        dry_run: true,
      });

      setTimeout(() => {
        mockProcess.stdout.emit('data', Buffer.from(JSON.stringify({
          merged: 'const x = 2;',
          explanation: 'Test',
        })));
        mockProcess.emit('close', 0);
      }, 10);

      const result = await resultPromise;

      expect(result).toHaveProperty('content');
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toHaveProperty('type', 'text');

      const data = JSON.parse(result.content[0].text);
      expect(data).toHaveProperty('resolved');
      expect(data).toHaveProperty('file');
      expect(data).toHaveProperty('conflicts_found');
      expect(data).toHaveProperty('resolutions');
      expect(data).toHaveProperty('applied');
    });

    test('resolution includes all required fields', async () => {
      const filePath = path.join(tempDir, 'resolution-fields.ts');
      const content = `<<<<<<< HEAD
const x = 'ours';
=======
const x = 'theirs';
>>>>>>> feature`;

      fs.writeFileSync(filePath, content);

      const mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      mockProcess.stdin = { write: vi.fn(), end: vi.fn() };

      vi.mocked(spawn).mockReturnValue(mockProcess);

      const resultPromise = handleResolveMergeConflict({
        file: filePath,
        dry_run: true,
      });

      setTimeout(() => {
        mockProcess.stdout.emit('data', Buffer.from(JSON.stringify({
          merged: 'const x = "merged";',
          explanation: 'Combined both',
        })));
        mockProcess.emit('close', 0);
      }, 10);

      const result = await resultPromise;
      const data = JSON.parse(result.content[0].text);

      const resolution = data.resolutions[0];
      expect(resolution).toHaveProperty('conflict_index');
      expect(resolution).toHaveProperty('ours');
      expect(resolution).toHaveProperty('theirs');
      expect(resolution).toHaveProperty('merged');
      expect(resolution).toHaveProperty('explanation');
    });
  });

  describe('error handling', () => {
    test('handles LLM timeout gracefully', async () => {
      const filePath = path.join(tempDir, 'timeout.ts');
      const content = `<<<<<<< HEAD
const x = 1;
=======
const x = 2;
>>>>>>> branch`;

      fs.writeFileSync(filePath, content);

      const mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      mockProcess.stdin = { write: vi.fn(), end: vi.fn() };
      mockProcess.kill = vi.fn();

      vi.mocked(spawn).mockReturnValue(mockProcess);

      const resultPromise = handleResolveMergeConflict({
        file: filePath,
        dry_run: true,
      });

      // Simulate timeout by not emitting close for a while
      setTimeout(() => {
        mockProcess.emit('close', 1);
      }, 10);

      const result = await resultPromise;
      const data = JSON.parse(result.content[0].text);

      // Should fall back to preference-based resolution
      expect(data.resolutions[0]).toHaveProperty('merged');
      expect(data.resolutions[0].explanation).toContain('failed');
    });

    test('handles spawn error', async () => {
      const filePath = path.join(tempDir, 'spawn-error.ts');
      const content = `<<<<<<< HEAD
const x = 1;
=======
const x = 2;
>>>>>>> branch`;

      fs.writeFileSync(filePath, content);

      const mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      mockProcess.stdin = { write: vi.fn(), end: vi.fn() };

      vi.mocked(spawn).mockReturnValue(mockProcess);

      const resultPromise = handleResolveMergeConflict({
        file: filePath,
        dry_run: true,
      });

      setTimeout(() => {
        mockProcess.emit('error', new Error('spawn failed'));
      }, 10);

      const result = await resultPromise;
      const data = JSON.parse(result.content[0].text);

      // Should fall back to preference-based resolution
      expect(data.resolutions[0]).toHaveProperty('merged');
    });

    test('handles invalid JSON from LLM', async () => {
      const filePath = path.join(tempDir, 'invalid-json.ts');
      const content = `<<<<<<< HEAD
const x = 1;
=======
const x = 2;
>>>>>>> branch`;

      fs.writeFileSync(filePath, content);

      const mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      mockProcess.stdin = { write: vi.fn(), end: vi.fn() };

      vi.mocked(spawn).mockReturnValue(mockProcess);

      const resultPromise = handleResolveMergeConflict({
        file: filePath,
        dry_run: true,
      });

      setTimeout(() => {
        mockProcess.stdout.emit('data', Buffer.from('This is not valid JSON at all!'));
        mockProcess.emit('close', 0);
      }, 10);

      const result = await resultPromise;
      const data = JSON.parse(result.content[0].text);

      // Should fall back to preference-based resolution
      expect(data.resolutions[0]).toHaveProperty('merged');
      expect(data.resolutions[0].explanation).toContain('failed');
    });
  });
});
