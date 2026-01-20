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
 * @param agentType - The type of agent (e.g., 'backend-engineer', 'test-engineer')
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
    contextParts.push('IMPORTANT: Always prefer GoodVibes skills and MCP tools over raw bash/shell commands. ' +
        'Only use commands outside of MCP tools or skills when there is absolutely no other way ' +
        'to accomplish a specific part of the task. Even if the entire task cannot be completed ' +
        'with skills/MCP tools, use them for every part where they apply.');
    // Batch processing reminder for efficiency
    contextParts.push('BATCH PROCESSING: For efficiency, use batch operations when possible:\n' +
        '  - Use `atomic_multi_edit` MCP tool for 3+ file edits (instead of individual Edit calls)\n' +
        '  - Use `batch_read` MCP tool for 3+ file reads (instead of individual Read calls)\n' +
        '  - Use `workspace_symbols` MCP tool for searching code symbols (instead of multiple Grep calls)\n' +
        '  - Default to `output_mode: "minimal"` on MCP tool calls to reduce context size');
    // Add agent-specific reminders based on type
    if (agentType.includes('backend')) {
        contextParts.push('Remember: Write-local only. All changes must be in the project root.');
    }
    if (agentType.includes('test')) {
        contextParts.push('Remember: Tests must actually verify behavior, not just exist.');
    }
    if (agentType.includes('brutal-reviewer')) {
        contextParts.push('Remember: Be brutally honest. Score out of 10.');
    }
    // contextParts always has at least 2 elements (project name and mode)
    return {
        additionalContext: contextParts.join('\n'),
    };
}
