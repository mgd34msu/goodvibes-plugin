import * as path from 'path';
import { loadSharedConfig } from '../shared.js';
import { getDefaultConfig as getAutomationConfig } from '../types/config.js';
/** Builds context for a subagent based on agent type and project */
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
    return {
        additionalContext: contextParts.length > 0 ? contextParts.join('\n') : null,
    };
}
