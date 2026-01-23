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
export async function buildSubagentContext(cwd, agentType, _sessionId) {
    // Load shared config for telemetry settings (unused currently but available)
    const _sharedConfig = await loadSharedConfig(cwd);
    const automationConfig = getAutomationConfig();
    const projectName = path.basename(cwd);
    const contextParts = [];
    // Add project context
    contextParts.push(`[GoodVibes] Project: ${projectName}`);
    contextParts.push(`Mode: ${automationConfig.automation.mode}`);
    // Universal reminder: Prefer skills and MCP tools over raw commands
    contextParts.push('MANDATORY: Always prefer GoodVibes skills and MCP tools over raw bash/shell commands.\n' +
        'CRITICAL: Only use commands outside of MCP tools or skills when there is absolutely no other way ' +
        'to accomplish a specific part of the task. Even if the entire task cannot be completed ' +
        'with skills/MCP tools, use them for every part where they apply.');
    // Batch processing reminder for efficiency
    contextParts.push(`MANDATORY: If multiple tool uses are planned, you MUST use "discover -> batch" process.\n` +
        ` - INFO: mcp-cli info plugin_goodvibes_precision-engine/discover\n` +
        ` - INFO: mcp-cli info plugin_goodvibes_batch-engine/batch\n`);
    // Add agent-specific reminders based on type
    if (agentType.includes('engineer')) {
        contextParts.push('Remember: Write-local only. All changes must be in the project root or directories within the project root.');
    }
    if (agentType.includes('tester')) {
        contextParts.push('Remember: Tests must actually verify behavior, not just exist.');
    }
    if (agentType.includes('reviewer')) {
        contextParts.push('Remember: Be completely honest, regardless of how harsh the truth would be. Never sugar coat or take feelings into account.');
    }
    // contextParts always has at least 2 elements (project name and mode)
    return {
        additionalContext: contextParts.join('\n'),
    };
}
