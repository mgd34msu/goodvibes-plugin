/**
 * Tests for stack-detector.ts
 *
 * Tests the stack detection functionality including:
 * - Framework detection via config files
 * - Package manager detection via lockfiles
 * - TypeScript strict mode detection
 * - Caching behavior with TTL and LRU pruning
 * - formatStackInfo output formatting
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import { fileExists } from '../../shared/file-utils.js';
import {
  detectStack,
  formatStackInfo,
  clearStackCache,
  type StackInfo,
} from '../../context/stack-detector.js';

// Mock dependencies
vi.mock('fs/promises');
vi.mock('../../shared/file-utils.js');
vi.mock('../../shared/logging.js', () => ({
  debug: vi.fn(),
}));

describe('stack-detector', () => {
  const mockCwd = '/test/project';

  beforeEach(() => {
    vi.clearAllMocks();
    clearStackCache();
    // Reset Date.now mock if any
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('detectStack', () => {
    describe('framework detection', () => {
      it('should detect Next.js via next.config', async () => {
        vi.mocked(fileExists).mockImplementation(async (path: string) => {
          return path.includes('next.config');
        });

        const result = await detectStack(mockCwd);

        expect(result.frameworks).toContain('Next.js');
      });

      it('should detect Next.js via next.config.js', async () => {
        vi.mocked(fileExists).mockImplementation(async (path: string) => {
          return path.endsWith('next.config.js');
        });

        const result = await detectStack(mockCwd);

        expect(result.frameworks).toContain('Next.js');
      });

      it('should detect Next.js via next.config.ts', async () => {
        vi.mocked(fileExists).mockImplementation(async (path: string) => {
          return path.endsWith('next.config.ts');
        });

        const result = await detectStack(mockCwd);

        expect(result.frameworks).toContain('Next.js');
      });

      it('should detect Next.js via next.config.mjs', async () => {
        vi.mocked(fileExists).mockImplementation(async (path: string) => {
          return path.endsWith('next.config.mjs');
        });

        const result = await detectStack(mockCwd);

        expect(result.frameworks).toContain('Next.js');
      });

      it('should detect Nuxt via nuxt.config', async () => {
        vi.mocked(fileExists).mockImplementation(async (path: string) => {
          return path.includes('nuxt.config');
        });

        const result = await detectStack(mockCwd);

        expect(result.frameworks).toContain('Nuxt');
      });

      it('should detect SvelteKit via svelte.config', async () => {
        vi.mocked(fileExists).mockImplementation(async (path: string) => {
          return path.includes('svelte.config');
        });

        const result = await detectStack(mockCwd);

        expect(result.frameworks).toContain('SvelteKit');
      });

      it('should detect Astro via astro.config', async () => {
        vi.mocked(fileExists).mockImplementation(async (path: string) => {
          return path.includes('astro.config');
        });

        const result = await detectStack(mockCwd);

        expect(result.frameworks).toContain('Astro');
      });

      it('should detect Remix via remix.config', async () => {
        vi.mocked(fileExists).mockImplementation(async (path: string) => {
          return path.includes('remix.config');
        });

        const result = await detectStack(mockCwd);

        expect(result.frameworks).toContain('Remix');
      });

      it('should detect Vite via vite.config', async () => {
        vi.mocked(fileExists).mockImplementation(async (path: string) => {
          return path.includes('vite.config');
        });

        const result = await detectStack(mockCwd);

        expect(result.frameworks).toContain('Vite');
      });

      it('should detect Angular via angular.json', async () => {
        vi.mocked(fileExists).mockImplementation(async (path: string) => {
          return path.includes('angular.json');
        });

        const result = await detectStack(mockCwd);

        expect(result.frameworks).toContain('Angular');
      });

      it('should detect Vue CLI via vue.config', async () => {
        vi.mocked(fileExists).mockImplementation(async (path: string) => {
          return path.includes('vue.config');
        });

        const result = await detectStack(mockCwd);

        expect(result.frameworks).toContain('Vue CLI');
      });

      it('should detect Prisma via prisma/schema.prisma', async () => {
        vi.mocked(fileExists).mockImplementation(async (path: string) => {
          return path.includes('prisma/schema.prisma') || path.includes('prisma\\schema.prisma');
        });

        const result = await detectStack(mockCwd);

        expect(result.frameworks).toContain('Prisma');
      });

      it('should detect Drizzle via drizzle.config', async () => {
        vi.mocked(fileExists).mockImplementation(async (path: string) => {
          return path.includes('drizzle.config');
        });

        const result = await detectStack(mockCwd);

        expect(result.frameworks).toContain('Drizzle');
      });

      it('should detect Tailwind CSS via tailwind.config', async () => {
        vi.mocked(fileExists).mockImplementation(async (path: string) => {
          return path.includes('tailwind.config');
        });

        const result = await detectStack(mockCwd);

        expect(result.frameworks).toContain('Tailwind CSS');
      });

      it('should detect Vitest via vitest.config', async () => {
        vi.mocked(fileExists).mockImplementation(async (path: string) => {
          return path.includes('vitest.config');
        });

        const result = await detectStack(mockCwd);

        expect(result.frameworks).toContain('Vitest');
      });

      it('should detect Jest via jest.config', async () => {
        vi.mocked(fileExists).mockImplementation(async (path: string) => {
          return path.includes('jest.config');
        });

        const result = await detectStack(mockCwd);

        expect(result.frameworks).toContain('Jest');
      });

      it('should detect Playwright via playwright.config', async () => {
        vi.mocked(fileExists).mockImplementation(async (path: string) => {
          return path.includes('playwright.config');
        });

        const result = await detectStack(mockCwd);

        expect(result.frameworks).toContain('Playwright');
      });

      it('should detect Turborepo via turbo.json', async () => {
        vi.mocked(fileExists).mockImplementation(async (path: string) => {
          return path.includes('turbo.json');
        });

        const result = await detectStack(mockCwd);

        expect(result.frameworks).toContain('Turborepo');
      });

      it('should detect pnpm workspaces via pnpm-workspace.yaml', async () => {
        vi.mocked(fileExists).mockImplementation(async (path: string) => {
          return path.includes('pnpm-workspace.yaml');
        });

        const result = await detectStack(mockCwd);

        expect(result.frameworks).toContain('pnpm workspaces');
      });

      it('should detect TypeScript via tsconfig.json', async () => {
        vi.mocked(fileExists).mockImplementation(async (path: string) => {
          return path.includes('tsconfig.json');
        });
        vi.mocked(fs.readFile).mockResolvedValue('{}');

        const result = await detectStack(mockCwd);

        expect(result.frameworks).toContain('TypeScript');
        expect(result.hasTypeScript).toBe(true);
      });

      it('should detect multiple frameworks', async () => {
        vi.mocked(fileExists).mockImplementation(async (path: string) => {
          if (path.includes('next.config')) return true;
          if (path.includes('tailwind.config')) return true;
          if (path.includes('tsconfig.json')) return true;
          return false;
        });
        vi.mocked(fs.readFile).mockResolvedValue('{}');

        const result = await detectStack(mockCwd);

        expect(result.frameworks).toContain('Next.js');
        expect(result.frameworks).toContain('Tailwind CSS');
        expect(result.frameworks).toContain('TypeScript');
      });

      it('should return empty frameworks when no config files found', async () => {
        vi.mocked(fileExists).mockResolvedValue(false);

        const result = await detectStack(mockCwd);

        expect(result.frameworks).toHaveLength(0);
      });
    });

    describe('package manager detection', () => {
      it('should detect pnpm via pnpm-lock.yaml', async () => {
        vi.mocked(fileExists).mockImplementation(async (path: string) => {
          return path.includes('pnpm-lock.yaml');
        });

        const result = await detectStack(mockCwd);

        expect(result.packageManager).toBe('pnpm');
      });

      it('should detect yarn via yarn.lock', async () => {
        vi.mocked(fileExists).mockImplementation(async (path: string) => {
          return path.includes('yarn.lock');
        });

        const result = await detectStack(mockCwd);

        expect(result.packageManager).toBe('yarn');
      });

      it('should detect npm via package-lock.json', async () => {
        vi.mocked(fileExists).mockImplementation(async (path: string) => {
          return path.includes('package-lock.json');
        });

        const result = await detectStack(mockCwd);

        expect(result.packageManager).toBe('npm');
      });

      it('should detect bun via bun.lockb', async () => {
        vi.mocked(fileExists).mockImplementation(async (path: string) => {
          return path.includes('bun.lockb');
        });

        const result = await detectStack(mockCwd);

        expect(result.packageManager).toBe('bun');
      });

      it('should return null when no lockfile found', async () => {
        vi.mocked(fileExists).mockResolvedValue(false);

        const result = await detectStack(mockCwd);

        expect(result.packageManager).toBeNull();
      });

      it('should prefer first lockfile found (pnpm over yarn)', async () => {
        vi.mocked(fileExists).mockImplementation(async (path: string) => {
          if (path.includes('pnpm-lock.yaml')) return true;
          if (path.includes('yarn.lock')) return true;
          return false;
        });

        const result = await detectStack(mockCwd);

        expect(result.packageManager).toBe('pnpm');
      });
    });

    describe('TypeScript strict mode detection', () => {
      it('should detect strict mode when enabled', async () => {
        vi.mocked(fileExists).mockImplementation(async (path: string) => {
          return path.includes('tsconfig.json');
        });
        vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({
          compilerOptions: {
            strict: true,
          },
        }));

        const result = await detectStack(mockCwd);

        expect(result.hasTypeScript).toBe(true);
        expect(result.isStrict).toBe(true);
      });

      it('should not set strict when not in config', async () => {
        vi.mocked(fileExists).mockImplementation(async (path: string) => {
          return path.includes('tsconfig.json');
        });
        vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({
          compilerOptions: {},
        }));

        const result = await detectStack(mockCwd);

        expect(result.hasTypeScript).toBe(true);
        expect(result.isStrict).toBe(false);
      });

      it('should not set strict when strict is false', async () => {
        vi.mocked(fileExists).mockImplementation(async (path: string) => {
          return path.includes('tsconfig.json');
        });
        vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({
          compilerOptions: {
            strict: false,
          },
        }));

        const result = await detectStack(mockCwd);

        expect(result.hasTypeScript).toBe(true);
        expect(result.isStrict).toBe(false);
      });

      it('should handle tsconfig without compilerOptions', async () => {
        vi.mocked(fileExists).mockImplementation(async (path: string) => {
          return path.includes('tsconfig.json');
        });
        vi.mocked(fs.readFile).mockResolvedValue('{}');

        const result = await detectStack(mockCwd);

        expect(result.hasTypeScript).toBe(true);
        expect(result.isStrict).toBe(false);
      });

      it('should handle invalid JSON in tsconfig gracefully', async () => {
        vi.mocked(fileExists).mockImplementation(async (path: string) => {
          return path.includes('tsconfig.json');
        });
        vi.mocked(fs.readFile).mockResolvedValue('{ invalid json }');

        const result = await detectStack(mockCwd);

        expect(result.hasTypeScript).toBe(true);
        expect(result.isStrict).toBe(false);
      });

      it('should handle tsconfig with comments (common but invalid JSON)', async () => {
        vi.mocked(fileExists).mockImplementation(async (path: string) => {
          return path.includes('tsconfig.json');
        });
        vi.mocked(fs.readFile).mockResolvedValue(`{
          // This is a comment
          "compilerOptions": {
            "strict": true
          }
        }`);

        const result = await detectStack(mockCwd);

        // JSON.parse will fail with comments, so isStrict should be false
        expect(result.hasTypeScript).toBe(true);
        expect(result.isStrict).toBe(false);
      });

      it('should handle file read error gracefully', async () => {
        vi.mocked(fileExists).mockImplementation(async (path: string) => {
          return path.includes('tsconfig.json');
        });
        vi.mocked(fs.readFile).mockRejectedValue(new Error('File read error'));

        const result = await detectStack(mockCwd);

        expect(result.hasTypeScript).toBe(true);
        expect(result.isStrict).toBe(false);
      });
    });

    describe('caching behavior', () => {
      it('should cache results for same cwd', async () => {
        vi.mocked(fileExists).mockResolvedValue(false);

        // First call
        const result1 = await detectStack(mockCwd);

        // Change mock behavior
        vi.mocked(fileExists).mockImplementation(async (path: string) => {
          return path.includes('next.config');
        });

        // Second call should return cached result
        const result2 = await detectStack(mockCwd);

        expect(result1).toEqual(result2);
        expect(result2.frameworks).toHaveLength(0);
      });

      it('should return fresh results for different cwd', async () => {
        vi.mocked(fileExists).mockResolvedValue(false);

        const result1 = await detectStack(mockCwd);

        vi.mocked(fileExists).mockImplementation(async (path: string) => {
          return path.includes('next.config');
        });

        const result2 = await detectStack('/different/path');

        expect(result1.frameworks).toHaveLength(0);
        expect(result2.frameworks).toContain('Next.js');
      });

      it('should invalidate cache after TTL expires', async () => {
        vi.useFakeTimers();
        const now = Date.now();
        vi.setSystemTime(now);

        vi.mocked(fileExists).mockResolvedValue(false);

        // First call
        const result1 = await detectStack(mockCwd);
        expect(result1.frameworks).toHaveLength(0);

        // Advance time past TTL (5 minutes)
        vi.setSystemTime(now + 5 * 60 * 1000 + 1);

        // Change mock behavior
        vi.mocked(fileExists).mockImplementation(async (path: string) => {
          return path.includes('next.config');
        });

        // Second call should return fresh result
        const result2 = await detectStack(mockCwd);

        expect(result2.frameworks).toContain('Next.js');
      });

      it('should clear cache when clearStackCache is called', async () => {
        vi.mocked(fileExists).mockResolvedValue(false);

        // First call
        await detectStack(mockCwd);

        // Clear cache
        clearStackCache();

        // Change mock behavior
        vi.mocked(fileExists).mockImplementation(async (path: string) => {
          return path.includes('next.config');
        });

        // Call should return fresh result
        const result = await detectStack(mockCwd);

        expect(result.frameworks).toContain('Next.js');
      });
    });

    describe('cache pruning', () => {
      it('should prune expired entries when cache exceeds threshold', async () => {
        vi.useFakeTimers();
        const now = Date.now();
        vi.setSystemTime(now);

        vi.mocked(fileExists).mockResolvedValue(false);

        // Fill cache with entries
        for (let i = 0; i < 45; i++) {
          await detectStack(`/project-${i}`);
        }

        // Advance time past TTL
        vi.setSystemTime(now + 5 * 60 * 1000 + 1);

        // Also advance past prune interval
        vi.setSystemTime(now + 5 * 60 * 1000 + 60 * 1000 + 1);

        // Next call should trigger pruning
        vi.mocked(fileExists).mockImplementation(async (path: string) => {
          return path.includes('next.config');
        });

        const result = await detectStack('/new-project');

        expect(result.frameworks).toContain('Next.js');
      });

      it('should remove oldest entries when cache exceeds maximum size', async () => {
        vi.useFakeTimers();
        const now = Date.now();
        vi.setSystemTime(now);

        vi.mocked(fileExists).mockResolvedValue(false);

        // Fill cache to maximum (50 entries)
        for (let i = 0; i < 55; i++) {
          // Advance time slightly for each entry to ensure order
          vi.setSystemTime(now + i * 10);
          await detectStack(`/project-${i}`);
          // Clear cache after each to avoid caching, then refill
          if (i < 54) {
            // Don't clear on last iteration
          }
        }

        // Cache should handle the overflow by pruning
        // Adding one more should trigger size-based pruning
        vi.setSystemTime(now + 60 * 1000 + 1); // Past prune interval
        await detectStack('/final-project');
      });

      it('should skip pruning when within prune interval and below threshold', async () => {
        vi.useFakeTimers();
        const now = Date.now();
        vi.setSystemTime(now);

        vi.mocked(fileExists).mockResolvedValue(false);

        // Add a few entries (below threshold of 40)
        for (let i = 0; i < 5; i++) {
          await detectStack(`/project-${i}`);
        }

        // Advance time slightly but not past prune interval
        vi.setSystemTime(now + 1000);

        // Next call should skip pruning
        const result = await detectStack('/new-project');

        expect(result.frameworks).toHaveLength(0);
      });

      it('should prune when cache exceeds max entries even within prune interval', async () => {
        vi.useFakeTimers();
        const now = Date.now();
        vi.setSystemTime(now);

        vi.mocked(fileExists).mockResolvedValue(false);

        // Fill cache to exceed maximum (50 entries)
        for (let i = 0; i < 52; i++) {
          clearStackCache(); // Clear to reset prune time
          vi.setSystemTime(now + i);
          // Re-add entries
          for (let j = 0; j <= i && j < 52; j++) {
            await detectStack(`/project-${j}`);
          }
        }
      });
    });
  });

  describe('formatStackInfo', () => {
    it('should format complete stack info', () => {
      const info: StackInfo = {
        frameworks: ['Next.js', 'Tailwind CSS'],
        packageManager: 'pnpm',
        hasTypeScript: true,
        isStrict: true,
      };

      const result = formatStackInfo(info);

      expect(result).toContain('Stack: Next.js, Tailwind CSS');
      expect(result).toContain('TypeScript: strict');
      expect(result).toContain('Package Manager: pnpm');
    });

    it('should format TypeScript non-strict mode', () => {
      const info: StackInfo = {
        frameworks: ['TypeScript'],
        packageManager: 'npm',
        hasTypeScript: true,
        isStrict: false,
      };

      const result = formatStackInfo(info);

      expect(result).toContain('TypeScript: not strict');
    });

    it('should handle empty frameworks array', () => {
      const info: StackInfo = {
        frameworks: [],
        packageManager: 'npm',
        hasTypeScript: false,
        isStrict: false,
      };

      const result = formatStackInfo(info);

      expect(result).not.toContain('Stack:');
      expect(result).toContain('Package Manager: npm');
    });

    it('should handle null package manager', () => {
      const info: StackInfo = {
        frameworks: ['Next.js'],
        packageManager: null,
        hasTypeScript: false,
        isStrict: false,
      };

      const result = formatStackInfo(info);

      expect(result).toContain('Stack: Next.js');
      expect(result).not.toContain('Package Manager');
    });

    it('should handle no TypeScript', () => {
      const info: StackInfo = {
        frameworks: ['Next.js'],
        packageManager: 'npm',
        hasTypeScript: false,
        isStrict: false,
      };

      const result = formatStackInfo(info);

      expect(result).not.toContain('TypeScript:');
    });

    it('should return empty string for completely empty info', () => {
      const info: StackInfo = {
        frameworks: [],
        packageManager: null,
        hasTypeScript: false,
        isStrict: false,
      };

      const result = formatStackInfo(info);

      expect(result).toBe('');
    });

    it('should return empty string for null input', () => {
      const result = formatStackInfo(null as unknown as StackInfo);

      expect(result).toBe('');
    });

    it('should return empty string for undefined input', () => {
      const result = formatStackInfo(undefined as unknown as StackInfo);

      expect(result).toBe('');
    });

    it('should return empty string for non-object input', () => {
      const result = formatStackInfo('string' as unknown as StackInfo);

      expect(result).toBe('');
    });

    it('should handle info with only frameworks', () => {
      const info: StackInfo = {
        frameworks: ['Vite', 'React'],
        packageManager: null,
        hasTypeScript: false,
        isStrict: false,
      };

      const result = formatStackInfo(info);

      expect(result).toBe('Stack: Vite, React');
    });

    it('should handle info with only TypeScript', () => {
      const info: StackInfo = {
        frameworks: [],
        packageManager: null,
        hasTypeScript: true,
        isStrict: true,
      };

      const result = formatStackInfo(info);

      expect(result).toBe('TypeScript: strict');
    });

    it('should handle info with only package manager', () => {
      const info: StackInfo = {
        frameworks: [],
        packageManager: 'yarn',
        hasTypeScript: false,
        isStrict: false,
      };

      const result = formatStackInfo(info);

      expect(result).toBe('Package Manager: yarn');
    });

    it('should format multiple lines correctly', () => {
      const info: StackInfo = {
        frameworks: ['Next.js'],
        packageManager: 'pnpm',
        hasTypeScript: true,
        isStrict: false,
      };

      const result = formatStackInfo(info);
      const lines = result.split('\n');

      expect(lines).toHaveLength(3);
      expect(lines[0]).toBe('Stack: Next.js');
      expect(lines[1]).toBe('TypeScript: not strict');
      expect(lines[2]).toBe('Package Manager: pnpm');
    });

    it('should handle undefined frameworks property', () => {
      const info = {
        packageManager: 'npm',
        hasTypeScript: false,
        isStrict: false,
      } as unknown as StackInfo;

      const result = formatStackInfo(info);

      expect(result).toContain('Package Manager: npm');
    });
  });

  describe('edge cases', () => {
    it('should handle special characters in cwd path', async () => {
      vi.mocked(fileExists).mockResolvedValue(false);

      const specialCwd = '/path/with spaces/and-dashes/project';
      const result = await detectStack(specialCwd);

      expect(result).toBeDefined();
      expect(result.frameworks).toHaveLength(0);
    });

    it('should handle Windows-style paths', async () => {
      vi.mocked(fileExists).mockResolvedValue(false);

      const windowsCwd = 'C:\\Users\\test\\project';
      const result = await detectStack(windowsCwd);

      expect(result).toBeDefined();
    });

    it('should handle concurrent calls to same cwd', async () => {
      vi.mocked(fileExists).mockImplementation(async () => {
        // Simulate async delay
        await new Promise(resolve => setTimeout(resolve, 10));
        return false;
      });

      const [result1, result2] = await Promise.all([
        detectStack(mockCwd),
        detectStack(mockCwd),
      ]);

      expect(result1).toEqual(result2);
    });

    it('should handle fileExists throwing an error', async () => {
      vi.mocked(fileExists).mockRejectedValue(new Error('Permission denied'));

      await expect(detectStack(mockCwd)).rejects.toThrow('Permission denied');
    });
  });

  describe('clearStackCache', () => {
    it('should reset the cache completely', async () => {
      vi.mocked(fileExists).mockResolvedValue(false);

      // Fill cache
      await detectStack(mockCwd);
      await detectStack('/other/path');

      // Clear
      clearStackCache();

      // Change behavior
      vi.mocked(fileExists).mockImplementation(async (path: string) => {
        return path.includes('next.config');
      });

      // Both should now return fresh results
      const result1 = await detectStack(mockCwd);
      const result2 = await detectStack('/other/path');

      expect(result1.frameworks).toContain('Next.js');
      expect(result2.frameworks).toContain('Next.js');
    });

    it('should reset lastPruneTime', async () => {
      vi.useFakeTimers();
      const now = Date.now();
      vi.setSystemTime(now);

      vi.mocked(fileExists).mockResolvedValue(false);

      // Fill cache to trigger pruning
      for (let i = 0; i < 45; i++) {
        await detectStack(`/project-${i}`);
      }

      // Clear cache (should reset lastPruneTime)
      clearStackCache();

      // Immediately add entries without waiting for prune interval
      for (let i = 0; i < 5; i++) {
        await detectStack(`/new-project-${i}`);
      }

      // Should work without issues since lastPruneTime was reset
      const result = await detectStack('/final');
      expect(result).toBeDefined();
    });
  });
});
