/**
 * Context Gathering interfaces for Batch Engine
 * @see SPEC-v2 Section 6.2
 */

import type { SessionContext, BatchContext, OperationContext, AgentContext } from './context.js';

export type GatheringPhase = 'session_start' | 'batch_start' | 'operation_start' | 'agent_spawn';

export interface GatheringStep {
  name: string;
  phase: GatheringPhase;
  handler: string;
  description: string;
}

export const GATHERING_STEPS: Record<GatheringPhase, GatheringStep[]> = {
  session_start: [
    { name: 'detectStack', phase: 'session_start', handler: 'detectStack', description: 'Analyze package.json, configs' },
    { name: 'loadPreferences', phase: 'session_start', handler: 'loadPreferences', description: 'Load user preferences' },
    { name: 'checkHealth', phase: 'session_start', handler: 'checkHealth', description: 'Run quick health checks' },
    { name: 'loadGitStatus', phase: 'session_start', handler: 'loadGitStatus', description: 'Get git information' }
  ],
  batch_start: [
    { name: 'analyzeScope', phase: 'batch_start', handler: 'analyzeScope', description: 'What files/symbols affected?' },
    { name: 'loadRelevantMemory', phase: 'batch_start', handler: 'loadRelevantMemory', description: 'Search memory for relevant entries' },
    { name: 'assessRisk', phase: 'batch_start', handler: 'assessRisk', description: 'How risky is this batch?' },
    { name: 'resolveDependencies', phase: 'batch_start', handler: 'resolveDependencies', description: 'Resolve operation dependencies' }
  ],
  operation_start: [
    { name: 'resolveInjections', phase: 'operation_start', handler: 'resolveInjections', description: 'Resolve {{template}} references' },
    { name: 'gatherOperationContext', phase: 'operation_start', handler: 'gatherOperationContext', description: 'Operation-specific context' }
  ],
  agent_spawn: [
    { name: 'buildAgentPrompt', phase: 'agent_spawn', handler: 'buildAgentPrompt', description: 'Construct full agent prompt' },
    { name: 'injectMemory', phase: 'agent_spawn', handler: 'injectMemory', description: 'Add relevant memory' },
    { name: 'injectPriorResults', phase: 'agent_spawn', handler: 'injectPriorResults', description: 'Add results from prior operations' },
    { name: 'setBudget', phase: 'agent_spawn', handler: 'setBudget', description: 'Set token/turn limits' }
  ]
};

export interface ContextGatherer {
  gatherSessionContext(): Promise<SessionContext>;
  gatherBatchContext(batch_id: string): Promise<BatchContext>;
  gatherOperationContext(operation_id: string): Promise<OperationContext>;
  gatherAgentContext(agent_id: string): Promise<AgentContext>;
}

export interface GatheringResult<T> { success: boolean; context: T; errors: string[]; duration_ms: number; }
