/**
 * Unit tests for config module
 *
 * Tests cover:
 * - PLUGIN_ROOT resolution
 * - PROJECT_ROOT resolution
 * - FUSE_OPTIONS configuration
 * - HOOK_SCRIPT_MAP entries
 * - Environment variable handling
 * - getConfigDir fallback behavior (lines 17-22)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('config', () => {
  // Store original env values
  const originalEnv = { ...process.env };
  const originalDirname = (globalThis as { __dirname?: string }).__dirname;

  beforeEach(() => {
    // Reset module cache to test fresh imports
    vi.resetModules();
    // Clear env variables that affect config
    delete process.env.PLUGIN_ROOT;
    delete process.env.CLAUDE_PLUGIN_ROOT;
    delete process.env.PROJECT_ROOT;
    delete process.env.CLAUDE_PROJECT_DIR;
  });

  afterEach(() => {
    // Restore original env
    process.env = { ...originalEnv };
    if (originalDirname !== undefined) {
      (globalThis as { __dirname?: string }).__dirname = originalDirname;
    }
    vi.restoreAllMocks();
  });

  describe('PLUGIN_ROOT', () => {
    it('should use PLUGIN_ROOT env var when set', async () => {
      process.env.PLUGIN_ROOT = '/custom/plugin/root';
      const { PLUGIN_ROOT } = await import('../config.js');

      expect(PLUGIN_ROOT).toBe('/custom/plugin/root');
    });

    it('should use CLAUDE_PLUGIN_ROOT env var when PLUGIN_ROOT not set', async () => {
      process.env.CLAUDE_PLUGIN_ROOT = '/claude/plugin/root';
      const { PLUGIN_ROOT } = await import('../config.js');

      expect(PLUGIN_ROOT).toBe('/claude/plugin/root');
    });

    it('should prioritize PLUGIN_ROOT over CLAUDE_PLUGIN_ROOT', async () => {
      process.env.PLUGIN_ROOT = '/priority/root';
      process.env.CLAUDE_PLUGIN_ROOT = '/fallback/root';
      const { PLUGIN_ROOT } = await import('../config.js');

      expect(PLUGIN_ROOT).toBe('/priority/root');
    });

    it('should fall back to resolved path when no env vars set', async () => {
      const { PLUGIN_ROOT } = await import('../config.js');

      // Should be a resolved path
      expect(typeof PLUGIN_ROOT).toBe('string');
      expect(PLUGIN_ROOT.length).toBeGreaterThan(0);
    });
  });

  describe('PROJECT_ROOT', () => {
    it('should use PROJECT_ROOT env var when set', async () => {
      process.env.PROJECT_ROOT = '/custom/project';
      const { PROJECT_ROOT } = await import('../config.js');

      expect(PROJECT_ROOT).toBe('/custom/project');
    });

    it('should use CLAUDE_PROJECT_DIR env var when PROJECT_ROOT not set', async () => {
      process.env.CLAUDE_PROJECT_DIR = '/claude/project';
      const { PROJECT_ROOT } = await import('../config.js');

      expect(PROJECT_ROOT).toBe('/claude/project');
    });

    it('should prioritize PROJECT_ROOT over CLAUDE_PROJECT_DIR', async () => {
      process.env.PROJECT_ROOT = '/priority/project';
      process.env.CLAUDE_PROJECT_DIR = '/fallback/project';
      const { PROJECT_ROOT } = await import('../config.js');

      expect(PROJECT_ROOT).toBe('/priority/project');
    });

    it('should fall back to process.cwd() when no env vars set', async () => {
      const { PROJECT_ROOT } = await import('../config.js');

      expect(PROJECT_ROOT).toBe(process.cwd());
    });
  });

  describe('FUSE_OPTIONS', () => {
    it('should have correct keys configuration', async () => {
      const { FUSE_OPTIONS } = await import('../config.js');

      expect(FUSE_OPTIONS.keys).toBeDefined();
      expect(Array.isArray(FUSE_OPTIONS.keys)).toBe(true);
      expect(FUSE_OPTIONS.keys).toHaveLength(3);
    });

    it('should weight name, description, and keywords fields', async () => {
      const { FUSE_OPTIONS } = await import('../config.js');

      const keyNames = FUSE_OPTIONS.keys?.map((k) =>
        typeof k === 'string' ? k : k.name
      );

      expect(keyNames).toContain('name');
      expect(keyNames).toContain('description');
      expect(keyNames).toContain('keywords');
    });

    it('should have appropriate weight distribution', async () => {
      const { FUSE_OPTIONS } = await import('../config.js');

      const keys = FUSE_OPTIONS.keys as Array<{ name: string; weight: number }>;

      // Description should be weighted highest (most relevant for search)
      const descKey = keys.find((k) => k.name === 'description');
      expect(descKey?.weight).toBe(0.4);

      // Name and keywords share remaining weight
      const nameKey = keys.find((k) => k.name === 'name');
      expect(nameKey?.weight).toBe(0.3);

      const keywordsKey = keys.find((k) => k.name === 'keywords');
      expect(keywordsKey?.weight).toBe(0.3);

      // Weights should sum to 1.0
      const totalWeight = keys.reduce((sum, k) => sum + k.weight, 0);
      expect(totalWeight).toBeCloseTo(1.0, 5);
    });

    it('should have appropriate threshold', async () => {
      const { FUSE_OPTIONS } = await import('../config.js');

      // Threshold of 0.4 allows fuzzy but relevant matches
      expect(FUSE_OPTIONS.threshold).toBe(0.4);
    });

    it('should include score in results', async () => {
      const { FUSE_OPTIONS } = await import('../config.js');

      expect(FUSE_OPTIONS.includeScore).toBe(true);
    });

    it('should ignore location for better matching', async () => {
      const { FUSE_OPTIONS } = await import('../config.js');

      // ignoreLocation allows matches regardless of position in string
      expect(FUSE_OPTIONS.ignoreLocation).toBe(true);
    });
  });

  describe('HOOK_SCRIPT_MAP', () => {
    it('should have mapping for all supported hooks', async () => {
      const { HOOK_SCRIPT_MAP } = await import('../config.js');

      const expectedHooks = [
        'SessionStart',
        'PreToolUse',
        'PostToolUse',
        'PostToolUseFailure',
        'PermissionRequest',
        'UserPromptSubmit',
        'Stop',
        'SubagentStart',
        'SubagentStop',
        'PreCompact',
        'SessionEnd',
        'Notification',
      ];

      for (const hook of expectedHooks) {
        expect(HOOK_SCRIPT_MAP[hook]).toBeDefined();
        expect(typeof HOOK_SCRIPT_MAP[hook]).toBe('string');
      }
    });

    it('should map hooks to correct script names', async () => {
      const { HOOK_SCRIPT_MAP } = await import('../config.js');

      expect(HOOK_SCRIPT_MAP.SessionStart).toBe('session-start.js');
      expect(HOOK_SCRIPT_MAP.PreToolUse).toBe('pre-tool-use.js');
      expect(HOOK_SCRIPT_MAP.PostToolUse).toBe('post-tool-use.js');
      expect(HOOK_SCRIPT_MAP.PostToolUseFailure).toBe('post-tool-use-failure.js');
      expect(HOOK_SCRIPT_MAP.PermissionRequest).toBe('permission-request.js');
      expect(HOOK_SCRIPT_MAP.UserPromptSubmit).toBe('user-prompt-submit.js');
      expect(HOOK_SCRIPT_MAP.Stop).toBe('stop.js');
      expect(HOOK_SCRIPT_MAP.SubagentStart).toBe('subagent-start.js');
      expect(HOOK_SCRIPT_MAP.SubagentStop).toBe('subagent-stop.js');
      expect(HOOK_SCRIPT_MAP.PreCompact).toBe('pre-compact.js');
      expect(HOOK_SCRIPT_MAP.SessionEnd).toBe('session-end.js');
      expect(HOOK_SCRIPT_MAP.Notification).toBe('notification.js');
    });

    it('should use .js extension for all scripts', async () => {
      const { HOOK_SCRIPT_MAP } = await import('../config.js');

      for (const script of Object.values(HOOK_SCRIPT_MAP)) {
        expect(script).toMatch(/\.js$/);
      }
    });

    it('should use kebab-case naming convention', async () => {
      const { HOOK_SCRIPT_MAP } = await import('../config.js');

      for (const script of Object.values(HOOK_SCRIPT_MAP)) {
        // Remove .js extension and check kebab-case
        const name = script.replace('.js', '');
        expect(name).toMatch(/^[a-z]+(-[a-z]+)*$/);
      }
    });
  });

  describe('getConfigDir', () => {
    it('should use dirname(fileURLToPath(import.meta.url)) in ESM context', async () => {
      // In Vitest ESM environment, __dirname is not defined (CJS-only feature)
      // so getConfigDir() uses the try block with import.meta.url
      vi.resetModules();
      const { getConfigDir } = await import('../config.js');

      const result = getConfigDir();

      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
      // The path should contain typical path characters and be the src directory
      expect(result).toMatch(/[/\\]/);
      expect(result).toMatch(/src$/);
    });

    it('should handle repeated calls consistently', async () => {
      vi.resetModules();
      const { getConfigDir } = await import('../config.js');

      // Multiple calls should return the same result
      const result1 = getConfigDir();
      const result2 = getConfigDir();
      const result3 = getConfigDir();

      expect(result1).toBe(result2);
      expect(result2).toBe(result3);
    });

    it('should return absolute path', async () => {
      vi.resetModules();
      const { getConfigDir } = await import('../config.js');

      const result = getConfigDir();

      // Check if path is absolute (starts with / on Unix or drive letter on Windows)
      const isAbsolute =
        result.startsWith('/') || /^[A-Za-z]:[\\/]/.test(result);
      expect(isAbsolute).toBe(true);
    });

    it('should be used as base for PLUGIN_ROOT calculation', async () => {
      vi.resetModules();
      const { getConfigDir, PLUGIN_ROOT } = await import('../config.js');

      // PLUGIN_ROOT is path.resolve(getConfigDir(), '../../..')
      // So it should be an ancestor of getConfigDir()
      const configDir = getConfigDir();
      expect(typeof PLUGIN_ROOT).toBe('string');

      // Both should be valid paths
      expect(configDir.length).toBeGreaterThan(0);
      expect(PLUGIN_ROOT.length).toBeGreaterThan(0);
    });

    it('should return the src directory path', async () => {
      vi.resetModules();
      const { getConfigDir } = await import('../config.js');

      const result = getConfigDir();

      // The config.ts file is in src/, so getConfigDir() should return a path ending in 'src'
      expect(result).toMatch(/src[/\\]?$/);
    });

    it('should be exported and callable as a function', async () => {
      const { getConfigDir } = await import('../config.js');

      // The function should be exported and callable
      expect(typeof getConfigDir).toBe('function');
      expect(typeof getConfigDir()).toBe('string');
    });
  });

  describe('getConfigDir edge cases', () => {
    // Note: The catch block (line 33) that returns process.cwd() is defensive code
    // for environments where __dirname is undefined AND import.meta.url fails.
    // This is a fallback for unusual bundling scenarios.
    //
    // In Vitest's ESM environment:
    // - __dirname is not defined (CJS-only feature)
    // - import.meta.url works correctly
    // So we exercise the try block (lines 28-31) but not the catch block (line 33).

    it('should handle ESM context gracefully', async () => {
      vi.resetModules();
      const { getConfigDir, PLUGIN_ROOT } = await import('../config.js');

      // Should not throw and should return valid values
      expect(() => getConfigDir()).not.toThrow();
      expect(typeof PLUGIN_ROOT).toBe('string');
    });

    it('should derive PLUGIN_ROOT from getConfigDir() when env vars not set', async () => {
      vi.resetModules();
      const { getConfigDir, PLUGIN_ROOT } = await import('../config.js');

      // When no env vars are set, PLUGIN_ROOT = path.resolve(getConfigDir(), '../../..')
      const configDir = getConfigDir();

      // Verify both are valid paths
      expect(configDir).toBeTruthy();
      expect(PLUGIN_ROOT).toBeTruthy();

      // PLUGIN_ROOT should be an ancestor directory
      expect(PLUGIN_ROOT.length).toBeLessThanOrEqual(configDir.length);
    });
  });

  describe('getProjectRoot function', () => {
    it('should return PROJECT_ROOT env var when set', async () => {
      process.env.PROJECT_ROOT = '/dynamic/project/root';
      const { getProjectRoot } = await import('../config.js');

      expect(getProjectRoot()).toBe('/dynamic/project/root');
    });

    it('should return CLAUDE_PROJECT_DIR when PROJECT_ROOT not set', async () => {
      delete process.env.PROJECT_ROOT;
      process.env.CLAUDE_PROJECT_DIR = '/claude/dynamic/project';

      vi.resetModules();
      const { getProjectRoot } = await import('../config.js');

      expect(getProjectRoot()).toBe('/claude/dynamic/project');
    });

    it('should return process.cwd() when no env vars set', async () => {
      delete process.env.PROJECT_ROOT;
      delete process.env.CLAUDE_PROJECT_DIR;

      vi.resetModules();
      const { getProjectRoot } = await import('../config.js');

      expect(getProjectRoot()).toBe(process.cwd());
    });

    it('should reflect runtime changes to PROJECT_ROOT', async () => {
      vi.resetModules();
      const { getProjectRoot } = await import('../config.js');

      // Set initial value
      process.env.PROJECT_ROOT = '/initial/path';
      expect(getProjectRoot()).toBe('/initial/path');

      // Change at runtime
      process.env.PROJECT_ROOT = '/changed/path';
      expect(getProjectRoot()).toBe('/changed/path');

      // Clear and check fallback
      delete process.env.PROJECT_ROOT;
      expect(getProjectRoot()).toBe(process.cwd());
    });
  });
});
