/**
 * WRFC Plugin Trigger Definitions — Layer 3
 *
 * Returns the WRFC trigger definitions this plugin provides.
 * These are used by RuntimePlugin.getTriggerDefinitions() and registered
 * with the TriggerRegistry during plugin registration.
 */

import type { PluginTriggerDefinition } from '../../shared/plugin.js';

/**
 * Returns the WRFC trigger definitions.
 *
 * Three triggers drive the WRFC quality loop:
 * 1. agent:spawned  — initialise workflow state when a new agent is spawned
 * 2. agent:completed — route to review / fix / complete when an agent finishes
 * 3. wrfc:review_completed — quality gate evaluation on the event-driven path
 */
export function getWRFCTriggerDefinitions(): PluginTriggerDefinition[] {
  return [
    {
      id: 'wrfc_agent_spawned',
      name: 'wrfc_agent_spawned',
      description: 'Initialise WRFC workflow state when a new agent is spawned',
      event_type: 'agent:spawned',
      conditions: [{ source: ['agent', 'internal'] }],
      actions: [],
      enabled: true,
      max_fires: 500,
    },
    {
      id: 'wrfc_agent_completed',
      name: 'wrfc_agent_completed',
      description: 'Route agent to review, fix, or complete when it finishes',
      event_type: 'agent:completed',
      conditions: [{ source: ['agent', 'internal'] }],
      actions: [],
      enabled: true,
      max_fires: 500,
    },
    {
      id: 'wrfc_review_completed',
      name: 'wrfc_review_completed',
      description: 'Quality gate evaluation when a review completes (event-driven path)',
      event_type: 'wrfc:review_completed',
      conditions: [{ source: 'internal' }],
      actions: [],
      enabled: true,
      max_fires: 500,
    },
  ];
}
