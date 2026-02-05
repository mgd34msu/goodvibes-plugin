/**
 * precision_config handler - Runtime configuration management
 *
 * Provides get/set/reload actions for precision-engine runtime configuration.
 * Allows toggling sandbox mode and other runtime settings.
 */

import { toCallToolResult, successResult, errorResult, ToolHandler } from '../utils/index.js';
import { startTimer, logger } from '../logging.js';
import { getConfig, getConfigValue, setConfigValue, loadConfig } from '../runtime-config.js';

export const handlePrecisionConfig: ToolHandler = async (args: unknown) => {
  const elapsed = startTimer();
  
  try {
    const params = args as Record<string, unknown>;
    const action = params.action as string;
    
    if (action === 'get') {
      const key = params.key as string | undefined;
      if (key) {
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
