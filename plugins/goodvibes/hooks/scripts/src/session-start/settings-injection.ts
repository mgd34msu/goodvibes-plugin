/**
 * Settings Injection
 *
 * Manages the injection of GoodVibes hooks into the project's .claude/settings.json.
 * Reads all hooks from hooks.json and syncs them to the user's settings, supporting
 * all hook types (SessionStart, PreToolUse, PostToolUse, SubagentStart, etc.).
 *
 * @module session-start/settings-injection
 */

import * as fs from 'fs/promises';
import * as path from 'path';

import { PLUGIN_ROOT } from '../shared/constants.js';
import { fileExists } from '../shared/file-utils.js';
import { debug, logError } from '../shared/logging.js';

/**
 * Structure for a single hook entry in settings.json.
 * Defines the command to execute when a hook is triggered.
 */
interface HookEntry {
  type: string;
  command: string;
  timeout?: number;
}

/**
 * Structure for a matcher with its hooks.
 * Matches patterns (e.g., '*') and associates hook entries.
 */
interface HookMatcher {
  matcher: string;
  hooks: HookEntry[];
}

/**
 * Structure for Claude settings hooks section.
 * Maps hook types (SubagentStart, SubagentStop, etc.) to matchers.
 */
interface ClaudeHooks {
  SubagentStart?: HookMatcher[];
  SubagentStop?: HookMatcher[];
  [key: string]: HookMatcher[] | undefined;
}

/**
 * Structure for .claude/settings.json.
 * Contains hooks configuration and other project settings.
 */
interface ClaudeSettings {
  hooks?: ClaudeHooks;
  [key: string]: unknown;
}

/**
 * Structure for the plugin's hooks.json file.
 * Contains all hook definitions with ${CLAUDE_PLUGIN_ROOT} placeholders.
 */
interface PluginHooksJson {
  description?: string;
  hooks: {
    [hookType: string]: HookMatcher[];
  };
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
 * Gets the plugin root directory.
 * Uses the PLUGIN_ROOT constant which is set from CLAUDE_PLUGIN_ROOT env var
 * or falls back to a sensible default.
 *
 * @returns The absolute path to the plugin root directory
 */
export function getPluginRoot(): string {
  return PLUGIN_ROOT;
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
 * Creates the SubagentStop hook command using the plugin root path.
 *
 * @param pluginRoot - The path to the plugin root directory
 * @returns The command string for the SubagentStop hook
 */
export function createSubagentStopCommand(pluginRoot: string): string {
  const scriptPath = path.join(
    pluginRoot,
    'hooks',
    'scripts',
    'dist',
    'subagent-stop.js'
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
 * Creates the default GoodVibes SubagentStop hook configuration.
 *
 * @param pluginRoot - The path to the plugin root directory
 * @returns The hook matcher configuration for SubagentStop
 */
export function createSubagentStopHook(pluginRoot: string): HookMatcher {
  return {
    matcher: '*',
    hooks: [
      {
        type: 'command',
        command: createSubagentStopCommand(pluginRoot),
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
 * Checks if the GoodVibes SubagentStop hook is already present in the hooks array.
 *
 * @param hooks - Array of existing hook matchers
 * @param pluginRoot - The plugin root path to check against
 * @returns True if our hook is already present
 */
export function isSubagentStopHookPresent(
  hooks: HookMatcher[],
  pluginRoot: string
): boolean {
  const expectedCommand = createSubagentStopCommand(pluginRoot);

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
 * Loads hooks.json from the plugin directory.
 *
 * @param pluginRoot - The path to the plugin root directory
 * @returns The parsed hooks.json content or null if loading failed
 */
export async function loadPluginHooks(pluginRoot: string): Promise<PluginHooksJson | null> {
  const hooksJsonPath = path.join(pluginRoot, 'hooks', 'hooks.json');
  try {
    const content = await fs.readFile(hooksJsonPath, 'utf-8');
    const parsed: unknown = JSON.parse(content);
    if (typeof parsed === 'object' && parsed !== null && 'hooks' in parsed) {
      return parsed as PluginHooksJson;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Normalizes a file path for comparison by converting all separators to forward slashes
 * and converting to lowercase on Windows.
 *
 * @param filePath - The path to normalize
 * @returns The normalized path
 */
export function normalizePath(filePath: string): string {
  // Convert backslashes to forward slashes
  let normalized = filePath.replace(/\\/g, '/');
  // On Windows, paths are case-insensitive
  if (process.platform === 'win32') {
    normalized = normalized.toLowerCase();
  }
  return normalized;
}

/**
 * Extracts the script filename from a hook command.
 * E.g., 'node "C:/path/to/subagent-start.js"' -> 'subagent-start.js'
 *
 * @param command - The hook command string
 * @returns The script filename or null if not found
 */
export function extractScriptName(command: string): string | null {
  const match = command.match(/([^/\\]+\.js)["']?\s*$/);
  return match ? match[1] : null;
}

/**
 * Replaces ${CLAUDE_PLUGIN_ROOT} placeholder with actual plugin root path.
 *
 * @param command - The command string with placeholder
 * @param pluginRoot - The actual plugin root path
 * @returns The command with placeholder resolved
 */
export function resolveCommand(command: string, pluginRoot: string): string {
  return command.replace(/\$\{CLAUDE_PLUGIN_ROOT\}/g, pluginRoot);
}

/**
 * Checks if a hook command points to a GoodVibes plugin script.
 * Matches commands containing 'goodvibes' in the path and ending with a .js file.
 *
 * @param command - The hook command to check
 * @returns True if this is a GoodVibes hook command
 */
export function isGoodVibesCommand(command: string): boolean {
  const normalized = normalizePath(command);
  return normalized.includes('goodvibes') && normalized.includes('/hooks/scripts/dist/');
}

/**
 * Checks if a specific hook command is already present in the matchers array.
 * Uses normalized path comparison to handle different path separators.
 *
 * @param matchers - Array of existing hook matchers
 * @param command - The command to check for
 * @returns True if the command is already present
 */
export function isHookCommandPresent(matchers: HookMatcher[], command: string): boolean {
  const normalizedCommand = normalizePath(command);
  return matchers.some(m =>
    m.hooks?.some(h => normalizePath(h.command) === normalizedCommand)
  );
}

/**
 * Removes all GoodVibes hooks from a matchers array.
 * This cleans up stale hooks from different plugin installations.
 *
 * @param matchers - Array of hook matchers to clean
 * @returns Cleaned array with only non-GoodVibes hooks
 */
export function removeGoodVibesHooks(matchers: HookMatcher[]): HookMatcher[] {
  return matchers.filter(m => {
    // Keep matchers that have no hooks or have non-GoodVibes hooks
    if (!m.hooks || m.hooks.length === 0) return true;
    // Remove if ALL hooks are GoodVibes hooks
    const hasNonGoodVibesHook = m.hooks.some(h => !isGoodVibesCommand(h.command));
    return hasNonGoodVibesHook;
  });
}

/**
 * Merges ALL hooks from hooks.json into existing settings.
 * REPLACES all existing GoodVibes hooks with fresh ones from the current plugin root.
 * Preserves any non-GoodVibes hooks the user may have added.
 *
 * @param settings - The existing settings object
 * @param pluginHooks - The parsed hooks.json content
 * @param pluginRoot - The plugin root path for resolving command placeholders
 * @returns Object with merged settings and whether hooks were added
 */
export function mergeAllHooks(
  settings: ClaudeSettings,
  pluginHooks: PluginHooksJson,
  pluginRoot: string
): { settings: ClaudeSettings; hooksAdded: boolean } {
  settings.hooks ??= {};
  let hooksAdded = false;

  for (const [hookType, matchers] of Object.entries(pluginHooks.hooks)) {
    // First, remove ALL existing GoodVibes hooks for this type
    // This cleans up stale hooks from different plugin installations/paths
    const existingHooks = settings.hooks[hookType] ?? [];
    const userHooks = removeGoodVibesHooks(existingHooks);

    // Build fresh hooks from hooks.json
    const freshHooks: HookMatcher[] = [];
    for (const matcher of matchers) {
      const resolvedMatcher: HookMatcher = {
        matcher: matcher.matcher,
        hooks: matcher.hooks.map(h => ({
          ...h,
          command: resolveCommand(h.command, pluginRoot),
        })),
      };
      freshHooks.push(resolvedMatcher);
    }

    // Combine: fresh GoodVibes hooks first, then any user hooks
    settings.hooks[hookType] = [...freshHooks, ...userHooks];

    // Track if we actually changed anything
    if (freshHooks.length > 0) {
      hooksAdded = true;
      debug(`Set ${hookType} hooks: ${freshHooks.length} GoodVibes + ${userHooks.length} user hooks`);
    }
  }

  return { settings, hooksAdded };
}

/**
 * Merges GoodVibes hooks into existing settings.
 * REPLACES all existing GoodVibes SubagentStart/SubagentStop hooks with fresh ones.
 * Preserves any non-GoodVibes hooks the user may have added.
 *
 * @deprecated Use mergeAllHooks instead for full hooks.json support
 * @param settings - The existing settings object
 * @param pluginRoot - The plugin root path
 * @returns Object with merged settings and whether hooks were added
 */
export function mergeHooks(
  settings: ClaudeSettings,
  pluginRoot: string
): { settings: ClaudeSettings; hooksAdded: boolean } {
  const subagentStartHook = createGoodVibesHook(pluginRoot);
  const subagentStopHook = createSubagentStopHook(pluginRoot);

  // Initialize hooks object if it doesn't exist
  settings.hooks ??= {};

  // Initialize arrays if they don't exist
  settings.hooks.SubagentStart ??= [];
  settings.hooks.SubagentStop ??= [];

  // Remove all existing GoodVibes hooks first, keep user hooks
  const userStartHooks = removeGoodVibesHooks(settings.hooks.SubagentStart);
  const userStopHooks = removeGoodVibesHooks(settings.hooks.SubagentStop);

  // Replace with fresh hooks
  settings.hooks.SubagentStart = [subagentStartHook, ...userStartHooks];
  settings.hooks.SubagentStop = [subagentStopHook, ...userStopHooks];

  debug('Replaced GoodVibes SubagentStart/SubagentStop hooks');

  return { settings, hooksAdded: true };
}

/**
 * Creates the default settings object with GoodVibes hooks.
 *
 * @deprecated Use createDefaultSettingsFromHooksJson instead for full hooks.json support
 * @param pluginRoot - The plugin root path
 * @returns A new settings object with SubagentStart and SubagentStop hooks configured
 */
export function createDefaultSettings(pluginRoot: string): ClaudeSettings {
  return {
    hooks: {
      SubagentStart: [createGoodVibesHook(pluginRoot)],
      SubagentStop: [createSubagentStopHook(pluginRoot)],
    },
  };
}

/**
 * Creates a settings object with all hooks from hooks.json.
 *
 * @param pluginHooks - The parsed hooks.json content
 * @param pluginRoot - The plugin root path for resolving command placeholders
 * @returns A new settings object with all hooks configured
 */
export function createDefaultSettingsFromHooksJson(
  pluginHooks: PluginHooksJson,
  pluginRoot: string
): ClaudeSettings {
  const settings: ClaudeSettings = {};
  const { settings: mergedSettings } = mergeAllHooks(settings, pluginHooks, pluginRoot);
  return mergedSettings;
}

/**
 * Injects GoodVibes hooks into the project's .claude/settings.json.
 *
 * This function:
 * 1. Loads hooks.json from the plugin directory
 * 2. Checks if .claude/settings.json exists
 * 3. If not, creates .claude directory and settings.json with all hooks from hooks.json
 * 4. If it exists, reads it and merges hooks without overwriting user hooks
 * 5. Replaces ${CLAUDE_PLUGIN_ROOT} placeholders with actual plugin root path
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
    // Load hooks.json from plugin directory
    const pluginHooks = await loadPluginHooks(pluginRoot);

    if (!pluginHooks) {
      // Fall back to legacy behavior if hooks.json is not available
      debug('Could not load hooks.json, falling back to legacy SubagentStart/SubagentStop only');
      return injectSettingsLegacy(cwd, pluginRoot, claudeDir, settingsPath);
    }

    // Check if settings file exists
    const settingsExist = await fileExists(settingsPath);

    if (!settingsExist) {
      // Create .claude directory if needed
      const claudeDirExists = await fileExists(claudeDir);
      if (!claudeDirExists) {
        await fs.mkdir(claudeDir, { recursive: true });
        debug(`Created .claude directory at ${claudeDir}`);
      }

      // Create new settings file with all hooks from hooks.json
      const settings = createDefaultSettingsFromHooksJson(pluginHooks, pluginRoot);
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

    // Merge all hooks from hooks.json
    const { settings: mergedSettings, hooksAdded } = mergeAllHooks(settings, pluginHooks, pluginRoot);

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

/**
 * Legacy settings injection that only handles SubagentStart/SubagentStop.
 * Used as fallback when hooks.json cannot be loaded.
 *
 * @internal
 */
async function injectSettingsLegacy(
  cwd: string,
  pluginRoot: string,
  claudeDir: string,
  settingsPath: string
): Promise<SettingsInjectionResult> {
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
