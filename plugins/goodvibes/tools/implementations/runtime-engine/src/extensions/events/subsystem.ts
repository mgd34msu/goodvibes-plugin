/**
 * Event Subsystem Factory
 *
 * Encapsulates creation and lifecycle of the event system:
 * EventBus and EventLog.
 */

import { join } from 'node:path';

import type { RuntimeConfig } from '../../shared/config.js';
import { createLogger } from '../../shared/logger.js';
import { ensureDirSync } from '../../core/utils/fs-utils.js';

import { EventBus } from './event-bus.js';
import { EventLog } from './event-log.js';

const logger = createLogger('events-subsystem');

export interface EventSubsystem {
  eventBus: EventBus;
  eventLog: EventLog;
  shutdown(): Promise<void>;
}

export async function createEventSubsystem(
  config: RuntimeConfig,
  projectRoot: string,
): Promise<EventSubsystem> {
  const eventBus = new EventBus();

  const stateDir = join(projectRoot, config.persistence.state_dir);
  ensureDirSync(stateDir);

  const eventLog = new EventLog(stateDir, config.persistence);
  await eventLog.initialize();
  eventBus.setEventLog(eventLog);

  logger.debug('Event subsystem created');

  return {
    eventBus,
    eventLog,
    async shutdown(): Promise<void> {
      eventBus.removeAllListeners();
      await eventLog.flush();
      await eventLog.close();
      logger.debug('Event subsystem shut down');
    },
  };
}
