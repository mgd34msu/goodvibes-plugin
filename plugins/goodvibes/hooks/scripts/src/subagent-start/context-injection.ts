import * as path from 'path';
import { loadSharedConfig } from '../shared.js';
import { getDefaultConfig as getAutomationConfig } from '../types/config.js';

/** Context to inject into a subagent session */
export interface SubagentContext {
  /** Additional context string to inject, or null if none */
  additionalContext: string | null;
}

/** Builds context for a subagent based on agent type and project */
export function buildSubagentContext(
  cwd: string,
  agentType: string,
  _sessionId: string
): SubagentContext {
  // Load shared config for telemetry settings (unused currently but available)
  const _sharedConfig = loadSharedConfig(cwd);
  const automationConfig = getAutomationConfig();
  const projectName = path.basename(cwd);

  const contextParts: string[] = [];

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
