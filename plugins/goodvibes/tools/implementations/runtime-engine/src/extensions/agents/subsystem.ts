/**
 * AgentSubsystem factory — Layer 2 agents extension.
 *
 * Creates and wires BudgetTracker and AgentCoordinator. This factory owns
 * only L0 (config, utils) and L2 (EventBus, AgentCoordinator, BudgetTracker)
 * dependencies. Cross-layer wiring (e.g. WRFC handlers) stays in bootstrap.
 */

import type { RuntimeConfig } from '../../shared/config.js';
import type { EventBus } from '../events/event-bus.js';
import { BudgetTracker } from './budget-tracker.js';
import { AgentCoordinator } from './agent-coordinator.js';

/**
 * The agent subsystem: budget tracking + agent lifecycle coordination.
 */
export interface AgentSubsystem {
  agentCoordinator: AgentCoordinator;
  budgetTracker: BudgetTracker;
}

/**
 * Create the agent subsystem.
 *
 * Instantiates a BudgetTracker bound to the EventBus and config, then creates
 * an AgentCoordinator that uses it for spend accounting and threshold alerts.
 *
 * @param config   - Full runtime configuration (agents section used).
 * @param eventBus - EventBus for emitting budget and lifecycle events.
 */
export function createAgentSubsystem(
  config: RuntimeConfig,
  eventBus: EventBus,
): AgentSubsystem {
  const budgetTracker = new BudgetTracker(eventBus, config.agents);
  const agentCoordinator = new AgentCoordinator(eventBus, budgetTracker, config.agents);
  return { agentCoordinator, budgetTracker };
}
