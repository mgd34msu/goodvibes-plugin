/**
 * Event Subsystem Factory
 *
 * Encapsulates creation and lifecycle of the event system:
 * EventBus, EventLog, and EventQueue.
 */

import { join } from 'node:path';

import type { RuntimeConfig } from '../../shared/config.js';
import { createLogger } from '../../shared/logger.js';
import { ensureDirSync } from '../../core/utils/fs-utils.js';

import { EventBus } from './event-bus.js';
import { EventLog } from './event-log.js';
import { EventQueue } from './event-queue.js';

const logger = createLogger('events-subsystem');

export interface EventSubsystem {
  eventBus: EventBus;
  eventLog: EventLog;
  eventQueue: EventQueue;
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

  const eventQueue = new EventQueue(config.queue);
  eventQueue.start();

  logger.debug('Event subsystem created');

  return {
    eventBus,
    eventLog,
    eventQueue,
    async shutdown(): Promise<void> {
      await eventQueue.drain(5_000);
      eventQueue.stop();
      eventBus.removeAllListeners();
      await eventLog.flush();
      await eventLog.close();
      logger.debug('Event subsystem shut down');
    },
  };
}
