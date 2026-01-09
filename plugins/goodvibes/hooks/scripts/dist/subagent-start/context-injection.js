/**
 * Subagent Context Injection
 *
 * Builds context for subagent sessions based on agent type and project configuration.
 * Provides agent-specific reminders and guidelines (e.g., write-local for backend,
 * test quality for test engineers, scoring for reviewers).
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
