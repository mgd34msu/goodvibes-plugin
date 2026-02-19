/**
 * precision_config handler - Runtime configuration management
 *
 * Provides get/set/reload actions for precision-engine runtime configuration.
 * Allows toggling sandbox mode and other runtime settings.
 */

import { toCallToolResult, successResult, errorResult, ToolHandler } from '../utils/index.js';
import { Telemetry } from '../state/telemetry.js';
import { startTimer, logger } from '../logging.js';
import { getConfig, getConfigValue, setConfigValue, loadConfig } from '../runtime-config.js';
import { getFetchServices } from '../utils/fetch/service-registry.js';
import { KVState } from '../state/kv-state.js';
import { HooksManager } from '../state/hooks.js';
import type { HookEvent, HookConfig } from '../state/hooks.js';

export const handlePrecisionConfig: ToolHandler = async (args: unknown) => {
  const elapsed = startTimer();

  try {
    const params = args as Record<string, unknown>;
    const action = params.action as string;

    if (action === 'get') {
      const key = params.key as string | undefined;
      if (key) {
        // Handle virtual keys first
        if (key === 'fetch.services') {
          const services = getFetchServices();
          const serviceList = Object.entries(services).map(([name, config]) => ({
            name,
            base_url: config.base_url,
            auth_type: config.auth_type ?? 'none',
            description: config.description ?? '',
          }));
          return toCallToolResult(successResult({ key, value: serviceList }, 'standard', elapsed()));
        }

        if (key === 'fetch.auth_status') {
          const services = getFetchServices();
          const statusMap: Record<string, string> = {};

          // Try to import auth-orchestrator dynamically
          let getAuthStatus: ((serviceName: string) => Promise<string>) | undefined;
          try {
            const module = await import('../utils/fetch/auth/auth-orchestrator.js');
            getAuthStatus = module.getAuthStatus;
          } catch {
            // Auth orchestrator doesn't exist yet, fall back to 'unknown'
          }

          // Get status for each service
          for (const serviceName of Object.keys(services)) {
            if (getAuthStatus) {
              try {
                statusMap[serviceName] = await getAuthStatus(serviceName);
              } catch {
                statusMap[serviceName] = 'error';
              }
            } else {
              statusMap[serviceName] = 'unknown';
            }
          }

          return toCallToolResult(successResult({ key, value: statusMap }, 'standard', elapsed()));
        }

        // Standard config key
        const value = getConfigValue(key);
        return toCallToolResult(successResult({ key, value }, 'standard', elapsed()));
      } else {
        const config = getConfig();
        return toCallToolResult(successResult({ config }, 'standard', elapsed()));
      }
    }

    if (action === 'set') {
      const key = params.key as string;
      const value = params.value;

      if (!key) {
        return toCallToolResult(errorResult('Missing required field: key', 'standard', elapsed()));
      }
      if (value === undefined) {
        return toCallToolResult(errorResult('Missing required field: value', 'standard', elapsed()));
      }

      // Guard virtual keys from being written
      const virtualKeys = ['fetch.services', 'fetch.auth_status'];
      if (virtualKeys.includes(key)) {
        return toCallToolResult(errorResult(
          `Cannot set virtual key '${key}' - this is a read-only computed key`,
          'standard',
          elapsed()
        ));
      }

      await setConfigValue(key, value);
      const current = getConfigValue(key);
      return toCallToolResult(successResult({ key, value: current, persisted: true }, 'standard', elapsed()));
    }

    if (action === 'reload') {
      await loadConfig();
      const config = getConfig();
      return toCallToolResult(successResult({ config, reloaded: true }, 'standard', elapsed()));
    }

    if (action === 'telemetry') {
      const operation = (params.operation as string | undefined) ?? 'summary';
      const tel = Telemetry.getInstance();

      if (operation === 'summary') {
        const summary = tel.getSummary();
        return toCallToolResult(successResult({ summary }, 'standard', elapsed()));
      }

      if (operation === 'query') {
        const rawFilter = params.filter as Record<string, unknown> | undefined;
        const filter = rawFilter
          ? {
              tool: rawFilter['tool'] as string | undefined,
              status: rawFilter['status'] as string | undefined,
              session_id: rawFilter['session_id'] as string | undefined,
              since: rawFilter['since'] as string | undefined,
              limit: rawFilter['limit'] !== undefined ? Number(rawFilter['limit']) : undefined,
            }
          : undefined;
        const records = tel.query(filter);
        return toCallToolResult(successResult({ records, count: records.length }, 'standard', elapsed()));
      }

      return toCallToolResult(errorResult(
        `Unknown telemetry operation: '${operation}'. Use 'summary' or 'query'.`,
        'standard',
        elapsed()
      ));
    }

    if (action === 'state') {
      const state = KVState.getInstance();
      const operation = params.operation as string;

      if (!operation) {
        return toCallToolResult(errorResult(
          `Missing required field: operation. Use 'get', 'set', 'list', or 'clear'.`,
          'standard',
          elapsed()
        ));
      }

      switch (operation) {
        case 'get': {
          const keys = params.keys as string[] | undefined;
          if (!keys || !Array.isArray(keys) || keys.length === 0) {
            return toCallToolResult(errorResult(
              `'get' operation requires a non-empty 'keys' array.`,
              'standard',
              elapsed()
            ));
          }
          const result = await state.get(keys);
          return toCallToolResult(successResult({ state: result }, 'standard', elapsed()));
        }

        case 'set': {
          const values = params.values as Record<string, unknown> | undefined;
          if (!values || typeof values !== 'object' || Array.isArray(values)) {
            return toCallToolResult(errorResult(
              `'set' operation requires a 'values' object.`,
              'standard',
              elapsed()
            ));
          }
          await state.set(values);
          return toCallToolResult(successResult({ success: true, operation: 'set' }, 'standard', elapsed()));
        }

        case 'list': {
          const prefix = params.prefix as string | undefined;
          const result = await state.list(prefix);
          return toCallToolResult(successResult({ state: result }, 'standard', elapsed()));
        }

        case 'clear': {
          const keys = params.keys as string[] | undefined;
          if (!keys || !Array.isArray(keys) || keys.length === 0) {
            return toCallToolResult(errorResult(
              `'clear' operation requires a non-empty 'keys' array.`,
              'standard',
              elapsed()
            ));
          }
          await state.clear(keys);
          return toCallToolResult(successResult({ success: true, operation: 'clear' }, 'standard', elapsed()));
        }

        default:
          return toCallToolResult(errorResult(
            `Unknown state operation: '${operation}'. Use 'get', 'set', 'list', or 'clear'.`,
            'standard',
            elapsed()
          ));
      }
    }

    if (action === 'hooks') {
      const operation = params.operation as string | undefined;
      const hooks = HooksManager.getInstance();

      if (!operation || operation === 'list') {
        const event = params.event as HookEvent | undefined;
        const hooksList = hooks.listHooks(event);
        return toCallToolResult(successResult({ hooks: hooksList }, 'standard', elapsed()));
      }

      if (operation === 'enable' || operation === 'disable') {
        const event = params.event as HookEvent | undefined;
        const hookName = params.hook as string | undefined;

        if (!event) {
          return toCallToolResult(errorResult(
            `'${operation}' requires 'event' field (PrePrecisionTool, PostPrecisionTool, OnPrecisionError, OnPrecisionMutation).`,
            'standard',
            elapsed()
          ));
        }
        if (!hookName) {
          return toCallToolResult(errorResult(
            `'${operation}' requires 'hook' field (the hook name or cmd to ${operation}).`,
            'standard',
            elapsed()
          ));
        }

        const found = operation === 'enable'
          ? hooks.enableHook(event, hookName)
          : hooks.disableHook(event, hookName);

        if (!found) {
          return toCallToolResult(errorResult(
            `Hook '${hookName}' not found in event '${event}'.`,
            'standard',
            elapsed()
          ));
        }

        // Persist the change so it survives server restarts
        await hooks.persistToConfig();

        return toCallToolResult(successResult(
          { operation, event, hook: hookName, success: true },
          'standard',
          elapsed()
        ));
      }

      if (operation === 'add') {
        const event = params.event as HookEvent | undefined;
        const hookCfg = params.hook as HookConfig | undefined;

        if (!event) {
          return toCallToolResult(errorResult(
            `'add' requires 'event' field.`,
            'standard',
            elapsed()
          ));
        }
        if (!hookCfg || typeof hookCfg !== 'object' || !('type' in hookCfg)) {
          return toCallToolResult(errorResult(
            `'add' requires 'hook' field (a HookConfig object with type, name/cmd, etc.).`,
            'standard',
            elapsed()
          ));
        }

        try {
          hooks.addHook(event, hookCfg);
          // Persist the change so it survives server restarts
          await hooks.persistToConfig();
          return toCallToolResult(successResult(
            { operation: 'add', event, hook: hookCfg, success: true },
            'standard',
            elapsed()
          ));
        } catch (addErr) {
          return toCallToolResult(errorResult(
            addErr instanceof Error ? addErr.message : String(addErr),
            'standard',
            elapsed()
          ));
        }
      }

      if (operation === 'remove') {
        const event = params.event as HookEvent | undefined;
        const hookName = params.hook as string | undefined;

        if (!event) {
          return toCallToolResult(errorResult(
            `'remove' requires 'event' field.`,
            'standard',
            elapsed()
          ));
        }
        if (!hookName) {
          return toCallToolResult(errorResult(
            `'remove' requires 'hook' field (the hook name or cmd to remove).`,
            'standard',
            elapsed()
          ));
        }

        const found = hooks.removeHook(event, hookName);
        if (!found) {
          return toCallToolResult(errorResult(
            `Hook '${hookName}' not found in event '${event}'.`,
            'standard',
            elapsed()
          ));
        }

        // Persist the change so it survives server restarts
        await hooks.persistToConfig();

        return toCallToolResult(successResult(
          { operation: 'remove', event, hook: hookName, success: true },
          'standard',
          elapsed()
        ));
      }

      return toCallToolResult(errorResult(
        `Unknown hooks operation: '${operation}'. Use 'list', 'enable', 'disable', 'add', or 'remove'.`,
        'standard',
        elapsed()
      ));
    }

    return toCallToolResult(errorResult(
      `Unknown action: '${action}'. Use 'get', 'set', 'reload', 'telemetry', 'state', or 'hooks'.`,
      'standard',
      elapsed()
    ));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('precision_config failed', { error: message });
    return toCallToolResult(errorResult(message, 'standard', elapsed()));
  }
};
