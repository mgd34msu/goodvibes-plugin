/**
 * Unit tests for session-start/settings-injection.ts
 *
 * Tests cover:
 * - getPluginRoot() path resolution
 * - createSubagentStartCommand() command generation
 * - createGoodVibesHook() hook configuration
 * - isGoodVibesHookPresent() hook detection
 * - safeParseJson() error handling
 * - mergeHooks() hook merging without overwrites
 * - createDefaultSettings() default creation
 * - injectSettings() full integration
 * - 100% line and branch coverage
 */

import * as path from 'path';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fs/promises
const mockReadFile = vi.fn<(path: string, encoding: string) => Promise<string>>();
const mockWriteFile = vi.fn<(path: string, content: string) => Promise<void>>();
const mockMkdir = vi.fn<(path: string, options: { recursive: boolean }) => Promise<void>>();

vi.mock('fs/promises', () => ({
  readFile: (p: string, e: string) => mockReadFile(p, e),
  writeFile: (p: string, c: string) => mockWriteFile(p, c),
  mkdir: (p: string, o: { recursive: boolean }) => mockMkdir(p, o),
}));

// Mock file-utils
const mockFileExists = vi.fn<(path: string) => Promise<boolean>>();

vi.mock('../../shared/file-utils.js', () => ({
  fileExists: (p: string) => mockFileExists(p),
}));

// Mock logging
const mockDebug = vi.fn<(...args: unknown[]) => void>();
const mockLogError = vi.fn<(context: string, error: unknown) => void>();

vi.mock('../../shared/logging.js', () => ({
  debug: (...args: unknown[]) => mockDebug(...args),
  logError: (ctx: string, err: unknown) => mockLogError(ctx, err),
}));

describe('settings-injection', () => {
  const testPluginRoot = '/test/plugin/root';
  const testCwd = '/test/project';
  const testClaudeDir = path.join(testCwd, '.claude');
  const testSettingsPath = path.join(testClaudeDir, 'settings.json');

  beforeEach(() => {
    vi.clearAllMocks();
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('getPluginRoot', () => {
    it('should return path 3 levels up from __dirname', async () => {
      const { getPluginRoot } = await import(
        '../../session-start/settings-injection.js'
      );

      const result = getPluginRoot();

      // Result should be a valid path (we can't easily test the exact value
      // since __dirname varies, but we can verify it's a string path)
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('createSubagentStartCommand', () => {
    it('should create command with correct path', async () => {
      const { createSubagentStartCommand } = await import(
        '../../session-start/settings-injection.js'
      );

      const result = createSubagentStartCommand(testPluginRoot);

      expect(result).toBe(
        `node "${path.join(testPluginRoot, 'hooks', 'scripts', 'dist', 'subagent-start.js')}"`
      );
    });

    it('should handle paths with spaces', async () => {
      const { createSubagentStartCommand } = await import(
        '../../session-start/settings-injection.js'
      );
      const pathWithSpaces = '/path/with spaces/plugin';

      const result = createSubagentStartCommand(pathWithSpaces);

      expect(result).toContain('"');
      expect(result).toContain('with spaces');
    });
  });

  describe('createGoodVibesHook', () => {
    it('should create hook with wildcard matcher', async () => {
      const { createGoodVibesHook } = await import(
        '../../session-start/settings-injection.js'
      );

      const result = createGoodVibesHook(testPluginRoot);

      expect(result.matcher).toBe('*');
      expect(result.hooks).toHaveLength(1);
      expect(result.hooks[0].type).toBe('command');
      expect(result.hooks[0].timeout).toBe(10);
    });

    it('should include correct command in hooks array', async () => {
      const { createGoodVibesHook, createSubagentStartCommand } = await import(
        '../../session-start/settings-injection.js'
      );

      const result = createGoodVibesHook(testPluginRoot);

      expect(result.hooks[0].command).toBe(
        createSubagentStartCommand(testPluginRoot)
      );
    });
  });

  describe('isGoodVibesHookPresent', () => {
    it('should return true when hook is present', async () => {
      const { isGoodVibesHookPresent, createSubagentStartCommand } =
        await import('../../session-start/settings-injection.js');

      const existingHooks = [
        {
          matcher: '*',
          hooks: [
            {
              type: 'command',
              command: createSubagentStartCommand(testPluginRoot),
            },
          ],
        },
      ];

      const result = isGoodVibesHookPresent(existingHooks, testPluginRoot);

      expect(result).toBe(true);
    });

    it('should return false when hook is not present', async () => {
      const { isGoodVibesHookPresent } = await import(
        '../../session-start/settings-injection.js'
      );

      const existingHooks = [
        {
          matcher: '*',
          hooks: [{ type: 'command', command: 'some-other-command' }],
        },
      ];

      const result = isGoodVibesHookPresent(existingHooks, testPluginRoot);

      expect(result).toBe(false);
    });

    it('should return false for empty hooks array', async () => {
      const { isGoodVibesHookPresent } = await import(
        '../../session-start/settings-injection.js'
      );

      const result = isGoodVibesHookPresent([], testPluginRoot);

      expect(result).toBe(false);
    });

    it('should return false when hooks property is missing', async () => {
      const { isGoodVibesHookPresent } = await import(
        '../../session-start/settings-injection.js'
      );

      const existingHooks = [{ matcher: '*' }] as unknown as Array<{
        matcher: string;
        hooks: Array<{ type: string; command: string }>;
      }>;

      const result = isGoodVibesHookPresent(existingHooks, testPluginRoot);

      expect(result).toBe(false);
    });

    it('should handle matchers with empty hooks array', async () => {
      const { isGoodVibesHookPresent } = await import(
        '../../session-start/settings-injection.js'
      );

      const existingHooks = [{ matcher: '*', hooks: [] }];

      const result = isGoodVibesHookPresent(existingHooks, testPluginRoot);

      expect(result).toBe(false);
    });
  });

  describe('safeParseJson', () => {
    it('should parse valid JSON object', async () => {
      const { safeParseJson } = await import(
        '../../session-start/settings-injection.js'
      );

      const result = safeParseJson('{"key": "value"}');

      expect(result).toEqual({ key: 'value' });
    });

    it('should return null for invalid JSON', async () => {
      const { safeParseJson } = await import(
        '../../session-start/settings-injection.js'
      );

      const result = safeParseJson('not valid json');

      expect(result).toBeNull();
    });

    it('should return null for JSON array', async () => {
      const { safeParseJson } = await import(
        '../../session-start/settings-injection.js'
      );

      const result = safeParseJson('[1, 2, 3]');

      expect(result).toBeNull();
    });

    it('should return null for JSON primitive', async () => {
      const { safeParseJson } = await import(
        '../../session-start/settings-injection.js'
      );

      const result = safeParseJson('"string"');

      expect(result).toBeNull();
    });

    it('should return null for JSON null', async () => {
      const { safeParseJson } = await import(
        '../../session-start/settings-injection.js'
      );

      const result = safeParseJson('null');

      expect(result).toBeNull();
    });

    it('should parse complex nested JSON', async () => {
      const { safeParseJson } = await import(
        '../../session-start/settings-injection.js'
      );

      const complexJson = JSON.stringify({
        hooks: {
          SubagentStart: [{ matcher: '*', hooks: [] }],
        },
        other: { nested: { value: 123 } },
      });

      const result = safeParseJson(complexJson);

      expect(result).toEqual({
        hooks: {
          SubagentStart: [{ matcher: '*', hooks: [] }],
        },
        other: { nested: { value: 123 } },
      });
    });
  });

  describe('mergeHooks', () => {
    it('should add hooks to empty settings', async () => {
      const { mergeHooks } = await import(
        '../../session-start/settings-injection.js'
      );

      const settings = {};
      const { settings: result, hooksAdded } = mergeHooks(
        settings,
        testPluginRoot
      );

      expect(hooksAdded).toBe(true);
      expect(result.hooks).toBeDefined();
      expect(result.hooks?.SubagentStart).toHaveLength(1);
    });

    it('should add hooks when hooks object exists but SubagentStart is missing', async () => {
      const { mergeHooks } = await import(
        '../../session-start/settings-injection.js'
      );

      const settings = { hooks: { OtherHook: [] } };
      const { settings: result, hooksAdded } = mergeHooks(
        settings,
        testPluginRoot
      );

      expect(hooksAdded).toBe(true);
      expect(result.hooks?.SubagentStart).toHaveLength(1);
      expect(result.hooks?.OtherHook).toEqual([]);
    });

    it('should prepend hook to existing SubagentStart array', async () => {
      const { mergeHooks } = await import(
        '../../session-start/settings-injection.js'
      );

      const existingHook = {
        matcher: 'specific',
        hooks: [{ type: 'command', command: 'user-command' }],
      };
      const settings = { hooks: { SubagentStart: [existingHook] } };

      const { settings: result, hooksAdded } = mergeHooks(
        settings,
        testPluginRoot
      );

      expect(hooksAdded).toBe(true);
      expect(result.hooks?.SubagentStart).toHaveLength(2);
      // Our hook should be first
      expect(result.hooks?.SubagentStart?.[0].matcher).toBe('*');
      // User hook should be preserved
      expect(result.hooks?.SubagentStart?.[1]).toEqual(existingHook);
    });

    it('should not add hook if already present', async () => {
      const { mergeHooks, createGoodVibesHook } = await import(
        '../../session-start/settings-injection.js'
      );

      const goodVibesHook = createGoodVibesHook(testPluginRoot);
      const settings = { hooks: { SubagentStart: [goodVibesHook] } };

      const { settings: result, hooksAdded } = mergeHooks(
        settings,
        testPluginRoot
      );

      expect(hooksAdded).toBe(false);
      expect(result.hooks?.SubagentStart).toHaveLength(1);
      expect(mockDebug).toHaveBeenCalledWith(
        'GoodVibes SubagentStart hook already present'
      );
    });

    it('should preserve other settings properties', async () => {
      const { mergeHooks } = await import(
        '../../session-start/settings-injection.js'
      );

      const settings = {
        otherSetting: 'value',
        nested: { data: 123 },
      };

      const { settings: result } = mergeHooks(settings, testPluginRoot);

      expect(result.otherSetting).toBe('value');
      expect(result.nested).toEqual({ data: 123 });
    });
  });

  describe('createDefaultSettings', () => {
    it('should create settings with SubagentStart hook', async () => {
      const { createDefaultSettings, createGoodVibesHook } = await import(
        '../../session-start/settings-injection.js'
      );

      const result = createDefaultSettings(testPluginRoot);

      expect(result.hooks).toBeDefined();
      expect(result.hooks?.SubagentStart).toHaveLength(1);
      expect(result.hooks?.SubagentStart?.[0]).toEqual(
        createGoodVibesHook(testPluginRoot)
      );
    });
  });

  describe('injectSettings', () => {
    describe('when settings file does not exist', () => {
      it('should create .claude directory and settings.json', async () => {
        mockFileExists.mockResolvedValue(false);

        const { injectSettings } = await import(
          '../../session-start/settings-injection.js'
        );

        const result = await injectSettings(testCwd, testPluginRoot);

        expect(result.success).toBe(true);
        expect(result.created).toBe(true);
        expect(result.hooksAdded).toBe(true);
        expect(mockMkdir).toHaveBeenCalledWith(testClaudeDir, {
          recursive: true,
        });
        expect(mockWriteFile).toHaveBeenCalledWith(
          testSettingsPath,
          expect.any(String)
        );
      });

      it('should not create directory if it already exists', async () => {
        // First call: settings file doesn't exist
        // Second call: .claude directory exists
        mockFileExists
          .mockResolvedValueOnce(false) // settings.json doesn't exist
          .mockResolvedValueOnce(true); // .claude dir exists

        const { injectSettings } = await import(
          '../../session-start/settings-injection.js'
        );

        const result = await injectSettings(testCwd, testPluginRoot);

        expect(result.success).toBe(true);
        expect(mockMkdir).not.toHaveBeenCalled();
      });

      it('should log creation messages', async () => {
        mockFileExists.mockResolvedValue(false);

        const { injectSettings } = await import(
          '../../session-start/settings-injection.js'
        );

        await injectSettings(testCwd, testPluginRoot);

        expect(mockDebug).toHaveBeenCalledWith(
          expect.stringContaining('Created .claude directory')
        );
        expect(mockDebug).toHaveBeenCalledWith(
          expect.stringContaining('Created settings.json')
        );
      });
    });

    describe('when settings file exists', () => {
      it('should merge hooks into existing settings', async () => {
        mockFileExists.mockResolvedValue(true);
        mockReadFile.mockResolvedValue(JSON.stringify({ existing: 'data' }));

        const { injectSettings } = await import(
          '../../session-start/settings-injection.js'
        );

        const result = await injectSettings(testCwd, testPluginRoot);

        expect(result.success).toBe(true);
        expect(result.created).toBe(false);
        expect(result.hooksAdded).toBe(true);

        // Verify written content preserves existing data
        const writtenContent = mockWriteFile.mock.calls[0]?.[1] ?? '';
        const parsed: { existing: string; hooks: { SubagentStart: unknown[] } } =
          JSON.parse(writtenContent);
        expect(parsed.existing).toBe('data');
        expect(parsed.hooks.SubagentStart).toHaveLength(1);
      });

      it('should not modify file if hooks already present', async () => {
        mockFileExists.mockResolvedValue(true);

        const { injectSettings, createGoodVibesHook } = await import(
          '../../session-start/settings-injection.js'
        );

        const existingSettings = {
          hooks: {
            SubagentStart: [createGoodVibesHook(testPluginRoot)],
          },
        };
        mockReadFile.mockResolvedValue(JSON.stringify(existingSettings));

        const result = await injectSettings(testCwd, testPluginRoot);

        expect(result.success).toBe(true);
        expect(result.created).toBe(false);
        expect(result.hooksAdded).toBe(false);
        expect(mockWriteFile).not.toHaveBeenCalled();
      });

      it('should preserve user hooks when adding ours', async () => {
        mockFileExists.mockResolvedValue(true);
        const userHook = {
          matcher: 'user-matcher',
          hooks: [{ type: 'command', command: 'user-command' }],
        };
        mockReadFile.mockResolvedValue(
          JSON.stringify({
            hooks: { SubagentStart: [userHook] },
          })
        );

        const { injectSettings } = await import(
          '../../session-start/settings-injection.js'
        );

        const result = await injectSettings(testCwd, testPluginRoot);

        expect(result.success).toBe(true);
        expect(result.hooksAdded).toBe(true);

        const writtenContent = mockWriteFile.mock.calls[0]?.[1] ?? '';
        const parsed: { hooks: { SubagentStart: unknown[] } } =
          JSON.parse(writtenContent);
        expect(parsed.hooks.SubagentStart).toHaveLength(2);
        // User hook should still be present
        expect(parsed.hooks.SubagentStart[1]).toEqual(userHook);
      });

      it('should handle invalid JSON gracefully', async () => {
        mockFileExists.mockResolvedValue(true);
        mockReadFile.mockResolvedValue('invalid json {{{');

        const { injectSettings } = await import(
          '../../session-start/settings-injection.js'
        );

        const result = await injectSettings(testCwd, testPluginRoot);

        expect(result.success).toBe(false);
        expect(result.error).toBe(
          'Invalid JSON in settings.json, skipping hook injection'
        );
        expect(mockWriteFile).not.toHaveBeenCalled();
        expect(mockLogError).toHaveBeenCalled();
      });
    });

    describe('error handling', () => {
      it('should handle read errors gracefully', async () => {
        mockFileExists.mockResolvedValue(true);
        mockReadFile.mockRejectedValue(new Error('Read permission denied'));

        const { injectSettings } = await import(
          '../../session-start/settings-injection.js'
        );

        const result = await injectSettings(testCwd, testPluginRoot);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Read permission denied');
        expect(mockLogError).toHaveBeenCalledWith(
          'Settings injection',
          expect.any(Error)
        );
      });

      it('should handle write errors gracefully', async () => {
        mockFileExists
          .mockResolvedValueOnce(false) // settings doesn't exist
          .mockResolvedValueOnce(false); // .claude dir doesn't exist
        mockWriteFile.mockRejectedValue(new Error('Write permission denied'));

        const { injectSettings } = await import(
          '../../session-start/settings-injection.js'
        );

        const result = await injectSettings(testCwd, testPluginRoot);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Write permission denied');
      });

      it('should handle mkdir errors gracefully', async () => {
        mockFileExists.mockResolvedValue(false);
        mockMkdir.mockRejectedValue(new Error('Cannot create directory'));

        const { injectSettings } = await import(
          '../../session-start/settings-injection.js'
        );

        const result = await injectSettings(testCwd, testPluginRoot);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Cannot create directory');
      });

      it('should handle non-Error exceptions', async () => {
        mockFileExists.mockResolvedValue(true);
        mockReadFile.mockRejectedValue('string error');

        const { injectSettings } = await import(
          '../../session-start/settings-injection.js'
        );

        const result = await injectSettings(testCwd, testPluginRoot);

        expect(result.success).toBe(false);
        expect(result.error).toBe('string error');
      });
    });

    describe('plugin root detection', () => {
      it('should use provided pluginRootOverride', async () => {
        mockFileExists.mockResolvedValue(false);

        const { injectSettings } = await import(
          '../../session-start/settings-injection.js'
        );

        await injectSettings(testCwd, testPluginRoot);

        type ParsedSettings = {
          hooks: {
            SubagentStart: Array<{
              hooks: Array<{ command: string }>;
            }>;
          };
        };
        const writtenContent = mockWriteFile.mock.calls[0]?.[1] ?? '';
        const parsed: ParsedSettings = JSON.parse(writtenContent);
        const command = parsed.hooks.SubagentStart[0].hooks[0].command;
        // Verify the command contains the script name and is built from the plugin root
        expect(command).toContain('subagent-start.js');
        // The command should contain elements of the plugin root (path separators vary by OS)
        expect(command).toContain('test');
        expect(command).toContain('plugin');
        expect(command).toContain('root');
      });

      it('should use getPluginRoot when no override provided', async () => {
        mockFileExists.mockResolvedValue(false);

        const { injectSettings } = await import(
          '../../session-start/settings-injection.js'
        );

        // Call without override
        await injectSettings(testCwd);

        type ParsedSettings = {
          hooks: {
            SubagentStart: Array<{
              hooks: Array<{ command: string }>;
            }>;
          };
        };
        const writtenContent = mockWriteFile.mock.calls[0]?.[1] ?? '';
        const parsed: ParsedSettings = JSON.parse(writtenContent);
        const command = parsed.hooks.SubagentStart[0].hooks[0].command;
        // The command should contain the script path
        expect(command).toContain('subagent-start.js');
        // Verify it's using the standard plugin structure path
        expect(command).toContain('hooks');
        expect(command).toContain('scripts');
        expect(command).toContain('dist');
      });
    });

    describe('JSON formatting', () => {
      it('should write formatted JSON with 2-space indentation', async () => {
        mockFileExists.mockResolvedValue(false);

        const { injectSettings } = await import(
          '../../session-start/settings-injection.js'
        );

        await injectSettings(testCwd, testPluginRoot);

        const writtenContent = mockWriteFile.mock.calls[0]?.[1] ?? '';
        // Check for proper indentation (2 spaces)
        expect(writtenContent).toContain('\n  ');
        // Verify it's valid JSON
        expect(() => JSON.parse(writtenContent) as unknown).not.toThrow();
      });
    });
  });
});
