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

import * as path from 'path';

import { describe, it, expect, vi, _beforeEach, afterEach } from 'vitest';

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

    it('should resolve from __dirname when env var is not set and __dirname contains hooks', async () => {
      delete process.env.CLAUDE_PLUGIN_ROOT;
      vi.resetModules();

      const { PLUGIN_ROOT } = await import('../../shared/constants.js');

      // When running tests, __dirname contains 'hooks', so it resolves to plugin root
      // by taking substring before 'hooks'
      expect(PLUGIN_ROOT).toContain('goodvibes');
      expect(PLUGIN_ROOT).not.toContain('hooks');
    });

    it('should handle empty string env var as falsy (use __dirname fallback)', async () => {
      process.env.CLAUDE_PLUGIN_ROOT = '';
      vi.resetModules();

      const { PLUGIN_ROOT } = await import('../../shared/constants.js');

      // Empty string is falsy, so __dirname-based fallback is used
      expect(PLUGIN_ROOT).toContain('goodvibes');
      expect(PLUGIN_ROOT).not.toContain('hooks');
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

      const { CACHE_DIR, PLUGIN_ROOT } = await import('../../shared/constants.js');

      // CACHE_DIR should be PLUGIN_ROOT + .cache
      expect(CACHE_DIR).toBe(path.join(PLUGIN_ROOT, '.cache'));
      expect(CACHE_DIR).toContain('.cache');
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

      const { ANALYTICS_FILE, CACHE_DIR } = await import('../../shared/constants.js');

      // ANALYTICS_FILE should be CACHE_DIR + analytics.json
      expect(ANALYTICS_FILE).toBe(path.join(CACHE_DIR, 'analytics.json'));
      expect(ANALYTICS_FILE).toContain('analytics.json');
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

  describe('resolvePluginRootFromDirname', () => {
    it('should use env var when CLAUDE_PLUGIN_ROOT is set', async () => {
      process.env.CLAUDE_PLUGIN_ROOT = '/custom/plugin/root';
      vi.resetModules();

      const { resolvePluginRootFromDirname } = await import('../../shared/constants.js');
      const result = resolvePluginRootFromDirname('/some/path');

      expect(result).toBe('/custom/plugin/root');
    });

    it('should resolve from dirname when it contains hooks and hooksIndex > 0', async () => {
      delete process.env.CLAUDE_PLUGIN_ROOT;
      vi.resetModules();

      const { resolvePluginRootFromDirname } = await import('../../shared/constants.js');
      const result = resolvePluginRootFromDirname('/path/to/plugins/goodvibes/hooks/scripts/dist');

      expect(result).toBe('/path/to/plugins/goodvibes');
    });

    it('should use fallback when dirname does not contain hooks', async () => {
      delete process.env.CLAUDE_PLUGIN_ROOT;
      vi.resetModules();

      const { resolvePluginRootFromDirname } = await import('../../shared/constants.js');
      const result = resolvePluginRootFromDirname('/some/random/path');

      expect(result).toBe(path.join(process.cwd(), 'plugins', 'goodvibes'));
    });

    it('should use fallback when dirname is undefined', async () => {
      delete process.env.CLAUDE_PLUGIN_ROOT;
      vi.resetModules();

      const { resolvePluginRootFromDirname } = await import('../../shared/constants.js');
      const result = resolvePluginRootFromDirname(undefined);

      expect(result).toBe(path.join(process.cwd(), 'plugins', 'goodvibes'));
    });

    it('should use fallback when hooks is at index 0', async () => {
      delete process.env.CLAUDE_PLUGIN_ROOT;
      vi.resetModules();

      const { resolvePluginRootFromDirname } = await import('../../shared/constants.js');
      const result = resolvePluginRootFromDirname('hooks/scripts/dist');

      // hooksIndex is 0, so hooksIndex > 0 is false, fallback is used
      expect(result).toBe(path.join(process.cwd(), 'plugins', 'goodvibes'));
    });
  });

  describe('resolvePluginRoot', () => {
    it('should use resolvePluginRoot function directly with env var set', async () => {
      process.env.CLAUDE_PLUGIN_ROOT = '/test/custom/path';
      vi.resetModules();

      const { resolvePluginRoot } = await import('../../shared/constants.js');
      const result = resolvePluginRoot();

      expect(result).toBe('/test/custom/path');
    });

    it('should use resolvePluginRoot function directly without env var (uses __dirname)', async () => {
      delete process.env.CLAUDE_PLUGIN_ROOT;
      vi.resetModules();

      const { resolvePluginRoot } = await import('../../shared/constants.js');
      const result = resolvePluginRoot();

      // Since tests run from hooks/scripts, __dirname contains 'hooks'
      // and the function returns the path before 'hooks'
      expect(result).toContain('goodvibes');
      expect(result).not.toContain('hooks');
    });
  });
});
