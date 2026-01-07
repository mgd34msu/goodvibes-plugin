/**
 * Comprehensive unit tests for constants.ts
 *
 * Tests cover:
 * - LOCKFILES: readonly array of package manager lockfiles
 * - PLUGIN_ROOT: environment variable with fallback
 * - PROJECT_ROOT: environment variable with fallback
 * - CACHE_DIR: derived path from PLUGIN_ROOT
 * - ANALYTICS_FILE: derived path from CACHE_DIR
 *
 * Target: 100% line and branch coverage
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'path';

describe('constants', () => {
  // Store original env values
  const originalPluginRoot = process.env.CLAUDE_PLUGIN_ROOT;
  const originalProjectDir = process.env.CLAUDE_PROJECT_DIR;

  afterEach(() => {
    // Restore original env values
    if (originalPluginRoot === undefined) {
      delete process.env.CLAUDE_PLUGIN_ROOT;
    } else {
      process.env.CLAUDE_PLUGIN_ROOT = originalPluginRoot;
    }
    if (originalProjectDir === undefined) {
      delete process.env.CLAUDE_PROJECT_DIR;
    } else {
      process.env.CLAUDE_PROJECT_DIR = originalProjectDir;
    }
    // Clear module cache to allow re-import with different env
    vi.resetModules();
  });

  describe('LOCKFILES', () => {
    it('should export an array of package manager lockfile names', async () => {
      const { LOCKFILES } = await import('../../shared/constants.js');

      expect(LOCKFILES).toEqual([
        'pnpm-lock.yaml',
        'yarn.lock',
        'package-lock.json',
        'bun.lockb',
      ]);
    });

    it('should be an array with 4 lockfile types', async () => {
      const { LOCKFILES } = await import('../../shared/constants.js');

      expect(LOCKFILES).toHaveLength(4);
      expect(Array.isArray(LOCKFILES)).toBe(true);
    });

    it('should include pnpm lockfile', async () => {
      const { LOCKFILES } = await import('../../shared/constants.js');

      expect(LOCKFILES).toContain('pnpm-lock.yaml');
    });

    it('should include yarn lockfile', async () => {
      const { LOCKFILES } = await import('../../shared/constants.js');

      expect(LOCKFILES).toContain('yarn.lock');
    });

    it('should include npm lockfile', async () => {
      const { LOCKFILES } = await import('../../shared/constants.js');

      expect(LOCKFILES).toContain('package-lock.json');
    });

    it('should include bun lockfile', async () => {
      const { LOCKFILES } = await import('../../shared/constants.js');

      expect(LOCKFILES).toContain('bun.lockb');
    });
  });

  describe('PLUGIN_ROOT', () => {
    it('should use CLAUDE_PLUGIN_ROOT env var when set', async () => {
      process.env.CLAUDE_PLUGIN_ROOT = '/custom/plugin/root';
      vi.resetModules();

      const { PLUGIN_ROOT } = await import('../../shared/constants.js');

      expect(PLUGIN_ROOT).toBe('/custom/plugin/root');
    });

    it('should fallback to parent of cwd when env var is not set', async () => {
      delete process.env.CLAUDE_PLUGIN_ROOT;
      vi.resetModules();

      const { PLUGIN_ROOT } = await import('../../shared/constants.js');

      expect(PLUGIN_ROOT).toBe(path.resolve(process.cwd(), '..'));
    });

    it('should handle empty string env var as falsy (use fallback)', async () => {
      process.env.CLAUDE_PLUGIN_ROOT = '';
      vi.resetModules();

      const { PLUGIN_ROOT } = await import('../../shared/constants.js');

      // Empty string is falsy, so fallback is used
      expect(PLUGIN_ROOT).toBe(path.resolve(process.cwd(), '..'));
    });
  });

  describe('PROJECT_ROOT', () => {
    it('should use CLAUDE_PROJECT_DIR env var when set', async () => {
      process.env.CLAUDE_PROJECT_DIR = '/custom/project/dir';
      vi.resetModules();

      const { PROJECT_ROOT } = await import('../../shared/constants.js');

      expect(PROJECT_ROOT).toBe('/custom/project/dir');
    });

    it('should fallback to cwd when env var is not set', async () => {
      delete process.env.CLAUDE_PROJECT_DIR;
      vi.resetModules();

      const { PROJECT_ROOT } = await import('../../shared/constants.js');

      expect(PROJECT_ROOT).toBe(process.cwd());
    });

    it('should handle empty string env var as falsy (use fallback)', async () => {
      process.env.CLAUDE_PROJECT_DIR = '';
      vi.resetModules();

      const { PROJECT_ROOT } = await import('../../shared/constants.js');

      // Empty string is falsy, so fallback is used
      expect(PROJECT_ROOT).toBe(process.cwd());
    });
  });

  describe('CACHE_DIR', () => {
    it('should be derived from PLUGIN_ROOT with .cache suffix', async () => {
      process.env.CLAUDE_PLUGIN_ROOT = '/test/plugin';
      vi.resetModules();

      const { CACHE_DIR, PLUGIN_ROOT } =
        await import('../../shared/constants.js');

      expect(CACHE_DIR).toBe(path.join(PLUGIN_ROOT, '.cache'));
      expect(CACHE_DIR).toBe(path.join('/test/plugin', '.cache'));
    });

    it('should use fallback PLUGIN_ROOT when env var not set', async () => {
      delete process.env.CLAUDE_PLUGIN_ROOT;
      vi.resetModules();

      const { CACHE_DIR } = await import('../../shared/constants.js');

      const expectedPluginRoot = path.resolve(process.cwd(), '..');
      expect(CACHE_DIR).toBe(path.join(expectedPluginRoot, '.cache'));
    });
  });

  describe('ANALYTICS_FILE', () => {
    it('should be derived from CACHE_DIR with analytics.json suffix', async () => {
      process.env.CLAUDE_PLUGIN_ROOT = '/test/plugin';
      vi.resetModules();

      const { ANALYTICS_FILE, CACHE_DIR } =
        await import('../../shared/constants.js');

      expect(ANALYTICS_FILE).toBe(path.join(CACHE_DIR, 'analytics.json'));
      expect(ANALYTICS_FILE).toBe(
        path.join('/test/plugin', '.cache', 'analytics.json')
      );
    });

    it('should use fallback paths when env vars not set', async () => {
      delete process.env.CLAUDE_PLUGIN_ROOT;
      vi.resetModules();

      const { ANALYTICS_FILE } = await import('../../shared/constants.js');

      const expectedPluginRoot = path.resolve(process.cwd(), '..');
      const expectedCacheDir = path.join(expectedPluginRoot, '.cache');
      expect(ANALYTICS_FILE).toBe(
        path.join(expectedCacheDir, 'analytics.json')
      );
    });
  });

  describe('path relationships', () => {
    it('should have consistent path hierarchy', async () => {
      process.env.CLAUDE_PLUGIN_ROOT = '/root/plugin';
      process.env.CLAUDE_PROJECT_DIR = '/root/project';
      vi.resetModules();

      const { PLUGIN_ROOT, PROJECT_ROOT, CACHE_DIR, ANALYTICS_FILE } =
        await import('../../shared/constants.js');

      // Verify CACHE_DIR contains .cache segment after PLUGIN_ROOT
      expect(CACHE_DIR).toBe(path.join(PLUGIN_ROOT, '.cache'));

      // Verify ANALYTICS_FILE contains analytics.json after CACHE_DIR
      expect(ANALYTICS_FILE).toBe(path.join(CACHE_DIR, 'analytics.json'));

      // PROJECT_ROOT is independent
      expect(PROJECT_ROOT).toBe('/root/project');
    });
  });
});
