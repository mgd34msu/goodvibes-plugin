/**
 * Subagent Stop Context Injection
 *
 * Builds context to inject back into the main context (orchestrator) when a subagent completes.
 * Provides reminders about:
 * - Using agents for all work (delegation pattern)
 * - Using GoodVibes memory/state/logging functions in .goodvibes/ directory
 * - Agent chaining based on completed work
 *
 * @module subagent-stop/context-injection
 */

import * as path from 'path';

/** Context to inject into the main context after a subagent completes */
export interface OrchestratorContext {
  /** System message to inject (reminders for orchestrator) */
  systemMessage: string;
}

/**
 * Builds context for the orchestrator after a subagent completes.
 * Reminds about delegation patterns and GoodVibes state management.
 *
 * @param cwd - The current working directory (project root)
 * @param agentType - The type of agent that just completed
 * @param agentId - The ID of the agent that completed
 * @param success - Whether the agent completed successfully
 * @returns OrchestratorContext with system message reminders
 *
 * @example
 * const context = buildOrchestratorContext(cwd, 'backend-engineer', 'abc123', true);
 * // Returns context with delegation and state management reminders
 */
export function buildOrchestratorContext(
  cwd: string,
  agentType: string,
  agentId: string,
  success: boolean
): OrchestratorContext {
  const projectName = path.basename(cwd);
  const contextParts: string[] = [];

  // Header
  contextParts.push(`[GoodVibes] Agent ${agentType} (${agentId}) ${success ? 'completed' : 'finished with issues'} in project '${projectName}'`);

  // Core orchestrator reminder: delegate ALL work to agents
  contextParts.push(
    'ORCHESTRATOR REMINDER: You are the orchestrator. Delegate ALL project work to specialist agents. ' +
      'Never do coding, file editing, testing, or technical implementation in main context. ' +
      'The main context is sacred - protect it from clutter.'
  );

  // GoodVibes state/memory reminder
  contextParts.push(
    'GOODVIBES STATE: Use the .goodvibes/ directory for persistence across context compactions:\n' +
      '  - .goodvibes/state/hooks-state.json - Session state, git info, test status\n' +
      '  - .goodvibes/state/agent-tracking.json - Active agent tracking\n' +
      '  - .goodvibes/logs/justvibes-log.md - Activity logging (decisions, progress)\n' +
      '  - .goodvibes/logs/justvibes-errors.md - Error logging\n' +
      '  - .goodvibes/telemetry/*.jsonl - Agent telemetry records\n' +
      'Read these files to recover context after compaction. Write to logs to persist decisions.'
  );

  // Agent chaining reminder based on agent type
  const chainingReminder = getAgentChainingReminder(agentType, success);
  if (chainingReminder) {
    contextParts.push(chainingReminder);
  }

  // MCP tools reminder
  contextParts.push(
    'MCP TOOLS: Use mcp-cli tools for project introspection (detect_stack, check_types, project_issues, etc.) ' +
      'before spawning agents to provide better context.'
  );

  return {
    systemMessage: contextParts.join('\n\n'),
  };
}

/**
 * Returns agent-specific chaining reminders based on what type of agent completed.
 */
function getAgentChainingReminder(agentType: string, success: boolean): string | null {
  const normalizedType = agentType.toLowerCase();

  if (!success) {
    return 'CHAIN: Agent had issues. Consider spawning a fix agent or investigating the problem before continuing.';
  }

  if (normalizedType.includes('backend')) {
    return 'CHAIN: Backend work done. Consider: brutal-reviewer for review, frontend-architect for UI, test-engineer for tests.';
  }

  if (normalizedType.includes('frontend')) {
    return 'CHAIN: Frontend work done. Consider: brutal-reviewer for review, test-engineer for component tests, fullstack-integrator for data.';
  }

  if (normalizedType.includes('test')) {
    return 'CHAIN: Tests written. If all passing, consider: brutal-reviewer for review, devops-deployer for deployment.';
  }

  if (normalizedType.includes('reviewer') || normalizedType.includes('brutal')) {
    return 'CHAIN: Review complete. If issues found, spawn appropriate agent to fix. If approved, continue to next task.';
  }

  if (normalizedType.includes('architect') || normalizedType.includes('refactor')) {
    return 'CHAIN: Architecture/refactoring done. Consider: test-engineer to verify, brutal-reviewer for review.';
  }

  if (normalizedType.includes('fullstack') || normalizedType.includes('integrator')) {
    return 'CHAIN: Integration done. Consider: test-engineer for integration tests, brutal-reviewer for review.';
  }

  if (normalizedType.includes('devops') || normalizedType.includes('deploy')) {
    return 'CHAIN: Deployment task done. Verify deployment succeeded. Log results to .goodvibes/logs/.';
  }

  return null;
}
