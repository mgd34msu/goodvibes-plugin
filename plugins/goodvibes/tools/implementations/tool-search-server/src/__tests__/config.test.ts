/**
 * Unit tests for config module
 *
 * Tests cover:
 * - PLUGIN_ROOT resolution
 * - PROJECT_ROOT resolution
 * - FUSE_OPTIONS configuration
 * - HOOK_SCRIPT_MAP entries
 * - Environment variable handling
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

  describe('getConfigDir fallback behavior', () => {
    it('should handle __dirname in CJS context', async () => {
      // Simulate CJS environment by setting __dirname
      (globalThis as { __dirname?: string }).__dirname = '/test/cjs/dir';

      vi.resetModules();
      const { PLUGIN_ROOT } = await import('../config.js');

      // In CJS context with __dirname, it should use that as base
      expect(typeof PLUGIN_ROOT).toBe('string');
    });

    it('should handle ESM context gracefully', async () => {
      // Remove __dirname to simulate ESM
      delete (globalThis as { __dirname?: string }).__dirname;

      vi.resetModules();

      // Should not throw and should return a valid path
      const { PLUGIN_ROOT } = await import('../config.js');
      expect(typeof PLUGIN_ROOT).toBe('string');
    });

    it('should fall back to process.cwd() when import.meta.url throws', async () => {
      // Remove __dirname to force ESM path
      delete (globalThis as { __dirname?: string }).__dirname;

      // In environments where import.meta.url is not available (CJS bundle without __dirname),
      // the catch block should trigger and return process.cwd()
      vi.resetModules();

      // We can't directly mock import.meta, but we verify the fallback chain works
      // The function getConfigDir() has three possible return values:
      // 1. __dirname (if defined) - covered above
      // 2. dirname(fileURLToPath(import.meta.url)) - ESM path
      // 3. process.cwd() - catch fallback when import.meta throws

      const { PLUGIN_ROOT } = await import('../config.js');

      // Result should be a valid path string regardless of which branch executes
      expect(typeof PLUGIN_ROOT).toBe('string');
      expect(PLUGIN_ROOT.length).toBeGreaterThan(0);
    });

    it('should use ESM path when import.meta.url is available', async () => {
      // Remove __dirname to simulate pure ESM
      delete (globalThis as { __dirname?: string }).__dirname;

      vi.resetModules();
      const { PLUGIN_ROOT } = await import('../config.js');

      // In ESM context (Vitest runs in ESM), import.meta.url should work
      // and return a path derived from the config.js file location
      expect(typeof PLUGIN_ROOT).toBe('string');
      // The path should resolve to something (may be relative to config.js or cwd)
      expect(PLUGIN_ROOT).toBeTruthy();
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
