/**
 * precision_config handler - Runtime configuration management
 *
 * Provides get/set/reload actions for precision-engine runtime configuration.
 * Allows toggling sandbox mode and other runtime settings.
 */

import { toCallToolResult, successResult, errorResult, ToolHandler } from '../utils/index.js';
import { startTimer, logger } from '../logging.js';
import { getConfig, getConfigValue, setConfigValue, loadConfig } from '../runtime-config.js';
import { getFetchServices } from '../utils/fetch/service-registry.js';

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

    return toCallToolResult(errorResult(
      `Unknown action: '${action}'. Use 'get', 'set', or 'reload'.`,
      'standard',
      elapsed()
    ));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('precision_config failed', { error: message });
    return toCallToolResult(errorResult(message, 'standard', elapsed()));
  }
};
