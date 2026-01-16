/**
 * Unit tests for explain-codebase handler
 *
 * Tests cover:
 * - Directory structure scanning
 * - Key file detection
 * - Entry point identification
 * - Architecture diagram generation
 * - Cache handling
 * - Fallback results when LLM unavailable
 * - Depth levels (shallow, medium, deep)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

// Mock modules before imports
vi.mock('fs');
vi.mock('fs/promises');
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

/**
 * Helper to create a mock child process for Claude CLI spawn.
 * This properly simulates the event-based spawn behavior.
 */
function createMockChildProcess(options: {
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  shouldError?: boolean;
  errorMessage?: string;
} = {}): ChildProcess {
  const proc = new EventEmitter() as ChildProcess;
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();

  Object.defineProperty(proc, 'stdout', { value: stdout });
  Object.defineProperty(proc, 'stderr', { value: stderr });
  proc.kill = vi.fn().mockReturnValue(true);

  // Prevent uncaught exception if no error listener is attached.
  // This is a default handler that gets called only if nothing else handles the error.
  // Real error handlers attached by the code under test will still receive the error.
  proc.on('error', () => {
    // Intentionally empty - prevents uncaught exception from EventEmitter
  });

  // Schedule events to fire after spawn returns
  setImmediate(() => {
    if (options.shouldError) {
      proc.emit('error', new Error(options.errorMessage || 'spawn ENOENT'));
    } else {
      if (options.stderr) {
        stderr.emit('data', Buffer.from(options.stderr));
      }
      if (options.stdout) {
        stdout.emit('data', Buffer.from(options.stdout));
      }
      // Emit close event with exit code
      proc.emit('close', options.exitCode ?? 0);
    }
  });

  return proc;
}

vi.mock('../../../config.js', () => ({
  PROJECT_ROOT: '/mock/project/root',
}));
vi.mock('../../../utils.js', () => ({
  success: vi.fn((data) => ({
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  })),
  error: vi.fn((msg) => ({
    content: [{ type: 'text', text: JSON.stringify({ error: msg }, null, 2) }],
    isError: true,
  })),
  readJsonFile: vi.fn(),
  fileExists: vi.fn(),
}));
vi.mock('../../../handlers/context.js', () => ({
  handleDetectStack: vi.fn(),
}));
vi.mock('../../../handlers/schema/index.js', () => ({
  handleGetApiRoutes: vi.fn(),
}));
vi.mock('../../../handlers/project/conventions.js', () => ({
  handleGetConventions: vi.fn(),
}));

import { handleExplainCodebase, ExplainCodebaseArgs } from '../../../handlers/docs/explain-codebase.js';
import { success, error, readJsonFile, fileExists } from '../../../utils.js';
import { handleDetectStack } from '../../../handlers/context.js';
import { handleGetApiRoutes } from '../../../handlers/schema/index.js';
import { handleGetConventions } from '../../../handlers/project/conventions.js';

describe('handleExplainCodebase', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Suppress console noise from LLM failures and other expected errors
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Default mock setup
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(readJsonFile).mockResolvedValue(null);
    vi.mocked(fileExists).mockResolvedValue(false);
    vi.mocked(handleDetectStack).mockResolvedValue({
      content: [{ type: 'text', text: '{}' }],
    });
    vi.mocked(handleGetApiRoutes).mockResolvedValue({
      content: [{ type: 'text', text: '{}' }],
    });
    vi.mocked(handleGetConventions).mockResolvedValue({
      content: [{ type: 'text', text: '{}' }],
    });
    vi.mocked(fsPromises.readdir).mockResolvedValue([]);
    vi.mocked(fsPromises.stat).mockResolvedValue({
      mtimeMs: Date.now(),
      size: 100,
    } as fs.Stats);
    vi.mocked(fsPromises.readFile).mockResolvedValue('');
    vi.mocked(fsPromises.writeFile).mockResolvedValue();
    vi.mocked(fsPromises.mkdir).mockResolvedValue(undefined);

    // Default spawn mock (LLM fails via spawn error, triggering fallback)
    // This properly mocks the Claude CLI spawn to fail, triggering the fallback path
    vi.mocked(spawn).mockReturnValue(createMockChildProcess({
      shouldError: true,
      errorMessage: 'spawn ENOENT',
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('argument handling', () => {
    it('should use default path when not provided', async () => {
      const args: ExplainCodebaseArgs = {};

      await handleExplainCodebase(args);

      expect(fs.existsSync).toHaveBeenCalled();
    });

    it('should use provided path', async () => {
      const args: ExplainCodebaseArgs = {
        path: 'custom/path',
      };

      await handleExplainCodebase(args);

      expect(fs.existsSync).toHaveBeenCalled();
    });

    it('should return error when path does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const args: ExplainCodebaseArgs = {
        path: '/nonexistent',
      };

      await handleExplainCodebase(args);

      expect(error).toHaveBeenCalledWith(expect.stringContaining('does not exist'));
    });
  });

  describe('depth levels', () => {
    it('should use shallow depth when specified', async () => {
      const args: ExplainCodebaseArgs = {
        depth: 'shallow',
      };

      await handleExplainCodebase(args);

      // Conventions should not be called for shallow depth
      // Deep analysis is skipped
    });

    it('should use medium depth by default', async () => {
      const args: ExplainCodebaseArgs = {};

      await handleExplainCodebase(args);

      // Conventions should be called for medium depth
      expect(handleGetConventions).toHaveBeenCalled();
    });

    it('should use deep depth when specified', async () => {
      const args: ExplainCodebaseArgs = {
        depth: 'deep',
      };

      await handleExplainCodebase(args);

      // All handlers should be called for deep depth
      expect(handleDetectStack).toHaveBeenCalled();
      expect(handleGetApiRoutes).toHaveBeenCalled();
      expect(handleGetConventions).toHaveBeenCalled();
    });
  });

  describe('cache handling', () => {
    it('should return cached result if available and valid', async () => {
      // Mock fileExists to return true for cache file
      // Use platform-agnostic check by normalizing path separators
      vi.mocked(fileExists).mockImplementation(async (p) => {
        const pathStr = String(p).replace(/\\/g, '/');
        return pathStr.includes('.goodvibes/cache/codebase-explanation.json');
      });

      // Create cached data with a computed hash
      // The hash computation: hashContent = "file:mtime:size;" for each file
      // Then simple hash: (hash << 5) - hash + charCode
      const cachedResult = {
        summary: 'Cached project summary',
        tech_stack: ['react', 'typescript'],
        architecture: {
          type: 'modular-monolith',
          description: 'Cached architecture',
          layers: ['UI', 'API'],
        },
        key_files: [{ path: 'src/index.ts', purpose: 'Entry', importance: 'critical' }],
        entry_points: ['src/index.ts'],
        main_features: ['feature1'],
        dependencies_summary: 'Cached deps',
        patterns_used: ['pattern1'],
        conventions: ['convention1'],
        cached: false, // Will be set to true when returning
        generated_at: new Date().toISOString(),
        cache_version: 1,
        project_hash: '0', // Empty hash since no files exist in mock
      };

      // Mock readFile to return cached data when cache file is read
      vi.mocked(fsPromises.readFile).mockImplementation(async (p) => {
        const pathStr = String(p).replace(/\\/g, '/');
        if (pathStr.includes('codebase-explanation.json')) {
          return JSON.stringify(cachedResult);
        }
        return '';
      });

      // Mock stat to throw for all files (results in hash '0' matching cached project_hash)
      vi.mocked(fsPromises.stat).mockRejectedValue(new Error('File not found'));

      const args: ExplainCodebaseArgs = {};

      await handleExplainCodebase(args);

      // Should return cached result with cached: true
      expect(success).toHaveBeenCalledWith(expect.objectContaining({
        summary: 'Cached project summary',
        cached: true,
      }));
    });

    it('should regenerate when refresh is true', async () => {
      const args: ExplainCodebaseArgs = {
        refresh: true,
      };

      await handleExplainCodebase(args);

      // Should not check cache when refresh is true
      expect(success).toHaveBeenCalled();
    });
  });

  describe('stack detection integration', () => {
    it('should include stack detection results', async () => {
      vi.mocked(handleDetectStack).mockResolvedValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            frontend: { framework: 'next', ui_library: 'react' },
            backend: { orm: 'prisma' },
            build: { typescript: true },
          }),
        }],
      });

      const args: ExplainCodebaseArgs = {};

      await handleExplainCodebase(args);

      expect(handleDetectStack).toHaveBeenCalled();
    });

    it('should handle stack detection errors gracefully', async () => {
      vi.mocked(handleDetectStack).mockResolvedValue({
        content: [{ type: 'text', text: 'invalid json' }],
        isError: true,
      });

      const args: ExplainCodebaseArgs = {};

      await handleExplainCodebase(args);

      // Should still complete without error
      expect(success).toHaveBeenCalled();
    });
  });

  describe('API routes integration', () => {
    it('should include API routes in analysis', async () => {
      vi.mocked(handleGetApiRoutes).mockResolvedValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            routes: [
              { method: 'GET', path: '/api/users' },
              { method: 'POST', path: '/api/users' },
            ],
          }),
        }],
      });

      const args: ExplainCodebaseArgs = {};

      await handleExplainCodebase(args);

      expect(handleGetApiRoutes).toHaveBeenCalled();
    });
  });

  describe('key file detection', () => {
    it('should identify entry points', async () => {
      vi.mocked(fsPromises.readdir).mockImplementation(async (dir) => {
        const d = String(dir);
        if (d.includes('src')) {
          return [
            { name: 'index.ts', isDirectory: () => false, isFile: () => true },
            { name: 'app.tsx', isDirectory: () => false, isFile: () => true },
          ] as unknown as fsPromises.Dirent[];
        }
        return [];
      });
      vi.mocked(fileExists).mockImplementation(async (p) => {
        return String(p).includes('src/index.ts') || String(p).includes('src/app.tsx');
      });

      const args: ExplainCodebaseArgs = {};

      await handleExplainCodebase(args);

      expect(success).toHaveBeenCalled();
    });

    it('should detect Next.js key files', async () => {
      vi.mocked(fsPromises.readdir).mockImplementation(async (dir) => {
        const d = String(dir);
        if (d.endsWith('app') || d.includes('/app')) {
          return [
            { name: 'layout.tsx', isDirectory: () => false, isFile: () => true },
            { name: 'page.tsx', isDirectory: () => false, isFile: () => true },
          ] as unknown as fsPromises.Dirent[];
        }
        return [
          { name: 'app', isDirectory: () => true, isFile: () => false },
        ] as unknown as fsPromises.Dirent[];
      });

      const args: ExplainCodebaseArgs = {};

      await handleExplainCodebase(args);

      expect(success).toHaveBeenCalled();
    });

    it('should detect configuration files', async () => {
      vi.mocked(fsPromises.readdir).mockImplementation(async () => {
        return [
          { name: 'next.config.js', isDirectory: () => false, isFile: () => true },
          { name: 'tsconfig.json', isDirectory: () => false, isFile: () => true },
          { name: 'tailwind.config.ts', isDirectory: () => false, isFile: () => true },
        ] as unknown as fsPromises.Dirent[];
      });

      const args: ExplainCodebaseArgs = {};

      await handleExplainCodebase(args);

      expect(success).toHaveBeenCalled();
    });
  });

  describe('architecture diagram generation', () => {
    it('should include architecture diagram when include_architecture is true', async () => {
      vi.mocked(handleDetectStack).mockResolvedValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            frontend: { framework: 'next', ui_library: 'react' },
            backend: { orm: 'prisma', database: 'postgresql' },
          }),
        }],
      });
      vi.mocked(handleGetApiRoutes).mockResolvedValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            routes: [{ method: 'GET', path: '/api/users' }],
          }),
        }],
      });

      const args: ExplainCodebaseArgs = {
        include_architecture: true,
      };

      await handleExplainCodebase(args);

      expect(success).toHaveBeenCalledWith(expect.objectContaining({
        architecture: expect.objectContaining({
          diagram_ascii: expect.any(String),
        }),
      }));
    });

    it('should skip architecture diagram when include_architecture is false', async () => {
      const args: ExplainCodebaseArgs = {
        include_architecture: false,
      };

      await handleExplainCodebase(args);

      expect(success).toHaveBeenCalledWith(expect.objectContaining({
        architecture: expect.not.objectContaining({
          diagram_ascii: expect.any(String),
        }),
      }));
    });
  });

  describe('fallback result', () => {
    it('should provide fallback result when LLM is unavailable', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        name: 'test-project',
        version: '1.0.0',
        description: 'A test project',
        dependencies: { react: '^18.0.0' },
      });
      vi.mocked(handleDetectStack).mockResolvedValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            frontend: { framework: 'next', ui_library: 'react' },
          }),
        }],
      });

      const args: ExplainCodebaseArgs = {};

      await handleExplainCodebase(args);

      expect(success).toHaveBeenCalledWith(expect.objectContaining({
        summary: expect.stringContaining('test-project'),
        concerns: expect.arrayContaining([
          expect.stringContaining('LLM analysis unavailable'),
        ]),
      }));
    });

    it('should determine architecture type from stack', async () => {
      vi.mocked(handleDetectStack).mockResolvedValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            frontend: { framework: 'next', ui_library: 'react' },
          }),
        }],
      });
      vi.mocked(handleGetApiRoutes).mockResolvedValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            routes: [{ method: 'GET', path: '/api/test' }],
          }),
        }],
      });

      const args: ExplainCodebaseArgs = {};

      await handleExplainCodebase(args);

      expect(success).toHaveBeenCalledWith(expect.objectContaining({
        architecture: expect.objectContaining({
          type: expect.stringMatching(/modular-monolith|spa|monolith/),
        }),
      }));
    });
  });

  describe('focus areas', () => {
    it('should accept focus areas for targeted analysis', async () => {
      const args: ExplainCodebaseArgs = {
        focus: ['auth', 'api', 'database'],
      };

      await handleExplainCodebase(args);

      expect(success).toHaveBeenCalled();
    });
  });

  describe('response format', () => {
    it('should return complete explanation result', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        name: 'test-app',
        version: '1.0.0',
        dependencies: { react: '^18.0.0' },
      });

      const args: ExplainCodebaseArgs = {};

      await handleExplainCodebase(args);

      expect(success).toHaveBeenCalledWith(expect.objectContaining({
        summary: expect.any(String),
        tech_stack: expect.any(Array),
        architecture: expect.any(Object),
        key_files: expect.any(Array),
        entry_points: expect.any(Array),
        main_features: expect.any(Array),
        dependencies_summary: expect.any(String),
        patterns_used: expect.any(Array),
        conventions: expect.any(Array),
        cached: expect.any(Boolean),
        generated_at: expect.any(String),
      }));
    });

    it('should include tech stack from detection', async () => {
      vi.mocked(handleDetectStack).mockResolvedValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            frontend: { framework: 'next', ui_library: 'react', styling: 'tailwind' },
            build: { typescript: true, bundler: 'turbopack' },
          }),
        }],
      });

      const args: ExplainCodebaseArgs = {};

      await handleExplainCodebase(args);

      expect(success).toHaveBeenCalledWith(expect.objectContaining({
        tech_stack: expect.arrayContaining(['next', 'react', 'tailwind', 'TypeScript']),
      }));
    });
  });

  describe('error handling', () => {
    it('should handle readdir errors gracefully', async () => {
      vi.mocked(fsPromises.readdir).mockRejectedValue(new Error('Permission denied'));

      const args: ExplainCodebaseArgs = {};

      await handleExplainCodebase(args);

      // Should still complete
      expect(success).toHaveBeenCalled();
    });

    it('should handle file read errors gracefully', async () => {
      vi.mocked(fsPromises.readFile).mockRejectedValue(new Error('Permission denied'));

      const args: ExplainCodebaseArgs = {};

      await handleExplainCodebase(args);

      // Should still complete
      expect(success).toHaveBeenCalled();
    });
  });
});
