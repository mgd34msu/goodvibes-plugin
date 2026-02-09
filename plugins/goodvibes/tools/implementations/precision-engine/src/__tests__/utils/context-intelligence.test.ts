import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { getContextForFile, resetContextTracking } from '../../utils/context-intelligence.js';
import type { FileTypeInfo } from '../../utils/file-type-detection.js';

// Mock fs/promises
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  stat: vi.fn(),
}));

import { readFile, stat } from 'fs/promises';

const mockReadFile = vi.mocked(readFile);
const mockStat = vi.mocked(stat);

describe('context-intelligence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetContextTracking();
    vi.useFakeTimers();
    // Invalidate memory cache from previous tests (30s TTL)
    vi.advanceTimersByTime(31000);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const createFileTypeInfo = (category: string, framework?: string): FileTypeInfo => ({
    category,
    framework,
    patterns: [],
  });

  const mockGoodvibesDir = (projectRoot: string) => {
    mockStat.mockImplementation(async (path: string) => {
      if (typeof path === 'string' && path.includes('.goodvibes')) {
        return { isDirectory: () => true } as any;
      }
      throw new Error('ENOENT');
    });
  };

  const mockMemoryFiles = (decisions: any[] = [], patterns: any[] = [], failures: any[] = []) => {
    mockReadFile.mockImplementation(async (path: string) => {
      const pathStr = typeof path === 'string' ? path : path.toString();
      if (pathStr.endsWith('decisions.json')) {
        return JSON.stringify({ entries: decisions });
      }
      if (pathStr.endsWith('patterns.json')) {
        return JSON.stringify({ entries: patterns });
      }
      if (pathStr.endsWith('failures.json')) {
        return JSON.stringify({ entries: failures });
      }
      throw new Error('ENOENT');
    });
  };

  describe('resetContextTracking', () => {
    it('clears sent categories tracking', async () => {
      mockGoodvibesDir('/project');
      mockMemoryFiles();

      const fileType = createFileTypeInfo('typescript');

      // First call - should include memory
      const result1 = await getContextForFile('/project/src/file.ts', fileType, '/project');
      expect(result1.file_type).toEqual(fileType);

      // Second call - should skip memory (category already sent)
      const result2 = await getContextForFile('/project/src/other.ts', fileType, '/project');
      expect(result2.related_memory).toBeUndefined();

      // Reset tracking
      resetContextTracking();

      // Third call - should include memory again after reset
      const result3 = await getContextForFile('/project/src/other.ts', fileType, '/project');
      expect(result3.file_type).toEqual(fileType);
    });
  });

  describe('getContextForFile', () => {
    describe('basic functionality', () => {
      it('returns file_type metadata', async () => {
        mockGoodvibesDir('/project');
        mockMemoryFiles();

        const fileType = createFileTypeInfo('typescript');
        const result = await getContextForFile('/project/src/file.ts', fileType, '/project');

        expect(result.file_type).toEqual(fileType);
      });

      it('skips memory lookup for already-sent categories', async () => {
        mockGoodvibesDir('/skiptest');
        mockMemoryFiles([{ id: 'decision-1', what: 'Test', why: 'Because', keywords: ['typescript', 'skiptest'] }]);

        const fileType = createFileTypeInfo('typescript');

        // First call
        const result1 = await getContextForFile('/skiptest/src/file.ts', fileType, '/skiptest');
        expect(result1.related_memory).toBeDefined();

        // Second call with same category
        const result2 = await getContextForFile('/skiptest/src/other.ts', fileType, '/skiptest');
        expect(result2.related_memory).toBeUndefined();
      });

      it('includes memory for different categories', async () => {
        mockGoodvibesDir('/project');
        mockMemoryFiles([{ id: 'decision-1', what: 'Test', why: 'Because', keywords: ['typescript', 'javascript'] }]);

        const tsFileType = createFileTypeInfo('typescript');
        const jsFileType = createFileTypeInfo('javascript');

        // First category
        const result1 = await getContextForFile('/workspace/code/typescript-file.ts', tsFileType, '/workspace');
        expect(result1.related_memory).toBeDefined();

        // Different category - should include memory
        const result2 = await getContextForFile('/workspace/code/javascript-file.js', jsFileType, '/workspace');
        expect(result2.related_memory).toBeDefined();
      });
    });

    describe('keyword extraction and matching', () => {
      it('extracts keywords from file path', async () => {
        mockGoodvibesDir('/project');
        mockMemoryFiles(
          [{ id: 'decision-1', what: 'Auth decision', why: 'Security', keywords: ['auth', 'security'] }],
          [{ id: 'pattern-1', pattern: 'Auth pattern', keywords: ['authentication'] }]
        );

        const fileType = createFileTypeInfo('typescript');
        const result = await getContextForFile('/project/src/auth/login.ts', fileType, '/project');

        expect(result.related_memory).toBeDefined();
        expect(result.related_memory!.length).toBeGreaterThan(0);
        expect(result.related_memory!.some(e => e.source === 'decisions')).toBe(true);
      });

      it('filters out stopwords', async () => {
        mockGoodvibesDir('/project');
        mockMemoryFiles(
          [{ id: 'decision-1', what: 'Test', why: 'Because', keywords: ['src', 'lib', 'index'] }]
        );

        const fileType = createFileTypeInfo('typescript');
        const result = await getContextForFile('/project/src/lib/index.ts', fileType, '/project');

        // Should not match because all keywords are stopwords
        expect(result.related_memory?.length || 0).toBe(0);
      });

      it('splits camelCase, snake_case, and kebab-case', async () => {
        mockGoodvibesDir('/project');
        mockMemoryFiles(
          [{ id: 'decision-1', what: 'User decision', why: 'Because', keywords: ['user', 'profile'] }]
        );

        const fileType = createFileTypeInfo('typescript');
        const result = await getContextForFile('/project/src/userProfile.ts', fileType, '/project');

        expect(result.related_memory).toBeDefined();
        expect(result.related_memory!.some(e => e.id === 'decision-1')).toBe(true);
      });

      it('handles multiple word formats', async () => {
        mockGoodvibesDir('/project');
        mockMemoryFiles(
          [{ id: 'decision-1', what: 'API decision', why: 'Because', keywords: ['route', 'handler'] }]
        );

        const fileType = createFileTypeInfo('typescript');
        const result = await getContextForFile('/project/features/api-route-handler.ts', fileType, '/project');

        expect(result.related_memory).toBeDefined();
        expect(result.related_memory!.some(e => e.id === 'decision-1')).toBe(true);
      });

      it('includes file type category in keywords', async () => {
        mockGoodvibesDir('/project');
        mockMemoryFiles(
          [{ id: 'decision-1', what: 'TS decision', why: 'Because', keywords: ['typescript'] }]
        );

        const fileType = createFileTypeInfo('typescript');
        const result = await getContextForFile('/workspace/code/module.ts', fileType, '/workspace');

        expect(result.related_memory).toBeDefined();
        expect(result.related_memory!.some(e => e.id === 'decision-1')).toBe(true);
      });

      it('includes framework in keywords', async () => {
        mockGoodvibesDir('/project');
        mockMemoryFiles(
          [{ id: 'decision-1', what: 'React decision', why: 'Because', keywords: ['react'] }]
        );

        const fileType = createFileTypeInfo('typescript', 'react');
        const result = await getContextForFile('/workspace/components/Component.tsx', fileType, '/workspace');

        expect(result.related_memory).toBeDefined();
        expect(result.related_memory!.some(e => e.id === 'decision-1')).toBe(true);
      });
    });

    describe('relevance calculation', () => {
      it('assigns high relevance for >50% keyword overlap', async () => {
        mockGoodvibesDir('/project');
        mockMemoryFiles(
          [{ id: 'decision-1', what: 'Auth decision', why: 'Security', keywords: ['auth', 'login'] }]
        );

        const fileType = createFileTypeInfo('typescript');
        const result = await getContextForFile('/project/src/auth/login.ts', fileType, '/project');

        const authEntry = result.related_memory?.find(e => e.id === 'decision-1');
        expect(authEntry?.relevance).toBe('high');
      });

      it('assigns medium relevance for >25% keyword overlap', async () => {
        mockGoodvibesDir('/project');
        mockMemoryFiles(
          [{ id: 'decision-1', what: 'Decision', why: 'Because', keywords: ['auth', 'security', 'token', 'session', 'jwt'] }]
        );

        const fileType = createFileTypeInfo('typescript');
        const result = await getContextForFile('/project/features/auth/handler.ts', fileType, '/project');

        const entry = result.related_memory?.find(e => e.id === 'decision-1');
        expect(entry?.relevance).toBe('medium');
      });

      it('filters out low relevance entries', async () => {
        mockGoodvibesDir('/filtertest');
        mockMemoryFiles(
          [{ id: 'decision-1', what: 'Unrelated', why: 'Because', keywords: ['database', 'schema', 'migration', 'query', 'records', 'tables', 'models', 'entities'] }]
        );

        const fileType = createFileTypeInfo('typescript');
        const result = await getContextForFile('/filtertest/features/auth/login.ts', fileType, '/filtertest');

        expect(result.related_memory?.some(e => e.id === 'decision-1') || false).toBe(false);
      });

      it('assigns low relevance for entries without keywords', async () => {
        mockGoodvibesDir('/project');
        mockMemoryFiles(
          [{ id: 'decision-1', what: 'No keywords', why: 'Because' }]
        );

        const fileType = createFileTypeInfo('typescript');
        const result = await getContextForFile('/project/src/file.ts', fileType, '/project');

        // Should not include entries with low relevance (undefined when no matches)
        expect(result.related_memory).toBeUndefined();
      });

      it('assigns low relevance for empty keyword arrays', async () => {
        mockGoodvibesDir('/project');
        mockMemoryFiles(
          [{ id: 'decision-1', what: 'Empty keywords', why: 'Because', keywords: [] }]
        );

        const fileType = createFileTypeInfo('typescript');
        const result = await getContextForFile('/project/src/file.ts', fileType, '/project');

        // Should not include entries with low relevance (undefined when no matches)
        expect(result.related_memory).toBeUndefined();
      });
    });

    describe('memory file types', () => {
      it('includes decisions with correct summary format', async () => {
        mockGoodvibesDir('/project');
        mockMemoryFiles(
          [{ id: 'decision-1', what: 'Use TypeScript', why: 'Type safety', keywords: ['typescript', 'file'] }]
        );

        const fileType = createFileTypeInfo('typescript');
        const result = await getContextForFile('/project/features/file.ts', fileType, '/project');

        const decision = result.related_memory?.find(e => e.source === 'decisions');
        expect(decision).toBeDefined();
        expect(decision?.summary).toBe('Use TypeScript: Type safety');
      });

      it('includes patterns with correct summary format', async () => {
        mockGoodvibesDir('/patterntest');
        mockMemoryFiles(
          [],
          [{ id: 'pattern-1', pattern: 'Always use const', keywords: ['typescript', 'pattern', 'module'] }]
        );

        const fileType = createFileTypeInfo('typescript');
        const result = await getContextForFile('/patterntest/features/pattern-module.ts', fileType, '/patterntest');

        const pattern = result.related_memory?.find(e => e.source === 'patterns');
        expect(pattern).toBeDefined();
        expect(pattern?.summary).toBe('Always use const');
      });

      it('includes failures with resolution in summary', async () => {
        mockGoodvibesDir('/project');
        mockMemoryFiles(
          [],
          [],
          [{ id: 'failure-1', operation: 'Build', error: 'Type error', resolution: 'Fixed types', keywords: ['typescript', 'build'] }]
        );

        const fileType = createFileTypeInfo('typescript');
        const result = await getContextForFile('/workspace/build/module.ts', fileType, '/workspace');

        const failure = result.related_memory?.find(e => e.source === 'failures');
        expect(failure).toBeDefined();
        expect(failure?.summary).toBe('Build: Type error → Fixed types');
      });

      it('includes failures without resolution in summary', async () => {
        mockGoodvibesDir('/project');
        mockMemoryFiles(
          [],
          [],
          [{ id: 'failure-1', operation: 'Build', error: 'Type error', keywords: ['error', 'handler'] }]
        );

        const fileType = createFileTypeInfo('typescript');
        const result = await getContextForFile('/workspace/error-handler.ts', fileType, '/workspace');

        const failure = result.related_memory?.find(e => e.source === 'failures');
        expect(failure).toBeDefined();
        expect(failure?.summary).toBe('Build: Type error');
      });

      it('combines all memory types', async () => {
        mockGoodvibesDir('/combinetest');
        mockMemoryFiles(
          [{ id: 'decision-1', what: 'Decision', why: 'Because', keywords: ['typescript', 'combined', 'module'] }],
          [{ id: 'pattern-1', pattern: 'Pattern', keywords: ['typescript', 'combined', 'module'] }],
          [{ id: 'failure-1', operation: 'Op', error: 'Error', keywords: ['typescript', 'combined', 'module'] }]
        );

        const fileType = createFileTypeInfo('typescript');
        const result = await getContextForFile('/combinetest/combined-module.ts', fileType, '/combinetest');

        expect(result.related_memory).toBeDefined();
        expect(result.related_memory!.some(e => e.source === 'decisions')).toBe(true);
        expect(result.related_memory!.some(e => e.source === 'patterns')).toBe(true);
        expect(result.related_memory!.some(e => e.source === 'failures')).toBe(true);
      });
    });

    describe('sorting and limiting', () => {
      it('sorts by relevance with high first', async () => {
        mockGoodvibesDir('/project');
        mockMemoryFiles(
          [
            { id: 'low', what: 'Low', why: 'Because', keywords: ['typescript', 'random', 'other', 'words'] },
            { id: 'high', what: 'High', why: 'Because', keywords: ['auth'] },
            { id: 'medium', what: 'Medium', why: 'Because', keywords: ['auth', 'random', 'other'] },
          ]
        );

        const fileType = createFileTypeInfo('typescript');
        const result = await getContextForFile('/project/src/auth/login.ts', fileType, '/project');

        expect(result.related_memory).toBeDefined();
        expect(result.related_memory![0].relevance).toBe('high');
      });

      it('limits results to top 3', async () => {
        mockGoodvibesDir('/project');
        mockMemoryFiles(
          [
            { id: 'decision-1', what: 'D1', why: 'Because', keywords: ['typescript'] },
            { id: 'decision-2', what: 'D2', why: 'Because', keywords: ['typescript'] },
            { id: 'decision-3', what: 'D3', why: 'Because', keywords: ['typescript'] },
            { id: 'decision-4', what: 'D4', why: 'Because', keywords: ['typescript'] },
            { id: 'decision-5', what: 'D5', why: 'Because', keywords: ['typescript'] },
          ]
        );

        const fileType = createFileTypeInfo('typescript');
        const result = await getContextForFile('/project/src/file.ts', fileType, '/project');

        expect(result.related_memory).toBeDefined();
        expect(result.related_memory!.length).toBeLessThanOrEqual(3);
      });

      it('includes fewer than 3 if not enough matches', async () => {
        mockGoodvibesDir('/project');
        mockMemoryFiles(
          [{ id: 'decision-1', what: 'D1', why: 'Because', keywords: ['single', 'match'] }]
        );

        const fileType = createFileTypeInfo('typescript');
        const result = await getContextForFile('/workspace/single-match.ts', fileType, '/workspace');

        expect(result.related_memory).toBeDefined();
        expect(result.related_memory!.length).toBe(1);
      });
    });

    describe('project root discovery', () => {
      it('finds .goodvibes directory by walking up', async () => {
        mockStat.mockImplementation(async (path: string) => {
          const pathStr = typeof path === 'string' ? path : path.toString();
          if (pathStr === '/project/.goodvibes') {
            return { isDirectory: () => true } as any;
          }
          throw new Error('ENOENT');
        });
        mockMemoryFiles();

        const fileType = createFileTypeInfo('typescript');
        const result = await getContextForFile('/project/src/nested/deep/test.ts', fileType, '/project');

        expect(result.file_type).toEqual(fileType);
        expect(mockStat).toHaveBeenCalledWith(expect.stringContaining('.goodvibes'));
      });

      it('uses workDir as fallback when no .goodvibes found', async () => {
        mockStat.mockRejectedValue(new Error('ENOENT'));
        mockMemoryFiles();

        const fileType = createFileTypeInfo('typescript');
        const result = await getContextForFile('/fallbacktest/path/testing.ts', fileType, '/fallbackwork');

        expect(result.file_type).toEqual(fileType);
        // Should attempt to read from workDir/.goodvibes/memory
        const readFileCalls = mockReadFile.mock.calls.map(call => call[0] as string);
        expect(readFileCalls.some(path => path.includes('/fallbackwork/.goodvibes/memory'))).toBe(true);
      });
    });

    describe('memory file loading', () => {
      it('handles missing decisions.json gracefully', async () => {
        mockGoodvibesDir('/project');
        mockReadFile.mockImplementation(async (path: string) => {
          const pathStr = typeof path === 'string' ? path : path.toString();
          if (pathStr.endsWith('decisions.json')) {
            throw new Error('ENOENT');
          }
          return JSON.stringify({ entries: [] });
        });

        const fileType = createFileTypeInfo('typescript');
        const result = await getContextForFile('/project/src/file.ts', fileType, '/project');

        expect(result.file_type).toEqual(fileType);
      });

      it('handles missing patterns.json gracefully', async () => {
        mockGoodvibesDir('/project');
        mockReadFile.mockImplementation(async (path: string) => {
          const pathStr = typeof path === 'string' ? path : path.toString();
          if (pathStr.endsWith('patterns.json')) {
            throw new Error('ENOENT');
          }
          return JSON.stringify({ entries: [] });
        });

        const fileType = createFileTypeInfo('typescript');
        const result = await getContextForFile('/project/src/file.ts', fileType, '/project');

        expect(result.file_type).toEqual(fileType);
      });

      it('handles missing failures.json gracefully', async () => {
        mockGoodvibesDir('/project');
        mockReadFile.mockImplementation(async (path: string) => {
          const pathStr = typeof path === 'string' ? path : path.toString();
          if (pathStr.endsWith('failures.json')) {
            throw new Error('ENOENT');
          }
          return JSON.stringify({ entries: [] });
        });

        const fileType = createFileTypeInfo('typescript');
        const result = await getContextForFile('/project/src/file.ts', fileType, '/project');

        expect(result.file_type).toEqual(fileType);
      });

      it('handles all missing memory files', async () => {
        mockGoodvibesDir('/project');
        mockReadFile.mockRejectedValue(new Error('ENOENT'));

        const fileType = createFileTypeInfo('typescript');
        const result = await getContextForFile('/project/src/file.ts', fileType, '/project');

        expect(result.file_type).toEqual(fileType);
        expect(result.related_memory).toBeUndefined();
      });

      it('handles malformed JSON gracefully', async () => {
        mockGoodvibesDir('/project');
        mockReadFile.mockResolvedValue('{ invalid json }');

        const fileType = createFileTypeInfo('typescript');
        const result = await getContextForFile('/project/src/file.ts', fileType, '/project');

        expect(result.file_type).toEqual(fileType);
      });

      it('handles empty memory files', async () => {
        mockGoodvibesDir('/project');
        mockMemoryFiles([], [], []);

        const fileType = createFileTypeInfo('typescript');
        const result = await getContextForFile('/project/src/file.ts', fileType, '/project');

        expect(result.file_type).toEqual(fileType);
        expect(result.related_memory).toBeUndefined();
      });
    });

    describe('caching behavior', () => {
      it('caches memory files within TTL', async () => {
        mockGoodvibesDir('/project');
        mockMemoryFiles([{ id: 'decision-1', what: 'Test', why: 'Because', keywords: ['typescript'] }]);

        const fileType = createFileTypeInfo('typescript');

        // First call - cache miss
        await getContextForFile('/project/src/file.ts', fileType, '/project');
        const firstCallCount = mockReadFile.mock.calls.length;

        // Second call within TTL - cache hit
        resetContextTracking();
        await getContextForFile('/project/src/other.ts', fileType, '/project');
        const secondCallCount = mockReadFile.mock.calls.length;

        expect(secondCallCount).toBe(firstCallCount);
      });

      it('invalidates cache after TTL expires', async () => {
        mockGoodvibesDir('/project');
        mockMemoryFiles([{ id: 'decision-1', what: 'Test', why: 'Because', keywords: ['typescript'] }]);

        const fileType = createFileTypeInfo('typescript');

        // First call
        await getContextForFile('/project/src/file.ts', fileType, '/project');
        const firstCallCount = mockReadFile.mock.calls.length;

        // Advance time past TTL (30 seconds)
        vi.advanceTimersByTime(31000);

        // Second call after TTL - cache miss
        resetContextTracking();
        await getContextForFile('/project/src/other.ts', fileType, '/project');
        const secondCallCount = mockReadFile.mock.calls.length;

        expect(secondCallCount).toBeGreaterThan(firstCallCount);
      });

      it('invalidates cache when memoryDir changes', async () => {
        // First project
        mockStat.mockImplementation(async (path: string) => {
          const pathStr = typeof path === 'string' ? path : path.toString();
          if (pathStr.includes('/project1/.goodvibes')) {
            return { isDirectory: () => true } as any;
          }
          if (pathStr.includes('/project2/.goodvibes')) {
            return { isDirectory: () => true } as any;
          }
          throw new Error('ENOENT');
        });
        mockMemoryFiles([{ id: 'decision-1', what: 'Test', why: 'Because', keywords: ['typescript'] }]);

        const fileType = createFileTypeInfo('typescript');

        // First project
        await getContextForFile('/project1/src/test.ts', fileType, '/project1');
        const firstCallCount = mockReadFile.mock.calls.length;

        // Different project
        resetContextTracking();
        await getContextForFile('/project2/src/test.ts', fileType, '/project2');
        const secondCallCount = mockReadFile.mock.calls.length;

        expect(secondCallCount).toBeGreaterThan(firstCallCount);
      });
    });

    describe('edge cases', () => {
      it('handles file paths with special characters', async () => {
        mockGoodvibesDir('/project');
        mockMemoryFiles();

        const fileType = createFileTypeInfo('typescript');
        const result = await getContextForFile('/project/src/file-with-dashes_and_underscores.test.ts', fileType, '/project');

        expect(result.file_type).toEqual(fileType);
      });

      it('handles deeply nested file paths', async () => {
        mockGoodvibesDir('/project');
        mockMemoryFiles();

        const fileType = createFileTypeInfo('typescript');
        const result = await getContextForFile('/project/src/features/auth/components/forms/LoginForm.tsx', fileType, '/project');

        expect(result.file_type).toEqual(fileType);
      });

      it('handles file path at project root', async () => {
        mockGoodvibesDir('/project');
        mockMemoryFiles();

        const fileType = createFileTypeInfo('typescript');
        const result = await getContextForFile('/project/test.ts', fileType, '/project');

        expect(result.file_type).toEqual(fileType);
      });

      it('handles entries with keywords field but no relevant matches', async () => {
        mockGoodvibesDir('/keywordtest');
        mockMemoryFiles(
          [{ id: 'decision-1', what: 'Test', why: 'Because', keywords: ['completely', 'unrelated', 'keywords', 'different', 'stuff', 'random', 'words', 'nothing'] }]
        );

        const fileType = createFileTypeInfo('typescript');
        const result = await getContextForFile('/keywordtest/features/auth/login.ts', fileType, '/keywordtest');

        // Should not include entries with insufficient keyword overlap
        expect(result.related_memory?.some(e => e.id === 'decision-1') || false).toBe(false);
      });
    });
  });
});
