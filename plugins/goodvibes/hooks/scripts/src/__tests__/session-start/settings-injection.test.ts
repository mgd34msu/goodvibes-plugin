/**
 * Unit tests for session-start/settings-injection.ts
 *
 * Tests cover:
 * - getPluginRoot() path resolution
 * - createSubagentStartCommand() command generation
 * - createSubagentStopCommand() command generation
 * - createGoodVibesHook() hook configuration
 * - createSubagentStopHook() hook configuration
 * - isGoodVibesHookPresent() hook detection
 * - isSubagentStopHookPresent() hook detection
 * - safeParseJson() error handling
 * - loadPluginHooks() hooks.json loading
 * - resolveCommand() placeholder replacement
 * - isHookCommandPresent() generic hook detection
 * - mergeAllHooks() comprehensive hook merging from hooks.json
 * - mergeHooks() hook merging for both SubagentStart and SubagentStop (legacy)
 * - createDefaultSettings() default creation with both hooks (legacy)
 * - createDefaultSettingsFromHooksJson() settings creation from hooks.json
 * - injectSettings() full integration with hooks.json support
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

  describe('createSubagentStopCommand', () => {
    it('should create command with correct path', async () => {
      const { createSubagentStopCommand } = await import(
        '../../session-start/settings-injection.js'
      );

      const result = createSubagentStopCommand(testPluginRoot);

      expect(result).toBe(
        `node "${path.join(testPluginRoot, 'hooks', 'scripts', 'dist', 'subagent-stop.js')}"`
      );
    });

    it('should handle paths with spaces', async () => {
      const { createSubagentStopCommand } = await import(
        '../../session-start/settings-injection.js'
      );
      const pathWithSpaces = '/path/with spaces/plugin';

      const result = createSubagentStopCommand(pathWithSpaces);

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

  describe('createSubagentStopHook', () => {
    it('should create hook with wildcard matcher', async () => {
      const { createSubagentStopHook } = await import(
        '../../session-start/settings-injection.js'
      );

      const result = createSubagentStopHook(testPluginRoot);

      expect(result.matcher).toBe('*');
      expect(result.hooks).toHaveLength(1);
      expect(result.hooks[0].type).toBe('command');
      expect(result.hooks[0].timeout).toBe(10);
    });

    it('should include correct command in hooks array', async () => {
      const { createSubagentStopHook, createSubagentStopCommand } = await import(
        '../../session-start/settings-injection.js'
      );

      const result = createSubagentStopHook(testPluginRoot);

      expect(result.hooks[0].command).toBe(
        createSubagentStopCommand(testPluginRoot)
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

  describe('isSubagentStopHookPresent', () => {
    it('should return true when hook is present', async () => {
      const { isSubagentStopHookPresent, createSubagentStopCommand } =
        await import('../../session-start/settings-injection.js');

      const existingHooks = [
        {
          matcher: '*',
          hooks: [
            {
              type: 'command',
              command: createSubagentStopCommand(testPluginRoot),
            },
          ],
        },
      ];

      const result = isSubagentStopHookPresent(existingHooks, testPluginRoot);

      expect(result).toBe(true);
    });

    it('should return false when hook is not present', async () => {
      const { isSubagentStopHookPresent } = await import(
        '../../session-start/settings-injection.js'
      );

      const existingHooks = [
        {
          matcher: '*',
          hooks: [{ type: 'command', command: 'some-other-command' }],
        },
      ];

      const result = isSubagentStopHookPresent(existingHooks, testPluginRoot);

      expect(result).toBe(false);
    });

    it('should return false for empty hooks array', async () => {
      const { isSubagentStopHookPresent } = await import(
        '../../session-start/settings-injection.js'
      );

      const result = isSubagentStopHookPresent([], testPluginRoot);

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

  describe('loadPluginHooks', () => {
    it('should load and parse valid hooks.json', async () => {
      const { loadPluginHooks } = await import(
        '../../session-start/settings-injection.js'
      );

      const validHooksJson = {
        description: 'Test hooks',
        hooks: {
          PreToolUse: [
            {
              matcher: 'Read',
              hooks: [{ type: 'command', command: 'node script.js', timeout: 5 }],
            },
          ],
        },
      };
      mockReadFile.mockResolvedValueOnce(JSON.stringify(validHooksJson));

      const result = await loadPluginHooks(testPluginRoot);

      expect(result).toEqual(validHooksJson);
      expect(mockReadFile).toHaveBeenCalledWith(
        path.join(testPluginRoot, 'hooks', 'hooks.json'),
        'utf-8'
      );
    });

    it('should return null for invalid JSON', async () => {
      const { loadPluginHooks } = await import(
        '../../session-start/settings-injection.js'
      );

      mockReadFile.mockResolvedValueOnce('invalid json {{{');

      const result = await loadPluginHooks(testPluginRoot);

      expect(result).toBeNull();
    });

    it('should return null if file does not exist', async () => {
      const { loadPluginHooks } = await import(
        '../../session-start/settings-injection.js'
      );

      mockReadFile.mockRejectedValueOnce(new Error('ENOENT'));

      const result = await loadPluginHooks(testPluginRoot);

      expect(result).toBeNull();
    });

    it('should return null if JSON does not have hooks property', async () => {
      const { loadPluginHooks } = await import(
        '../../session-start/settings-injection.js'
      );

      mockReadFile.mockResolvedValueOnce(JSON.stringify({ description: 'No hooks' }));

      const result = await loadPluginHooks(testPluginRoot);

      expect(result).toBeNull();
    });
  });

  describe('resolveCommand', () => {
    it('should replace ${CLAUDE_PLUGIN_ROOT} with actual path', async () => {
      const { resolveCommand } = await import(
        '../../session-start/settings-injection.js'
      );

      const command = 'node "${CLAUDE_PLUGIN_ROOT}/hooks/scripts/dist/test.js"';
      const result = resolveCommand(command, testPluginRoot);

      expect(result).toBe(`node "${testPluginRoot}/hooks/scripts/dist/test.js"`);
    });

    it('should replace multiple occurrences', async () => {
      const { resolveCommand } = await import(
        '../../session-start/settings-injection.js'
      );

      const command = '${CLAUDE_PLUGIN_ROOT}/a ${CLAUDE_PLUGIN_ROOT}/b';
      const result = resolveCommand(command, testPluginRoot);

      expect(result).toBe(`${testPluginRoot}/a ${testPluginRoot}/b`);
    });

    it('should return unchanged command if no placeholder', async () => {
      const { resolveCommand } = await import(
        '../../session-start/settings-injection.js'
      );

      const command = 'node "/static/path/script.js"';
      const result = resolveCommand(command, testPluginRoot);

      expect(result).toBe(command);
    });
  });

  describe('isHookCommandPresent', () => {
    it('should return true when command is present', async () => {
      const { isHookCommandPresent } = await import(
        '../../session-start/settings-injection.js'
      );

      const matchers = [
        {
          matcher: '*',
          hooks: [{ type: 'command', command: 'node test.js' }],
        },
      ];

      const result = isHookCommandPresent(matchers, 'node test.js');

      expect(result).toBe(true);
    });

    it('should return false when command is not present', async () => {
      const { isHookCommandPresent } = await import(
        '../../session-start/settings-injection.js'
      );

      const matchers = [
        {
          matcher: '*',
          hooks: [{ type: 'command', command: 'node other.js' }],
        },
      ];

      const result = isHookCommandPresent(matchers, 'node test.js');

      expect(result).toBe(false);
    });

    it('should return false for empty matchers array', async () => {
      const { isHookCommandPresent } = await import(
        '../../session-start/settings-injection.js'
      );

      const result = isHookCommandPresent([], 'node test.js');

      expect(result).toBe(false);
    });

    it('should return false when hooks property is missing', async () => {
      const { isHookCommandPresent } = await import(
        '../../session-start/settings-injection.js'
      );

      const matchers = [{ matcher: '*' }] as unknown as Array<{
        matcher: string;
        hooks: Array<{ type: string; command: string }>;
      }>;

      const result = isHookCommandPresent(matchers, 'node test.js');

      expect(result).toBe(false);
    });
  });

  describe('mergeAllHooks', () => {
    const samplePluginHooks = {
      description: 'Test hooks',
      hooks: {
        PreToolUse: [
          {
            matcher: 'Read',
            hooks: [{ type: 'command', command: 'node "${CLAUDE_PLUGIN_ROOT}/pre.js"', timeout: 5 }],
          },
        ],
        PostToolUse: [
          {
            matcher: '*',
            hooks: [{ type: 'command', command: 'node "${CLAUDE_PLUGIN_ROOT}/post.js"', timeout: 10 }],
          },
        ],
      },
    };

    it('should add all hooks from hooks.json to empty settings', async () => {
      const { mergeAllHooks } = await import(
        '../../session-start/settings-injection.js'
      );

      const settings = {};
      const { settings: result, hooksAdded } = mergeAllHooks(
        settings,
        samplePluginHooks,
        testPluginRoot
      );

      expect(hooksAdded).toBe(true);
      expect(result.hooks).toBeDefined();
      expect(result.hooks?.PreToolUse).toHaveLength(1);
      expect(result.hooks?.PostToolUse).toHaveLength(1);
    });

    it('should resolve ${CLAUDE_PLUGIN_ROOT} in commands', async () => {
      const { mergeAllHooks } = await import(
        '../../session-start/settings-injection.js'
      );

      const settings = {};
      const { settings: result } = mergeAllHooks(
        settings,
        samplePluginHooks,
        testPluginRoot
      );

      const preToolCommand = result.hooks?.PreToolUse?.[0]?.hooks[0]?.command;
      expect(preToolCommand).toBe(`node "${testPluginRoot}/pre.js"`);
    });

    it('should not add hooks if already present', async () => {
      const { mergeAllHooks } = await import(
        '../../session-start/settings-injection.js'
      );

      const existingHook = {
        matcher: 'Read',
        hooks: [{ type: 'command', command: `node "${testPluginRoot}/pre.js"` }],
      };
      const settings = { hooks: { PreToolUse: [existingHook] } };

      const { settings: result, hooksAdded } = mergeAllHooks(
        settings,
        { hooks: { PreToolUse: samplePluginHooks.hooks.PreToolUse } },
        testPluginRoot
      );

      // PreToolUse hook already present, but PostToolUse should be noted as not added
      // since we only passed PreToolUse in this test
      expect(hooksAdded).toBe(false);
      expect(result.hooks?.PreToolUse).toHaveLength(1);
    });

    it('should preserve existing user hooks', async () => {
      const { mergeAllHooks } = await import(
        '../../session-start/settings-injection.js'
      );

      const userHook = {
        matcher: 'CustomMatcher',
        hooks: [{ type: 'command', command: 'user-command' }],
      };
      const settings = { hooks: { PreToolUse: [userHook] } };

      const { settings: result, hooksAdded } = mergeAllHooks(
        settings,
        samplePluginHooks,
        testPluginRoot
      );

      expect(hooksAdded).toBe(true);
      // User hook should be preserved, new hook appended
      expect(result.hooks?.PreToolUse).toHaveLength(2);
      expect(result.hooks?.PreToolUse?.[0]).toEqual(userHook);
    });

    it('should handle multiple hook types', async () => {
      const { mergeAllHooks } = await import(
        '../../session-start/settings-injection.js'
      );

      const multiHookJson = {
        hooks: {
          SessionStart: [
            { matcher: 'startup', hooks: [{ type: 'command', command: 'cmd1' }] },
          ],
          PreToolUse: [
            { matcher: 'Read', hooks: [{ type: 'command', command: 'cmd2' }] },
          ],
          SubagentStart: [
            { matcher: '*', hooks: [{ type: 'command', command: 'cmd3' }] },
          ],
        },
      };

      const settings = {};
      const { settings: result, hooksAdded } = mergeAllHooks(
        settings,
        multiHookJson,
        testPluginRoot
      );

      expect(hooksAdded).toBe(true);
      expect(result.hooks?.SessionStart).toHaveLength(1);
      expect(result.hooks?.PreToolUse).toHaveLength(1);
      expect(result.hooks?.SubagentStart).toHaveLength(1);
    });

    it('should log added hooks', async () => {
      const { mergeAllHooks } = await import(
        '../../session-start/settings-injection.js'
      );

      const settings = {};
      mergeAllHooks(settings, samplePluginHooks, testPluginRoot);

      expect(mockDebug).toHaveBeenCalledWith('Added PreToolUse hook: Read');
      expect(mockDebug).toHaveBeenCalledWith('Added PostToolUse hook: *');
    });
  });

  describe('createDefaultSettingsFromHooksJson', () => {
    it('should create settings with all hooks from hooks.json', async () => {
      const { createDefaultSettingsFromHooksJson } = await import(
        '../../session-start/settings-injection.js'
      );

      const pluginHooks = {
        hooks: {
          PreToolUse: [
            { matcher: 'Read', hooks: [{ type: 'command', command: 'cmd1' }] },
          ],
          SubagentStart: [
            { matcher: '*', hooks: [{ type: 'command', command: 'cmd2' }] },
          ],
        },
      };

      const result = createDefaultSettingsFromHooksJson(pluginHooks, testPluginRoot);

      expect(result.hooks).toBeDefined();
      expect(result.hooks?.PreToolUse).toHaveLength(1);
      expect(result.hooks?.SubagentStart).toHaveLength(1);
    });
  });

  describe('mergeHooks', () => {
    it('should add both hooks to empty settings', async () => {
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
      expect(result.hooks?.SubagentStop).toHaveLength(1);
    });

    it('should add hooks when hooks object exists but SubagentStart/Stop are missing', async () => {
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
      expect(result.hooks?.SubagentStop).toHaveLength(1);
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

    it('should not add hooks if both already present', async () => {
      const { mergeHooks, createGoodVibesHook, createSubagentStopHook } = await import(
        '../../session-start/settings-injection.js'
      );

      const subagentStartHook = createGoodVibesHook(testPluginRoot);
      const subagentStopHook = createSubagentStopHook(testPluginRoot);
      const settings = {
        hooks: {
          SubagentStart: [subagentStartHook],
          SubagentStop: [subagentStopHook],
        },
      };

      const { settings: result, hooksAdded } = mergeHooks(
        settings,
        testPluginRoot
      );

      expect(hooksAdded).toBe(false);
      expect(result.hooks?.SubagentStart).toHaveLength(1);
      expect(result.hooks?.SubagentStop).toHaveLength(1);
      expect(mockDebug).toHaveBeenCalledWith(
        'GoodVibes SubagentStart hook already present'
      );
      expect(mockDebug).toHaveBeenCalledWith(
        'GoodVibes SubagentStop hook already present'
      );
    });

    it('should add only SubagentStop if SubagentStart already present', async () => {
      const { mergeHooks, createGoodVibesHook } = await import(
        '../../session-start/settings-injection.js'
      );

      const subagentStartHook = createGoodVibesHook(testPluginRoot);
      const settings = { hooks: { SubagentStart: [subagentStartHook] } };

      const { settings: result, hooksAdded } = mergeHooks(
        settings,
        testPluginRoot
      );

      expect(hooksAdded).toBe(true);
      expect(result.hooks?.SubagentStart).toHaveLength(1);
      expect(result.hooks?.SubagentStop).toHaveLength(1);
      expect(mockDebug).toHaveBeenCalledWith(
        'GoodVibes SubagentStart hook already present'
      );
      expect(mockDebug).toHaveBeenCalledWith(
        'Added GoodVibes SubagentStop hook'
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
    it('should create settings with both SubagentStart and SubagentStop hooks', async () => {
      const { createDefaultSettings, createGoodVibesHook, createSubagentStopHook } = await import(
        '../../session-start/settings-injection.js'
      );

      const result = createDefaultSettings(testPluginRoot);

      expect(result.hooks).toBeDefined();
      expect(result.hooks?.SubagentStart).toHaveLength(1);
      expect(result.hooks?.SubagentStart?.[0]).toEqual(
        createGoodVibesHook(testPluginRoot)
      );
      expect(result.hooks?.SubagentStop).toHaveLength(1);
      expect(result.hooks?.SubagentStop?.[0]).toEqual(
        createSubagentStopHook(testPluginRoot)
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

        // Verify written content preserves existing data and has both hooks
        const writtenContent = mockWriteFile.mock.calls[0]?.[1] ?? '';
        const parsed: { existing: string; hooks: { SubagentStart: unknown[]; SubagentStop: unknown[] } } =
          JSON.parse(writtenContent);
        expect(parsed.existing).toBe('data');
        expect(parsed.hooks.SubagentStart).toHaveLength(1);
        expect(parsed.hooks.SubagentStop).toHaveLength(1);
      });

      it('should not modify file if both hooks already present', async () => {
        mockFileExists.mockResolvedValue(true);

        const { injectSettings, createGoodVibesHook, createSubagentStopHook } = await import(
          '../../session-start/settings-injection.js'
        );

        const existingSettings = {
          hooks: {
            SubagentStart: [createGoodVibesHook(testPluginRoot)],
            SubagentStop: [createSubagentStopHook(testPluginRoot)],
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
        // First read: hooks.json fails (fallback to legacy), second read: settings.json
        const userHook = {
          matcher: 'user-matcher',
          hooks: [{ type: 'command', command: 'user-command' }],
        };
        mockReadFile
          .mockRejectedValueOnce(new Error('ENOENT')) // hooks.json fails
          .mockResolvedValueOnce(
            JSON.stringify({
              hooks: { SubagentStart: [userHook] },
            })
          );
        mockFileExists.mockResolvedValue(true);

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
        const { injectSettings } = await import(
          '../../session-start/settings-injection.js'
        );

        // First read: hooks.json fails (fallback to legacy)
        // Second read: settings.json fails with permission error
        let readCallCount = 0;
        mockReadFile.mockImplementation(async () => {
          readCallCount++;
          if (readCallCount === 1) {
            throw new Error('ENOENT');
          }
          throw new Error('Read permission denied');
        });
        mockFileExists.mockResolvedValue(true);

        const result = await injectSettings(testCwd, testPluginRoot);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Read permission denied');
        expect(mockLogError).toHaveBeenCalledWith(
          'Settings injection',
          expect.any(Error)
        );
      });

      it('should handle write errors gracefully', async () => {
        const { injectSettings } = await import(
          '../../session-start/settings-injection.js'
        );

        // First read: hooks.json fails (fallback to legacy)
        mockReadFile.mockImplementation(async () => {
          throw new Error('ENOENT');
        });
        mockFileExists
          .mockResolvedValueOnce(false) // settings doesn't exist
          .mockResolvedValueOnce(false); // .claude dir doesn't exist
        mockWriteFile.mockImplementation(async () => {
          throw new Error('Write permission denied');
        });

        const result = await injectSettings(testCwd, testPluginRoot);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Write permission denied');
      });

      it('should handle mkdir errors gracefully', async () => {
        const { injectSettings } = await import(
          '../../session-start/settings-injection.js'
        );

        // First read: hooks.json fails (fallback to legacy)
        mockReadFile.mockImplementation(async () => {
          throw new Error('ENOENT');
        });
        mockFileExists.mockResolvedValue(false);
        mockMkdir.mockImplementation(async () => {
          throw new Error('Cannot create directory');
        });

        const result = await injectSettings(testCwd, testPluginRoot);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Cannot create directory');
      });

      it('should handle non-Error exceptions', async () => {
        const { injectSettings } = await import(
          '../../session-start/settings-injection.js'
        );

        // First read: hooks.json fails (fallback to legacy)
        // Second read: settings.json throws string error
        let readCallCount = 0;
        mockReadFile.mockImplementation(async () => {
          readCallCount++;
          if (readCallCount === 1) {
            throw new Error('ENOENT');
          }
          throw 'string error';
        });
        mockFileExists.mockResolvedValue(true);

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

    describe('hooks.json integration', () => {
      const sampleHooksJson = {
        description: 'Test hooks',
        hooks: {
          SessionStart: [
            {
              matcher: 'startup',
              hooks: [{ type: 'command', command: 'node "${CLAUDE_PLUGIN_ROOT}/hooks/scripts/dist/session-start.js"', timeout: 10 }],
            },
          ],
          PreToolUse: [
            {
              matcher: 'Read',
              hooks: [{ type: 'command', command: 'node "${CLAUDE_PLUGIN_ROOT}/hooks/scripts/dist/pre-tool-use.js"', timeout: 5 }],
            },
          ],
          SubagentStart: [
            {
              matcher: '*',
              hooks: [{ type: 'command', command: 'node "${CLAUDE_PLUGIN_ROOT}/hooks/scripts/dist/subagent-start.js"', timeout: 10 }],
            },
          ],
        },
      };

      it('should load all hooks from hooks.json when creating new settings', async () => {
        // First read is for hooks.json, then fileExists checks
        mockReadFile.mockResolvedValueOnce(JSON.stringify(sampleHooksJson));
        mockFileExists.mockResolvedValue(false);

        const { injectSettings } = await import(
          '../../session-start/settings-injection.js'
        );

        const result = await injectSettings(testCwd, testPluginRoot);

        expect(result.success).toBe(true);
        expect(result.created).toBe(true);
        expect(result.hooksAdded).toBe(true);

        const writtenContent = mockWriteFile.mock.calls[0]?.[1] ?? '';
        const parsed = JSON.parse(writtenContent) as { hooks: Record<string, unknown[]> };

        // Should have all hook types from hooks.json
        expect(parsed.hooks.SessionStart).toHaveLength(1);
        expect(parsed.hooks.PreToolUse).toHaveLength(1);
        expect(parsed.hooks.SubagentStart).toHaveLength(1);
      });

      it('should resolve ${CLAUDE_PLUGIN_ROOT} placeholders', async () => {
        mockReadFile.mockResolvedValueOnce(JSON.stringify(sampleHooksJson));
        mockFileExists.mockResolvedValue(false);

        const { injectSettings } = await import(
          '../../session-start/settings-injection.js'
        );

        await injectSettings(testCwd, testPluginRoot);

        const writtenContent = mockWriteFile.mock.calls[0]?.[1] ?? '';
        const parsed = JSON.parse(writtenContent) as {
          hooks: {
            PreToolUse: Array<{ hooks: Array<{ command: string }> }>;
          };
        };

        const command = parsed.hooks.PreToolUse[0].hooks[0].command;
        expect(command).toContain(testPluginRoot);
        expect(command).not.toContain('${CLAUDE_PLUGIN_ROOT}');
      });

      it('should merge hooks.json hooks with existing settings', async () => {
        // First read: hooks.json, second read: existing settings.json
        mockReadFile
          .mockResolvedValueOnce(JSON.stringify(sampleHooksJson))
          .mockResolvedValueOnce(JSON.stringify({ existing: 'data', hooks: {} }));
        mockFileExists.mockResolvedValue(true);

        const { injectSettings } = await import(
          '../../session-start/settings-injection.js'
        );

        const result = await injectSettings(testCwd, testPluginRoot);

        expect(result.success).toBe(true);
        expect(result.hooksAdded).toBe(true);

        const writtenContent = mockWriteFile.mock.calls[0]?.[1] ?? '';
        const parsed = JSON.parse(writtenContent) as {
          existing: string;
          hooks: Record<string, unknown[]>;
        };

        expect(parsed.existing).toBe('data');
        expect(parsed.hooks.SessionStart).toHaveLength(1);
        expect(parsed.hooks.PreToolUse).toHaveLength(1);
      });

      it('should fall back to legacy behavior when hooks.json fails to load', async () => {
        // hooks.json read fails, should fall back to legacy
        mockReadFile.mockRejectedValueOnce(new Error('ENOENT'));
        mockFileExists.mockResolvedValue(false);

        const { injectSettings } = await import(
          '../../session-start/settings-injection.js'
        );

        const result = await injectSettings(testCwd, testPluginRoot);

        expect(result.success).toBe(true);
        expect(result.created).toBe(true);
        expect(mockDebug).toHaveBeenCalledWith(
          expect.stringContaining('falling back to legacy')
        );

        const writtenContent = mockWriteFile.mock.calls[0]?.[1] ?? '';
        const parsed = JSON.parse(writtenContent) as {
          hooks: { SubagentStart: unknown[]; SubagentStop: unknown[] };
        };

        // Legacy behavior should only create SubagentStart and SubagentStop
        expect(parsed.hooks.SubagentStart).toHaveLength(1);
        expect(parsed.hooks.SubagentStop).toHaveLength(1);
      });

      it('should not add hooks if all are already present', async () => {
        // Create hooks that match what would be resolved from hooks.json
        const existingHooks = {
          hooks: {
            SessionStart: [
              {
                matcher: 'startup',
                hooks: [{ type: 'command', command: `node "${testPluginRoot}/hooks/scripts/dist/session-start.js"` }],
              },
            ],
            PreToolUse: [
              {
                matcher: 'Read',
                hooks: [{ type: 'command', command: `node "${testPluginRoot}/hooks/scripts/dist/pre-tool-use.js"` }],
              },
            ],
            SubagentStart: [
              {
                matcher: '*',
                hooks: [{ type: 'command', command: `node "${testPluginRoot}/hooks/scripts/dist/subagent-start.js"` }],
              },
            ],
          },
        };

        mockReadFile
          .mockResolvedValueOnce(JSON.stringify(sampleHooksJson))
          .mockResolvedValueOnce(JSON.stringify(existingHooks));
        mockFileExists.mockResolvedValue(true);

        const { injectSettings } = await import(
          '../../session-start/settings-injection.js'
        );

        const result = await injectSettings(testCwd, testPluginRoot);

        expect(result.success).toBe(true);
        expect(result.hooksAdded).toBe(false);
        expect(mockWriteFile).not.toHaveBeenCalled();
      });

      it('should preserve user-defined hooks when adding from hooks.json', async () => {
        const userHook = {
          matcher: 'CustomMatcher',
          hooks: [{ type: 'command', command: 'user-custom-command' }],
        };
        const existingSettings = {
          hooks: {
            PreToolUse: [userHook],
          },
        };

        mockReadFile
          .mockResolvedValueOnce(JSON.stringify(sampleHooksJson))
          .mockResolvedValueOnce(JSON.stringify(existingSettings));
        mockFileExists.mockResolvedValue(true);

        const { injectSettings } = await import(
          '../../session-start/settings-injection.js'
        );

        const result = await injectSettings(testCwd, testPluginRoot);

        expect(result.success).toBe(true);
        expect(result.hooksAdded).toBe(true);

        const writtenContent = mockWriteFile.mock.calls[0]?.[1] ?? '';
        const parsed = JSON.parse(writtenContent) as {
          hooks: { PreToolUse: Array<{ matcher: string }> };
        };

        // User hook should be preserved (first), new hook appended
        expect(parsed.hooks.PreToolUse).toHaveLength(2);
        expect(parsed.hooks.PreToolUse[0].matcher).toBe('CustomMatcher');
        expect(parsed.hooks.PreToolUse[1].matcher).toBe('Read');
      });
    });
  });
});
