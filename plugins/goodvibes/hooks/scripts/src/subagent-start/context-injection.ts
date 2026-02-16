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

/** Skill catalog with descriptions and validation scripts */
export const SKILL_CATALOG: Record<string, { description: string; path: string; scripts: string[] }> = {
  // Protocol
  'precision-mastery': { description: 'Optimal usage of precision engine tools for maximum token efficiency', path: 'protocol/precision-mastery', scripts: ['validate-precision-usage.sh'] },
  'review-scoring': { description: 'Quantified scoring rubric and review format for WRFC loops', path: 'protocol/review-scoring', scripts: ['validate-review.sh', 'validate-fix.sh'] },
  'discover-plan-batch': { description: 'Discover-Plan-Batch loop for all agents', path: 'protocol/discover-plan-batch', scripts: ['validate-dpb-compliance.sh'] },
  'goodvibes-memory': { description: 'Reading/writing persistent memory and logging system', path: 'protocol/goodvibes-memory', scripts: ['validate-memory-usage.sh'] },
  'error-recovery': { description: 'Error recovery procedures with escalation tiers', path: 'protocol/error-recovery', scripts: ['validate-error-recovery.sh'] },
  // Orchestration
  'fullstack-feature': { description: 'End-to-end feature development across full stack', path: 'orchestration/fullstack-feature', scripts: ['validate-feature-workflow.sh'] },
  'task-orchestration': { description: 'Decomposing requests into parallel agent tasks with WRFC coordination', path: 'orchestration/task-orchestration', scripts: ['validate-orchestration.sh'] },
  // Outcome
  'ai-integration': { description: 'AI/LLM integration: chat, streaming, RAG, embeddings, tool calling', path: 'outcome/ai-integration', scripts: ['validate-ai-integration.sh'] },
  'api-design': { description: 'API endpoint design: REST, GraphQL, tRPC, validation, error handling', path: 'outcome/api-design', scripts: ['api-checklist.sh'] },
  'authentication': { description: 'Auth setup: login, JWT, OAuth, sessions, RBAC, protected routes', path: 'outcome/authentication', scripts: ['auth-checklist.sh'] },
  'component-architecture': { description: 'Component design: composition, state, render optimization, file organization', path: 'outcome/component-architecture', scripts: ['validate-components.sh'] },
  'database-layer': { description: 'Database/ORM setup: schema, migrations, queries, connection pooling', path: 'outcome/database-layer', scripts: ['database-checklist.sh'] },
  'deployment': { description: 'Deployment patterns: Vercel, Railway, Fly.io, Docker, AWS', path: 'outcome/deployment', scripts: ['validate-deployment.sh'] },
  'payment-integration': { description: 'Payment processing: Stripe, LemonSqueezy, subscriptions, webhooks', path: 'outcome/payment-integration', scripts: ['validate-payments.sh'] },
  'service-integration': { description: 'External service integration: email, CMS, file uploads', path: 'outcome/service-integration', scripts: ['validate-services.sh'] },
  'state-management': { description: 'State architecture: server state, client state, form state, URL state', path: 'outcome/state-management', scripts: ['validate-state.sh'] },
  'styling-system': { description: 'CSS architecture: Tailwind, design tokens, responsive, dark mode', path: 'outcome/styling-system', scripts: ['validate-styling.sh'] },
  'testing-strategy': { description: 'Testing patterns: Vitest/Jest, RTL, Playwright E2E, MSW mocking', path: 'outcome/testing-strategy', scripts: ['validate-tests.sh'] },
  // Quality
  'accessibility-audit': { description: 'WCAG 2.1 AA audit: semantic HTML, ARIA, keyboard, screen reader, contrast', path: 'quality/accessibility-audit', scripts: ['validate-accessibility-audit.sh'] },
  'code-review': { description: 'Systematic code review methodology with precision tools', path: 'quality/code-review', scripts: ['validate-code-review.sh'] },
  'debugging': { description: 'Systematic debugging methodology with precision tools', path: 'quality/debugging', scripts: ['validate-debugging.sh'] },
  'performance-audit': { description: 'Performance audit: bundle, database, rendering, network, Core Web Vitals', path: 'quality/performance-audit', scripts: ['validate-performance-audit.sh'] },
  'project-onboarding': { description: 'Codebase analysis, architecture mapping, dependency audit, convention detection', path: 'quality/project-onboarding', scripts: ['validate-onboarding.sh'] },
  'refactoring': { description: 'Systematic refactoring methodology with precision tools', path: 'quality/refactoring', scripts: ['validate-refactoring.sh'] },
  'security-audit': { description: 'Security audit: auth, input validation, data protection, dependency scanning', path: 'quality/security-audit', scripts: ['validate-security-audit.sh'] },
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
 * const context = await buildSubagentContext(cwd, 'goodvibes:engineer', sessionId);
 * // Returns context with write-local and skill recommendations
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

  // Skill injection — provides Level 1 awareness (names + descriptions)
  const agentSuffix = agentType.split(':').pop() ?? agentType;
  const outcomeSkills = AGENT_SKILL_MAP[agentSuffix] ?? [];

  // Helper: Format skill list with descriptions
  const formatSkillList = (skillNames: string[]): string => {
    return skillNames
      .map(name => {
        const info = SKILL_CATALOG[name];
        return info ? `  - ${name}: ${info.description}` : `  - ${name}`;
      })
      .join('\n');
  };

  // Build protocol skills section
  const protocolSection = [
    'Protocol skills (MUST load before starting work):',
    formatSkillList(PROTOCOL_SKILLS)
  ].join('\n');

  // Build role-specific skills section
  const roleSkillsSection = outcomeSkills.length > 0
    ? ['Skills for your role:', formatSkillList(outcomeSkills)].join('\n')
    : 'Skills for your role: none — load as needed';

  // Build mandatory load instruction
  const loadInstruction = [
    'MANDATORY: Load assigned skills using get_skill_content from registry-engine BEFORE starting work.',
    'Skills contain workflows, checklists, and validation scripts that define quality standards.'
  ].join('\n');

  // Build script validation instruction
  const validationInstruction = [
    'AFTER completing work, validate with the relevant skill script:',
    '  precision_exec cmd: "bash plugins/goodvibes/skills/{tier}/{skill}/scripts/{script-name}"',
    '  Example: bash plugins/goodvibes/skills/outcome/api-design/scripts/api-checklist.sh',
    'Scripts verify work programmatically. Run BEFORE submitting for review.'
  ].join('\n');

  contextParts.push(
    [protocolSection, roleSkillsSection, loadInstruction, validationInstruction].join('\n\n') + '\n\n'
  );

  // contextParts always has at least 2 elements (project name and mode)
  return {
    additionalContext: contextParts.join('\n'),
  };
}
