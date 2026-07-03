import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Aggregator } from '../daemon/aggregator.js';
import type { AnalyticsConfig } from '../types.js';
import type { AnalyticsConfigInput } from '../schemas/tools.js';
import { type HandlerResponse, text } from './types.js';
import { loadConfig } from '../config.js';

// === Config file path ===

const CONFIG_FILENAME = 'analytics.json';

// === Dot-notation helpers ===

/**
 * Reads a value from a nested object using dot-notation key path.
 * Returns `undefined` if any segment of the path does not exist.
 *
 * @example getByPath({ a: { b: 1 } }, 'a.b') // => 1
 */
function getByPath(obj: Record<string, unknown>, keyPath: string): unknown {
  const segments = keyPath.split('.');
  let current: unknown = obj;
  for (const segment of segments) {
    if (current === null || typeof current !== 'object' || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/**
 * Sets a value in a nested object using dot-notation key path.
 * Creates intermediate objects if they do not exist.
 * Mutates `obj` in place.
 *
 * @example setByPath({ a: {} }, 'a.b', 42) // obj becomes { a: { b: 42 } }
 */
function setByPath(
  obj: Record<string, unknown>,
  keyPath: string,
  value: unknown,
): void {
  const segments = keyPath.split('.');
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i] as string;
    if (
      current[segment] === null ||
      current[segment] === undefined ||
      typeof current[segment] !== 'object' ||
      Array.isArray(current[segment])
    ) {
      current[segment] = {};
    }
    current = current[segment] as Record<string, unknown>;
  }
  const lastSegment = segments[segments.length - 1] as string;
  current[lastSegment] = value;
}

// === Persistence ===

/**
 * Persist a config object to `.goodvibes/analytics.json`.
 */
async function persistConfig(goodvibesDir: string, config: AnalyticsConfig): Promise<void> {
  const configPath = path.join(goodvibesDir, CONFIG_FILENAME);
  await fs.promises.mkdir(goodvibesDir, { recursive: true });
  await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

// === Handler ===

/**
 * Handle the `analytics_config` tool.
 *
 * Actions:
 * - `get`    — Return the full config or a specific key (dot-notation supported).
 * - `set`    — Set a specific config key (dot-notation). Persists to global analytics.json.
 * - `reload` — Hot-reload the config from disk and apply it to the running Aggregator.
 *
 * @param aggregator  - The running Aggregator instance.
 * @param input       - Validated AnalyticsConfigInput from the MCP tool call.
 * @param goodvibesDir - Path to the `.goodvibes/` directory for persistence.
 * @returns MCP tool response with the config value or confirmation.
 */
export async function handleConfig(
  aggregator: Aggregator,
  input: AnalyticsConfigInput,
  goodvibesDir: string,
): Promise<HandlerResponse> {
  try {
    const config = aggregator.getConfig();
    const configObj = config as unknown as Record<string, unknown>;

    // === reload ===
    if (input.action === 'reload') {
      try {
        const newConfig = loadConfig(goodvibesDir);
        // Apply the reloaded config to the running aggregator
        aggregator.reloadConfig(newConfig);
        return text(
          'Config hot-reloaded from disk and applied to the running aggregator.\n\n' +
          `Loaded from: ${goodvibesDir}/analytics.json (or global config if present).`,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return text(`Config reload failed: ${message}`);
      }
    }

    // === get ===
    if (input.action === 'get') {
      if (input.key) {
        const value = getByPath(configObj, input.key);
        if (value === undefined) {
          return text(`Config key not found: "${input.key}".`);
        }
        return text(`${input.key} = ${JSON.stringify(value, null, 2)}`);
      }

      // No key — return full config
      return text(JSON.stringify(config, null, 2));
    }

    // === set ===
    if (!input.key) {
      return text('analytics_config set: "key" is required.');
    }

    if (input.value === undefined) {
      return text('analytics_config set: "value" is required.');
    }

    // Verify the key path exists before setting
    const existing = getByPath(configObj, input.key);
    if (existing === undefined) {
      return text(
        `Config key not found: "${input.key}". Use "get" (no key) to list all valid keys.`,
      );
    }

    // Clone config to avoid mutating the passed-in reference
    const updated = JSON.parse(JSON.stringify(config)) as AnalyticsConfig;
    setByPath(updated as unknown as Record<string, unknown>, input.key, input.value);
    await persistConfig(goodvibesDir, updated);

    return text(
      `Config updated: ${input.key} = ${JSON.stringify(input.value)}\n\n` +
      `Persisted to ${path.join(goodvibesDir, CONFIG_FILENAME)}.\n` +
      'Use action="reload" to apply changes to the running engine without restarting.',
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return text(`analytics_config error: ${message}`);
  }
}
