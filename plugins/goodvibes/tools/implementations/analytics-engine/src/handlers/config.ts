import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Aggregator } from '../daemon/aggregator.js';
import type { AnalyticsConfig } from '../types.js';
import type { AnalyticsConfigInput } from '../schemas/tools.js';
import type { HandlerResponse } from './types.js';

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
 * - `get` — Return the full config or a specific key (dot-notation supported).
 * - `set` — Set a specific config key (dot-notation). Persists to `.goodvibes/analytics.json`.
 *
 * Note: `set` persists the change to disk so it survives session restarts,
 * but does NOT hot-reload the running Aggregator's in-memory config.
 * Restart the analytics daemon for changes to take effect.
 *
 * @param _aggregator - The running Aggregator instance (unused; kept for handler interface consistency).
 * @param input       - Validated AnalyticsConfigInput from the MCP tool call.
 * @param config      - The current AnalyticsConfig (passed from the engine context).
 * @param goodvibesDir - Path to the `.goodvibes/` directory for persistence.
 * @returns MCP tool response with the config value or confirmation.
 */
export async function handleConfig(
  _aggregator: Aggregator,
  input: AnalyticsConfigInput,
  config: AnalyticsConfig,
  goodvibesDir: string,
): Promise<HandlerResponse> {
  // Note: _aggregator is unused here but kept for handler interface consistency
  // (all handlers receive aggregator as their first argument).
  try {
    const configObj = config as unknown as Record<string, unknown>;

    // === get ===
    if (input.action === 'get') {
      if (input.key) {
        const value = getByPath(configObj, input.key);
        if (value === undefined) {
          return {
            content: [{
              type: 'text',
              text: `Config key not found: "${input.key}"`,
            }],
          };
        }
        return {
          content: [{
            type: 'text',
            text: `${input.key} = ${JSON.stringify(value, null, 2)}`,
          }],
        };
      }

      // No key — return full config
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(config, null, 2),
        }],
      };
    }

    // === set ===
    if (!input.key) {
      return {
        content: [{ type: 'text', text: 'analytics_config set: "key" is required.' }],
      };
    }

    if (input.value === undefined) {
      return {
        content: [{ type: 'text', text: 'analytics_config set: "value" is required.' }],
      };
    }

    // Verify the key path exists before setting
    const existing = getByPath(configObj, input.key);
    if (existing === undefined) {
      return {
        content: [{
          type: 'text',
          text: `Config key not found: "${input.key}". Use "get" (no key) to list all valid keys.`,
        }],
      };
    }

    // Clone config to avoid mutating the passed-in reference
    const updated = JSON.parse(JSON.stringify(config)) as AnalyticsConfig;
    setByPath(updated as unknown as Record<string, unknown>, input.key, input.value);
    await persistConfig(goodvibesDir, updated);

    return {
      content: [{
        type: 'text',
        text: `Config updated: ${input.key} = ${JSON.stringify(input.value)}\n\nPersisted to ${path.join(goodvibesDir, CONFIG_FILENAME)}.\nRestart the analytics daemon for changes to take effect.`,
      }],
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: 'text', text: `analytics_config error: ${message}` }],
    };
  }
}
