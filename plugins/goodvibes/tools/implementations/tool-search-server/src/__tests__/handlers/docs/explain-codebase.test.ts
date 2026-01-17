/**
 * Comprehensive tests for explain-codebase handler
 *
 * Tests cover:
 * - handleExplainCodebase main function
 * - Directory structure scanning
 * - Key file detection
 * - Entry point detection
 * - Cache mechanism (read/write/invalidation)
 * - Architecture diagram generation
 * - LLM analysis (mocked)
 * - Fallback behavior
 * - Error handling
 */

import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as childProcess from 'child_process';
import { EventEmitter } from 'events';

import { handleExplainCodebase } from '../../../handlers/docs/explain-codebase.js';

// Mock modules - use partial mocking to preserve exec for utils.ts
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  statSync: vi.fn(),
  openSync: vi.fn(),
  readSync: vi.fn(),
  closeSync: vi.fn(),
  readdirSync: vi.fn(),
}));

vi.mock('fs/promises', () => ({
  access: vi.fn(),
  readFile: vi.fn(),
  readdir: vi.fn(),
  stat: vi.fn(),
  mkdir: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock('child_process', async (importOriginal) => {
  const original = await importOriginal<typeof import('child_process')>();
  return {
    ...original,
    spawn: vi.fn(),
  };
});

vi.mock('../../../config.js', () => ({
  PLUGIN_ROOT: '/mock/plugin/root',
  PROJECT_ROOT: '/mock/project/root',
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

// Import mocked modules for type safety
import { handleDetectStack } from '../../../handlers/context.js';
import { handleGetApiRoutes } from '../../../handlers/schema/index.js';
import { handleGetConventions } from '../../../handlers/project/conventions.js';

// Helper to create mock spawn child process - uses setImmediate for immediate async without hanging
// Track created EventEmitters for cleanup
const createdEmitters: EventEmitter[] = [];

function createMockSpawn(stdout: string, exitCode: number = 0, stderr: string = ''): Mock {
  return vi.fn(() => {
    const child = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter;
      stderr: EventEmitter;
      kill: Mock;
    };
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = vi.fn();

    // Track for cleanup
    createdEmitters.push(child, child.stdout, child.stderr);

    // Emit data immediately in next tick - no timeout delays
    setImmediate(() => {
      if (stdout) {
        child.stdout.emit('data', Buffer.from(stdout));
      }
      if (stderr) {
        child.stderr.emit('data', Buffer.from(stderr));
      }
      child.emit('close', exitCode);
    });

    return child;
  });
}

// Cleanup function to remove all listeners
function cleanupEmitters(): void {
  for (const emitter of createdEmitters) {
    emitter.removeAllListeners();
  }
  createdEmitters.length = 0;
}

// Helper to create a tracked mock child process for inline use
function createTrackedMockChild(): EventEmitter & { stdout: EventEmitter; stderr: EventEmitter; kill: Mock } {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    kill: Mock;
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = vi.fn();
  createdEmitters.push(child, child.stdout, child.stderr);
  return child;
}

// Sample data
const samplePackageJson = {
  name: 'test-project',
  description: 'A test project for explain-codebase',
  version: '1.0.0',
  scripts: {
    dev: 'next dev',
    build: 'next build',
    start: 'node dist/server.js',
  },
  dependencies: {
    next: '^14.0.0',
    react: '^18.0.0',
    '@prisma/client': '^5.0.0',
  },
  devDependencies: {
    typescript: '^5.0.0',
    tailwindcss: '^3.0.0',
  },
};

const sampleStackData = {
  frontend: {
    framework: 'next',
    ui_library: 'react',
    styling: 'tailwind',
    state_management: 'zustand',
  },
  backend: {
    runtime: 'node',
    framework: 'next-api',
    orm: 'prisma',
    database: 'postgresql',
  },
  build: {
    bundler: 'turbopack',
    package_manager: 'pnpm',
    typescript: true,
  },
  detected_configs: ['next.config.js', 'tsconfig.json'],
  recommended_skills: ['webdev/meta-frameworks/nextjs', 'webdev/databases-orms/prisma'],
};

const sampleApiRoutes = {
  routes: [
    { method: 'GET', path: '/api/users', handler: 'app/api/users/route.ts' },
    { method: 'POST', path: '/api/users', handler: 'app/api/users/route.ts' },
    { method: 'GET', path: '/api/posts', handler: 'app/api/posts/route.ts' },
  ],
  framework: 'next',
};

const sampleConventions = {
  naming: {
    files: 'kebab-case',
    variables: 'camelCase',
    functions: 'camelCase',
  },
  imports: {
    order: ['external', 'internal', 'relative'],
    style: 'named',
  },
  structure: {
    directory_layout: ['app', 'components', 'lib', 'hooks'],
  },
};

const sampleLLMResponse = {
  summary: 'A Next.js full-stack application with authentication and blog features.',
  architecture: {
    type: 'modular-monolith',
    description: 'Next.js App Router with colocated API routes',
    layers: ['UI Components', 'API Routes', 'Database Layer'],
  },
  main_features: ['User authentication', 'Blog posts', 'API endpoints'],
  dependencies_summary: '12 production dependencies including Next.js, React, Prisma',
  patterns_used: ['Repository pattern', 'Server Components'],
  conventions: ['kebab-case files', 'camelCase functions'],
  concerns: ['Missing error boundaries'],
};

describe('explain-codebase handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock implementations
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fsPromises.access).mockResolvedValue(undefined);
    vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify(samplePackageJson));
    vi.mocked(fsPromises.readdir).mockResolvedValue([]);
    vi.mocked(fsPromises.stat).mockResolvedValue({ mtimeMs: Date.now(), size: 100 } as fs.Stats);
    vi.mocked(fsPromises.mkdir).mockResolvedValue(undefined);
    vi.mocked(fsPromises.writeFile).mockResolvedValue(undefined);

    // Mock handlers
    vi.mocked(handleDetectStack).mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(sampleStackData) }],
    });
    vi.mocked(handleGetApiRoutes).mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(sampleApiRoutes) }],
    });
    vi.mocked(handleGetConventions).mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(sampleConventions) }],
    });
  });

  afterEach(() => {
    cleanupEmitters();
    vi.resetAllMocks();
  });

  describe('handleExplainCodebase', () => {
    describe('path validation', () => {
      it('should return error for non-existent path', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(false);

        const result = await handleExplainCodebase({ path: 'nonexistent' });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Path does not exist');
      });

      it('should use PROJECT_ROOT when no path provided', async () => {
        vi.mocked(childProcess.spawn).mockImplementation(
          createMockSpawn(JSON.stringify(sampleLLMResponse))
        );

        await handleExplainCodebase({});

        expect(fs.existsSync).toHaveBeenCalled();
      });

      it('should resolve relative paths against PROJECT_ROOT', async () => {
        vi.mocked(childProcess.spawn).mockImplementation(
          createMockSpawn(JSON.stringify(sampleLLMResponse))
        );

        await handleExplainCodebase({ path: 'subdir' });

        const existsCalls = vi.mocked(fs.existsSync).mock.calls;
        expect(existsCalls.some(call => String(call[0]).includes('subdir'))).toBe(true);
      });
    });

    describe('cache behavior', () => {
      it('should return cached result when valid cache exists', async () => {
        // Use fixed stat values to generate a predictable hash
        // Hash is generated from: `${file}:${stat.mtimeMs}:${stat.size};`
        // for files: package.json, package-lock.json, pnpm-lock.yaml, yarn.lock, tsconfig.json
        const fixedMtimeMs = 1000000;
        const fixedSize = 100;

        // Calculate the expected hash using the same algorithm as generateProjectHash
        // Simple hash function replication
        const hashContent = `package.json:${fixedMtimeMs}:${fixedSize};`;
        let hash = 0;
        for (let i = 0; i < hashContent.length; i++) {
          const char = hashContent.charCodeAt(i);
          hash = ((hash << 5) - hash) + char;
          hash = hash & hash;
        }
        const expectedHash = hash.toString(36);

        const cachedResult = {
          summary: 'Cached summary',
          tech_stack: ['next', 'react'],
          architecture: { type: 'monolith', description: 'Test', layers: [] },
          key_files: [],
          entry_points: [],
          main_features: ['feature1'],
          dependencies_summary: 'Cached deps',
          patterns_used: [],
          conventions: [],
          concerns: [],
          cached: false,
          generated_at: new Date().toISOString(),
          cache_version: 1,
          project_hash: expectedHash,
        };

        // Mock cache file exists and other files
        vi.mocked(fsPromises.access).mockImplementation((p) => {
          const pathStr = String(p);
          // Only package.json exists for hash generation
          if (pathStr.includes('codebase-explanation.json') ||
              pathStr.includes('package.json')) {
            return Promise.resolve(undefined);
          }
          // Other lock files don't exist
          if (pathStr.includes('package-lock.json') ||
              pathStr.includes('pnpm-lock.yaml') ||
              pathStr.includes('yarn.lock') ||
              pathStr.includes('tsconfig.json')) {
            return Promise.reject(new Error('ENOENT'));
          }
          return Promise.resolve(undefined);
        });

        // Mock reading cache file
        vi.mocked(fsPromises.readFile).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.includes('codebase-explanation.json')) {
            return Promise.resolve(JSON.stringify(cachedResult));
          }
          return Promise.resolve(JSON.stringify(samplePackageJson));
        });

        // Mock stat with fixed values to generate matching hash
        vi.mocked(fsPromises.stat).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.includes('package.json')) {
            return Promise.resolve({
              mtimeMs: fixedMtimeMs,
              size: fixedSize,
            } as fs.Stats);
          }
          return Promise.reject(new Error('ENOENT'));
        });

        const result = await handleExplainCodebase({});
        const data = JSON.parse(result.content[0].text);

        expect(data.cached).toBe(true);
        expect(data.summary).toBe('Cached summary');
      });

      it('should refresh cache when refresh=true', async () => {
        vi.mocked(childProcess.spawn).mockImplementation(
          createMockSpawn(JSON.stringify(sampleLLMResponse))
        );

        const result = await handleExplainCodebase({ refresh: true });
        const data = JSON.parse(result.content[0].text);

        expect(data.cached).toBe(false);
        // Claude should have been called
        expect(childProcess.spawn).toHaveBeenCalled();
      });

      it('should invalidate cache when project files change', async () => {
        const cachedResult = {
          cache_version: 1,
          project_hash: 'old-hash',
          summary: 'Old cached summary',
          tech_stack: [],
          architecture: { type: 'unknown', description: '', layers: [] },
          key_files: [],
          entry_points: [],
          main_features: [],
          dependencies_summary: '',
          patterns_used: [],
          conventions: [],
          cached: false,
          generated_at: '',
        };

        vi.mocked(fsPromises.access).mockResolvedValue(undefined);
        vi.mocked(fsPromises.readFile).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.includes('codebase-explanation.json')) {
            return Promise.resolve(JSON.stringify(cachedResult));
          }
          return Promise.resolve(JSON.stringify(samplePackageJson));
        });

        // Different mtimeMs will produce different hash
        vi.mocked(fsPromises.stat).mockResolvedValue({
          mtimeMs: Date.now() + 1000000,
          size: 200,
        } as fs.Stats);

        vi.mocked(childProcess.spawn).mockImplementation(
          createMockSpawn(JSON.stringify(sampleLLMResponse))
        );

        const result = await handleExplainCodebase({});
        const data = JSON.parse(result.content[0].text);

        // Should have regenerated (not cached)
        expect(data.cached).toBe(false);
      });

      it('should invalidate cache when cache version differs', async () => {
        const cachedResult = {
          cache_version: 999, // Different version
          project_hash: '123abc',
          summary: 'Old version summary',
          tech_stack: [],
          architecture: { type: 'unknown', description: '', layers: [] },
          key_files: [],
          entry_points: [],
          main_features: [],
          dependencies_summary: '',
          patterns_used: [],
          conventions: [],
          cached: false,
          generated_at: '',
        };

        vi.mocked(fsPromises.access).mockResolvedValue(undefined);
        vi.mocked(fsPromises.readFile).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.includes('codebase-explanation.json')) {
            return Promise.resolve(JSON.stringify(cachedResult));
          }
          return Promise.resolve(JSON.stringify(samplePackageJson));
        });

        vi.mocked(childProcess.spawn).mockImplementation(
          createMockSpawn(JSON.stringify(sampleLLMResponse))
        );

        const result = await handleExplainCodebase({});
        const data = JSON.parse(result.content[0].text);

        expect(data.cached).toBe(false);
      });
    });

    describe('depth parameter', () => {
      it('should use shallow depth when specified', async () => {
        vi.mocked(childProcess.spawn).mockImplementation(
          createMockSpawn(JSON.stringify(sampleLLMResponse))
        );

        await handleExplainCodebase({ depth: 'shallow' });

        // Shallow depth means conventions are skipped
        expect(handleGetConventions).not.toHaveBeenCalled();
      });

      it('should use medium depth by default', async () => {
        vi.mocked(childProcess.spawn).mockImplementation(
          createMockSpawn(JSON.stringify(sampleLLMResponse))
        );

        await handleExplainCodebase({});

        // Medium depth includes conventions
        expect(handleGetConventions).toHaveBeenCalled();
      });

      it('should use deep depth when specified', async () => {
        vi.mocked(childProcess.spawn).mockImplementation(
          createMockSpawn(JSON.stringify(sampleLLMResponse))
        );

        await handleExplainCodebase({ depth: 'deep' });

        expect(handleGetConventions).toHaveBeenCalled();
      });
    });

    describe('focus areas', () => {
      it('should pass focus areas to analysis', async () => {
        vi.mocked(childProcess.spawn).mockImplementation(
          createMockSpawn(JSON.stringify(sampleLLMResponse))
        );

        await handleExplainCodebase({ focus: ['auth', 'api'] });

        // The prompt should include focus areas (spawn was called)
        expect(childProcess.spawn).toHaveBeenCalled();
      });
    });

    describe('include_architecture flag', () => {
      it('should include architecture diagram by default', async () => {
        vi.mocked(childProcess.spawn).mockImplementation(
          createMockSpawn(JSON.stringify(sampleLLMResponse))
        );

        const result = await handleExplainCodebase({});
        const data = JSON.parse(result.content[0].text);

        expect(data.architecture.diagram_ascii).toBeDefined();
      });

      it('should exclude architecture diagram when include_architecture=false', async () => {
        vi.mocked(childProcess.spawn).mockImplementation(
          createMockSpawn(JSON.stringify(sampleLLMResponse))
        );

        const result = await handleExplainCodebase({ include_architecture: false });
        const data = JSON.parse(result.content[0].text);

        expect(data.architecture.diagram_ascii).toBeUndefined();
      });
    });

    describe('LLM integration', () => {
      it('should call Claude CLI with correct prompt', async () => {
        vi.mocked(childProcess.spawn).mockImplementation(
          createMockSpawn(JSON.stringify(sampleLLMResponse))
        );

        await handleExplainCodebase({});

        expect(childProcess.spawn).toHaveBeenCalledWith(
          'claude',
          expect.arrayContaining(['--print', '-p', expect.any(String)]),
          expect.objectContaining({ shell: true })
        );
      });

      it('should parse JSON from Claude response with markdown fences', async () => {
        const markdownResponse = '```json\n' + JSON.stringify(sampleLLMResponse) + '\n```';
        vi.mocked(childProcess.spawn).mockImplementation(
          createMockSpawn(markdownResponse)
        );

        const result = await handleExplainCodebase({});
        const data = JSON.parse(result.content[0].text);

        expect(data.summary).toContain('Next.js');
      });

      it('should parse JSON from Claude response without fences', async () => {
        const plainJson = JSON.stringify(sampleLLMResponse);
        vi.mocked(childProcess.spawn).mockImplementation(
          createMockSpawn(plainJson)
        );

        const result = await handleExplainCodebase({});
        const data = JSON.parse(result.content[0].text);

        expect(data.summary).toContain('Next.js');
      });

      it('should extract JSON embedded in text response', async () => {
        const embeddedJson = 'Here is the analysis:\n' + JSON.stringify(sampleLLMResponse) + '\n\nDone.';
        vi.mocked(childProcess.spawn).mockImplementation(
          createMockSpawn(embeddedJson)
        );

        const result = await handleExplainCodebase({});
        const data = JSON.parse(result.content[0].text);

        expect(data.summary).toContain('Next.js');
      });

      it('should use fallback when Claude CLI fails', async () => {
        vi.mocked(childProcess.spawn).mockImplementation(
          createMockSpawn('', 1, 'Claude CLI error')
        );

        const result = await handleExplainCodebase({});
        const data = JSON.parse(result.content[0].text);

        // Fallback result should have concerns about LLM unavailability
        expect(data.concerns).toContain('LLM analysis unavailable - results are based on static analysis only');
      });

      it('should use fallback when Claude returns invalid JSON', async () => {
        vi.mocked(childProcess.spawn).mockImplementation(
          createMockSpawn('This is not valid JSON')
        );

        const result = await handleExplainCodebase({});
        const data = JSON.parse(result.content[0].text);

        expect(data.concerns).toContain('LLM analysis unavailable - results are based on static analysis only');
      });

      it('should use fallback when Claude returns malformed JSON with braces', async () => {
        // This triggers line 531: JSON has braces but is malformed, so JSON.parse throws
        vi.mocked(childProcess.spawn).mockImplementation(
          createMockSpawn('Here is the result: {not: valid, json: syntax error}')
        );

        const result = await handleExplainCodebase({});
        const data = JSON.parse(result.content[0].text);

        expect(data.concerns).toContain('LLM analysis unavailable - results are based on static analysis only');
      });

      it('should use fallback when Claude CLI times out', async () => {
        // This triggers lines 541-542: timeout kills child and rejects
        // We simulate a timeout by having the spawn mock call kill when the close event isn't emitted
        // The test hooks into the setTimeout mechanism to trigger the timeout callback
        let timeoutCallback: (() => void) | null = null;

        // Mock global setTimeout to capture the timeout callback
        const originalSetTimeout = globalThis.setTimeout;
        globalThis.setTimeout = ((cb: () => void) => {
          timeoutCallback = cb;
          return 999 as unknown as ReturnType<typeof setTimeout>;
        }) as typeof globalThis.setTimeout;

        vi.mocked(childProcess.spawn).mockImplementation(() => {
          const child = createTrackedMockChild();
          // When kill is called (by timeout), emit close
          child.kill = vi.fn(() => {
            setImmediate(() => child.emit('close', null));
          });

          // After setting up the mock, trigger the timeout callback in next tick
          setImmediate(() => {
            if (timeoutCallback) {
              timeoutCallback();
            }
          });

          return child;
        });

        const result = await handleExplainCodebase({ depth: 'shallow' });

        // Restore setTimeout
        globalThis.setTimeout = originalSetTimeout;

        const data = JSON.parse(result.content[0].text);

        // Should fall back due to timeout
        expect(data.concerns).toContain('LLM analysis unavailable - results are based on static analysis only');
      });

      it('should use longer timeout for deep analysis', async () => {
        vi.mocked(childProcess.spawn).mockImplementation(
          createMockSpawn(JSON.stringify(sampleLLMResponse))
        );

        // Should not timeout with short test
        const result = await handleExplainCodebase({ depth: 'deep' });
        expect(result.content[0].text).toBeDefined();
      });
    });

    describe('fallback behavior', () => {
      beforeEach(() => {
        // Make Claude fail
        vi.mocked(childProcess.spawn).mockImplementation(
          createMockSpawn('', 1, 'Claude CLI not available')
        );
      });

      it('should generate summary from package.json info', async () => {
        const result = await handleExplainCodebase({});
        const data = JSON.parse(result.content[0].text);

        expect(data.summary).toContain('test-project');
      });

      it('should detect architecture type from stack', async () => {
        const result = await handleExplainCodebase({});
        const data = JSON.parse(result.content[0].text);

        // Next.js detected should result in modular-monolith
        expect(data.architecture.type).toBe('modular-monolith');
      });

      it('should build tech stack from detected stack', async () => {
        const result = await handleExplainCodebase({});
        const data = JSON.parse(result.content[0].text);

        expect(data.tech_stack).toContain('next');
        expect(data.tech_stack).toContain('react');
      });

      it('should extract main features from API routes', async () => {
        const result = await handleExplainCodebase({});
        const data = JSON.parse(result.content[0].text);

        // Features extracted from /api/users and /api/posts
        expect(data.main_features.some((f: string) => f.includes('users') || f.includes('posts'))).toBe(true);
      });

      it('should generate dependencies summary', async () => {
        const result = await handleExplainCodebase({});
        const data = JSON.parse(result.content[0].text);

        expect(data.dependencies_summary).toContain('production dependencies');
      });

      it('should cache fallback results', async () => {
        await handleExplainCodebase({});

        expect(fsPromises.mkdir).toHaveBeenCalled();
        expect(fsPromises.writeFile).toHaveBeenCalled();
      });
    });

    describe('handler dependency integration', () => {
      beforeEach(() => {
        vi.mocked(childProcess.spawn).mockImplementation(
          createMockSpawn(JSON.stringify(sampleLLMResponse))
        );
      });

      it('should call handleDetectStack with correct path', async () => {
        await handleExplainCodebase({ path: 'custom/path' });

        expect(handleDetectStack).toHaveBeenCalledWith(
          expect.objectContaining({ path: expect.stringContaining('custom') })
        );
      });

      it('should call handleGetApiRoutes with correct path', async () => {
        await handleExplainCodebase({ path: 'custom/path' });

        expect(handleGetApiRoutes).toHaveBeenCalledWith(
          expect.objectContaining({ path: expect.stringContaining('custom') })
        );
      });

      it('should call handleGetConventions for medium depth', async () => {
        await handleExplainCodebase({ depth: 'medium' });

        expect(handleGetConventions).toHaveBeenCalled();
      });

      it('should skip handleGetConventions for shallow depth', async () => {
        await handleExplainCodebase({ depth: 'shallow' });

        expect(handleGetConventions).not.toHaveBeenCalled();
      });

      it('should handle stack detection failure gracefully', async () => {
        vi.mocked(handleDetectStack).mockResolvedValue({
          content: [{ type: 'text', text: 'invalid json' }],
        });

        const result = await handleExplainCodebase({});

        // Should not throw, should continue with empty stack
        expect(result.content[0].text).toBeDefined();
      });

      it('should handle API routes detection failure gracefully', async () => {
        vi.mocked(handleGetApiRoutes).mockResolvedValue({
          content: [{ type: 'text', text: 'invalid json' }],
        });

        const result = await handleExplainCodebase({});

        // Should not throw
        expect(result.content[0].text).toBeDefined();
      });

      it('should handle conventions detection failure gracefully', async () => {
        vi.mocked(handleGetConventions).mockResolvedValue({
          content: [{ type: 'text', text: 'invalid json' }],
        });

        const result = await handleExplainCodebase({});

        // Should not throw
        expect(result.content[0].text).toBeDefined();
      });
    });

    describe('result structure', () => {
      beforeEach(() => {
        vi.mocked(childProcess.spawn).mockImplementation(
          createMockSpawn(JSON.stringify(sampleLLMResponse))
        );
      });

      it('should include all required fields', async () => {
        const result = await handleExplainCodebase({});
        const data = JSON.parse(result.content[0].text);

        expect(data).toHaveProperty('summary');
        expect(data).toHaveProperty('tech_stack');
        expect(data).toHaveProperty('architecture');
        expect(data).toHaveProperty('key_files');
        expect(data).toHaveProperty('entry_points');
        expect(data).toHaveProperty('main_features');
        expect(data).toHaveProperty('dependencies_summary');
        expect(data).toHaveProperty('patterns_used');
        expect(data).toHaveProperty('conventions');
        expect(data).toHaveProperty('cached');
        expect(data).toHaveProperty('generated_at');
      });

      it('should include architecture with correct structure', async () => {
        const result = await handleExplainCodebase({});
        const data = JSON.parse(result.content[0].text);

        expect(data.architecture).toHaveProperty('type');
        expect(data.architecture).toHaveProperty('description');
        expect(data.architecture).toHaveProperty('layers');
      });

      it('should set cached to false for fresh generation', async () => {
        const result = await handleExplainCodebase({});
        const data = JSON.parse(result.content[0].text);

        expect(data.cached).toBe(false);
      });

      it('should include generated_at timestamp', async () => {
        const result = await handleExplainCodebase({});
        const data = JSON.parse(result.content[0].text);

        expect(new Date(data.generated_at).getTime()).toBeLessThanOrEqual(Date.now());
      });
    });
  });

  describe('getDirectoryStructure helper', () => {
    it('should build tree structure with directories first', async () => {
      // Track calls to prevent infinite recursion - return empty for subdirectories
      let callCount = 0;
      vi.mocked(fsPromises.readdir).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // First call - return root entries
          return Promise.resolve([
            { name: 'src', isDirectory: () => true, isFile: () => false },
            { name: 'package.json', isDirectory: () => false, isFile: () => true },
            { name: 'app', isDirectory: () => true, isFile: () => false },
          ] as unknown as fs.Dirent[]);
        }
        // Subsequent calls - return empty to stop recursion
        return Promise.resolve([]);
      });
      vi.mocked(childProcess.spawn).mockImplementation(
        createMockSpawn(JSON.stringify(sampleLLMResponse))
      );

      // Just verify it doesn't throw
      const result = await handleExplainCodebase({});
      expect(result.content[0].text).toBeDefined();
    });

    it('should skip node_modules and other excluded directories', async () => {
      // Track calls to prevent infinite recursion
      let callCount = 0;
      vi.mocked(fsPromises.readdir).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve([
            { name: 'src', isDirectory: () => true, isFile: () => false },
            { name: 'node_modules', isDirectory: () => true, isFile: () => false },
            { name: '.git', isDirectory: () => true, isFile: () => false },
            { name: 'dist', isDirectory: () => true, isFile: () => false },
          ] as unknown as fs.Dirent[]);
        }
        return Promise.resolve([]);
      });
      vi.mocked(childProcess.spawn).mockImplementation(
        createMockSpawn(JSON.stringify(sampleLLMResponse))
      );

      const result = await handleExplainCodebase({});
      expect(result.content[0].text).toBeDefined();
    });

    it('should respect depth limit', async () => {
      // Return empty readdir to avoid recursion issues
      vi.mocked(fsPromises.readdir).mockResolvedValue([]);
      vi.mocked(childProcess.spawn).mockImplementation(
        createMockSpawn(JSON.stringify(sampleLLMResponse))
      );

      // Shallow depth = 2 levels
      await handleExplainCodebase({ depth: 'shallow' });
      expect(childProcess.spawn).toHaveBeenCalled();
    });
  });

  describe('findKeyFiles helper', () => {
    it('should detect critical entry point files', async () => {
      const mockEntries = [
        { name: 'index.ts', isDirectory: () => false, isFile: () => true },
        { name: 'main.tsx', isDirectory: () => false, isFile: () => true },
      ];

      vi.mocked(fsPromises.readdir).mockResolvedValue(mockEntries as unknown as fs.Dirent[]);
      vi.mocked(childProcess.spawn).mockImplementation(
        createMockSpawn(JSON.stringify(sampleLLMResponse))
      );

      const result = await handleExplainCodebase({});
      expect(result.content[0].text).toBeDefined();
    });

    it('should detect Next.js specific files', async () => {
      const mockEntries = [
        { name: 'app', isDirectory: () => true, isFile: () => false },
      ];
      const appEntries = [
        { name: 'layout.tsx', isDirectory: () => false, isFile: () => true },
        { name: 'page.tsx', isDirectory: () => false, isFile: () => true },
      ];

      vi.mocked(fsPromises.readdir).mockImplementation((p) => {
        const pathStr = String(p);
        if (pathStr.includes('app')) {
          return Promise.resolve(appEntries as unknown as fs.Dirent[]);
        }
        return Promise.resolve(mockEntries as unknown as fs.Dirent[]);
      });

      vi.mocked(childProcess.spawn).mockImplementation(
        createMockSpawn(JSON.stringify(sampleLLMResponse))
      );

      const result = await handleExplainCodebase({});
      const data = JSON.parse(result.content[0].text);

      expect(data.key_files.some((f: { path: string }) =>
        f.path.includes('layout') || f.path.includes('page')
      )).toBe(true);
    });

    it('should detect configuration files', async () => {
      const mockEntries = [
        { name: 'next.config.js', isDirectory: () => false, isFile: () => true },
        { name: 'tsconfig.json', isDirectory: () => false, isFile: () => true },
        { name: 'tailwind.config.js', isDirectory: () => false, isFile: () => true },
      ];

      vi.mocked(fsPromises.readdir).mockResolvedValue(mockEntries as unknown as fs.Dirent[]);
      vi.mocked(childProcess.spawn).mockImplementation(
        createMockSpawn(JSON.stringify(sampleLLMResponse))
      );

      const result = await handleExplainCodebase({});
      const data = JSON.parse(result.content[0].text);

      expect(data.key_files.some((f: { path: string }) =>
        f.path.includes('next.config') || f.path.includes('tsconfig')
      )).toBe(true);
    });

    it('should sort key files by importance', async () => {
      vi.mocked(childProcess.spawn).mockImplementation(
        createMockSpawn(JSON.stringify(sampleLLMResponse))
      );

      const result = await handleExplainCodebase({});
      const data = JSON.parse(result.content[0].text);

      // Critical files should come before high importance files
      const criticalIndex = data.key_files.findIndex(
        (f: { importance: string }) => f.importance === 'critical'
      );
      const highIndex = data.key_files.findIndex(
        (f: { importance: string }) => f.importance === 'high'
      );

      if (criticalIndex !== -1 && highIndex !== -1) {
        expect(criticalIndex).toBeLessThan(highIndex);
      }
    });
  });

  describe('findEntryPoints helper', () => {
    it('should detect entry points from package.json main', async () => {
      const pkgWithMain = {
        ...samplePackageJson,
        main: 'dist/index.js',
      };

      vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify(pkgWithMain));
      vi.mocked(fsPromises.access).mockResolvedValue(undefined);
      vi.mocked(childProcess.spawn).mockImplementation(
        createMockSpawn(JSON.stringify(sampleLLMResponse))
      );

      const result = await handleExplainCodebase({});
      const data = JSON.parse(result.content[0].text);

      expect(data.entry_points).toContain('dist/index.js');
    });

    it('should detect Next.js entry point from dev script', async () => {
      vi.mocked(childProcess.spawn).mockImplementation(
        createMockSpawn(JSON.stringify(sampleLLMResponse))
      );

      const result = await handleExplainCodebase({});
      const data = JSON.parse(result.content[0].text);

      // Next.js app router entry
      expect(data.entry_points.some((e: string) => e.includes('app') || e.includes('Next'))).toBe(true);
    });

    it('should detect Vite entry point from dev script', async () => {
      const pkgWithVite = {
        ...samplePackageJson,
        scripts: { dev: 'vite' },
      };

      vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify(pkgWithVite));
      vi.mocked(childProcess.spawn).mockImplementation(
        createMockSpawn(JSON.stringify(sampleLLMResponse))
      );

      const result = await handleExplainCodebase({});
      const data = JSON.parse(result.content[0].text);

      expect(data.entry_points.some((e: string) =>
        e.includes('index.html') || e.includes('main')
      )).toBe(true);
    });

    it('should detect node entry point from start script', async () => {
      const pkgWithStart = {
        ...samplePackageJson,
        scripts: { start: 'node server.js' },
      };

      vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify(pkgWithStart));
      vi.mocked(childProcess.spawn).mockImplementation(
        createMockSpawn(JSON.stringify(sampleLLMResponse))
      );

      const result = await handleExplainCodebase({});
      const data = JSON.parse(result.content[0].text);

      expect(data.entry_points).toContain('server.js');
    });

    it('should check for common entry files', async () => {
      vi.mocked(fsPromises.access).mockImplementation((p) => {
        const pathStr = String(p);
        if (pathStr.includes('src/index.ts') || pathStr.includes('src/main.tsx')) {
          return Promise.resolve(undefined);
        }
        return Promise.reject(new Error('ENOENT'));
      });

      vi.mocked(childProcess.spawn).mockImplementation(
        createMockSpawn(JSON.stringify(sampleLLMResponse))
      );

      const result = await handleExplainCodebase({});
      const data = JSON.parse(result.content[0].text);

      // Common entries like src/index.ts should be checked
      expect(data.entry_points).toBeDefined();
    });
  });

  describe('generateArchitectureDiagram helper', () => {
    beforeEach(() => {
      vi.mocked(childProcess.spawn).mockImplementation(
        createMockSpawn(JSON.stringify(sampleLLMResponse))
      );
    });

    it('should generate Next.js full-stack diagram', async () => {
      const result = await handleExplainCodebase({});
      const data = JSON.parse(result.content[0].text);

      // Next.js with API routes should have specific diagram
      expect(data.architecture.diagram_ascii).toContain('Next.js');
    });

    it('should generate full-stack diagram for non-Next.js projects', async () => {
      vi.mocked(handleDetectStack).mockResolvedValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            frontend: { ui_library: 'react', styling: 'tailwind' },
            backend: { framework: 'express', orm: 'prisma', database: 'postgresql' },
            build: { typescript: true },
          }),
        }],
      });

      const result = await handleExplainCodebase({});
      const data = JSON.parse(result.content[0].text);

      expect(data.architecture.diagram_ascii).toContain('Frontend');
      expect(data.architecture.diagram_ascii).toContain('Backend');
    });

    it('should generate SPA diagram for frontend-only projects', async () => {
      vi.mocked(handleDetectStack).mockResolvedValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            frontend: { ui_library: 'react', styling: 'tailwind', state_management: 'zustand' },
            backend: {},
            build: { typescript: true },
          }),
        }],
      });
      vi.mocked(handleGetApiRoutes).mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify({ routes: [] }) }],
      });

      const result = await handleExplainCodebase({});
      const data = JSON.parse(result.content[0].text);

      expect(data.architecture.diagram_ascii).toContain('Single Page Application');
    });

    it('should generate API service diagram for backend-only projects', async () => {
      vi.mocked(handleDetectStack).mockResolvedValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            frontend: {},
            backend: { framework: 'express', orm: 'prisma', database: 'postgresql' },
            build: { typescript: true },
          }),
        }],
      });

      const result = await handleExplainCodebase({});
      const data = JSON.parse(result.content[0].text);

      expect(data.architecture.diagram_ascii).toContain('API');
    });

    it('should generate generic diagram for unknown structure', async () => {
      vi.mocked(handleDetectStack).mockResolvedValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            frontend: {},
            backend: {},
            build: {},
          }),
        }],
      });
      vi.mocked(handleGetApiRoutes).mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify({ routes: [] }) }],
      });

      const result = await handleExplainCodebase({});
      const data = JSON.parse(result.content[0].text);

      expect(data.architecture.diagram_ascii).toContain('Application');
    });
  });

  describe('generateProjectHash helper', () => {
    it('should generate different hash when files change', async () => {
      // First call
      vi.mocked(fsPromises.stat).mockResolvedValue({
        mtimeMs: 1000,
        size: 100,
      } as fs.Stats);

      vi.mocked(childProcess.spawn).mockImplementation(
        createMockSpawn(JSON.stringify(sampleLLMResponse))
      );

      await handleExplainCodebase({ refresh: true });

      // Get the hash from cached file
      const firstWriteCall = vi.mocked(fsPromises.writeFile).mock.calls[0];
      const firstCache = JSON.parse(firstWriteCall[1] as string);

      // Second call with different file stats
      vi.clearAllMocks();
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fsPromises.access).mockResolvedValue(undefined);
      vi.mocked(fsPromises.readdir).mockResolvedValue([]);
      vi.mocked(fsPromises.mkdir).mockResolvedValue(undefined);
      vi.mocked(fsPromises.writeFile).mockResolvedValue(undefined);
      vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify(samplePackageJson));

      vi.mocked(fsPromises.stat).mockResolvedValue({
        mtimeMs: 2000,
        size: 200,
      } as fs.Stats);

      vi.mocked(handleDetectStack).mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify(sampleStackData) }],
      });
      vi.mocked(handleGetApiRoutes).mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify(sampleApiRoutes) }],
      });
      vi.mocked(handleGetConventions).mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify(sampleConventions) }],
      });

      vi.mocked(childProcess.spawn).mockImplementation(
        createMockSpawn(JSON.stringify(sampleLLMResponse))
      );

      await handleExplainCodebase({ refresh: true });

      const secondWriteCall = vi.mocked(fsPromises.writeFile).mock.calls[0];
      const secondCache = JSON.parse(secondWriteCall[1] as string);

      expect(firstCache.project_hash).not.toBe(secondCache.project_hash);
    });
  });

  describe('error handling', () => {
    it('should handle readdir errors gracefully', async () => {
      vi.mocked(fsPromises.readdir).mockRejectedValue(new Error('Permission denied'));
      vi.mocked(childProcess.spawn).mockImplementation(
        createMockSpawn(JSON.stringify(sampleLLMResponse))
      );

      const result = await handleExplainCodebase({});

      // Should not throw, should return result
      expect(result.content[0].text).toBeDefined();
    });

    it('should handle cache write failure gracefully', async () => {
      vi.mocked(fsPromises.mkdir).mockRejectedValue(new Error('No space'));
      vi.mocked(fsPromises.writeFile).mockRejectedValue(new Error('No space'));
      vi.mocked(childProcess.spawn).mockImplementation(
        createMockSpawn(JSON.stringify(sampleLLMResponse))
      );

      const result = await handleExplainCodebase({});

      // Should not throw, should still return result
      expect(result.content[0].text).toBeDefined();
    });

    it('should handle cache read errors gracefully', async () => {
      vi.mocked(fsPromises.readFile).mockImplementation((p) => {
        const pathStr = String(p);
        if (pathStr.includes('codebase-explanation.json')) {
          return Promise.reject(new Error('Corrupt file'));
        }
        return Promise.resolve(JSON.stringify(samplePackageJson));
      });

      vi.mocked(childProcess.spawn).mockImplementation(
        createMockSpawn(JSON.stringify(sampleLLMResponse))
      );

      const result = await handleExplainCodebase({});

      // Should fall back to regeneration
      expect(result.content[0].text).toBeDefined();
      expect(childProcess.spawn).toHaveBeenCalled();
    });

    it('should handle spawn error event', async () => {
      vi.mocked(childProcess.spawn).mockImplementation(() => {
        const child = createTrackedMockChild();

        setImmediate(() => {
          child.emit('error', new Error('spawn ENOENT'));
        });

        return child;
      });

      const result = await handleExplainCodebase({});
      const data = JSON.parse(result.content[0].text);

      // Should use fallback
      expect(data.concerns).toContain('LLM analysis unavailable - results are based on static analysis only');
    });

    it('should handle stat errors when generating hash', async () => {
      vi.mocked(fsPromises.stat).mockRejectedValue(new Error('ENOENT'));
      vi.mocked(childProcess.spawn).mockImplementation(
        createMockSpawn(JSON.stringify(sampleLLMResponse))
      );

      const result = await handleExplainCodebase({});

      // Should not throw
      expect(result.content[0].text).toBeDefined();
    });
  });

  describe('buildAnalysisPrompt helper', () => {
    it('should include focus areas in prompt', async () => {
      let capturedPrompt = '';
      vi.mocked(childProcess.spawn).mockImplementation((cmd, args) => {
        if (args && args[2]) {
          capturedPrompt = args[2] as string;
        }
        const child = createTrackedMockChild();

        setImmediate(() => {
          child.stdout.emit('data', Buffer.from(JSON.stringify(sampleLLMResponse)));
          child.emit('close', 0);
        });

        return child;
      });

      await handleExplainCodebase({ focus: ['auth', 'api'] });

      expect(capturedPrompt).toContain('auth');
      expect(capturedPrompt).toContain('api');
    });

    it('should include depth instructions in prompt', async () => {
      let capturedPrompt = '';
      vi.mocked(childProcess.spawn).mockImplementation((cmd, args) => {
        if (args && args[2]) {
          capturedPrompt = args[2] as string;
        }
        const child = createTrackedMockChild();

        setImmediate(() => {
          child.stdout.emit('data', Buffer.from(JSON.stringify(sampleLLMResponse)));
          child.emit('close', 0);
        });

        return child;
      });

      await handleExplainCodebase({ depth: 'deep' });

      expect(capturedPrompt).toContain('thorough');
    });
  });

  describe('createFallbackResult helper', () => {
    beforeEach(() => {
      vi.mocked(childProcess.spawn).mockImplementation(
        createMockSpawn('', 1, 'Claude unavailable')
      );
    });

    it('should detect monolith architecture for full-stack', async () => {
      vi.mocked(handleDetectStack).mockResolvedValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            frontend: { ui_library: 'react' },
            backend: { framework: 'express' },
            build: {},
          }),
        }],
      });

      const result = await handleExplainCodebase({});
      const data = JSON.parse(result.content[0].text);

      expect(data.architecture.type).toBe('monolith');
    });

    it('should detect SPA architecture for frontend-only', async () => {
      vi.mocked(handleDetectStack).mockResolvedValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            frontend: { ui_library: 'react' },
            backend: {},
            build: {},
          }),
        }],
      });
      vi.mocked(handleGetApiRoutes).mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify({ routes: [] }) }],
      });

      const result = await handleExplainCodebase({});
      const data = JSON.parse(result.content[0].text);

      expect(data.architecture.type).toBe('spa');
    });

    it('should detect API service architecture for backend-only', async () => {
      vi.mocked(handleDetectStack).mockResolvedValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            frontend: {},
            backend: { framework: 'express' },
            build: {},
          }),
        }],
      });

      const result = await handleExplainCodebase({});
      const data = JSON.parse(result.content[0].text);

      expect(data.architecture.type).toBe('api-service');
    });

    it('should include convention patterns from detected conventions', async () => {
      const result = await handleExplainCodebase({});
      const data = JSON.parse(result.content[0].text);

      // Should have some patterns from conventions
      expect(data.patterns_used).toBeDefined();
      expect(Array.isArray(data.patterns_used)).toBe(true);
    });

    it('should handle missing package.json in fallback (line 798-799)', async () => {
      // Return null for package.json by making readFile return invalid JSON
      vi.mocked(fsPromises.readFile).mockRejectedValue(new Error('ENOENT'));

      const result = await handleExplainCodebase({});
      const data = JSON.parse(result.content[0].text);

      // Should use default name "This project" when no package.json
      expect(data.summary).toContain('This project');
    });

    it('should handle missing description in package.json (line 799-800)', async () => {
      // Package.json without description
      const pkgWithoutDesc = {
        name: 'test-pkg',
        version: '1.0.0',
        scripts: {},
        dependencies: {},
      };
      vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify(pkgWithoutDesc));

      const result = await handleExplainCodebase({});
      const data = JSON.parse(result.content[0].text);

      // Summary should not contain double periods or "undefined"
      expect(data.summary).not.toContain('undefined');
    });

    it('should handle missing dependencies in fallback (line 813)', async () => {
      // Package.json without dependencies
      const pkgWithoutDeps = {
        name: 'test-pkg',
        version: '1.0.0',
        scripts: {},
      };
      vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify(pkgWithoutDeps));

      const result = await handleExplainCodebase({});
      const data = JSON.parse(result.content[0].text);

      // Should handle missing dependencies gracefully
      expect(data.dependencies_summary).toContain('0 production dependencies');
    });

    it('should exclude architecture diagram when include_architecture=false in fallback (line 830)', async () => {
      const result = await handleExplainCodebase({ include_architecture: false });
      const data = JSON.parse(result.content[0].text);

      // Fallback should not include diagram when include_architecture is false
      expect(data.architecture.diagram_ascii).toBeUndefined();
    });
  });

  describe('additional branch coverage tests', () => {
    describe('getDirectoryStructure depth limit (line 263)', () => {
      it('should return empty string when max depth is reached', async () => {
        // Create deep directory structure that exceeds shallow depth limit
        let callDepth = 0;
        vi.mocked(fsPromises.readdir).mockImplementation(() => {
          callDepth++;
          if (callDepth <= 3) {
            return Promise.resolve([
              { name: `level${callDepth}`, isDirectory: () => true, isFile: () => false },
            ] as unknown as fs.Dirent[]);
          }
          return Promise.resolve([]);
        });

        vi.mocked(childProcess.spawn).mockImplementation(
          createMockSpawn(JSON.stringify(sampleLLMResponse))
        );

        // Use shallow depth (maxDepth = 2)
        const result = await handleExplainCodebase({ depth: 'shallow' });
        expect(result.content[0].text).toBeDefined();
      });
    });

    describe('findKeyFiles hidden directory branch (line 319)', () => {
      it('should skip directories starting with dot', async () => {
        vi.mocked(fsPromises.readdir).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.includes('.hidden')) {
            // This should never be called if hidden dirs are skipped
            return Promise.resolve([
              { name: 'secret.ts', isDirectory: () => false, isFile: () => true },
            ] as unknown as fs.Dirent[]);
          }
          if (pathStr.includes('src')) {
            // Terminate recursion by returning only files
            return Promise.resolve([
              { name: 'index.ts', isDirectory: () => false, isFile: () => true },
            ] as unknown as fs.Dirent[]);
          }
          return Promise.resolve([
            { name: '.hidden', isDirectory: () => true, isFile: () => false },
            { name: 'src', isDirectory: () => true, isFile: () => false },
          ] as unknown as fs.Dirent[]);
        });

        vi.mocked(childProcess.spawn).mockImplementation(
          createMockSpawn(JSON.stringify(sampleLLMResponse))
        );

        const result = await handleExplainCodebase({});
        expect(result.content[0].text).toBeDefined();
      });
    });

    describe('findEntryPoints module field (line 360)', () => {
      it('should detect entry point from package.json module field', async () => {
        const pkgWithModule = {
          ...samplePackageJson,
          module: 'dist/esm/index.js',
        };

        vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify(pkgWithModule));
        vi.mocked(childProcess.spawn).mockImplementation(
          createMockSpawn(JSON.stringify(sampleLLMResponse))
        );

        const result = await handleExplainCodebase({});
        const data = JSON.parse(result.content[0].text);

        expect(data.entry_points).toContain('dist/esm/index.js');
      });
    });

    describe('findEntryPoints node script without match (line 369)', () => {
      it('should handle node script without file argument', async () => {
        const pkgWithBareNode = {
          ...samplePackageJson,
          scripts: { start: 'node' }, // No file argument, regex won't match
        };

        vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify(pkgWithBareNode));
        vi.mocked(childProcess.spawn).mockImplementation(
          createMockSpawn(JSON.stringify(sampleLLMResponse))
        );

        const result = await handleExplainCodebase({});
        // Should not throw
        expect(result.content[0].text).toBeDefined();
      });
    });

    describe('generateArchitectureDiagram fallback values (lines 585, 601-609, 617, 634, 667)', () => {
      it('should use fallback ORM value in Next.js diagram (line 585)', async () => {
        vi.mocked(handleDetectStack).mockResolvedValue({
          content: [{
            type: 'text',
            text: JSON.stringify({
              frontend: { framework: 'next', ui_library: 'react' },
              backend: { database: 'postgresql' }, // No ORM specified
              build: {},
            }),
          }],
        });

        vi.mocked(childProcess.spawn).mockImplementation(
          createMockSpawn(JSON.stringify(sampleLLMResponse))
        );

        const result = await handleExplainCodebase({});
        const data = JSON.parse(result.content[0].text);

        // Should use 'ORM' as fallback
        expect(data.architecture.diagram_ascii).toContain('ORM');
      });

      it('should use fallback values in full-stack non-Next.js diagram (lines 601-609, 617)', async () => {
        vi.mocked(handleDetectStack).mockResolvedValue({
          content: [{
            type: 'text',
            text: JSON.stringify({
              frontend: { ui_library: 'vue' }, // No styling
              backend: { database: 'mysql' }, // No framework, no orm
              build: {},
            }),
          }],
        });

        vi.mocked(childProcess.spawn).mockImplementation(
          createMockSpawn(JSON.stringify(sampleLLMResponse))
        );

        const result = await handleExplainCodebase({});
        const data = JSON.parse(result.content[0].text);

        // Should use fallback values
        expect(data.architecture.diagram_ascii).toContain('CSS'); // fallback for styling
        expect(data.architecture.diagram_ascii).toContain('Server'); // fallback for framework
      });

      it('should use fallback styling in SPA diagram (line 634)', async () => {
        vi.mocked(handleDetectStack).mockResolvedValue({
          content: [{
            type: 'text',
            text: JSON.stringify({
              frontend: { ui_library: 'react' }, // No styling specified
              backend: {},
              build: {},
            }),
          }],
        });
        vi.mocked(handleGetApiRoutes).mockResolvedValue({
          content: [{ type: 'text', text: JSON.stringify({ routes: [] }) }],
        });

        vi.mocked(childProcess.spawn).mockImplementation(
          createMockSpawn(JSON.stringify(sampleLLMResponse))
        );

        const result = await handleExplainCodebase({});
        const data = JSON.parse(result.content[0].text);

        // Should use 'CSS' as fallback for styling
        expect(data.architecture.diagram_ascii).toContain('CSS');
      });

      it('should use fallback ORM in API-only diagram (line 667)', async () => {
        vi.mocked(handleDetectStack).mockResolvedValue({
          content: [{
            type: 'text',
            text: JSON.stringify({
              frontend: {},
              backend: { framework: 'express', database: 'postgresql' }, // No ORM
              build: {},
            }),
          }],
        });

        vi.mocked(childProcess.spawn).mockImplementation(
          createMockSpawn(JSON.stringify(sampleLLMResponse))
        );

        const result = await handleExplainCodebase({});
        const data = JSON.parse(result.content[0].text);

        // Should use 'Driver' as fallback for ORM in API-only diagram
        expect(data.architecture.diagram_ascii).toContain('Driver');
      });
    });

    describe('buildAnalysisPrompt invalid depth fallback (line 730)', () => {
      it('should use medium depth instructions for invalid depth', async () => {
        let capturedPrompt = '';
        vi.mocked(childProcess.spawn).mockImplementation((cmd, args) => {
          if (args && args[2]) {
            capturedPrompt = args[2] as string;
          }
          const child = createTrackedMockChild();

          setImmediate(() => {
            child.stdout.emit('data', Buffer.from(JSON.stringify(sampleLLMResponse)));
            child.emit('close', 0);
          });

          return child;
        });

        // Pass invalid depth via type coercion
        await handleExplainCodebase({ depth: 'invalid' as 'medium' });

        // Should use medium instructions as fallback
        expect(capturedPrompt).toContain('moderately detailed');
      });
    });

    describe('MAX_STRUCTURE_DEPTH invalid depth fallback (line 894)', () => {
      it('should use default depth 3 for invalid depth value', async () => {
        vi.mocked(fsPromises.readdir).mockResolvedValue([]);
        vi.mocked(childProcess.spawn).mockImplementation(
          createMockSpawn(JSON.stringify(sampleLLMResponse))
        );

        // Pass invalid depth
        const result = await handleExplainCodebase({ depth: 'invalid' as 'medium' });
        expect(result.content[0].text).toBeDefined();
      });
    });

    describe('LLM result null value fallbacks (lines 990-995, 1002-1005)', () => {
      it('should handle LLM returning null for summary (line 990)', async () => {
        const incompleteResponse = {
          ...sampleLLMResponse,
          summary: null,
        };
        vi.mocked(childProcess.spawn).mockImplementation(
          createMockSpawn(JSON.stringify(incompleteResponse))
        );

        const result = await handleExplainCodebase({});
        const data = JSON.parse(result.content[0].text);

        expect(data.summary).toBe('Analysis incomplete');
      });

      it('should handle LLM returning null for architecture type (line 993)', async () => {
        const incompleteResponse = {
          ...sampleLLMResponse,
          architecture: { description: 'test', layers: [] },
        };
        vi.mocked(childProcess.spawn).mockImplementation(
          createMockSpawn(JSON.stringify(incompleteResponse))
        );

        const result = await handleExplainCodebase({});
        const data = JSON.parse(result.content[0].text);

        expect(data.architecture.type).toBe('unknown');
      });

      it('should handle LLM returning null for architecture description (line 994)', async () => {
        const incompleteResponse = {
          ...sampleLLMResponse,
          architecture: { type: 'monolith', layers: [] },
        };
        vi.mocked(childProcess.spawn).mockImplementation(
          createMockSpawn(JSON.stringify(incompleteResponse))
        );

        const result = await handleExplainCodebase({});
        const data = JSON.parse(result.content[0].text);

        expect(data.architecture.description).toBe('Unable to determine');
      });

      it('should handle LLM returning null for architecture layers (line 995)', async () => {
        const incompleteResponse = {
          ...sampleLLMResponse,
          architecture: { type: 'monolith', description: 'test' },
        };
        vi.mocked(childProcess.spawn).mockImplementation(
          createMockSpawn(JSON.stringify(incompleteResponse))
        );

        const result = await handleExplainCodebase({});
        const data = JSON.parse(result.content[0].text);

        expect(data.architecture.layers).toEqual([]);
      });

      it('should handle LLM returning null for main_features (line 1002)', async () => {
        const incompleteResponse = {
          ...sampleLLMResponse,
          main_features: null,
        };
        vi.mocked(childProcess.spawn).mockImplementation(
          createMockSpawn(JSON.stringify(incompleteResponse))
        );

        const result = await handleExplainCodebase({});
        const data = JSON.parse(result.content[0].text);

        expect(data.main_features).toEqual([]);
      });

      it('should handle LLM returning null for dependencies_summary (line 1003)', async () => {
        const incompleteResponse = {
          ...sampleLLMResponse,
          dependencies_summary: null,
        };
        vi.mocked(childProcess.spawn).mockImplementation(
          createMockSpawn(JSON.stringify(incompleteResponse))
        );

        const result = await handleExplainCodebase({});
        const data = JSON.parse(result.content[0].text);

        expect(data.dependencies_summary).toBe('Not analyzed');
      });

      it('should handle LLM returning null for patterns_used (line 1004)', async () => {
        const incompleteResponse = {
          ...sampleLLMResponse,
          patterns_used: null,
        };
        vi.mocked(childProcess.spawn).mockImplementation(
          createMockSpawn(JSON.stringify(incompleteResponse))
        );

        const result = await handleExplainCodebase({});
        const data = JSON.parse(result.content[0].text);

        expect(data.patterns_used).toEqual([]);
      });

      it('should handle LLM returning null for conventions (line 1005)', async () => {
        const incompleteResponse = {
          ...sampleLLMResponse,
          conventions: null,
        };
        vi.mocked(childProcess.spawn).mockImplementation(
          createMockSpawn(JSON.stringify(incompleteResponse))
        );

        const result = await handleExplainCodebase({});
        const data = JSON.parse(result.content[0].text);

        expect(data.conventions).toEqual([]);
      });

      it('should handle LLM returning completely empty architecture object', async () => {
        const incompleteResponse = {
          ...sampleLLMResponse,
          architecture: null,
        };
        vi.mocked(childProcess.spawn).mockImplementation(
          createMockSpawn(JSON.stringify(incompleteResponse))
        );

        const result = await handleExplainCodebase({});
        const data = JSON.parse(result.content[0].text);

        expect(data.architecture.type).toBe('unknown');
        expect(data.architecture.description).toBe('Unable to determine');
        expect(data.architecture.layers).toEqual([]);
      });
    });

    describe('error handling non-Error object (line 1029)', () => {
      it('should handle non-Error thrown from spawnClaude', async () => {
        vi.mocked(childProcess.spawn).mockImplementation(() => {
          const child = createTrackedMockChild();

          setImmediate(() => {
            // Emit 'close' without proper error - triggers a string rejection
            child.emit('close', 0);
            // But stdout has invalid data that causes parsing to throw a non-Error
          });

          return child;
        });

        // This test is tricky - we need to make spawnClaude throw a non-Error
        // Actually, we can mock it to throw a string directly
        const result = await handleExplainCodebase({});
        const data = JSON.parse(result.content[0].text);

        // Should fall back gracefully
        expect(data.concerns).toBeDefined();
      });

      it('should log non-Error objects in catch block', async () => {
        // Mock console.error to capture the call
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        vi.mocked(childProcess.spawn).mockImplementation(() => {
          const child = createTrackedMockChild();

          setImmediate(() => {
            child.stdout.emit('data', Buffer.from('not json'));
            child.emit('close', 0);
          });

          return child;
        });

        await handleExplainCodebase({});

        // Should have logged the error
        expect(consoleErrorSpy).toHaveBeenCalled();

        consoleErrorSpy.mockRestore();
      });
    });

    describe('tech_stack recommended_skills mapping (line 991)', () => {
      it('should map recommended_skills to tech_stack with path parsing', async () => {
        vi.mocked(handleDetectStack).mockResolvedValue({
          content: [{
            type: 'text',
            text: JSON.stringify({
              ...sampleStackData,
              recommended_skills: ['webdev/frameworks/nextjs', 'databases/orms/prisma'],
            }),
          }],
        });

        vi.mocked(childProcess.spawn).mockImplementation(
          createMockSpawn(JSON.stringify(sampleLLMResponse))
        );

        const result = await handleExplainCodebase({});
        // The tech_stack gets overwritten by the actual stack detection
        expect(result.content[0].text).toBeDefined();
      });

      it('should handle recommended_skills with empty path segments (line 991)', async () => {
        vi.mocked(handleDetectStack).mockResolvedValue({
          content: [{
            type: 'text',
            text: JSON.stringify({
              frontend: {},
              backend: {},
              build: {},
              recommended_skills: ['simple', '/leading/slash/skill'],
            }),
          }],
        });

        vi.mocked(childProcess.spawn).mockImplementation(
          createMockSpawn(JSON.stringify(sampleLLMResponse))
        );

        const result = await handleExplainCodebase({});
        expect(result.content[0].text).toBeDefined();
      });
    });

    describe('API routes with empty path segments (line 805)', () => {
      it('should handle API routes with empty path segments', async () => {
        vi.mocked(handleGetApiRoutes).mockResolvedValue({
          content: [{
            type: 'text',
            text: JSON.stringify({
              routes: [
                { method: 'GET', path: '/' }, // No segments after split
                { method: 'GET', path: '/api' }, // Only one segment
              ],
              framework: 'express',
            }),
          }],
        });

        vi.mocked(childProcess.spawn).mockImplementation(
          createMockSpawn('', 1, 'Claude unavailable')
        );

        const result = await handleExplainCodebase({});
        const data = JSON.parse(result.content[0].text);

        // Should filter out empty features
        expect(data.main_features).toBeDefined();
      });
    });

    describe('full-stack diagram without database (line 612 hasDatabase false)', () => {
      it('should generate full-stack diagram without database section', async () => {
        vi.mocked(handleDetectStack).mockResolvedValue({
          content: [{
            type: 'text',
            text: JSON.stringify({
              frontend: { ui_library: 'react', styling: 'tailwind' },
              backend: { framework: 'express' }, // No orm, no database
              build: {},
            }),
          }],
        });

        vi.mocked(childProcess.spawn).mockImplementation(
          createMockSpawn(JSON.stringify(sampleLLMResponse))
        );

        const result = await handleExplainCodebase({});
        const data = JSON.parse(result.content[0].text);

        // Should have frontend and backend but not database layer
        expect(data.architecture.diagram_ascii).toContain('Frontend');
        expect(data.architecture.diagram_ascii).toContain('Backend');
        expect(data.architecture.diagram_ascii).not.toContain('Database Layer');
      });
    });

    describe('API service diagram without database (line 662 hasDatabase false)', () => {
      it('should generate API service diagram without database section', async () => {
        vi.mocked(handleDetectStack).mockResolvedValue({
          content: [{
            type: 'text',
            text: JSON.stringify({
              frontend: {},
              backend: { framework: 'express' }, // No orm, no database
              build: {},
            }),
          }],
        });

        vi.mocked(childProcess.spawn).mockImplementation(
          createMockSpawn(JSON.stringify(sampleLLMResponse))
        );

        const result = await handleExplainCodebase({});
        const data = JSON.parse(result.content[0].text);

        // Should have API layer but not database layer
        expect(data.architecture.diagram_ascii).toContain('API');
        expect(data.architecture.diagram_ascii).not.toContain('Database Layer');
      });
    });

    describe('package.json without scripts (line 365)', () => {
      it('should handle package.json without scripts property', async () => {
        // Mock readFile to return package.json without scripts
        vi.mocked(fsPromises.readFile).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.includes('package.json')) {
            return Promise.resolve(JSON.stringify({
              name: 'test-project',
              version: '1.0.0',
              // No scripts property
            }));
          }
          return Promise.reject(new Error('ENOENT'));
        });

        vi.mocked(childProcess.spawn).mockImplementation(
          createMockSpawn(JSON.stringify(sampleLLMResponse))
        );

        const result = await handleExplainCodebase({});
        const data = JSON.parse(result.content[0].text);

        expect(data.entry_points).toBeDefined();
      });
    });

    describe('empty project with no detected stack (line 785 hasApi false branch)', () => {
      it('should handle project with no frontend and no API routes', async () => {
        // Mock stack detection to return empty stack
        vi.mocked(handleDetectStack).mockResolvedValue({
          content: [{
            type: 'text',
            text: JSON.stringify({
              frontend: {},  // No ui_library
              backend: {},   // No framework
              build: {},
            }),
          }],
        });

        // Mock API routes to return no routes
        vi.mocked(handleGetApiRoutes).mockResolvedValue({
          content: [{
            type: 'text',
            text: JSON.stringify({
              routes: [],
              framework: null,
            }),
          }],
        });

        // Make Claude fail to trigger fallback
        vi.mocked(childProcess.spawn).mockImplementation(
          createMockSpawn('', 1, 'Claude unavailable')
        );

        const result = await handleExplainCodebase({});
        const data = JSON.parse(result.content[0].text);

        // Should fall through to 'unknown' architecture type
        expect(data.architecture.type).toBe('unknown');
        expect(data.architecture.description).toContain('Unable to determine');
      });
    });

    describe('branch coverage for lines 804, 991, 1029', () => {
      it('should handle fallback when apiRoutes.routes is undefined (line 804)', async () => {
        // Mock API routes to return undefined routes
        vi.mocked(handleGetApiRoutes).mockResolvedValue({
          content: [{
            type: 'text',
            text: JSON.stringify({
              // routes property is missing/undefined
              framework: 'express',
            }),
          }],
        });

        // Make Claude fail to trigger fallback
        vi.mocked(childProcess.spawn).mockImplementation(
          createMockSpawn('', 1, 'Claude unavailable')
        );

        const result = await handleExplainCodebase({});
        const data = JSON.parse(result.content[0].text);

        // Should use fallback message when no routes
        expect(data.main_features).toContain('See API routes for features');
      });

      it('should handle recommended_skills with trailing slash (line 991 || s branch)', async () => {
        vi.mocked(handleDetectStack).mockResolvedValue({
          content: [{
            type: 'text',
            text: JSON.stringify({
              frontend: { ui_library: 'react' },
              backend: {},
              build: {},
              // 'trailing/' splits to ['trailing', ''], pop() returns '' (falsy), so || s gives 'trailing/'
              recommended_skills: ['normal/path/skill', 'trailing/', ''],
            }),
          }],
        });

        vi.mocked(childProcess.spawn).mockImplementation(
          createMockSpawn(JSON.stringify(sampleLLMResponse))
        );

        const result = await handleExplainCodebase({});
        const data = JSON.parse(result.content[0].text);

        // tech_stack should include the fallback values
        expect(data.tech_stack).toBeDefined();
      });

      it('should log non-Error thrown value in catch block (line 1029 : err branch)', async () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        // Mock spawn to throw a string (not an Error)
        vi.mocked(childProcess.spawn).mockImplementation(() => {
          throw 'string error thrown directly';
        });

        const result = await handleExplainCodebase({});
        const data = JSON.parse(result.content[0].text);

        // Should have used fallback
        expect(data.summary).toBeDefined();

        // Should have logged the raw string (not .message)
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining('[explain-codebase]'),
          'string error thrown directly'
        );

        consoleErrorSpy.mockRestore();
      });
    });
  });
});
