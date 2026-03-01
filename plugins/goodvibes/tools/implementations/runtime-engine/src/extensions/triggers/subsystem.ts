/**
 * Trigger Subsystem Factory
 *
 * Encapsulates creation and registration of the TriggerRegistry
 * with all built-in triggers.
 *
 * NOTE: setDependencies() and the wildcard eventBus listener are NOT wired
 * here — they require cross-layer dependencies and remain in bootstrap.ts.
 */

import type { RuntimeConfig } from '../../shared/config.js';
import { createLogger } from '../../shared/logger.js';

import { TriggerRegistry } from './trigger-registry.js';
import { getBuiltinTriggers } from './builtins.js';

const logger = createLogger('triggers-subsystem');

export interface TriggerSubsystem {
  triggerRegistry: TriggerRegistry;
}

export function createTriggerSubsystem(config: RuntimeConfig): TriggerSubsystem {
  const triggerRegistry = new TriggerRegistry(config.triggers);

  for (const trigger of getBuiltinTriggers()) {
    triggerRegistry.register(trigger);
  }

  logger.debug('Trigger subsystem created');

  return { triggerRegistry };
}
