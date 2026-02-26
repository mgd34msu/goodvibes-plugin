/**
 * Triggers barrel — Layer 2 trigger type extensions.
 * Re-exports all trigger interfaces, type guards, and factories.
 */

export type { TriggerFactoryParams } from './shared.js';

export type { WRFCTrigger } from './wrfc-trigger.js';
export { isWRFCTrigger, createWRFCTrigger } from './wrfc-trigger.js';

export type { CronTrigger } from './cron-trigger.js';
export { isCronTrigger, createCronTrigger } from './cron-trigger.js';

export type { WebhookTrigger } from './webhook-trigger.js';
export { isWebhookTrigger, createWebhookTrigger } from './webhook-trigger.js';
