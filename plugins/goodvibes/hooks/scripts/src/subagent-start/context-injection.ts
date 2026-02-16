/**
 * Subagent Context Injection
 *
 * Builds context for subagent sessions based on agent type and project configuration.
 * Provides:
 * - Universal reminder to prefer skills and MCP tools over raw bash/shell commands
 * - Agent-specific reminders and guidelines (e.g., write-local for backend,
 *   test quality for test engineers, scoring for reviewers)
 *
 * @module subagent-start/context-injection
 * @see {@link ../session-start/context-injection} for main session context
 */

import * as path from 'path';

import { loadSharedConfig } from '../shared/index.js';
import { getDefaultConfig as getAutomationConfig } from '../types/config.js';

/** Protocol skills that should be loaded before starting work */
export const PROTOCOL_SKILLS = [
  'precision-mastery',
  'review-scoring',
  'discover-plan-batch',
  'goodvibes-memory',
  'error-recovery'
];

/** Agent-specific skill recommendations based on role */
export const AGENT_SKILL_MAP: Record<string, string[]> = {
  'engineer': ['authentication', 'database-layer', 'api-design', 'component-architecture', 'styling-system', 'state-management', 'payment-integration', 'ai-integration', 'service-integration', 'refactoring', 'debugging'],
  'reviewer': ['code-review', 'security-audit', 'performance-audit', 'accessibility-audit'],
  'tester': ['testing-strategy'],
  'architect': ['project-onboarding'], // Loads outcome skills as needed per task; project-onboarding is the primary quality skill
  'deployer': ['deployment'],
  'integrator': ['ai-integration', 'payment-integration', 'service-integration', 'state-management', 'authentication'], // Generic integrator
  'integrator-ai': ['ai-integration'],
  'integrator-services': ['payment-integration', 'service-integration', 'authentication'],
  'integrator-state': ['state-management'],
  'planner': ['task-orchestration', 'fullstack-feature'],
  'agent-factory': [], // Meta-agent, loads skills as needed
  'skill-factory': [], // Meta-agent, loads skills as needed
};

/** Context to inject into a subagent session */
export interface SubagentContext {
  /** Additional context string to inject (always contains at least project info) */
  additionalContext: string;
}

/**
 * Builds context for a subagent based on agent type and project.
 * Adds agent-specific reminders (write-local, test quality, scoring, etc.).
 *
 * @param cwd - The current working directory (project root)
 * @param agentType - The type of agent (e.g., 'engineer', 'reviewer', 'tester')
 * @param _sessionId - The session ID (reserved for future use)
 * @returns Promise resolving to SubagentContext with additional context string
 *
 * @example
 * const context = await buildSubagentContext(cwd, 'backend-engineer', sessionId);
 * // Returns context with write-local reminder
 */
export async function buildSubagentContext(
  cwd: string,
  agentType: string,
  _sessionId: string
): Promise<SubagentContext> {
  // Load shared config for telemetry settings (reserved for future use; kept to ensure config is loaded)
  const _sharedConfig = await loadSharedConfig(cwd);
  const automationConfig = getAutomationConfig();
  const projectName = path.basename(cwd);

  const contextParts: string[] = [];

  // Add project context
  contextParts.push(`[GoodVibes] Project: ${projectName}`);
  contextParts.push(`Mode: ${automationConfig.automation.mode}`);

  // Universal reminder: Prefer skills and MCP tools over raw commands
  contextParts.push(
    'MANDATORY: Always prefer GoodVibes skills and MCP tools over raw bash/shell commands.\n' +
    'CRITICAL: Only use commands outside of MCP tools or skills when there is absolutely no other way ' +
    'to accomplish a specific part of the task. Even if the entire task cannot be completed ' +
    'with skills/MCP tools, use them for every part where they apply.\n\n'
  );

  // Batch processing reminder for efficiency
  contextParts.push(
    `MANDATORY: If multiple tool uses are planned, use discover and batch tools:\n` +
    ` - mcp__plugin_goodvibes_precision-engine__discover\n` +
    ` - mcp__plugin_goodvibes_batch-engine__batch\n\n`
  );

  // Add agent-specific reminders based on type
  if (agentType.includes('engineer')) {
    contextParts.push(
      'Remember: Write-local only. All changes must be in the project root or directories within the project root.\n\n'
    );
  }

  if (agentType.includes('test')) {
    contextParts.push(
      'Remember: Tests must actually verify behavior, not just exist.\n\n'
    );
  }

  if (agentType.includes('reviewer')) {
    contextParts.push(
      'Remember: Be completely honest, regardless of how harsh the truth would be. Never sugar coat or take feelings into account.\n\n'
    );
  }

  // Inject skill recommendations
  const agentSuffix = agentType.split(':').pop() ?? agentType;
  const outcomeSkills = AGENT_SKILL_MAP[agentSuffix] ?? [];

  contextParts.push(
    `Available protocol skills (load before starting work): ${PROTOCOL_SKILLS.join(', ')}\n` +
    `Relevant outcome/quality skills for your role: ${outcomeSkills.length > 0 ? outcomeSkills.join(', ') : 'none — load as needed'}\n` +
    `Load skills with: search_skills or get_skill_content from the registry engine.\n\n`
  );

  // contextParts always has at least 2 elements (project name and mode)
  return {
    additionalContext: contextParts.join('\n'),
  };
}
