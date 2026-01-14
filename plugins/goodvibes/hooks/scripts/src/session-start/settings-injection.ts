/**
 * Settings Injection
 *
 * Manages the injection of GoodVibes hooks into the project's .claude/settings.json.
 * Creates or updates the settings file to include SubagentStart hooks pointing to
 * the plugin's hook scripts.
 *
 * @module session-start/settings-injection
 */

import * as fs from 'fs/promises';
import * as path from 'path';

import { fileExists } from '../shared/file-utils.js';
import { debug, logError } from '../shared/logging.js';

/** Structure for a single hook entry */
interface HookEntry {
  type: string;
  command: string;
  timeout?: number;
}

/** Structure for a matcher with its hooks */
interface HookMatcher {
  matcher: string;
  hooks: HookEntry[];
}

/** Structure for Claude settings hooks section */
interface ClaudeHooks {
  SubagentStart?: HookMatcher[];
  [key: string]: HookMatcher[] | undefined;
}

/** Structure for .claude/settings.json */
interface ClaudeSettings {
  hooks?: ClaudeHooks;
  [key: string]: unknown;
}

/** Result of the settings injection operation */
export interface SettingsInjectionResult {
  /** Whether the operation succeeded */
  success: boolean;
  /** Whether the settings file was created (vs updated) */
  created: boolean;
  /** Whether hooks were added (false if already present) */
  hooksAdded: boolean;
  /** Error message if operation failed */
  error?: string;
}

/**
 * Gets the plugin root directory from the hook script's location.
 * The hook scripts are at: {pluginRoot}/hooks/scripts/dist/
 * So we go up 3 levels from dist to get the plugin root.
 *
 * @returns The absolute path to the plugin root directory
 */
export function getPluginRoot(): string {
  // In production: __dirname is {pluginRoot}/hooks/scripts/dist
  // Go up 3 levels: dist -> scripts -> hooks -> pluginRoot
  const scriptDir = __dirname || process.cwd();
  return path.resolve(scriptDir, '..', '..', '..');
}

/**
 * Creates the SubagentStart hook command using the plugin root path.
 *
 * @param pluginRoot - The path to the plugin root directory
 * @returns The command string for the SubagentStart hook
 */
export function createSubagentStartCommand(pluginRoot: string): string {
  const scriptPath = path.join(
    pluginRoot,
    'hooks',
    'scripts',
    'dist',
    'subagent-start.js'
  );
  return `node "${scriptPath}"`;
}

/**
 * Creates the default GoodVibes SubagentStart hook configuration.
 *
 * @param pluginRoot - The path to the plugin root directory
 * @returns The hook matcher configuration for SubagentStart
 */
export function createGoodVibesHook(pluginRoot: string): HookMatcher {
  return {
    matcher: '*',
    hooks: [
      {
        type: 'command',
        command: createSubagentStartCommand(pluginRoot),
        timeout: 10,
      },
    ],
  };
}

/**
 * Checks if the GoodVibes SubagentStart hook is already present in the hooks array.
 *
 * @param hooks - Array of existing hook matchers
 * @param pluginRoot - The plugin root path to check against
 * @returns True if our hook is already present
 */
export function isGoodVibesHookPresent(
  hooks: HookMatcher[],
  pluginRoot: string
): boolean {
  const expectedCommand = createSubagentStartCommand(pluginRoot);

  return hooks.some((matcher) =>
    matcher.hooks?.some((hook) => hook.command === expectedCommand)
  );
}

/**
 * Safely parses JSON with error handling.
 *
 * @param content - The JSON string to parse
 * @returns The parsed object or null if parsing failed
 */
export function safeParseJson(content: string): ClaudeSettings | null {
  try {
    const parsed: unknown = JSON.parse(content);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as ClaudeSettings;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Merges GoodVibes hooks into existing settings without overwriting user hooks.
 *
 * @param settings - The existing settings object
 * @param pluginRoot - The plugin root path
 * @returns Object with merged settings and whether hooks were added
 */
export function mergeHooks(
  settings: ClaudeSettings,
  pluginRoot: string
): { settings: ClaudeSettings; hooksAdded: boolean } {
  const goodVibesHook = createGoodVibesHook(pluginRoot);

  // Initialize hooks object if it doesn't exist
  settings.hooks ??= {};

  // Initialize SubagentStart array if it doesn't exist
  settings.hooks.SubagentStart ??= [];

  // Check if our hook is already present
  if (isGoodVibesHookPresent(settings.hooks.SubagentStart, pluginRoot)) {
    debug('GoodVibes SubagentStart hook already present');
    return { settings, hooksAdded: false };
  }

  // Add our hook to the beginning of the array
  settings.hooks.SubagentStart = [
    goodVibesHook,
    ...settings.hooks.SubagentStart,
  ];

  debug('Added GoodVibes SubagentStart hook');
  return { settings, hooksAdded: true };
}

/**
 * Creates the default settings object with GoodVibes hooks.
 *
 * @param pluginRoot - The plugin root path
 * @returns A new settings object with SubagentStart hook configured
 */
export function createDefaultSettings(pluginRoot: string): ClaudeSettings {
  return {
    hooks: {
      SubagentStart: [createGoodVibesHook(pluginRoot)],
    },
  };
}

/**
 * Injects GoodVibes hooks into the project's .claude/settings.json.
 *
 * This function:
 * 1. Checks if .claude/settings.json exists
 * 2. If not, creates .claude directory and settings.json with our hooks
 * 3. If it exists, reads it and merges our hooks without overwriting user hooks
 * 4. Only adds our SubagentStart hook if it's not already present
 *
 * @param cwd - The current working directory (project root)
 * @param pluginRootOverride - Optional override for plugin root (used in tests)
 * @returns Promise resolving to the injection result
 *
 * @example
 * const result = await injectSettings('/path/to/project');
 * if (result.success) {
 *   if (result.created) {
 *     console.log('Created new settings.json');
 *   } else if (result.hooksAdded) {
 *     console.log('Added hooks to existing settings.json');
 *   }
 * }
 */
export async function injectSettings(
  cwd: string,
  pluginRootOverride?: string
): Promise<SettingsInjectionResult> {
  const pluginRoot = pluginRootOverride ?? getPluginRoot();
  const claudeDir = path.join(cwd, '.claude');
  const settingsPath = path.join(claudeDir, 'settings.json');

  try {
    // Check if settings file exists
    const settingsExist = await fileExists(settingsPath);

    if (!settingsExist) {
      // Create .claude directory if needed
      const claudeDirExists = await fileExists(claudeDir);
      if (!claudeDirExists) {
        await fs.mkdir(claudeDir, { recursive: true });
        debug(`Created .claude directory at ${claudeDir}`);
      }

      // Create new settings file with our hooks
      const settings = createDefaultSettings(pluginRoot);
      await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2));
      debug(`Created settings.json at ${settingsPath}`);

      return { success: true, created: true, hooksAdded: true };
    }

    // Read existing settings
    const content = await fs.readFile(settingsPath, 'utf-8');
    const settings = safeParseJson(content);

    if (settings === null) {
      // Invalid JSON - log error but don't overwrite
      const errorMsg = 'Invalid JSON in settings.json, skipping hook injection';
      logError('Settings injection', new Error(errorMsg));
      return { success: false, created: false, hooksAdded: false, error: errorMsg };
    }

    // Merge our hooks
    const { settings: mergedSettings, hooksAdded } = mergeHooks(settings, pluginRoot);

    if (!hooksAdded) {
      // Hooks already present, no need to write
      return { success: true, created: false, hooksAdded: false };
    }

    // Write updated settings
    await fs.writeFile(settingsPath, JSON.stringify(mergedSettings, null, 2));
    debug(`Updated settings.json at ${settingsPath}`);

    return { success: true, created: false, hooksAdded: true };
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logError('Settings injection', error);
    return { success: false, created: false, hooksAdded: false, error: errorMsg };
  }
}
